import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import rateLimit from "express-rate-limit";
import { verifyJWT } from "./middleware/verifyJWT.js";
import { notFound, errorHandler } from "./middleware/errorHandler.js";
import userRoutes from "./routes/userRoutes.js";
import menuRoutes from "./routes/menuRoutes.js";

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

app.get("/api/session-check", verifyJWT, (req, res) => {
  res.json({ success: true, auth: req.auth });
});

app.use("/api/users", userRoutes);
app.use("/api/menu-items", menuRoutes);

// এই দুটো সবসময় সবার শেষে
app.use(notFound);
app.use(errorHandler);

export default app;