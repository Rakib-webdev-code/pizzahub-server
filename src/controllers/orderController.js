import { getDB } from "../config/db.js";
import { MENU_STATUS, ORDER_STATUS } from "../utils/constants.js";
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