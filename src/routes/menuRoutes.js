import { Router } from "express";
import {
  requireAuth,
  requireVendor,
  requireCustomer,
} from "../middleware/verifyRole.js";
import { validate } from "../middleware/validate.js";
import {
  createMenuItemSchema,
  updateMenuItemSchema,
  availabilitySchema,
} from "../validators/menuSchemas.js";
import { reviewSchema } from "../validators/reviewSchemas.js";
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
import {
  getReviewEligibility,
  addReview,
  deleteMyReview,
} from "../controllers/reviewController.js";

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

// Reviews (Customer)
router.get("/:id/review-eligibility", requireCustomer, getReviewEligibility);
router.post("/:id/reviews", requireCustomer, validate(reviewSchema), addReview);
router.delete("/:id/reviews", requireCustomer, deleteMyReview);

// Vendor (শুধু মালিক)
router.patch("/:id", requireVendor, validate(updateMenuItemSchema), updateMenuItem);
router.patch("/:id/availability", requireVendor, validate(availabilitySchema), setAvailability);
router.delete("/:id", requireVendor, deleteMenuItem);

export default router;