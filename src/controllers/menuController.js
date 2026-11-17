import { getDB } from "../config/db.js";
import { CATEGORIES, MENU_STATUS, FREE_PLAN_ITEM_LIMIT } from "../utils/constants.js";
import { isPremium, escapeRegex } from "../utils/helpers.js";

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