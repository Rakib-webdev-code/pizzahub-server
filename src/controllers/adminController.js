import { getDB } from "../config/db.js";
import { CATEGORIES, MENU_STATUS, ROLES } from "../utils/constants.js";
import { escapeRegex, toObjectId, idFilter } from "../utils/helpers.js";;

const items = () => getDB().collection("menuItems");
const str = (v) => (typeof v === "string" ? v.trim() : "");

// GET /api/admin/menu-items?search=&status=&category=&page=&limit=
export const getAllMenuItems = async (req, res) => {
  const q = req.query;
  const match = {};

  const status = str(q.status);
  if (Object.values(MENU_STATUS).includes(status)) match.status = status;

  const category = str(q.category);
  if (CATEGORIES.includes(category)) match.category = category;

  const search = str(q.search);
  if (search) {
    const re = new RegExp(escapeRegex(search), "i");
    match.$or = [{ itemName: re }, { location: re }];
  }

  const page = Math.max(parseInt(str(q.page)) || 1, 1);
  const limit = Math.min(Math.max(parseInt(str(q.limit)) || 10, 1), 50);

  const [result] = await items()
    .aggregate([
      { $match: match },
      { $sort: { createdAt: -1, _id: 1 } },
      {
        $facet: {
          data: [
            { $skip: (page - 1) * limit },
            { $limit: limit },
            {
              $lookup: {
                from: "users",
                localField: "vendorId",
                foreignField: "_id",
                as: "vendor",
              },
            },
            { $unwind: { path: "$vendor", preserveNullAndEmptyArrays: true } },
            {
              $addFields: {
                vendor: {
                  _id: "$vendor._id",
                  name: "$vendor.name",
                  email: "$vendor.email",
                  businessName: "$vendor.businessName",
                  isBlocked: "$vendor.isBlocked",
                },
              },
            },
            { $project: { reviews: 0 } },
          ],
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

// PATCH /api/admin/menu-items/:id/status  { status, rejectionReason? }
export const updateMenuItemStatus = async (req, res) => {
  const _id = toObjectId(req.params.id);
  if (!_id) {
    return res.status(400).json({ success: false, message: "Invalid item ID" });
  }

  const { status, rejectionReason } = req.validated;

  const ops = { $set: { status, updatedAt: new Date() } };
  if (status === MENU_STATUS.REJECTED) {
    ops.$set.rejectionReason = rejectionReason || "";
  } else {
    ops.$unset = { rejectionReason: "" };
  }

  const item = await items().findOneAndUpdate({ _id }, ops, {
    returnDocument: "after",
  });

  if (!item) {
    return res.status(404).json({ success: false, message: "Menu item not found" });
  }

  res.json({ success: true, message: `Menu item ${status}`, status: item.status });
};

export const adminDeleteMenuItem = async (req, res) => {
  const _id = toObjectId(req.params.id);
  if (!_id) {
    return res.status(400).json({ success: false, message: "Invalid item ID" });
  }

  const result = await items().deleteOne({ _id });
  if (result.deletedCount === 0) {
    return res.status(404).json({ success: false, message: "Menu item not found" });
  }

  res.json({ success: true, message: "Menu item deleted" });
};

const users = () => getDB().collection("users");

const userProjection = {
  name: 1,
  email: 1,
  image: 1,
  role: 1,
  isBlocked: 1,
  businessName: 1,
  subscriptionPlan: 1,
  subscriptionExpiresAt: 1,
  createdAt: 1,
};

// GET /api/admin/users?search=&role=&blocked=&page=&limit=
export const getAllUsers = async (req, res) => {
  const q = req.query;
  const match = {};

  const role = str(q.role);
  if (Object.values(ROLES).includes(role)) match.role = role;

  const blocked = str(q.blocked);
  if (blocked === "true") match.isBlocked = true;
  if (blocked === "false") match.isBlocked = { $ne: true };

  const search = str(q.search);
  if (search) {
    const re = new RegExp(escapeRegex(search), "i");
    match.$or = [{ name: re }, { email: re }];
  }

  const page = Math.max(parseInt(str(q.page)) || 1, 1);
  const limit = Math.min(Math.max(parseInt(str(q.limit)) || 10, 1), 50);

  const [list, total] = await Promise.all([
    users()
      .find(match, { projection: userProjection })
      .sort({ createdAt: -1, _id: 1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .toArray(),
    users().countDocuments(match),
  ]);

  res.json({
    success: true,
    users: list,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  });
};

// GET /api/admin/users/:id
export const getUserDetails = async (req, res) => {
  const user = await users().findOne(idFilter(req.params.id), {
    projection: userProjection,
  });

  if (!user) {
    return res.status(404).json({ success: false, message: "User not found" });
  }

  const orders = getDB().collection("orders");
  let stats = {};

  if (user.role === ROLES.VENDOR) {
    const [menuItems, receivedOrders] = await Promise.all([
      items().countDocuments({ vendorId: user._id }),
      orders.countDocuments({ vendorId: user._id }),
    ]);
    stats = { menuItems, receivedOrders };
  } else if (user.role === ROLES.CUSTOMER) {
    stats = { placedOrders: await orders.countDocuments({ customerId: user._id }) };
  }

  res.json({ success: true, user, stats });
};

// PATCH /api/admin/users/:id/block  { isBlocked: true | false }
export const setBlockStatus = async (req, res) => {
  const { isBlocked } = req.validated;

  const target = await users().findOne(idFilter(req.params.id), {
    projection: { role: 1 },
  });

  if (!target) {
    return res.status(404).json({ success: false, message: "User not found" });
  }

  if (String(target._id) === req.user.id) {
    return res
      .status(400)
      .json({ success: false, message: "You cannot block your own account" });
  }

  if (target.role === ROLES.ADMIN) {
    return res
      .status(403)
      .json({ success: false, message: "Admin accounts cannot be blocked" });
  }

  await users().updateOne(
    { _id: target._id },
    { $set: { isBlocked, updatedAt: new Date() } }
  );

  res.json({
    success: true,
    message: isBlocked ? "User blocked" : "User unblocked",
    isBlocked,
  });
};

// GET /api/admin/transactions?status=&page=&limit=  (কোনো edit API নেই, ইচ্ছাকৃত)
export const getTransactions = async (req, res) => {
  const match = {};
  const status = str(req.query.status);
  if (status) match.status = status;

  const page = Math.max(parseInt(str(req.query.page)) || 1, 1);
  const limit = Math.min(Math.max(parseInt(str(req.query.limit)) || 10, 1), 50);

  const [result] = await getDB()
    .collection("transactions")
    .aggregate([
      { $match: match },
      { $sort: { createdAt: -1, _id: 1 } },
      {
        $facet: {
          data: [
            { $skip: (page - 1) * limit },
            { $limit: limit },
            {
              $lookup: {
                from: "users",
                localField: "vendorId",
                foreignField: "_id",
                as: "vendor",
              },
            },
            { $unwind: { path: "$vendor", preserveNullAndEmptyArrays: true } },
            {
              $addFields: {
                vendor: {
                  _id: "$vendor._id",
                  name: "$vendor.name",
                  email: "$vendor.email",
                  businessName: "$vendor.businessName",
                },
              },
            },
          ],
          total: [{ $count: "count" }],
        },
      },
    ])
    .toArray();

  const total = result.total[0]?.count || 0;

  res.json({
    success: true,
    transactions: result.data,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  });
};