import "dotenv/config";
import { MongoClient } from "mongodb";

const email = process.argv[2]?.trim().toLowerCase();

if (!email) {
  console.error("Usage: npm run make-admin -- <email>");
  process.exit(1);
}

const client = new MongoClient(process.env.MONGODB_URI);

try {
  await client.connect();
  const result = await client
    .db(process.env.DB_NAME || "pizzahub")
    .collection("users")
    .updateOne({ email }, { $set: { role: "admin", isBlocked: false } });

  console.log(
    result.matchedCount
      ? `Done: ${email} is now an admin`
      : `No user found with email: ${email}`
  );
} finally {
  await client.close();
}