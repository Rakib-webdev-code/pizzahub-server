import { Router } from "express";
import { requireAdmin, requireCustomer, requireVendor } from "../middleware/verifyRole.js";
import { vendorStats, customerStats, adminStats } from "../controllers/statsController.js";

const router = Router();

router.get("/vendor", requireVendor, vendorStats);
router.get("/customer", requireCustomer, customerStats);
router.get("/admin", requireAdmin, adminStats);

export default router;