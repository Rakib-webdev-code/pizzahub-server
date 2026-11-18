import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import rateLimit from "express-rate-limit";
import { verifyJWT } from "./middleware/verifyJWT.js";
import { notFound, errorHandler } from "./middleware/errorHandler.js";
import { stripeWebhook } from "./controllers/paymentController.js";
import apiRoutes from "./routes/index.js";

const app = express();

// Vercel/Render এর proxy এর পেছনে সঠিক IP পেতে (rate limit এর জন্য)
app.set("trust proxy", 1);

app.use(helmet());

app.use(
  cors({
    origin: (process.env.CLIENT_URL || "http://localhost:3000").split(","),
    credentials: true,
    methods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 300,
    standardHeaders: true,
    legacyHeaders: false,
  })
);

// Stripe webhook: অবশ্যই express.json() এর আগে, কারণ raw body লাগে
app.post(
  "/api/payments/webhook",
  express.raw({ type: "application/json" }),
  stripeWebhook
);

app.use(express.json());
app.use(cookieParser());

app.get("/", (req, res) => {
  res.json({ success: true, message: "PizzaHub server is running 🍕" });
});

app.get("/api/session-check", verifyJWT, (req, res) => {
  res.json({ success: true, auth: req.auth });
});

app.use("/api", apiRoutes);

// এই দুটো সবসময় সবার শেষে
app.use(notFound);
app.use(errorHandler);

export default app;