import express from "express";
import Joi from "joi";
import mongoose from "mongoose";
import { Booking, Hotel, Payment, Room } from "../config/database.js";
import { publishEvent } from "../config/kafka.js";
import { authenticate, requireRole } from "../middleware/auth.js";

const router = express.Router();

const BELLA_HOTEL_NAME = "BELLA HOTEL Phu Quoc";

const paymentSchema = Joi.object({
  bookingId: Joi.string().required(),
  paymentMethod: Joi.string().valid("credit_card", "debit_card").required(),
  cardNumber: Joi.string()
    .pattern(/^(?:\d[\s-]?){12,19}$/)
    .required(),
  cardHolderName: Joi.string().trim().min(2).required(),
  expiryDate: Joi.string()
    .pattern(/^\d{2}\/\d{2}$/)
    .required(),
  cvv: Joi.string()
    .pattern(/^\d{3,4}$/)
    .required(),
});

function normalizeHotelName(value) {
  return value?.trim().toLowerCase() || "";
}

function isBellaHotelName(value) {
  return normalizeHotelName(value) === normalizeHotelName(BELLA_HOTEL_NAME);
}

function canAccessBooking(req, booking) {
  return req.user?.role === "admin" || booking.user_id === req.user?.id;
}

async function loadBellaBookingById(bookingId) {
  return Booking.findById(bookingId).populate({
    path: "room_id",
    model: Room,
    select: "room_number room_type hotel_id",
    populate: {
      path: "hotel_id",
      model: Hotel,
      select: "name address city country",
    },
  });
}

async function loadOwnedBellaBooking(req, res, bookingId) {
  if (!mongoose.Types.ObjectId.isValid(bookingId)) {
    res.status(400).json({ error: "Invalid booking id" });
    return null;
  }

  const booking = await loadBellaBookingById(bookingId);
  if (!booking || !booking.room_id?.hotel_id?.name || !isBellaHotelName(booking.room_id.hotel_id.name)) {
    res.status(404).json({ error: "Booking not found" });
    return null;
  }
  if (!canAccessBooking(req, booking)) {
    res.status(403).json({ error: "Access denied" });
    return null;
  }

  return booking;
}

// -- POST /  (record payment for owned booking) --------------------------------
router.post("/", authenticate, async (req, res) => {
  try {
    const { error, value } = paymentSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    const booking = await loadOwnedBellaBooking(req, res, value.bookingId);
    if (!booking) {
      return;
    }

    if (booking.status === "cancelled") {
      return res.status(409).json({ error: "Cancelled bookings cannot be paid" });
    }
    if (booking.status !== "pending") {
      return res.status(409).json({
        error: "Only pending Bella reservations can be paid here",
      });
    }
    if (!Number.isFinite(Number(booking.total_price)) || Number(booking.total_price) <= 0) {
      return res.status(409).json({ error: "Bella booking total is unavailable" });
    }

    const existingPayment = await Payment.findOne({ booking_id: booking._id });
    if (existingPayment?.payment_status === "completed") {
      return res.status(409).json({ error: "Payment has already been completed" });
    }
    if (existingPayment?.payment_status === "refunded") {
      return res.status(409).json({ error: "Refunded payments cannot be reprocessed here" });
    }
    if (existingPayment && existingPayment.payment_status !== "pending") {
      return res.status(409).json({ error: "Payment is not in a payable state" });
    }

    const transactionId = `TXN-${Date.now()}-${Math.random().toString(36).substring(2, 10)}`;
    const payment = existingPayment || new Payment({ booking_id: booking._id });

    payment.amount = booking.total_price;
    payment.payment_method = value.paymentMethod;
    payment.payment_status = "completed";
    payment.transaction_id = transactionId;
    payment.payment_date = new Date();
    await payment.save();

    booking.status = "confirmed";
    await booking.save();

    await publishEvent("payment-processed", {
      id: payment._id.toString(),
      bookingId: payment.booking_id.toString(),
      amount: payment.amount,
      paymentMethod: payment.payment_method,
      paymentStatus: payment.payment_status,
      transactionId: payment.transaction_id,
      timestamp: new Date().toISOString(),
    });

    await publishEvent("booking-status-updated", {
      id: booking._id.toString(),
      userId: booking.user_id,
      roomId: booking.room_id._id.toString(),
      status: booking.status,
      timestamp: new Date().toISOString(),
    });

    await publishEvent("notification-request", {
      type: "payment-success",
      userId: booking.user_id,
      bookingId: booking._id.toString(),
      amount: payment.amount,
      transactionId: payment.transaction_id,
      timestamp: new Date().toISOString(),
    });

    res.status(201).json({
      message: "Payment processed successfully",
      payment: {
        id: payment._id.toString(),
        bookingId: payment.booking_id.toString(),
        amount: payment.amount,
        paymentMethod: payment.payment_method,
        paymentStatus: payment.payment_status,
        transactionId: payment.transaction_id,
        paymentDate: payment.payment_date,
      },
    });
  } catch (error) {
    console.error("Process payment error:", error);
    if (error.code === 11000) {
      return res.status(409).json({ error: "A payment already exists for this booking" });
    }
    res.status(500).json({ error: "Failed to process payment" });
  }
});

