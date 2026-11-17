import { Router } from "express";
import { requireCustomer } from "../middleware/verifyRole.js";
import { validate } from "../middleware/validate.js";
import { createOrderSchema } from "../validators/orderSchemas.js";
import { createOrder } from "../controllers/orderController.js";

const router = Router();

router.post("/", requireCustomer, validate(createOrderSchema), createOrder);

export default router;