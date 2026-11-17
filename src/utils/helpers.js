import { ObjectId } from "mongodb";

// বৈধ হলে ObjectId, নইলে null
export const toObjectId = (id) => {
  if (typeof id !== "string" || !ObjectId.isValid(id)) return null;
  const oid = new ObjectId(id);
  return String(oid) === id ? oid : null;
};