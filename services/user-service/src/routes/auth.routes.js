import express from "express";
import bcrypt from "bcryptjs";
import Joi from "joi";
import { User } from "../config/database.js";
import { generateToken } from "../middleware/auth.js";
import { authenticate } from "../middleware/auth.js";
import { getRedisClient } from "../config/redis.js";
import { createRateLimiter } from "../middleware/rateLimit.js";
import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  PASSWORD_POLICY_REGEX,
  getPasswordPolicyMessage,
} from "../utils/passwordPolicy.js";
import { buildUserProfile } from "../utils/profilePayload.js";

const router = express.Router();

const registerRateLimit = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  maxRequests: 8,
  message: "Too many account creation attempts. Please try again later.",
  prefix: "auth-register",
});

const failedLoginAttemptWindowMs = 15 * 60 * 1000;
const maxFailedLoginAttempts = 10;

// Validation schemas
const registerSchema = Joi.object({
  email: Joi.string().trim().lowercase().email().required(),
  password: Joi.string()
    .min(PASSWORD_MIN_LENGTH)
    .max(PASSWORD_MAX_LENGTH)
    .pattern(PASSWORD_POLICY_REGEX)
    .required()
    .messages({
      "string.pattern.base": getPasswordPolicyMessage(),
      "string.min": getPasswordPolicyMessage(),
      "string.max": getPasswordPolicyMessage(),
    }),
  firstName: Joi.string().trim().min(2).required(),
  lastName: Joi.string().trim().min(2).required(),
  phone: Joi.string().trim().allow("").optional(),
}).unknown(false);

const loginSchema = Joi.object({
  email: Joi.string().trim().lowercase().email().required(),
  password: Joi.string().required(),
}).unknown(false);

function buildTokenPayload(user) {
  return {
    id: user._id.toString(),
    email: user.email,
    role: user.role,
    sessionVersion: user.sessionVersion,
  };
}

function normalizeEmail(email = "") {
  return email.trim().toLowerCase();
}

function getClientIp(req) {
  return String(req.ip || "unknown").replace(/^::ffff:/, "");
}

function buildLoginAttemptKey(req, email) {
  return `auth-login:${getClientIp(req)}:${normalizeEmail(email) || "anonymous"}`;
}

async function getActiveLoginAttemptBucket(key) {
  const redis = getRedisClient();
  const currentCount = Number(await redis.get(key));
  if (!Number.isFinite(currentCount) || currentCount <= 0) {
    return null;
  }

  const ttlMs = await redis.pTTL(key);
  if (!Number.isFinite(ttlMs) || ttlMs <= 0) {
    return null;
  }

  return {
    count: currentCount,
    ttlMs,
  };
}

function getLoginRetryAfterSeconds(bucket) {
  return Math.max(1, Math.ceil((bucket.ttlMs || 0) / 1000));
}

async function recordFailedLoginAttempt(key) {
  const redis = getRedisClient();
  const count = await redis.incr(key);
  if (count === 1) {
    await redis.pExpire(key, failedLoginAttemptWindowMs);
  }

  const ttlMs = await redis.pTTL(key);
  return { count, ttlMs };
}

async function clearFailedLoginAttempts(key) {
  const redis = getRedisClient();
  await redis.del(key);
}

function sendLoginRateLimitResponse(res, bucket) {
  const retryAfterSeconds = getLoginRetryAfterSeconds(bucket);
  res.setHeader("Retry-After", retryAfterSeconds);
  return res.status(429).json({
    error: "Too many failed login attempts. Please wait a few minutes and try again.",
    retryAfterSeconds,
  });
}

// -- Register ------------------------------------------------------------------
router.post("/register", registerRateLimit, async (req, res) => {
  try {
    const { error, value } = registerSchema.validate(req.body);
    if (error) return res.status(400).json({ error: error.details[0].message });

    const { email, password, firstName, lastName, phone } = value;

    // Check if user already exists
    const existing = await User.findOne({ email });
    if (existing) return res.status(409).json({ error: "User already exists" });

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await User.create({
      email,
      password: hashedPassword,
      firstName,
      lastName,
      phone,
      sessionVersion: 0,
    });

    const token = generateToken(buildTokenPayload(user));

    const profilePayload = buildUserProfile(user);

    const redis = getRedisClient();
    await redis.setEx(`user:${user._id.toString()}`, 3600, JSON.stringify(profilePayload));

    res.status(201).json({
      message: "User registered successfully",
      user: profilePayload,
      token,
    });
  } catch (error) {
    console.error("Register error:", error);
    res.status(500).json({ error: "Failed to register user" });
  }
});

// -- Login ---------------------------------------------------------------------
router.post("/login", async (req, res) => {
  try {
    const { error, value } = loginSchema.validate(req.body);
    if (error) return res.status(400).json({ error: error.details[0].message });

    const { email, password } = value;
    const loginAttemptKey = buildLoginAttemptKey(req, email);
    const activeLoginAttemptBucket = await getActiveLoginAttemptBucket(loginAttemptKey);

    if (activeLoginAttemptBucket && activeLoginAttemptBucket.count >= maxFailedLoginAttempts) {
      return sendLoginRateLimitResponse(res, activeLoginAttemptBucket);
    }

    const user = await User.findOne({ email });
    if (!user) {
      const failedAttemptBucket = await recordFailedLoginAttempt(loginAttemptKey);
      if (failedAttemptBucket.count >= maxFailedLoginAttempts) {
        return sendLoginRateLimitResponse(res, failedAttemptBucket);
      }

      return res.status(401).json({ error: "Invalid credentials" });
    }

    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      const failedAttemptBucket = await recordFailedLoginAttempt(loginAttemptKey);
      if (failedAttemptBucket.count >= maxFailedLoginAttempts) {
        return sendLoginRateLimitResponse(res, failedAttemptBucket);
      }

      return res.status(401).json({ error: "Invalid credentials" });
    }

    await clearFailedLoginAttempts(loginAttemptKey);

    const token = generateToken(buildTokenPayload(user));

    // Cache user session in Redis
    const redis = getRedisClient();
    const profilePayload = buildUserProfile(user);
    await redis.setEx(
      `user:${user._id.toString()}`,
      3600,
      JSON.stringify(profilePayload),
    );

    res.json({
      message: "Login successful",
      user: profilePayload,
      token,
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ error: "Failed to login" });
  }
});

// -- Logout --------------------------------------------------------------------
router.post("/logout", authenticate, async (req, res) => {
  try {
    await User.findByIdAndUpdate(req.user.id, {
      $inc: { sessionVersion: 1 },
    });

    const redis = getRedisClient();
    await redis.del(`user:${req.user.id}`);

    res.json({ message: "Logout successful" });
  } catch (error) {
    console.error("Logout error:", error);
    res.status(500).json({ error: "Failed to logout" });
  }
});

export default router;
