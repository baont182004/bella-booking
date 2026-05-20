import express from "express";
import Joi from "joi";
import mongoose from "mongoose";
import { AuditLog, Booking, Hotel, Room } from "../config/database.js";
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
}).unknown(false);

const roomUpdateSchema = Joi.object({
  roomNumber: Joi.string().optional(),
  roomType: Joi.string().optional(),
  description: Joi.string().allow("").optional(),
  pricePerNight: Joi.number().positive().optional(),
  capacity: Joi.number().integer().positive().optional(),
  amenities: Joi.array().items(Joi.string()).optional(),
  images: Joi.array().items(Joi.string()).optional(),
  isAvailable: Joi.boolean().optional(),
}).min(1).unknown(false);

function escapeRegex(value = "") {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

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

function buildRequestAuditMetadata(req, extra = {}) {
  return {
    ...extra,
    ip: String(req.ip || "").replace(/^::ffff:/, "") || null,
    userAgent: String(req.get("user-agent") || "").slice(0, 300) || null,
  };
}

function pickRoomAuditFields(room) {
  if (!room) return null;
  return {
    roomNumber: room.room_number,
    roomType: room.room_type,
    pricePerNight: room.price_per_night,
    capacity: room.capacity,
    isAvailable: room.is_available,
    isActive: room.is_active,
  };
}

async function recordAuditLog({ action, actor, entityType, entityId, metadata = {} }) {
  try {
    await AuditLog.create({
      service: "hotel-service",
      action,
      actor_user_id: actor?.id || null,
      actor_role: actor?.role || null,
      entity_type: entityType,
      entity_id: entityId,
      metadata,
    });
  } catch (error) {
    console.error("Hotel audit log error:", error);
  }
}

// -- POST /admin/bella/metadata/sync ------------------------------------------
router.post("/admin/bella/metadata/sync", authenticate, requireRole("admin"), async (req, res) => {
  try {
    const result = await syncBellaRoomMetadata();

    await recordAuditLog({
      action: "configuration.bella_metadata.synced",
      actor: req.user,
      entityType: "bella_room_metadata",
      entityId: "landing_featured_rooms",
      metadata: buildRequestAuditMetadata(req, { result }),
    });

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
      filter.city = { $regex: escapeRegex(city), $options: "i" };
    }
    if (country) {
      filter.country = { $regex: escapeRegex(country), $options: "i" };
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

    const where = {
      hotel_id: new mongoose.Types.ObjectId(id),
      is_active: { $ne: false },
    };
    if (roomType) {
      where.room_type = { $regex: escapeRegex(roomType), $options: "i" };
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

    await recordAuditLog({
      action: "configuration.room.created",
      actor: req.user,
      entityType: "room",
      entityId: room._id.toString(),
      metadata: buildRequestAuditMetadata(req, {
        objectType: "room",
        before: null,
        after: pickRoomAuditFields(room),
      }),
    });

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

// -- PUT /:hotelId/rooms/:roomId -----------------------------------------------
router.put(
  "/:hotelId/rooms/:roomId",
  authenticate,
  requireRole("admin"),
  async (req, res) => {
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

      const { error, value } = roomUpdateSchema.validate(req.body);
      if (error) {
        return res.status(400).json({ error: error.details[0].message });
      }

      const room = await Room.findOne({
        _id: roomId,
        hotel_id: new mongoose.Types.ObjectId(hotelId),
        is_active: { $ne: false },
      });
      if (!room) {
        return res.status(404).json({ error: "Room not found" });
      }

      const before = pickRoomAuditFields(room);

      if (value.roomNumber !== undefined) room.room_number = value.roomNumber;
      if (value.roomType !== undefined) room.room_type = value.roomType;
      if (value.description !== undefined) room.description = value.description || null;
      if (value.pricePerNight !== undefined) room.price_per_night = value.pricePerNight;
      if (value.capacity !== undefined) room.capacity = value.capacity;
      if (value.amenities !== undefined) room.amenities = value.amenities;
      if (value.images !== undefined) room.images = value.images;
      if (value.isAvailable !== undefined) room.is_available = value.isAvailable;
      await room.save();

      await clearHotelCaches([
        `hotel:bella:${hotelId}:rooms:*`,
        `hotel:bella:${hotelId}:room:${roomId}`,
      ]);

      await recordAuditLog({
        action: "configuration.room.updated",
        actor: req.user,
        entityType: "room",
        entityId: room._id.toString(),
        metadata: buildRequestAuditMetadata(req, {
          objectType: "room",
          before,
          after: pickRoomAuditFields(room),
          changedFields: Object.keys(value),
        }),
      });

      res.json({
        message: "Room updated successfully",
        room: { ...room.toObject(), id: room._id.toString() },
      });
    } catch (error) {
      console.error("Update room error:", error);
      if (error.code === 11000) {
        return res.status(409).json({ error: "Room number already exists for this hotel" });
      }
      res.status(500).json({ error: "Failed to update room" });
    }
  },
);

// -- DELETE /:hotelId/rooms/:roomId --------------------------------------------
router.delete(
  "/:hotelId/rooms/:roomId",
  authenticate,
  requireRole("admin"),
  async (req, res) => {
    try {
      const { hotelId, roomId } = req.params;
      if (!mongoose.Types.ObjectId.isValid(hotelId)) {
        return res.status(400).json({ error: "Invalid hotel id" });
      }
      if (!mongoose.Types.ObjectId.isValid(roomId)) {
        return res.status(400).json({ error: "Invalid room id" });
      }

      const room = await Room.findOne({
        _id: roomId,
        hotel_id: new mongoose.Types.ObjectId(hotelId),
        is_active: { $ne: false },
      });
      if (!room) {
        return res.status(404).json({ error: "Room not found" });
      }

      const bookingCount = await Booking.countDocuments({ room_id: room._id });
      if (bookingCount > 0) {
        const before = pickRoomAuditFields(room);
        room.is_active = false;
        room.is_available = false;
        await room.save();

        await clearHotelCaches([
          `hotel:bella:${hotelId}:rooms:*`,
          `hotel:bella:${hotelId}:room:${roomId}`,
        ]);

        await recordAuditLog({
          action: "configuration.room.archived",
          actor: req.user,
          entityType: "room",
          entityId: room._id.toString(),
          metadata: buildRequestAuditMetadata(req, {
            objectType: "room",
            before,
            after: pickRoomAuditFields(room),
          }),
        });

        return res.json({
          message: "Room archived because it already has booking history",
          room: { ...room.toObject(), id: room._id.toString() },
        });
      }

      const before = pickRoomAuditFields(room);
      await room.deleteOne();

      await clearHotelCaches([
        `hotel:bella:${hotelId}:rooms:*`,
        `hotel:bella:${hotelId}:room:${roomId}`,
      ]);

      await recordAuditLog({
        action: "configuration.room.deleted",
        actor: req.user,
        entityType: "room",
        entityId: room._id.toString(),
        metadata: buildRequestAuditMetadata(req, {
          objectType: "room",
          before,
          after: null,
        }),
      });

      res.json({ message: "Room deleted successfully" });
    } catch (error) {
      console.error("Delete room error:", error);
      res.status(500).json({ error: "Failed to delete room" });
    }
  },
);

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
      is_active: { $ne: false },
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
