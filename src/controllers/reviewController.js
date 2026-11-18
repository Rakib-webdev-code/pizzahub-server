import { ObjectId } from "mongodb";
import { getDB } from "../config/db.js";
import { ORDER_STATUS } from "../utils/constants.js";
import { toObjectId } from "../utils/helpers.js";

const items = () => getDB().collection("menuItems");
const orders = () => getDB().collection("orders");

// reviews array থেকে average ও সংখ্যা আবার হিসাব
const recalcRating = (_id) =>
  items().updateOne({ _id }, [
    {
      $set: {
        reviewCount: { $size: { $ifNull: ["$reviews", []] } },
        avgRating: {
          $round: [{ $ifNull: [{ $avg: "$reviews.rating" }, 0] }, 1],
        },
      },
    },
  ]);

const hasAcceptedOrder = (customerId, itemId) =>
  orders().findOne(
    { customerId, itemId, status: ORDER_STATUS.ACCEPTED },
    { projection: { _id: 1 } }
  );

// UI তে Review ফর্ম দেখাবে কিনা
export const getReviewEligibility = async (req, res) => {
  const _id = toObjectId(req.params.id);
  if (!_id) {
    return res.status(400).json({ success: false, message: "Invalid item ID" });
  }

  const [item, accepted] = await Promise.all([
    items().findOne({ _id }, { projection: { reviews: 1 } }),
    hasAcceptedOrder(req.user._id, _id),
  ]);

  if (!item) {
    return res.status(404).json({ success: false, message: "Menu item not found" });
  }

  const hasReviewed = (item.reviews || []).some(
    (r) => String(r.customerId) === req.user.id
  );

  res.json({
    success: true,
    canReview: Boolean(accepted) && !hasReviewed,
    hasReviewed,
    hasAcceptedOrder: Boolean(accepted),
  });
};

export const addReview = async (req, res) => {
  const _id = toObjectId(req.params.id);
  if (!_id) {
    return res.status(400).json({ success: false, message: "Invalid item ID" });
  }

  const item = await items().findOne({ _id }, { projection: { _id: 1 } });
  if (!item) {
    return res.status(404).json({ success: false, message: "Menu item not found" });
  }

  if (!(await hasAcceptedOrder(req.user._id, _id))) {
    return res.status(403).json({
      success: false,
      message: "You can review an item only after your order for it has been accepted",
    });
  }

  const review = {
    _id: new ObjectId(),
    customerId: req.user._id,
    customerName: req.user.name,
    customerImage: req.user.image || null,
    rating: req.validated.rating,
    comment: req.validated.comment,
    createdAt: new Date(),
  };

  // একই customer এর review থাকলে filter মিলবে না (matchedCount 0)
  const result = await items().updateOne(
    { _id, "reviews.customerId": { $ne: req.user._id } },
    { $push: { reviews: review } }
  );

  if (result.matchedCount === 0) {
    return res
      .status(409)
      .json({ success: false, message: "You have already reviewed this item" });
  }

  await recalcRating(_id);
  res.status(201).json({ success: true, message: "Review added", review });
};

export const deleteMyReview = async (req, res) => {
  const _id = toObjectId(req.params.id);
  if (!_id) {
    return res.status(400).json({ success: false, message: "Invalid item ID" });
  }

  const result = await items().updateOne(
    { _id },
    { $pull: { reviews: { customerId: req.user._id } } }
  );

  if (result.modifiedCount === 0) {
    return res.status(404).json({ success: false, message: "Review not found" });
  }

  await recalcRating(_id);
  res.json({ success: true, message: "Review deleted" });
};