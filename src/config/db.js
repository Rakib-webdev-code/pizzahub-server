import { MongoClient } from "mongodb";

let client;
let db;

export const connectDB = async () => {
  if (db) return db;

  if (!process.env.MONGODB_URI) {
    throw new Error("MONGODB_URI is missing in environment variables");
  }

  client = new MongoClient(process.env.MONGODB_URI);
  await client.connect();
  db = client.db(process.env.DB_NAME || "pizzahub");
  console.log("MongoDB connected");
  return db;
};

export const getDB = () => {
  if (!db) throw new Error("Database is not connected yet");
  return db;
};