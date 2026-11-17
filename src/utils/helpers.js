import { ObjectId } from "mongodb";

// বৈধ হলে ObjectId, নইলে null
export const toObjectId = (id) => {
  if (typeof id !== "string" || !ObjectId.isValid(id)) return null;
  const oid = new ObjectId(id);
  return String(oid) === id ? oid : null;
};

export const isPremium = (user) =>
  user?.subscriptionPlan === "premium" &&
  (!user.subscriptionExpiresAt ||
    new Date(user.subscriptionExpiresAt) > new Date());

    export const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    // ইউজারের _id ObjectId বা string যেটাই হোক, দুটোই মিলিয়ে দেখে
export const idFilter = (id) => {
  const oid = toObjectId(id);
  return { _id: { $in: oid ? [oid, id] : [id] } };
};