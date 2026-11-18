import { Router } from "express";
import userRoutes from "./userRoutes.js";
import menuRoutes from "./menuRoutes.js";
import adminRoutes from "./adminRoutes.js";
import orderRoutes from "./orderRoutes.js";
import paymentRoutes from "./paymentRoutes.js";
import statsRoutes from "./statsRoutes.js";
import favoriteRoutes from "./favoriteRoutes.js";

const router = Router();

router.use("/users", userRoutes);
router.use("/menu-items", menuRoutes);
router.use("/admin", adminRoutes);
router.use("/orders", orderRoutes);
router.use("/payments", paymentRoutes);
router.use("/stats", statsRoutes);
router.use("/favorites", favoriteRoutes);

export default router;