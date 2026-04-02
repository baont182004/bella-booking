import express from "express";
import Joi from "joi";
import mongoose from "mongoose";
import { Hotel, Room } from "../config/database.js";
import { getRedisClient } from "../config/redis.js";
import { authenticate, requireRole } from "../middleware/auth.js";
import {
  BELLA_HOTEL_NAME,
  clearHotelCaches,
  syncBellaRoomMetadata,
} from "../services/bellaMetadataSync.js";

const router = express.Router();
const CACHE_TTL = 3600;

const hotelSchema = Joi.object({
  name: Joi.string().min(3).required(),
  description: Joi.string().optional(),
  address: Joi.string().required(),
  city: Joi.string().required(),
  country: Joi.string().required(),
  rating: Joi.number().min(0).max(5).optional(),
  amenities: Joi.array().items(Joi.string()).optional(),
  images: Joi.array().items(Joi.string()).optional(),
});

const roomSchema = Joi.object({
  roomNumber: Joi.string().required(),
  roomType: Joi.string().required(),
  description: Joi.string().optional(),
  pricePerNight: Joi.number().positive().required(),
  capacity: Joi.number().integer().positive().required(),
  amenities: Joi.array().items(Joi.string()).optional(),
  images: Joi.array().items(Joi.string()).optional(),
  isAvailable: Joi.boolean().optional(),
});

function normalizeHotelName(value) {
  return value?.trim().toLowerCase() || "";
}

function isBellaHotelName(value) {
  return normalizeHotelName(value) === normalizeHotelName(BELLA_HOTEL_NAME);
}

async function loadBellaHotelById(hotelId) {
  return Hotel.findOne({
    _id: hotelId,
    name: BELLA_HOTEL_NAME,
  }).lean();
}

// -- POST /admin/bella/metadata/sync ------------------------------------------
router.post("/admin/bella/metadata/sync", authenticate, requireRole("admin"), async (req, res) => {
  try {
    const result = await syncBellaRoomMetadata();

    res.json({
      message: "Bella room metadata synced successfully",
      result,
    });
  } catch (error) {
    console.error("Sync Bella metadata error:", error);
    res.status(500).json({ error: "Failed to sync Bella room metadata" });
  }
});

// -- GET /  (Bella-only hotel list) -------------------------------------------
router.get("/", async (req, res) => {
  try {
    const { city, country, minRating, page = 1, limit = 10 } = req.query;

    const cacheKey = `hotels:bella:${city || "all"}:${country || "all"}:${minRating || "all"}:${page}:${limit}`;
    const redis = getRedisClient();
    const cached = await redis.get(cacheKey);
    if (cached) {
      return res.json(JSON.parse(cached));
    }

    const filter = { name: BELLA_HOTEL_NAME };
    if (city) {
      filter.city = { $regex: city, $options: "i" };
    }
    if (country) {
      filter.country = { $regex: country, $options: "i" };
    }
    if (minRating) {
      filter.rating = { $gte: parseFloat(minRating) };
    }

    const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);

    const [hotels, count] = await Promise.all([
      Hotel.find(filter)
        .sort({ rating: -1 })
        .skip(offset)
        .limit(parseInt(limit, 10))
        .lean(),
      Hotel.countDocuments(filter),
    ]);

    const response = {
      hotels: hotels.map((hotel) => ({
        ...hotel,
        id: hotel._id.toString(),
      })),
      pagination: {
        page: parseInt(page, 10),
        limit: parseInt(limit, 10),
        total: count,
        totalPages: Math.ceil(count / parseInt(limit, 10)),
      },
    };

    await redis.setEx(cacheKey, CACHE_TTL, JSON.stringify(response));
    res.json(response);
  } catch (error) {
    console.error("Get hotels error:", error);
    res.status(500).json({ error: "Failed to fetch hotels" });
  }
});

// -- GET /:id ------------------------------------------------------------------
router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: "Invalid hotel id" });
    }

    const cacheKey = `hotel:bella:${id}`;
    const redis = getRedisClient();
    const cached = await redis.get(cacheKey);
    if (cached) {
      return res.json(JSON.parse(cached));
    }

    const hotel = await loadBellaHotelById(id);
    if (!hotel) {
      return res.status(404).json({ error: "Hotel not found" });
    }

    const payload = { hotel: { ...hotel, id: hotel._id.toString() } };
    await redis.setEx(cacheKey, CACHE_TTL, JSON.stringify(payload));
    res.json(payload);
  } catch (error) {
    console.error("Get hotel error:", error);
    res.status(500).json({ error: "Failed to fetch hotel" });
  }
});

