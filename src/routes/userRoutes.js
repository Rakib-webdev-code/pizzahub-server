import { Router } from "express";
import { requireAuth } from "../middleware/verifyRole.js";

const router = Router();

// বর্তমান ইউজারের তথ্য (client এ role অনুযায়ী redirect এর জন্য)
router.get("/me", requireAuth, (req, res) => {
  res.json({ success: true, user: req.user });
});

export default router;