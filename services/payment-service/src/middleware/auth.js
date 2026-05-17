import jwt from "jsonwebtoken";
import { User } from "../config/database.js";

const JWT_ISSUER = "bella-user-service";
const JWT_AUDIENCE = "bella-clients";

function getJwtSecret() {
  if (!process.env.JWT_SECRET) {
    throw new Error("JWT_SECRET is required");
  }

  return process.env.JWT_SECRET;
}

export async function authenticate(req, res, next) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const token = authHeader.slice(7);
    const decoded = jwt.verify(token, getJwtSecret(), {
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
    });
    const user = await User.findById(decoded.id).select(
      "email firstName lastName phone role sessionVersion createdAt",
    );

    if (!user || user.sessionVersion !== decoded.sessionVersion) {
      return res.status(401).json({ error: "Session is no longer valid" });
    }

    req.user = {
      id: user._id.toString(),
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      phone: user.phone,
      role: user.role,
      sessionVersion: user.sessionVersion,
      createdAt: user.createdAt,
    };
    next();
  } catch (error) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: "Access denied" });
    }

    next();
  };
}
