import express from "express";
import bcrypt from "bcryptjs";
import Joi from "joi";
import mongoose from "mongoose";
import { User } from "../config/database.js";
import { authenticate } from "../middleware/auth.js";
import { generateToken } from "../middleware/auth.js";
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

const passwordRateLimit = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  maxRequests: 5,
  message: "Too many password change attempts. Please try again later.",
});

const updateProfileSchema = Joi.object({
  firstName: Joi.string().trim().min(2).optional(),
  lastName: Joi.string().trim().min(2).optional(),
  phone: Joi.string().trim().allow("").optional(),
}).min(1).unknown(false);

const changePasswordSchema = Joi.object({
  currentPassword: Joi.string().required(),
  newPassword: Joi.string()
    .min(PASSWORD_MIN_LENGTH)
    .max(PASSWORD_MAX_LENGTH)
    .pattern(PASSWORD_POLICY_REGEX)
    .required()
    .messages({
      "string.pattern.base": getPasswordPolicyMessage(),
      "string.min": getPasswordPolicyMessage(),
      "string.max": getPasswordPolicyMessage(),
    }),
}).unknown(false);

const listUsersQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(50).default(20),
  search: Joi.string().trim().allow("").default(""),
}).unknown(false);

function escapeRegex(value = "") {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// -- GET /profile ---------------------------------------------------------------
router.get("/profile", authenticate, async (req, res) => {
  try {
    const userId = req.user.id;

    // Try cache first
    const redis = getRedisClient();
    const cached = await redis.get(`user:${userId}`);
    if (cached) {
      return res.json({ user: JSON.parse(cached) });
    }

    const user = await User.findById(userId).select(
      "email firstName lastName phone role createdAt",
    );

    if (!user) return res.status(404).json({ error: "User not found" });

    const payload = buildUserProfile(user);

    await redis.setEx(`user:${userId}`, 3600, JSON.stringify(payload));

    res.json({ user: payload });
  } catch (error) {
    console.error("Get profile error:", error);
    res.status(500).json({ error: "Failed to get user profile" });
  }
});

// -- PUT /profile ---------------------------------------------------------------
router.put("/profile", authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    const { error, value } = updateProfileSchema.validate(req.body);
    if (error) return res.status(400).json({ error: error.details[0].message });

    const { firstName, lastName, phone } = value;

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ error: "User not found" });

    if (firstName !== undefined) user.firstName = firstName;
    if (lastName !== undefined) user.lastName = lastName;
    if (phone !== undefined) user.phone = phone;
    await user.save();

    // Invalidate cache
    const redis = getRedisClient();
    await redis.del(`user:${userId}`);

    res.json({
      message: "Profile updated successfully",
      user: buildUserProfile(user),
    });
  } catch (error) {
    console.error("Update profile error:", error);
    res.status(500).json({ error: "Failed to update profile" });
  }
});

// -- PUT /password --------------------------------------------------------------
router.put("/password", authenticate, passwordRateLimit, async (req, res) => {
  try {
    const { error, value } = changePasswordSchema.validate(req.body);
    if (error) return res.status(400).json({ error: error.details[0].message });

    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: "User not found" });

    const isValidPassword = await bcrypt.compare(value.currentPassword, user.password);
    if (!isValidPassword) {
      return res.status(401).json({ error: "Current password is incorrect" });
    }
    if (value.currentPassword === value.newPassword) {
      return res.status(400).json({
        error: "New password must be different from the current password",
      });
    }

    user.password = await bcrypt.hash(value.newPassword, 10);
    user.sessionVersion += 1;
    await user.save();

    const redis = getRedisClient();
    await redis.del(`user:${req.user.id}`);

    const token = generateToken({
      id: user._id.toString(),
      email: user.email,
      role: user.role,
      sessionVersion: user.sessionVersion,
    });

    res.json({
      message: "Password updated successfully",
      token,
      user: buildUserProfile(user),
    });
  } catch (error) {
    console.error("Change password error:", error);
    res.status(500).json({ error: "Failed to change password" });
  }
});

// -- GET / (admin only) ---------------------------------------------------------
router.get("/", authenticate, async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ error: "Access denied" });
    }

    const { error, value } = listUsersQuerySchema.validate(req.query);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    const search = value.search
      ? {
          $or: [
            { email: { $regex: escapeRegex(value.search), $options: "i" } },
            { firstName: { $regex: escapeRegex(value.search), $options: "i" } },
            { lastName: { $regex: escapeRegex(value.search), $options: "i" } },
          ],
        }
      : {};

    const [users, total] = await Promise.all([
      User.find(search)
        .select("email firstName lastName phone role createdAt")
        .sort({ createdAt: -1 })
        .skip((value.page - 1) * value.limit)
        .limit(value.limit),
      User.countDocuments(search),
    ]);

    res.json({
      users: users.map((user) => ({
        id: user._id.toString(),
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        phone: user.phone,
        role: user.role,
        createdAt: user.createdAt,
      })),
      pagination: {
        page: value.page,
        limit: value.limit,
        total,
        totalPages: Math.ceil(total / value.limit) || 1,
      },
    });
  } catch (error) {
    console.error("List users error:", error);
    res.status(500).json({ error: "Failed to list users" });
  }
});

// -- GET /:id (admin only) ------------------------------------------------------
router.get("/:id", authenticate, async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ error: "Access denied" });
    }
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ error: "Invalid user id" });
    }

    const user = await User.findById(req.params.id).select(
      "email firstName lastName phone role createdAt",
    );

    if (!user) return res.status(404).json({ error: "User not found" });

    res.json({
      user: {
        id: user._id.toString(),
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        phone: user.phone,
        role: user.role,
        createdAt: user.createdAt,
      },
    });
  } catch (error) {
    console.error("Get user error:", error);
    res.status(500).json({ error: "Failed to get user" });
  }
});

export default router;
