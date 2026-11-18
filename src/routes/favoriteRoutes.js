import { Router } from "express";
import { requireCustomer } from "../middleware/verifyRole.js";
import {
  getFavorites,
  addFavorite,
  removeFavorite,
} from "../controllers/favoriteController.js";

const router = Router();

router.get("/", requireCustomer, getFavorites);
router.post("/:itemId", requireCustomer, addFavorite);
router.delete("/:itemId", requireCustomer, removeFavorite);

export default router;