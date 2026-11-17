import { createRemoteJWKSet, jwtVerify } from "jose";

let jwks;

// Better Auth (Next.js) এর পাবলিক key set, প্রথমবার দরকারে লোড হয় ও cache থাকে
const getJWKS = () => {
  if (!jwks) {
    jwks = createRemoteJWKSet(
      new URL("/api/auth/jwks", process.env.BETTER_AUTH_URL)
    );
  }
  return jwks;
};

export const verifyJWT = async (req, res, next) => {
  try {
    const header = req.headers.authorization;

    if (!header || !header.startsWith("Bearer ")) {
      return res
        .status(401)
        .json({ success: false, message: "Unauthorized: token missing" });
    }

    const token = header.split(" ")[1];

    const { payload } = await jwtVerify(token, getJWKS(), {
      issuer: process.env.BETTER_AUTH_URL,
      audience: process.env.BETTER_AUTH_URL,
    });

    const userId = payload.id || payload.sub;
    if (!userId) {
      return res
        .status(401)
        .json({ success: false, message: "Unauthorized: invalid token" });
    }

    // শুধু পরিচয়, role এখানে বিশ্বাস করা হয় না (পরের middleware ডাটাবেস থেকে নেবে)
    req.auth = { userId: String(userId), email: payload.email };
    next();
  } catch (err) {
    if (process.env.NODE_ENV !== "production") {
      console.error("JWT verify failed:", err.code || err.message);
    }

    const message =
      err.code === "ERR_JWT_EXPIRED"
        ? "Unauthorized: token expired"
        : "Unauthorized: invalid token";

    return res.status(401).json({ success: false, message });
  }
};