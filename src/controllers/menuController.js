import { getDB } from "../config/db.js";
import { CATEGORIES, MENU_STATUS, FREE_PLAN_ITEM_LIMIT, ROLES } from "../utils/constants.js";
import { isPremium, escapeRegex, toObjectId } from "../utils/helpers.js";
const items = () => getDB().collection("menuItems");

export const createMenuItem = async (req, res) => {
  const vendor = req.user;

  if (!isPremium(vendor)) {
    const activeCount = await items().countDocuments({
      vendorId: vendor._id,
      status: { $in: [MENU_STATUS.PENDING, MENU_STATUS.APPROVED] },
    });

    if (activeCount >= FREE_PLAN_ITEM_LIMIT) {
      return res.status(403).json({
        success: false,
        code: "PLAN_LIMIT_REACHED",
        message: `Free plan allows up to ${FREE_PLAN_ITEM_LIMIT} active menu items. Upgrade to Premium for unlimited items.`,
      });
    }
  }

  const now = new Date();
  const doc = {
    ...req.validated,
    vendorId: vendor._id, // client থেকে কখনো নেওয়া হয় না
    status: MENU_STATUS.PENDING,
    avgRating: 0,
    reviewCount: 0,
    reviews: [],
    createdAt: now,
    updatedAt: now,
  };

  const result = await items().insertOne(doc);

  res.status(201).json({
    success: true,
    message: "Menu item submitted and is waiting for admin approval",
    item: { _id: result.insertedId, ...doc },
  });
};

const str = (v) => (typeof v === "string" ? v.trim() : "");

const SORTS = {
  newest: { createdAt: -1 },
  price_asc: { price: 1 },
  price_desc: { price: -1 },
  rating: { avgRating: -1, reviewCount: -1 },
};

// ভেন্ডরের তথ্য জুড়ে দেয়, blocked ভেন্ডরের আইটেম বাদ দেয়, premium কিনা হিসাব করে
const vendorStages = [
  { $lookup: { from: "users", localField: "vendorId", foreignField: "_id", as: "vendor" } },
  { $unwind: "$vendor" },
  { $match: { "vendor.isBlocked": { $ne: true } } },
  {
    $addFields: {
      isPremiumVendor: {
        $and: [
          { $eq: ["$vendor.subscriptionPlan", "premium"] },
          {
            $gt: [
              { $ifNull: ["$vendor.subscriptionExpiresAt", new Date("9999-12-31")] },
              "$$NOW",
            ],
          },
        ],
      },
    },
  },
  {
    $project: {
      itemName: 1,
      category: 1,
      description: 1,
      price: 1,
      location: 1,
      images: 1,
      status: 1,
      createdAt: 1,
      avgRating: 1,
      reviewCount: 1,
      isPremiumVendor: 1,
      vendor: {
        _id: "$vendor._id",
        name: "$vendor.name",
        businessName: "$vendor.businessName",
        image: "$vendor.image",
      },
    },
  },
];

// GET /api/menu-items?search=&category=&location=&minPrice=&maxPrice=&sort=&page=&limit=
export const getMenuItems = async (req, res) => {
  const q = req.query;
  const match = { status: MENU_STATUS.APPROVED };

  const search = str(q.search);
  if (search) {
    const re = new RegExp(escapeRegex(search), "i");
    match.$or = [{ itemName: re }, { description: re }, { category: re }];
  }

  const category = str(q.category);
  if (CATEGORIES.includes(category)) match.category = category;

  const location = str(q.location);
  if (location) match.location = new RegExp(escapeRegex(location), "i");

  const price = {};
  const minPrice = Number(str(q.minPrice));
  const maxPrice = Number(str(q.maxPrice));
  if (str(q.minPrice) && !Number.isNaN(minPrice)) price.$gte = minPrice;
  if (str(q.maxPrice) && !Number.isNaN(maxPrice)) price.$lte = maxPrice;
  if (Object.keys(price).length) match.price = price;

  const sort = { ...(SORTS[str(q.sort)] || SORTS.newest), _id: 1 };
  const page = Math.max(parseInt(str(q.page)) || 1, 1);
  const limit = Math.min(Math.max(parseInt(str(q.limit)) || 9, 1), 50);

  const [result] = await items()
    .aggregate([
      { $match: match },
      ...vendorStages,
      { $sort: sort },
      {
        $facet: {
          data: [{ $skip: (page - 1) * limit }, { $limit: limit }],
          total: [{ $count: "count" }],
        },
      },
    ])
    .toArray();

  const total = result.total[0]?.count || 0;

  res.json({
    success: true,
    items: result.data,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  });
};

// হোমপেজের Featured: Premium ভেন্ডরের আইটেম আগে
export const getFeaturedItems = async (req, res) => {
  const limit = Math.min(Math.max(parseInt(str(req.query.limit)) || 6, 1), 12);

  const list = await items()
    .aggregate([
      { $match: { status: MENU_STATUS.APPROVED } },
      ...vendorStages,
      { $sort: { isPremiumVendor: -1, createdAt: -1, _id: 1 } },
      { $limit: limit },
    ])
    .toArray();

  res.json({ success: true, items: list });
};

