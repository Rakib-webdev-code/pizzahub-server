import { Router } from "express";
import { requireAdmin } from "../middleware/verifyRole.js";
import { validate } from "../middleware/validate.js";
import { menuStatusSchema } from "../validators/adminSchemas.js";
import {
  getAllMenuItems,
  updateMenuItemStatus,
  adminDeleteMenuItem,
} from "../controllers/adminController.js";

const router = Router();

// এই ফাইলের সব রুট শুধু Admin এর জন্য
router.use(requireAdmin);

router.get("/menu-items", getAllMenuItems);
router.patch("/menu-items/:id/status", validate(menuStatusSchema), updateMenuItemStatus);
router.delete("/menu-items/:id", adminDeleteMenuItem);

export default router;