import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import rateLimit from "express-rate-limit";
import { verifyJWT } from "./middleware/verifyJWT.js";
import userRoutes from "./routes/userRoutes.js";

const app = express();

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

// NOTE: Stripe webhook route will be mounted BEFORE express.json()
// because it needs the raw request body.

app.use(express.json());
app.use(cookieParser());

app.get("/", (req, res) => {
  res.json({ success: true, message: "PizzaHub server is running 🍕" });
});

// টোকেন ঠিক আছে কিনা টেস্ট করার জন্য
app.get("/api/session-check", verifyJWT, (req, res) => {
  res.json({ success: true, auth: req.auth });
});

app.use("/api/users", userRoutes);

export default app;