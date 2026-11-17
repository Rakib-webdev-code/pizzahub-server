import { ROLES } from "../utils/constants.js";
import { verifyJWT } from "./verifyJWT.js";
import { verifyUser } from "./verifyUser.js";

export const verifyRole =
  (...allowedRoles) =>
  (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }
    if (!allowedRoles.includes(req.user.role)) {
      return res
        .status(403)
        .json({ success: false, message: "Forbidden: insufficient permissions" });
    }
    next();
  };

// রুটে সরাসরি ব্যবহার করার জন্য
export const requireAuth = [verifyJWT, verifyUser];
export const requireAdmin = [...requireAuth, verifyRole(ROLES.ADMIN)];
export const requireVendor = [...requireAuth, verifyRole(ROLES.VENDOR)];
export const requireCustomer = [...requireAuth, verifyRole(ROLES.CUSTOMER)];