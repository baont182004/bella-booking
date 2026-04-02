import { randomUUID } from "node:crypto";
import express from "express";
import Joi from "joi";
import mongoose from "mongoose";
import { Room, Booking, Hotel, Payment } from "../config/database.js";
import { publishEvent } from "../config/kafka.js";
import { getRedisClient } from "../config/redis.js";
import { authenticate, requireRole } from "../middleware/auth.js";

const router = express.Router();

const BELLA_HOTEL_NAME = "BELLA HOTEL Phu Quoc";
const BELLA_TIME_ZONE = "Asia/Ho_Chi_Minh";
const ROOM_LOCK_TTL_SECONDS = 15;
const ACTIVE_BOOKING_STATUSES = ["pending", "confirmed"];
const BOOKING_STATUS_TRANSITIONS = {
  pending: ["confirmed", "cancelled"],
  confirmed: ["completed", "cancelled"],
  cancelled: [],
  completed: [],
};

const dateSchema = Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/);

const bookingSchema = Joi.object({
  roomId: Joi.string().required(),
  checkInDate: dateSchema.required(),
  checkOutDate: dateSchema.required(),
  numGuests: Joi.number().integer().positive().required(),
  guestFullName: Joi.string().trim().min(2).max(120).required(),
  guestEmail: Joi.string().trim().lowercase().email().required(),
  guestPhone: Joi.string().trim().max(40).allow("").optional(),
  specialRequests: Joi.string().trim().max(500).allow("").optional(),
});

const listQuerySchema = Joi.object({
  userId: Joi.string().optional(),
  status: Joi.string().valid("pending", "confirmed", "cancelled", "completed").optional(),
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(50).default(10),
});

const statusSchema = Joi.object({
  status: Joi.string().valid("pending", "confirmed", "cancelled", "completed").required(),
});

function normalizeHotelName(value) {
  return value?.trim().toLowerCase() || "";
}

function isBellaHotelName(value) {
  return normalizeHotelName(value) === normalizeHotelName(BELLA_HOTEL_NAME);
}

function getBellaTodayString() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: BELLA_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  return `${year}-${month}-${day}`;
}

function parseDateOnly(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }

  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function validateStayDates(checkInValue, checkOutValue) {
  const checkIn = parseDateOnly(checkInValue);
  const checkOut = parseDateOnly(checkOutValue);
  const today = parseDateOnly(getBellaTodayString());

  if (!checkIn || !checkOut || !today) {
    return { error: "Enter valid check-in and check-out dates." };
  }

  if (checkIn < today) {
    return { error: "Check-in must be today or later." };
  }

  if (checkOut <= checkIn) {
    return { error: "Check-out must be after check-in." };
  }

  const nights = Math.round((checkOut - checkIn) / (1000 * 60 * 60 * 24));
  if (nights <= 0) {
    return { error: "Select at least one night for your Bella stay." };
  }

  return { checkIn, checkOut, nights };
}

function canAccessBooking(req, booking) {
  return req.user?.role === "admin" || booking.user_id === req.user?.id;
}

function canTransitionBooking(currentStatus, nextStatus) {
  return currentStatus === nextStatus ||
    (BOOKING_STATUS_TRANSITIONS[currentStatus] || []).includes(nextStatus);
}

async function invalidateBookingCache(userId) {
  const redis = getRedisClient();
  const keys = await redis.keys(`user:${userId}:bookings:*`);
  if (keys.length > 0) {
    await redis.del(...keys);
  }
}

async function acquireRoomLock(roomId) {
  const redis = getRedisClient();
  const lockKey = `lock:booking:room:${roomId}`;
  const lockToken = randomUUID();
  const acquired = await redis.set(lockKey, lockToken, {
    NX: true,
    EX: ROOM_LOCK_TTL_SECONDS,
  });

  if (acquired !== "OK") {
    return null;
  }

  return { lockKey, lockToken };
}

async function releaseRoomLock(lock) {
  if (!lock) {
    return;
  }

  const redis = getRedisClient();
  const currentToken = await redis.get(lock.lockKey);
  if (currentToken === lock.lockToken) {
    await redis.del(lock.lockKey);
  }
}

async function loadBellaRoom(roomId, { requireAvailable = false } = {}) {
  const filter = { _id: roomId };
  if (requireAvailable) {
    filter.is_available = true;
  }

  const room = await Room.findOne(filter)
    .populate({
      path: "hotel_id",
      model: Hotel,
      select: "name address city country",
    })
    .lean();

  if (!room || !room.hotel_id || !isBellaHotelName(room.hotel_id.name)) {
    return null;
  }

  return room;
}

async function findBookingPayment(bookingId) {
  return Payment.findOne({ booking_id: bookingId }).lean();
}

