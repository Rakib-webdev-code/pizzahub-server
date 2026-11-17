import { getDB } from "../config/db.js";
import { toObjectId } from "../utils/helpers.js";

// JWT এর পর চলে: ডাটাবেস থেকে ইউজার এনে block চেক করে, req.user সেট করে
export const verifyUser = async (req, res, next) => {
  const id = req.auth?.userId;
  if (!id) {
    return res.status(401).json({ success: false, message: "Unauthorized" });
  }

  const oid = toObjectId(id);
  const user = await getDB()
    .collection("users")
    .findOne({ _id: { $in: oid ? [oid, id] : [id] } });

  if (!user) {
    return res.status(401).json({ success: false, message: "User not found" });
  }

  if (user.isBlocked) {
    return res.status(403).json({
      success: false,
      message: "Your account has been blocked. Please contact support.",
    });
  }

  req.user = {
    _id: user._id,
    id: String(user._id),
    name: user.name,
    email: user.email,
    image: user.image,
    role: user.role || null,
    businessName: user.businessName || null,
    subscriptionPlan: user.subscriptionPlan || "free",
    subscriptionExpiresAt: user.subscriptionExpiresAt || null,
  };
  next();
};