import { Router } from "express";
import { requireAuth, requireVendor } from "../middleware/verifyRole.js";
import { validate } from "../middleware/validate.js";
import {
  createMenuItemSchema,
  updateMenuItemSchema,
  availabilitySchema,
} from "../validators/menuSchemas.js";
import {
  createMenuItem,
  getMenuItems,
  getFeaturedItems,
  getLocations,
  getMyMenuItems,
  getMenuItemById,
  updateMenuItem,
  setAvailability,
  deleteMenuItem,
} from "../controllers/menuController.js";

const router = Router();

// পাবলিক
router.get("/", getMenuItems);
router.get("/featured", getFeaturedItems);
router.get("/locations", getLocations);

// Vendor (/mine অবশ্যই /:id এর আগে)
router.get("/mine", requireVendor, getMyMenuItems);
router.post("/", requireVendor, validate(createMenuItemSchema), createMenuItem);

// লগইন করা ইউজার
router.get("/:id", requireAuth, getMenuItemById);

// Vendor (শুধু মালিক)
router.patch("/:id", requireVendor, validate(updateMenuItemSchema), updateMenuItem);
router.patch("/:id/availability", requireVendor, validate(availabilitySchema), setAvailability);
router.delete("/:id", requireVendor, deleteMenuItem);

export default router;