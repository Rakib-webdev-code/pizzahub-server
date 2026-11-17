import { Router } from "express";
import { requireVendor } from "../middleware/verifyRole.js";
import { validate } from "../middleware/validate.js";
import { createMenuItemSchema } from "../validators/menuSchemas.js";
import { createMenuItem } from "../controllers/menuController.js";

const router = Router();

router.post("/", requireVendor, validate(createMenuItemSchema), createMenuItem);

export default router;