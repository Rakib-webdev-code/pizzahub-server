import { Router } from "express";
import userRoutes from "./userRoutes.js";
import menuRoutes from "./menuRoutes.js";
import adminRoutes from "./adminRoutes.js";

const router = Router();

router.use("/users", userRoutes);
router.use("/menu-items", menuRoutes);
router.use("/admin", adminRoutes);

export default router;