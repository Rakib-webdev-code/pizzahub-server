import { getDB } from "../config/db.js";
import { MENU_STATUS } from "../utils/constants.js";
import { toObjectId } from "../utils/helpers.js";

const users = () => getDB().collection("users");
const items = () => getDB().collection("menuItems");

export const getFavorites = async (req, res) => {
  const me = await users().findOne({ _id: req.user._id }, { projection: { favorites: 1 } });
  const ids = me?.favorites || [];

  const list = ids.length
    ? await items()
        .aggregate([
          { $match: { _id: { $in: ids }, status: MENU_STATUS.APPROVED } },
          { $sort: { createdAt: -1, _id: 1 } },
          {
            $lookup: {
              from: "users",
              localField: "vendorId",
              foreignField: "_id",
              as: "vendor",
            },
          },
          { $unwind: "$vendor" },
          {
            $project: {
              itemName: 1,
              category: 1,
              price: 1,
              location: 1,
              images: 1,
              avgRating: 1,
              reviewCount: 1,
              vendor: {
                _id: "$vendor._id",
                name: "$vendor.name",
                businessName: "$vendor.businessName",
                image: "$vendor.image",
              },
            },
          },
        ])
        .toArray()
    : [];

  res.json({ success: true, items: list, ids: list.map((i) => String(i._id)) });
};

export const addFavorite = async (req, res) => {
  const _id = toObjectId(req.params.itemId);
  if (!_id) {
    return res.status(400).json({ success: false, message: "Invalid item ID" });
  }

  const item = await items().findOne(
    { _id, status: MENU_STATUS.APPROVED },
    { projection: { _id: 1 } }
  );
  if (!item) {
    return res.status(404).json({ success: false, message: "Menu item not found" });
  }

  await users().updateOne({ _id: req.user._id }, { $addToSet: { favorites: _id } });
  res.json({ success: true, message: "Added to favorites" });
};

export const removeFavorite = async (req, res) => {
  const _id = toObjectId(req.params.itemId);
  if (!_id) {
    return res.status(400).json({ success: false, message: "Invalid item ID" });
  }

  await users().updateOne({ _id: req.user._id }, { $pull: { favorites: _id } });
  res.json({ success: true, message: "Removed from favorites" });
};