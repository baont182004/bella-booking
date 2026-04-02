import express from "express";
import bcrypt from "bcryptjs";
import Joi from "joi";
import { User } from "../config/database.js";
import { generateToken } from "../middleware/auth.js";
import { getRedisClient } from "../config/redis.js";

const router = express.Router();

// Validation schemas
const registerSchema = Joi.object({
  email: Joi.string().trim().lowercase().email().required(),
  password: Joi.string().min(6).required(),
  firstName: Joi.string().trim().min(2).required(),
  lastName: Joi.string().trim().min(2).required(),
  phone: Joi.string().trim().allow("").optional(),
});

const loginSchema = Joi.object({
  email: Joi.string().trim().lowercase().email().required(),
  password: Joi.string().required(),
});

// -- Register ------------------------------------------------------------------
router.post("/register", async (req, res) => {
  try {
    const { error, value } = registerSchema.validate(req.body);
    if (error) return res.status(400).json({ error: error.details[0].message });

    const { email, password, firstName, lastName, phone } = value;

    // Check if user already exists
    const existing = await User.findOne({ email });
    if (existing) return res.status(400).json({ error: "User already exists" });

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await User.create({
      email,
      password: hashedPassword,
      firstName,
      lastName,
      phone,
    });

    const token = generateToken({
      id: user._id.toString(),
      email: user.email,
      role: user.role,
    });

    const profilePayload = {
      id: user._id.toString(),
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      phone: user.phone,
      role: user.role,
      createdAt: user.createdAt,
    };

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

    const user = await User.findOne({ email });
    if (!user) return res.status(401).json({ error: "Invalid credentials" });

    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword)
      return res.status(401).json({ error: "Invalid credentials" });

    const token = generateToken({
      id: user._id.toString(),
      email: user.email,
      role: user.role,
    });

    // Cache user session in Redis
    const redis = getRedisClient();
    const profilePayload = {
      id: user._id.toString(),
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      phone: user.phone,
      role: user.role,
      createdAt: user.createdAt,
    };
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
router.post("/logout", async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      res.json({ message: "Logout successful" });
    } else {
      res.status(400).json({ error: "No token provided" });
    }
  } catch (error) {
    console.error("Logout error:", error);
    res.status(500).json({ error: "Failed to logout" });
  }
});

export default router;
