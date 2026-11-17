import { Router } from "express";
import {
  requireAuth,
  requireCustomer,
  requireVendor,
} from "../middleware/verifyRole.js";
import { validate } from "../middleware/validate.js";
import { createOrderSchema, decisionSchema } from "../validators/orderSchemas.js";
import {
  createOrder,
  getMyOrders,
  getVendorOrders,
  getOrderById,
  decideOrder,
  cancelOrder,
} from "../controllers/orderController.js";

const router = Router();

// /my ও /vendor অবশ্যই /:id এর আগে
router.get("/my", requireCustomer, getMyOrders);
router.get("/vendor", requireVendor, getVendorOrders);
router.get("/:id", requireAuth, getOrderById);

router.post("/", requireCustomer, validate(createOrderSchema), createOrder);
router.patch("/:id/decision", requireVendor, validate(decisionSchema), decideOrder);
router.patch("/:id/cancel", requireCustomer, cancelOrder);

export default router;