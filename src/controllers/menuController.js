import { getDB } from "../config/db.js";
import { MENU_STATUS, FREE_PLAN_ITEM_LIMIT } from "../utils/constants.js";
import { isPremium } from "../utils/helpers.js";

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