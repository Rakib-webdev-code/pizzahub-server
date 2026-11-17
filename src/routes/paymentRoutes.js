import { Router } from "express";
import { requireVendor } from "../middleware/verifyRole.js";
import { createCheckoutSession } from "../controllers/paymentController.js";

const router = Router();

router.post("/create-checkout-session", requireVendor, createCheckoutSession);

export default router;