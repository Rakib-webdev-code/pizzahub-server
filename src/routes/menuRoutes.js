import { Router } from "express";
import { requireVendor } from "../middleware/verifyRole.js";
import { validate } from "../middleware/validate.js";
import { createMenuItemSchema } from "../validators/menuSchemas.js";
import {
  createMenuItem,
  getMenuItems,
  getFeaturedItems,
  getLocations,
} from "../controllers/menuController.js";

const router = Router();

// পাবলিক
router.get("/", getMenuItems);
router.get("/featured", getFeaturedItems);
router.get("/locations", getLocations);

// Vendor
router.post("/", requireVendor, validate(createMenuItemSchema), createMenuItem);

export default router;