// -- POST / --------------------------------------------------------------------
router.post("/", authenticate, requireRole("admin"), async (req, res) => {
  try {
    const { error, value } = hotelSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }
    if (!isBellaHotelName(value.name)) {
      return res.status(400).json({
        error: "This service only supports BELLA HOTEL Phu Quoc",
      });
    }

    const existingBella = await Hotel.findOne({ name: BELLA_HOTEL_NAME }).lean();
    if (existingBella) {
      return res.status(409).json({
        error: "BELLA HOTEL Phu Quoc already exists in this system",
      });
    }

    const hotel = await Hotel.create({
      name: BELLA_HOTEL_NAME,
      description: value.description,
      address: value.address,
      city: value.city,
      country: value.country,
      rating: value.rating || 0,
      amenities: value.amenities || [],
      images: value.images || [],
    });

    await clearHotelCaches(["hotels:*", "hotel:*"]);

    res.status(201).json({
      message: "Hotel created successfully",
      hotel: { ...hotel.toObject(), id: hotel._id.toString() },
    });
  } catch (error) {
    console.error("Create hotel error:", error);
    res.status(500).json({ error: "Failed to create hotel" });
  }
});

// -- GET /:id/rooms ------------------------------------------------------------
router.get("/:id/rooms", async (req, res) => {
  try {
    const { id } = req.params;
    const { roomType, minPrice, maxPrice, available } = req.query;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: "Invalid hotel id" });
    }

    const hotel = await loadBellaHotelById(id);
    if (!hotel) {
      return res.status(404).json({ error: "Hotel not found" });
    }

    const cacheKey = `hotel:bella:${id}:rooms:${roomType || "all"}:${minPrice || "all"}:${maxPrice || "all"}:${available || "all"}`;
    const redis = getRedisClient();
    const cached = await redis.get(cacheKey);
    if (cached) {
      return res.json(JSON.parse(cached));
    }

    const where = { hotel_id: new mongoose.Types.ObjectId(id) };
    if (roomType) {
      where.room_type = { $regex: roomType, $options: "i" };
    }
    if (minPrice) {
      where.price_per_night = { $gte: parseFloat(minPrice) };
    }
    if (maxPrice) {
      where.price_per_night = {
        ...(where.price_per_night || {}),
        $lte: parseFloat(maxPrice),
      };
    }
    if (available === "true") {
      where.is_available = true;
    }

    const rooms = await Room.find(where)
      .sort({ price_per_night: 1 })
      .lean();

    const response = {
      rooms: rooms.map((room) => ({
        ...room,
        id: room._id.toString(),
      })),
    };

    await redis.setEx(cacheKey, CACHE_TTL, JSON.stringify(response));
    res.json(response);
  } catch (error) {
    console.error("Get rooms error:", error);
    res.status(500).json({ error: "Failed to fetch rooms" });
  }
});

// -- POST /:id/rooms -----------------------------------------------------------
router.post("/:id/rooms", authenticate, requireRole("admin"), async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: "Invalid hotel id" });
    }

    const hotel = await loadBellaHotelById(id);
    if (!hotel) {
      return res.status(404).json({ error: "Hotel not found" });
    }

    const { error, value } = roomSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    const room = await Room.create({
      hotel_id: new mongoose.Types.ObjectId(id),
      room_number: value.roomNumber,
      room_type: value.roomType,
      description: value.description,
      price_per_night: value.pricePerNight,
      capacity: value.capacity,
      amenities: value.amenities || [],
      images: value.images || [],
      is_available: value.isAvailable !== false,
    });

    await clearHotelCaches([`hotel:${id}:rooms:*`, `hotel:bella:${id}:rooms:*`]);

    res.status(201).json({
      message: "Room created successfully",
      room: { ...room.toObject(), id: room._id.toString() },
    });
  } catch (error) {
    console.error("Create room error:", error);
    if (error.code === 11000) {
      return res.status(400).json({ error: "Room number already exists for this hotel" });
    }
    res.status(500).json({ error: "Failed to create room" });
  }
});

// -- GET /:hotelId/rooms/:roomId -----------------------------------------------
router.get("/:hotelId/rooms/:roomId", async (req, res) => {
  try {
    const { hotelId, roomId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(hotelId)) {
      return res.status(400).json({ error: "Invalid hotel id" });
    }
    if (!mongoose.Types.ObjectId.isValid(roomId)) {
      return res.status(400).json({ error: "Invalid room id" });
    }

    const hotel = await loadBellaHotelById(hotelId);
    if (!hotel) {
      return res.status(404).json({ error: "Hotel not found" });
    }

    const cacheKey = `hotel:bella:${hotelId}:room:${roomId}`;
    const redis = getRedisClient();
    const cached = await redis.get(cacheKey);
    if (cached) {
      return res.json(JSON.parse(cached));
    }

    const room = await Room.findOne({
      _id: roomId,
      hotel_id: new mongoose.Types.ObjectId(hotelId),
    }).lean();
    if (!room) {
      return res.status(404).json({ error: "Room not found" });
    }

    const payload = { room: { ...room, id: room._id.toString() } };
    await redis.setEx(cacheKey, CACHE_TTL, JSON.stringify(payload));
    res.json(payload);
  } catch (error) {
    console.error("Get room error:", error);
    res.status(500).json({ error: "Failed to fetch room" });
  }
});

export default router;