function serializeBookingListItem(booking) {
  return {
    ...booking,
    id: booking._id.toString(),
    room: booking.room_id
      ? {
          room_number: booking.room_id.room_number,
          room_type: booking.room_id.room_type,
          price_per_night: booking.room_id.price_per_night,
          capacity: booking.room_id.capacity,
          hotel: booking.room_id.hotel_id
            ? {
                name: booking.room_id.hotel_id.name,
                address: booking.room_id.hotel_id.address,
                city: booking.room_id.hotel_id.city,
                country: booking.room_id.hotel_id.country,
              }
            : undefined,
        }
      : undefined,
    guest_contact:
      booking.guest_full_name || booking.guest_email || booking.guest_phone
        ? {
            full_name: booking.guest_full_name,
            email: booking.guest_email,
            phone: booking.guest_phone,
          }
        : undefined,
  };
}

// -- POST /  (create booking) --------------------------------------------------
router.post("/", authenticate, async (req, res) => {
  let roomLock = null;

  try {
    const { error, value } = bookingSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    const {
      roomId,
      checkInDate,
      checkOutDate,
      numGuests,
      guestFullName,
      guestEmail,
      guestPhone,
      specialRequests,
    } = value;
    const userId = req.user.id;

    if (!mongoose.Types.ObjectId.isValid(roomId)) {
      return res.status(400).json({ error: "Invalid room id" });
    }

    const stay = validateStayDates(checkInDate, checkOutDate);
    if (stay.error) {
      return res.status(400).json({ error: stay.error });
    }

    roomLock = await acquireRoomLock(roomId);
    if (!roomLock) {
      return res.status(409).json({
        error: "This Bella room is being reserved right now. Please try again.",
      });
    }

    const room = await loadBellaRoom(roomId, { requireAvailable: true });
    if (!room) {
      return res.status(404).json({ error: "Bella room not found or not available" });
    }

    const nightlyRate = Number(room.price_per_night || 0);
    if (!Number.isFinite(nightlyRate) || nightlyRate <= 0) {
      return res.status(409).json({ error: "Current Bella room pricing is unavailable" });
    }

    if (numGuests > Number(room.capacity || 0)) {
      return res.status(400).json({ error: "Guest count exceeds room capacity" });
    }

    const conflict = await Booking.findOne({
      room_id: roomId,
      status: { $in: ACTIVE_BOOKING_STATUSES },
      check_in_date: { $lt: stay.checkOut },
      check_out_date: { $gt: stay.checkIn },
    }).lean();

    if (conflict) {
      return res.status(409).json({ error: "Room is not available for selected dates" });
    }

    const totalPrice = stay.nights * nightlyRate;
    const booking = await Booking.create({
      user_id: userId,
      room_id: roomId,
      check_in_date: stay.checkIn,
      check_out_date: stay.checkOut,
      total_price: totalPrice,
      num_guests: numGuests,
      guest_full_name: guestFullName,
      guest_email: guestEmail,
      guest_phone: guestPhone || undefined,
      special_requests: specialRequests || undefined,
      status: "pending",
    });

    await publishEvent("booking-created", {
      id: booking._id.toString(),
      userId: booking.user_id,
      roomId: booking.room_id.toString(),
      checkInDate: booking.check_in_date,
      checkOutDate: booking.check_out_date,
      totalPrice: booking.total_price,
      numGuests: booking.num_guests,
      status: booking.status,
      timestamp: new Date().toISOString(),
    });

    await invalidateBookingCache(userId);

    res.status(201).json({
      message: "Booking created successfully",
      booking: {
        id: booking._id.toString(),
        userId: booking.user_id,
        roomId: booking.room_id.toString(),
        checkInDate: booking.check_in_date,
        checkOutDate: booking.check_out_date,
        totalPrice: booking.total_price,
        numGuests: booking.num_guests,
        status: booking.status,
        nights: stay.nights,
        guestContact: {
          fullName: booking.guest_full_name,
          email: booking.guest_email,
          phone: booking.guest_phone,
        },
      },
    });
  } catch (error) {
    console.error("Create booking error:", error);
    res.status(500).json({ error: "Failed to create booking" });
  } finally {
    await releaseRoomLock(roomLock);
  }
});

// -- GET /  (list bookings for authenticated user or admin target) -------------
router.get("/", authenticate, async (req, res) => {
  try {
    const { error, value } = listQuerySchema.validate(req.query);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    const { userId, status, page, limit } = value;

    if (userId && req.user.role !== "admin" && userId !== req.user.id) {
      return res.status(403).json({ error: "Access denied" });
    }

    const targetUserId = req.user.role === "admin" && userId ? userId : req.user.id;
    const where = { user_id: targetUserId };
    if (status) {
      where.status = status;
    }

    const bookings = await Booking.find(where)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate({
        path: "room_id",
        model: Room,
        select: "room_number room_type price_per_night hotel_id capacity",
        populate: {
          path: "hotel_id",
          model: Hotel,
          select: "name address city country",
        },
      })
      .lean();

    const bellaBookings = bookings.filter(
      (booking) =>
        booking.room_id?.hotel_id?.name && isBellaHotelName(booking.room_id.hotel_id.name),
    );

    const response = {
      bookings: bellaBookings.map(serializeBookingListItem),
      pagination: { page, limit },
    };

    res.json(response);
  } catch (error) {
    console.error("Get bookings error:", error);
    res.status(500).json({ error: "Failed to fetch bookings" });
  }
});

