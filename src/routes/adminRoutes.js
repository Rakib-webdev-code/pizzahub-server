import { Router } from "express";
import { requireAdmin } from "../middleware/verifyRole.js";
import { validate } from "../middleware/validate.js";
import { menuStatusSchema, blockSchema } from "../validators/adminSchemas.js";
import {
  getAllMenuItems,
  updateMenuItemStatus,
  adminDeleteMenuItem,
  getAllUsers,
  getUserDetails,
  setBlockStatus,
  getTransactions,
} from "../controllers/adminController.js";

const router = Router();

// এই ফাইলের সব রুট শুধু Admin এর জন্য
router.use(requireAdmin);

// ইউজার ম্যানেজমেন্ট
router.get("/users", getAllUsers);
router.get("/users/:id", getUserDetails);
router.patch("/users/:id/block", validate(blockSchema), setBlockStatus);

// মেনু আইটেম রিভিউ
router.get("/menu-items", getAllMenuItems);
router.patch("/menu-items/:id/status", validate(menuStatusSchema), updateMenuItemStatus);
router.delete("/menu-items/:id", adminDeleteMenuItem);

// ট্রানজেকশন (শুধু পড়া)
router.get("/transactions", getTransactions);

export default router;