import express from "express";
import Joi from "joi";
import mongoose from "mongoose";
import { User } from "../config/database.js";
import { authenticate } from "../middleware/auth.js";
import { getRedisClient } from "../config/redis.js";

const router = express.Router();

const updateProfileSchema = Joi.object({
  firstName: Joi.string().trim().min(2).optional(),
  lastName: Joi.string().trim().min(2).optional(),
  phone: Joi.string().trim().allow("").optional(),
}).min(1);

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

    const payload = {
      id: user._id.toString(),
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      phone: user.phone,
      role: user.role,
    };

    await redis.setEx(`user:${userId}`, 3600, JSON.stringify(payload));

    res.json({ user: { ...payload, createdAt: user.createdAt } });
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
      user: {
        id: user._id.toString(),
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        phone: user.phone,
        role: user.role,
      },
    });
  } catch (error) {
    console.error("Update profile error:", error);
    res.status(500).json({ error: "Failed to update profile" });
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
