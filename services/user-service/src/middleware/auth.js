import jwt from 'jsonwebtoken';
import { User } from "../config/database.js";

const JWT_ISSUER = "bella-user-service";
const JWT_AUDIENCE = "bella-clients";

function getJwtSecret() {
  if (!process.env.JWT_SECRET) {
    throw new Error("JWT_SECRET is required");
  }

  return process.env.JWT_SECRET;
}

function getJwtExpiresIn() {
  return process.env.JWT_EXPIRES_IN || "12h";
}

function generateToken(payload) {
  return jwt.sign(payload, getJwtSecret(), {
    expiresIn: getJwtExpiresIn(),
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
  });
}

function verifyToken(token) {
  try {
    return jwt.verify(token, getJwtSecret(), {
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
    });
  } catch (error) {
    throw new Error('Invalid or expired token');
  }
}

async function authenticate(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const token = authHeader.substring(7);
    const decoded = verifyToken(token);

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
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

export {
  generateToken,
  verifyToken,
  authenticate
};
