import { Router } from "express";
import { requireVendor } from "../middleware/verifyRole.js";
import {
  createCheckoutSession,
  getCheckoutStatus,
  getSubscription,
  cancelSubscription,
} from "../controllers/paymentController.js";

const router = Router();

router.get("/subscription", requireVendor, getSubscription);
router.get("/checkout-status/:sessionId", requireVendor, getCheckoutStatus);
router.post("/create-checkout-session", requireVendor, createCheckoutSession);
router.post("/cancel-subscription", requireVendor, cancelSubscription);

export default router;