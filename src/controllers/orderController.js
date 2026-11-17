import { getDB } from "../config/db.js";
import { MENU_STATUS, ORDER_STATUS, ROLES } from "../utils/constants.js";
import { toObjectId } from "../utils/helpers.js";

const orders = () => getDB().collection("orders");

export const createOrder = async (req, res) => {
  const { itemId, deliveryDate, deliveryAddress, message } = req.validated;
  const customer = req.user;

  const _id = toObjectId(itemId);
  if (!_id) {
    return res.status(400).json({ success: false, message: "Invalid item ID" });
  }

  const item = await getDB().collection("menuItems").findOne({ _id });
  if (!item || item.status !== MENU_STATUS.APPROVED) {
    return res
      .status(404)
      .json({ success: false, message: "This item is not available for ordering" });
  }

  const vendor = await getDB()
    .collection("users")
    .findOne({ _id: item.vendorId }, { projection: { isBlocked: 1 } });
  if (!vendor || vendor.isBlocked) {
    return res
      .status(404)
      .json({ success: false, message: "This item is not available for ordering" });
  }

  if (String(item.vendorId) === customer.id) {
    return res
      .status(403)
      .json({ success: false, message: "You cannot order your own menu item" });
  }

  // একই আইটেম + একই তারিখে active অর্ডার থাকলে নতুন হবে না
  const duplicate = await orders().findOne({
    customerId: customer._id,
    itemId: item._id,
    deliveryDate,
    status: { $in: [ORDER_STATUS.PENDING, ORDER_STATUS.ACCEPTED] },
  });
  if (duplicate) {
    return res.status(409).json({
      success: false,
      message: "You already have an active order for this item on that delivery date",
    });
  }

  const now = new Date();
  const doc = {
    itemId: item._id,
    vendorId: item.vendorId, // আইটেম থেকে নেওয়া, client থেকে নয়
    customerId: customer._id, // টোকেন থেকে নেওয়া
    itemSnapshot: {
      itemName: item.itemName,
      category: item.category,
      price: item.price,
      image: item.images?.[0] || null,
    },
    deliveryDate,
    deliveryAddress,
    message,
    status: ORDER_STATUS.PENDING,
    statusHistory: [{ status: ORDER_STATUS.PENDING, at: now }],
    createdAt: now,
    updatedAt: now,
  };

  const result = await orders().insertOne(doc);

  res.status(201).json({
    success: true,
    message: "Order placed successfully",
    order: { _id: result.insertedId, ...doc },
  });
};

const str = (v) => (typeof v === "string" ? v.trim() : "");

// অর্ডারের সাথে ভেন্ডর ও কাস্টমারের প্রয়োজনীয় তথ্য জুড়ে দেয়
const partyStages = [
  {
    $lookup: { from: "users", localField: "vendorId", foreignField: "_id", as: "vendor" },
  },
  { $unwind: { path: "$vendor", preserveNullAndEmptyArrays: true } },
  {
    $lookup: { from: "users", localField: "customerId", foreignField: "_id", as: "customer" },
  },
  { $unwind: { path: "$customer", preserveNullAndEmptyArrays: true } },
  {
    $addFields: {
      vendor: {
        _id: "$vendor._id",
        name: "$vendor.name",
        businessName: "$vendor.businessName",
        image: "$vendor.image",
      },
      customer: {
        _id: "$customer._id",
        name: "$customer.name",
        email: "$customer.email",
        image: "$customer.image",
      },
    },
  },
];

const statusFilter = (value) =>
  Object.values(ORDER_STATUS).includes(value) ? value : null;

// Customer: নিজের অর্ডার
export const getMyOrders = async (req, res) => {
  const match = { customerId: req.user._id };
  const status = statusFilter(str(req.query.status));
  if (status) match.status = status;

  const list = await orders()
    .aggregate([{ $match: match }, { $sort: { createdAt: -1, _id: 1 } }, ...partyStages])
    .toArray();

  res.json({ success: true, orders: list });
};