// -- GET /:id ------------------------------------------------------------------
router.get("/:id", authenticate, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ error: "Invalid payment id" });
    }

    const payment = await Payment.findById(req.params.id);
    if (!payment) {
      return res.status(404).json({ error: "Payment not found" });
    }

    const booking = await loadOwnedBellaBooking(req, res, payment.booking_id.toString());
    if (!booking) {
      return;
    }

    res.json({ payment });
  } catch (error) {
    console.error("Get payment error:", error);
    res.status(500).json({ error: "Failed to fetch payment" });
  }
});

// -- GET /booking/:bookingId ---------------------------------------------------
router.get("/booking/:bookingId", authenticate, async (req, res) => {
  try {
    const booking = await loadOwnedBellaBooking(req, res, req.params.bookingId);
    if (!booking) {
      return;
    }

    const payment = await Payment.findOne({ booking_id: booking._id });
    if (!payment) {
      return res.status(404).json({ error: "Payment not found for this booking" });
    }

    res.json({ payment });
  } catch (error) {
    console.error("Get payment by booking error:", error);
    res.status(500).json({ error: "Failed to fetch payment" });
  }
});

// -- POST /:id/refund ----------------------------------------------------------
router.post("/:id/refund", authenticate, requireRole("admin"), async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ error: "Invalid payment id" });
    }

    const payment = await Payment.findById(req.params.id);
    if (!payment) {
      return res.status(404).json({ error: "Payment not found" });
    }

    const booking = await loadBellaBookingById(payment.booking_id.toString());
    if (!booking || !booking.room_id?.hotel_id?.name || !isBellaHotelName(booking.room_id.hotel_id.name)) {
      return res.status(404).json({ error: "Booking not found" });
    }

    if (payment.payment_status !== "completed") {
      return res.status(400).json({ error: "Only completed payments can be refunded" });
    }

    const refundTransactionId = `RFN-${Date.now()}-${Math.random().toString(36).substring(2, 10)}`;

    payment.payment_status = "refunded";
    await payment.save();

    if (booking.status === "pending" || booking.status === "confirmed") {
      booking.status = "cancelled";
      await booking.save();

      await publishEvent("booking-status-updated", {
        id: booking._id.toString(),
        userId: booking.user_id,
        roomId: booking.room_id._id.toString(),
        status: booking.status,
        timestamp: new Date().toISOString(),
      });
    }

    await publishEvent("payment-refunded", {
      id: payment._id.toString(),
      bookingId: payment.booking_id.toString(),
      amount: payment.amount,
      refundTransactionId,
      timestamp: new Date().toISOString(),
    });

    res.json({
      message: "Payment refunded successfully",
      refundTransactionId,
    });
  } catch (error) {
    console.error("Refund payment error:", error);
    res.status(500).json({ error: "Failed to refund payment" });
  }
});

export default router;