// ফিল্টার ড্রপডাউনের জন্য লোকেশন তালিকা
export const getLocations = async (req, res) => {
  const locations = await items().distinct("location", {
    status: MENU_STATUS.APPROVED,
  });
  res.json({ success: true, locations: locations.sort() });
};

// Vendor: শুধু নিজের আইটেম
export const getMyMenuItems = async (req, res) => {
  const filter = { vendorId: req.user._id };
  const status = str(req.query.status);
  if (Object.values(MENU_STATUS).includes(status)) filter.status = status;

  const list = await items()
    .find(filter)
    .project({ reviews: 0 })
    .sort({ createdAt: -1 })
    .toArray();

  res.json({ success: true, items: list });
};

// যেকোনো লগইন করা ইউজার; approved ছাড়া শুধু মালিক ও admin দেখতে পারবে
export const getMenuItemById = async (req, res) => {
  const _id = toObjectId(req.params.id);
  if (!_id) {
    return res.status(400).json({ success: false, message: "Invalid item ID" });
  }

  const item = await items().findOne({ _id });
  if (!item) {
    return res.status(404).json({ success: false, message: "Menu item not found" });
  }

  const isOwner = String(item.vendorId) === req.user.id;
  const isAdmin = req.user.role === ROLES.ADMIN;

  const vendor = await getDB()
    .collection("users")
    .findOne(
      { _id: item.vendorId },
      {
        projection: {
          name: 1,
          businessName: 1,
          image: 1,
          isBlocked: 1,
          subscriptionPlan: 1,
          subscriptionExpiresAt: 1,
        },
      }
    );

  const visibleToPublic =
    item.status === MENU_STATUS.APPROVED && vendor && !vendor.isBlocked;

  // অনুমতি না থাকলে অস্তিত্বই প্রকাশ করা হয় না
  if (!visibleToPublic && !isOwner && !isAdmin) {
    return res.status(404).json({ success: false, message: "Menu item not found" });
  }

  res.json({
    success: true,
    item: {
      ...item,
      vendor: vendor && {
        _id: vendor._id,
        name: vendor.name,
        businessName: vendor.businessName,
        image: vendor.image,
        isPremium: isPremium(vendor),
      },
    },
  });
};

// মালিকানা যাচাই: মিললে item, নইলে নিজেই response পাঠিয়ে null
const getOwnedItem = async (req, res) => {
  const _id = toObjectId(req.params.id);
  if (!_id) {
    res.status(400).json({ success: false, message: "Invalid item ID" });
    return null;
  }

  const item = await items().findOne({ _id });
  if (!item) {
    res.status(404).json({ success: false, message: "Menu item not found" });
    return null;
  }

  if (String(item.vendorId) !== req.user.id) {
    res
      .status(403)
      .json({ success: false, message: "You can only modify your own menu items" });
    return null;
  }

  return item;
};

// কনটেন্ট বদলালে আবার admin এর রিভিউয়ের জন্য pending হয়ে যায়
export const updateMenuItem = async (req, res) => {
  const item = await getOwnedItem(req, res);
  if (!item) return;

  await items().updateOne(
    { _id: item._id },
    {
      $set: {
        ...req.validated,
        status: MENU_STATUS.PENDING,
        updatedAt: new Date(),
      },
    }
  );

  res.json({
    success: true,
    message: "Menu item updated and sent for re-approval",
  });
};

// Available (approved) <-> Unavailable (inactive)
export const setAvailability = async (req, res) => {
  const item = await getOwnedItem(req, res);
  if (!item) return;

  if (![MENU_STATUS.APPROVED, MENU_STATUS.INACTIVE].includes(item.status)) {
    return res.status(400).json({
      success: false,
      message: "Only approved or inactive items can change availability",
    });
  }

  const { available } = req.validated;

  if (available && !isPremium(req.user)) {
    const activeCount = await items().countDocuments({
      vendorId: req.user._id,
      _id: { $ne: item._id },
      status: { $in: [MENU_STATUS.PENDING, MENU_STATUS.APPROVED] },
    });

    if (activeCount >= FREE_PLAN_ITEM_LIMIT) {
      return res.status(403).json({
        success: false,
        code: "PLAN_LIMIT_REACHED",
        message: `Free plan allows up to ${FREE_PLAN_ITEM_LIMIT} active menu items. Upgrade to Premium.`,
      });
    }
  }

  const status = available ? MENU_STATUS.APPROVED : MENU_STATUS.INACTIVE;
  await items().updateOne({ _id: item._id }, { $set: { status, updatedAt: new Date() } });

  res.json({ success: true, message: "Availability updated", status });
};

export const deleteMenuItem = async (req, res) => {
  const item = await getOwnedItem(req, res);
  if (!item) return;

  await items().deleteOne({ _id: item._id });
  res.json({ success: true, message: "Menu item deleted" });
};