// Vendor: নিজের আইটেমের অর্ডার
export const getVendorOrders = async (req, res) => {
  const match = { vendorId: req.user._id };
  const status = statusFilter(str(req.query.status));
  if (status) match.status = status;

  const list = await orders()
    .aggregate([{ $match: match }, { $sort: { createdAt: -1, _id: 1 } }, ...partyStages])
    .toArray();

  res.json({ success: true, orders: list });
};

// অর্ডারের বিস্তারিত: শুধু ওই কাস্টমার, ওই ভেন্ডর বা admin
export const getOrderById = async (req, res) => {
  const _id = toObjectId(req.params.id);
  if (!_id) {
    return res.status(400).json({ success: false, message: "Invalid order ID" });
  }

  const [order] = await orders()
    .aggregate([{ $match: { _id } }, ...partyStages])
    .toArray();

  if (!order) {
    return res.status(404).json({ success: false, message: "Order not found" });
  }

  const uid = req.user.id;
  const allowed =
    req.user.role === ROLES.ADMIN ||
    String(order.customerId) === uid ||
    String(order.vendorId) === uid;

  if (!allowed) {
    return res
      .status(403)
      .json({ success: false, message: "You do not have access to this order" });
  }

  res.json({ success: true, order });
};

// Vendor: Accept / Reject (শুধু pending, শুধু একবার)
export const decideOrder = async (req, res) => {
  const _id = toObjectId(req.params.id);
  if (!_id) {
    return res.status(400).json({ success: false, message: "Invalid order ID" });
  }

  const order = await orders().findOne({ _id });
  if (!order) {
    return res.status(404).json({ success: false, message: "Order not found" });
  }

  if (String(order.vendorId) !== req.user.id) {
    return res.status(403).json({
      success: false,
      message: "You can only manage orders for your own menu items",
    });
  }

  if (order.status !== ORDER_STATUS.PENDING) {
    return res
      .status(409)
      .json({ success: false, message: `Order is already ${order.status}` });
  }

  const status =
    req.validated.action === "accept" ? ORDER_STATUS.ACCEPTED : ORDER_STATUS.REJECTED;
  const now = new Date();

  const result = await orders().updateOne(
    { _id, vendorId: req.user._id, status: ORDER_STATUS.PENDING },
    { $set: { status, updatedAt: now }, $push: { statusHistory: { status, at: now } } }
  );

  if (result.modifiedCount === 0) {
    return res
      .status(409)
      .json({ success: false, message: "This order was already updated" });
  }

  res.json({ success: true, message: `Order ${status}`, status });
};

// Customer: নিজের pending অর্ডার ক্যান্সেল
export const cancelOrder = async (req, res) => {
  const _id = toObjectId(req.params.id);
  if (!_id) {
    return res.status(400).json({ success: false, message: "Invalid order ID" });
  }

  const order = await orders().findOne({ _id });
  if (!order) {
    return res.status(404).json({ success: false, message: "Order not found" });
  }

  if (String(order.customerId) !== req.user.id) {
    return res
      .status(403)
      .json({ success: false, message: "You can only cancel your own orders" });
  }

  if (order.status !== ORDER_STATUS.PENDING) {
    return res.status(409).json({
      success: false,
      message: `Only pending orders can be cancelled. This order is ${order.status}.`,
    });
  }

  const now = new Date();
  const result = await orders().updateOne(
    { _id, customerId: req.user._id, status: ORDER_STATUS.PENDING },
    {
      $set: { status: ORDER_STATUS.CANCELLED, updatedAt: now },
      $push: { statusHistory: { status: ORDER_STATUS.CANCELLED, at: now } },
    }
  );

  if (result.modifiedCount === 0) {
    return res
      .status(409)
      .json({ success: false, message: "This order was already updated" });
  }

  res.json({ success: true, message: "Order cancelled", status: ORDER_STATUS.CANCELLED });
};