// -- GET /:id ------------------------------------------------------------------
router.get("/:id", authenticate, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ error: "Invalid booking id" });
    }

    const booking = await Booking.findById(req.params.id)
      .populate({
        path: "room_id",
        model: Room,
        select: "room_number room_type price_per_night hotel_id capacity",
        populate: {
          path: "hotel_id",
          model: Hotel,
          select: "name address city country",
        },
      })
      .lean();

    if (!booking) {
      return res.status(404).json({ error: "Booking not found" });
    }
    if (!canAccessBooking(req, booking)) {
      return res.status(403).json({ error: "Access denied" });
    }
    if (!booking.room_id?.hotel_id?.name || !isBellaHotelName(booking.room_id.hotel_id.name)) {
      return res.status(404).json({ error: "Booking not found" });
    }

    res.json({ booking: serializeBookingListItem(booking) });
  } catch (error) {
    console.error("Get booking error:", error);
    res.status(500).json({ error: "Failed to fetch booking" });
  }
});

// -- PUT /:id/status -----------------------------------------------------------
router.put("/:id/status", authenticate, requireRole("admin"), async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ error: "Invalid booking id" });
    }

    const { error, value } = statusSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    const booking = await Booking.findById(req.params.id);
    if (!booking) {
      return res.status(404).json({ error: "Booking not found" });
    }

    const room = await loadBellaRoom(booking.room_id.toString());
    if (!room) {
      return res.status(404).json({ error: "Booking not found" });
    }

    if (!canTransitionBooking(booking.status, value.status)) {
      return res.status(409).json({
        error: `Booking cannot move from ${booking.status} to ${value.status}`,
      });
    }

    const payment = await findBookingPayment(booking._id);
    if (value.status === "confirmed" && payment?.payment_status !== "completed") {
      return res.status(409).json({
        error: "Only paid Bella reservations can be marked as confirmed",
      });
    }

    if (value.status === "cancelled" && payment?.payment_status === "completed") {
      return res.status(409).json({
        error: "Refund the payment before cancelling this Bella booking",
      });
    }

    if (booking.status === value.status) {
      return res.json({
        message: "Booking status unchanged",
        booking: { ...booking.toObject(), id: booking._id.toString() },
      });
    }

    booking.status = value.status;
    await booking.save();

    await publishEvent("booking-status-updated", {
      id: booking._id.toString(),
      userId: booking.user_id,
      roomId: booking.room_id.toString(),
      status: booking.status,
      timestamp: new Date().toISOString(),
    });

    await invalidateBookingCache(booking.user_id);

    res.json({
      message: "Booking status updated successfully",
      booking: { ...booking.toObject(), id: booking._id.toString() },
    });
  } catch (error) {
    console.error("Update booking status error:", error);
    res.status(500).json({ error: "Failed to update booking status" });
  }
});

// -- PUT /:id/cancel -----------------------------------------------------------
router.put("/:id/cancel", authenticate, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ error: "Invalid booking id" });
    }

    const booking = await Booking.findById(req.params.id);
    if (!booking) {
      return res.status(404).json({ error: "Booking not found" });
    }
    if (!canAccessBooking(req, booking)) {
      return res.status(403).json({ error: "Access denied" });
    }

    const room = await loadBellaRoom(booking.room_id.toString());
    if (!room) {
      return res.status(404).json({ error: "Booking not found" });
    }

    if (!canTransitionBooking(booking.status, "cancelled")) {
      return res.status(409).json({ error: "This Bella booking can no longer be cancelled" });
    }

    const payment = await findBookingPayment(booking._id);
    if (payment?.payment_status === "completed") {
      return res.status(409).json({
        error: "Paid Bella reservations cannot be cancelled here",
      });
    }

    booking.status = "cancelled";
    await booking.save();

    await publishEvent("booking-cancelled", {
      id: booking._id.toString(),
      userId: booking.user_id,
      roomId: booking.room_id.toString(),
      totalPrice: booking.total_price,
      timestamp: new Date().toISOString(),
    });

    await invalidateBookingCache(booking.user_id);

    res.json({
      message: "Booking cancelled successfully",
      booking: { ...booking.toObject(), id: booking._id.toString() },
    });
  } catch (error) {
    console.error("Cancel booking error:", error);
    res.status(500).json({ error: "Failed to cancel booking" });
  }
});

export default router;
