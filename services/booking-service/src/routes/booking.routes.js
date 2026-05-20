import { randomUUID } from "node:crypto";
import express from "express";
import Joi from "joi";
import mongoose from "mongoose";
import {
  AuditLog,
  Booking,
  BookingRequest,
  Combo,
  Hotel,
  Payment,
  Promotion,
  Room,
} from "../config/database.js";
import { enqueueOutboxEvent, triggerOutboxFlush } from "../config/kafka.js";
import { getRedisClient } from "../config/redis.js";
import { authenticate, requireRole } from "../middleware/auth.js";
import { createRateLimiter } from "../middleware/rateLimit.js";
import {
  buildActiveComboFilter,
  calculateBookingPrice,
  serializeCombo,
} from "../services/pricing.service.js";

const router = express.Router();

const BELLA_HOTEL_NAME = "BELLA HOTEL Phu Quoc";
const BELLA_TIME_ZONE = "Asia/Ho_Chi_Minh";
const ROOM_LOCK_TTL_SECONDS = 15;
const ACTIVE_BOOKING_STATUSES = ["pending_payment", "confirmed"];
const OPEN_PAYMENT_STATUSES = ["pending", "processing"];
const CONFIRMED_PAYMENT_STATUSES = ["authorized", "succeeded"];
const BOOKING_STATUS_TRANSITIONS = {
  pending_payment: ["confirmed", "payment_failed", "cancelled", "expired"],
  payment_failed: ["pending_payment", "cancelled", "expired"],
  confirmed: ["completed", "cancelled"],
  cancelled: [],
  completed: [],
  expired: [],
};
const publicRateLimit = createRateLimiter({
  windowMs: 10 * 60 * 1000,
  maxRequests: 30,
  message: "Too many booking lookup requests. Please try again shortly.",
  prefix: "booking-public",
});
const bookingCreateRateLimit = createRateLimiter({
  windowMs: 10 * 60 * 1000,
  maxRequests: 10,
  message: "Too many booking attempts. Please wait a moment and try again.",
  keyBuilder: (req) => `${String(req.ip || "unknown").replace(/^::ffff:/, "")}:${req.user?.id || "anonymous"}`,
  prefix: "booking-create",
});

const dateSchema = Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/);

function getPaymentHoldWindowMinutes() {
  const configuredMinutes = Number(process.env.PAYMENT_HOLD_WINDOW_MINUTES || 30);
  return Number.isFinite(configuredMinutes) && configuredMinutes > 0 ? configuredMinutes : 30;
}

const bookingSchema = Joi.object({
  roomId: Joi.string().required(),
  checkInDate: dateSchema.required(),
  checkOutDate: dateSchema.required(),
  numGuests: Joi.number().integer().positive().required(),
  comboId: Joi.string().optional(),
  comboSlug: Joi.string().trim().lowercase().pattern(/^[a-z0-9-]+$/).optional(),
  guestFullName: Joi.string().trim().min(2).max(120).required(),
  guestEmail: Joi.string().trim().lowercase().email().required(),
  guestPhone: Joi.string().trim().max(40).allow("").optional(),
  specialRequests: Joi.string().trim().max(500).allow("").optional(),
  promotionCode: Joi.string().trim().uppercase().pattern(/^[A-Z0-9-]+$/).optional(),
}).unknown(false);

const bookingRequestSchema = Joi.object({
  roomId: Joi.string().allow("").optional(),
  roomCode: Joi.string().trim().lowercase().max(120).allow("").optional(),
  roomName: Joi.string().trim().min(2).max(180).required(),
  checkInDate: dateSchema.required(),
  checkOutDate: dateSchema.required(),
  numGuests: Joi.number().integer().positive().required(),
  guestFullName: Joi.string().trim().min(2).max(120).required(),
  guestPhone: Joi.string().trim().min(6).max(40).required(),
  guestArea: Joi.string().trim().min(2).max(180).required(),
  guestEmail: Joi.string().trim().lowercase().email().allow("").optional(),
  note: Joi.string().trim().max(1000).allow("").optional(),
  comboSlug: Joi.string().trim().lowercase().pattern(/^[a-z0-9-]+$/).allow("").optional(),
  comboName: Joi.string().trim().max(160).allow("").optional(),
  estimatedTotal: Joi.number().min(0).optional(),
  context: Joi.object({
    landingPath: Joi.string().trim().max(300).allow("").optional(),
    roomIsLive: Joi.boolean().optional(),
    userAgent: Joi.string().trim().max(300).allow("").optional(),
  }).default({}),
}).unknown(false);

const availabilityQuerySchema = Joi.object({
  roomId: Joi.string().required(),
  checkInDate: dateSchema.required(),
  checkOutDate: dateSchema.required(),
  numGuests: Joi.number().integer().positive().required(),
  comboId: Joi.string().optional(),
  comboSlug: Joi.string().trim().lowercase().pattern(/^[a-z0-9-]+$/).optional(),
  promotionCode: Joi.string().trim().uppercase().pattern(/^[A-Z0-9-]+$/).optional(),
}).unknown(false);

const comboQuerySchema = Joi.object({
  roomType: Joi.string().trim().allow("").optional(),
  guestCount: Joi.number().integer().positive().optional(),
  nights: Joi.number().integer().positive().optional(),
  suitableFor: Joi.string().trim().allow("").optional(),
  sort: Joi.string().valid("displayOrder", "price", "price_desc").default("displayOrder"),
}).unknown(false);

const comboSchema = Joi.object({
  name: Joi.string().trim().min(2).max(140).required(),
  slug: Joi.string().trim().lowercase().pattern(/^[a-z0-9-]+$/).required(),
  description: Joi.string().trim().max(1200).allow("").default(""),
  roomTypesAllowed: Joi.array().items(Joi.string().trim()).default([]),
  durationLabel: Joi.string().trim().required(),
  nights: Joi.number().integer().min(1).required(),
  allowedNights: Joi.array().items(Joi.number().integer().min(1)).default([]),
  days: Joi.number().integer().min(1).required(),
  minGuests: Joi.number().integer().min(1).default(1),
  maxGuests: Joi.number().integer().min(1).allow(null).default(null),
  basePrice: Joi.number().min(0).required(),
  priceType: Joi.string().valid("fixed", "per_person", "from_price").default("fixed"),
  currency: Joi.string().trim().uppercase().default("VND"),
  includedServices: Joi.array().items(Joi.string().trim()).default([]),
  suitableFor: Joi.string().trim().allow("").default(""),
  badgeLabel: Joi.string().trim().allow("").default(""),
  imageUrl: Joi.string().trim().allow("").default(""),
  iconKey: Joi.string().trim().allow("").default(""),
  isActive: Joi.boolean().default(true),
  validFrom: Joi.date().allow(null).default(null),
  validTo: Joi.date().allow(null).default(null),
  termsAndConditions: Joi.array().items(Joi.string().trim()).default([]),
  displayOrder: Joi.number().integer().default(100),
}).unknown(false);

const updateComboSchema = comboSchema.fork(["name", "slug", "durationLabel", "nights", "days", "basePrice"], (schema) =>
  schema.optional(),
).min(1);

const bookingLookupSchema = Joi.object({
  reference: Joi.string().trim().uppercase().required(),
  email: Joi.string().trim().lowercase().email().required(),
}).unknown(false);

const listQuerySchema = Joi.object({
  userId: Joi.string().optional(),
  status: Joi.string()
    .valid("pending_payment", "confirmed", "payment_failed", "cancelled", "completed", "expired")
    .optional(),
  scope: Joi.string().valid("self", "all").default("self"),
  reference: Joi.string().trim().allow("").default(""),
  guestEmail: Joi.string().trim().lowercase().allow("").default(""),
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(50).default(10),
}).unknown(false);

const bookingRequestListQuerySchema = Joi.object({
  status: Joi.string().valid("new", "contacted", "converted", "closed").allow("").default(""),
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(50).default(20),
}).unknown(false);

const statusSchema = Joi.object({
  status: Joi.string()
    .valid("pending_payment", "confirmed", "payment_failed", "cancelled", "completed", "expired")
    .required(),
}).unknown(false);

const promotionSchema = Joi.object({
  code: Joi.string().trim().uppercase().pattern(/^[A-Z0-9-]+$/).required(),
  name: Joi.string().trim().min(3).max(120).required(),
  description: Joi.string().trim().max(500).allow("").optional(),
  type: Joi.string().valid("percentage", "fixed").required(),
  value: Joi.number().positive().required(),
  maxDiscount: Joi.number().positive().allow(null).optional(),
  minNights: Joi.number().integer().min(1).default(1),
  minSpend: Joi.number().min(0).default(0),
  activeFrom: Joi.date().allow(null).optional(),
  activeTo: Joi.date().allow(null).optional(),
  usageLimit: Joi.number().integer().min(1).allow(null).optional(),
  eligibleRoomCodes: Joi.array()
    .items(Joi.string().trim().lowercase().pattern(/^[a-z0-9-]+$/))
    .default([]),
  isActive: Joi.boolean().default(true),
}).unknown(false);

const updatePromotionSchema = Joi.object({
  name: Joi.string().trim().min(3).max(120).optional(),
  description: Joi.string().trim().max(500).allow("").optional(),
  type: Joi.string().valid("percentage", "fixed").optional(),
  value: Joi.number().positive().optional(),
  maxDiscount: Joi.number().positive().allow(null).optional(),
  minNights: Joi.number().integer().min(1).optional(),
  minSpend: Joi.number().min(0).optional(),
  activeFrom: Joi.date().allow(null).optional(),
  activeTo: Joi.date().allow(null).optional(),
  usageLimit: Joi.number().integer().min(1).allow(null).optional(),
  eligibleRoomCodes: Joi.array()
    .items(Joi.string().trim().lowercase().pattern(/^[a-z0-9-]+$/))
    .optional(),
  isActive: Joi.boolean().optional(),
}).min(1).unknown(false);

const auditLogQuerySchema = Joi.object({
  limit: Joi.number().integer().min(1).max(100).default(25),
}).unknown(false);

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
  return (
    currentStatus === nextStatus ||
    (BOOKING_STATUS_TRANSITIONS[currentStatus] || []).includes(nextStatus)
  );
}

function getPaymentStatus(payment) {
  return payment?.status || payment?.payment_status || "pending";
}

function isPaymentConfirmedForBooking(status) {
  return ["authorized", "succeeded"].includes(status);
}

function isPaymentBlockingCancellation(status) {
  return ["authorized", "succeeded", "partially_refunded"].includes(status);
}

function buildOutboxEvent({ topic, eventKey, aggregateType, aggregateId, payload }) {
  return {
    topic,
    eventKey,
    aggregateType,
    aggregateId,
    payload,
  };
}

async function enqueueDomainEvents(events = []) {
  for (const event of events) {
    await enqueueOutboxEvent(event);
  }

  if (events.length > 0) {
    triggerOutboxFlush();
  }
}

async function enqueueDomainEventsTransactional(events = [], session = null) {
  for (const event of events) {
    await enqueueOutboxEvent({
      ...event,
      session,
    });
  }
}

async function withOptionalTransaction(work) {
  if (process.env.MONGODB_TRANSACTIONS_ENABLED !== "true") {
    return work(null);
  }

  const session = await mongoose.startSession();
  let result;

  try {
    await session.withTransaction(async () => {
      result = await work(session);
    });
    return result;
  } finally {
    await session.endSession();
  }
}

function getPaymentHoldExpiry() {
  const holdMinutes = getPaymentHoldWindowMinutes();

  return new Date(Date.now() + holdMinutes * 60 * 1000);
}

function normalizePromotionCode(value) {
  return value?.trim().toUpperCase() || null;
}

function buildBookingReferenceCandidate() {
  const dateCode = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const suffix = randomUUID().replace(/-/g, "").slice(0, 6).toUpperCase();
  return `BEL-${dateCode}-${suffix}`;
}

async function generateUniqueBookingReference() {
  for (let index = 0; index < 5; index += 1) {
    const reference = buildBookingReferenceCandidate();
    const exists = await Booking.exists({ booking_reference: reference });
    if (!exists) {
      return reference;
    }
  }

  throw new Error("Unable to generate unique booking reference");
}

function buildBookingRequestReferenceCandidate() {
  const dateCode = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const suffix = randomUUID().replace(/-/g, "").slice(0, 6).toUpperCase();
  return `BRQ-${dateCode}-${suffix}`;
}

async function generateUniqueBookingRequestReference() {
  for (let index = 0; index < 5; index += 1) {
    const reference = buildBookingRequestReferenceCandidate();
    const exists = await BookingRequest.exists({ request_reference: reference });
    if (!exists) {
      return reference;
    }
  }

  throw new Error("Unable to generate unique booking request reference");
}

function buildPriceSnapshot({
  nights,
  nightlyRate,
  roomSubtotal = subtotal || 0,
  comboSubtotal = 0,
  subtotal,
  discountAmount,
  serviceFee = 0,
  total,
  priceBreakdown = {},
}) {
  return {
    nights,
    nightly_rate: nightlyRate,
    room_subtotal: roomSubtotal,
    combo_subtotal: comboSubtotal,
    subtotal: subtotal ?? roomSubtotal + comboSubtotal,
    discount_amount: discountAmount,
    service_fee: serviceFee,
    total,
    currency: "VND",
    breakdown: priceBreakdown,
  };
}

function serializeComboSnapshot(snapshot) {
  if (!snapshot) return null;

  return {
    slug: snapshot.slug,
    name: snapshot.name,
    price: snapshot.price,
    priceType: snapshot.price_type,
    includedServices: snapshot.included_services || [],
    durationLabel: snapshot.duration_label,
    suitableFor: snapshot.suitable_for,
  };
}

function escapeRegex(value = "") {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function serializePromotion(promotion) {
  if (!promotion) {
    return null;
  }

  return {
    id: promotion._id.toString(),
    code: promotion.code,
    name: promotion.name,
    description: promotion.description,
    type: promotion.type,
    value: promotion.value,
    maxDiscount: promotion.max_discount,
    minNights: promotion.min_nights,
    minSpend: promotion.min_spend,
    activeFrom: promotion.active_from,
    activeTo: promotion.active_to,
    usageLimit: promotion.usage_limit,
    usageCount: promotion.usage_count,
    eligibleRoomCodes: promotion.eligible_room_codes || [],
    isActive: promotion.is_active,
  };
}

function normalizeEligibleRoomCodes(values = []) {
  return [...new Set(values.map((value) => value.trim().toLowerCase()).filter(Boolean))];
}

function validatePromotionPayload(value, currentUsageCount = 0) {
  if (value.type === "percentage" && value.value > 100) {
    return "Percentage promotions cannot exceed 100%";
  }

  if (value.type === "fixed" && value.maxDiscount !== undefined && value.maxDiscount !== null) {
    return "Fixed-amount promotions cannot define a maximum discount";
  }

  if (value.activeFrom && value.activeTo && new Date(value.activeTo) < new Date(value.activeFrom)) {
    return "Promotion end date must be after the start date";
  }

  if (
    value.usageLimit !== undefined &&
    value.usageLimit !== null &&
    value.usageLimit < currentUsageCount
  ) {
    return "Promotion usage limit cannot be lower than current usage count";
  }

  return null;
}

function buildActivePromotionFilter(now = new Date()) {
  return {
    is_active: true,
    $and: [
      {
        $or: [{ active_from: null }, { active_from: { $lte: now } }],
      },
      {
        $or: [{ active_to: null }, { active_to: { $gte: now } }],
      },
      {
        $or: [
          { usage_limit: null },
          {
            $expr: {
              $lt: ["$usage_count", "$usage_limit"],
            },
          },
        ],
      },
    ],
  };
}

async function recordAuditLog({ action, actor, entityType, entityId, metadata = {} }) {
  try {
    await AuditLog.create({
      service: "booking-service",
      action,
      actor_user_id: actor?.id || null,
      actor_role: actor?.role || null,
      entity_type: entityType,
      entity_id: entityId,
      metadata,
    });
  } catch (error) {
    console.error("Audit log error:", error);
  }
}

async function invalidateBookingCache(userId) {
  const redis = getRedisClient();
  const keys = await redis.keys(`user:${userId}:bookings:*`);
  if (keys.length > 0) {
    await redis.del(...keys);
  }
}

function comboPayloadToDocument(value) {
  return {
    name: value.name,
    slug: value.slug,
    description: value.description || "",
    room_types_allowed: value.roomTypesAllowed || [],
    duration_label: value.durationLabel,
    nights: value.nights,
    allowed_nights: value.allowedNights || [],
    days: value.days,
    min_guests: value.minGuests,
    max_guests: value.maxGuests || null,
    base_price: value.basePrice,
    price_type: value.priceType,
    currency: value.currency || "VND",
    included_services: value.includedServices || [],
    suitable_for: value.suitableFor || "",
    badge_label: value.badgeLabel || "",
    image_url: value.imageUrl || "",
    icon_key: value.iconKey || "",
    is_active: value.isActive,
    valid_from: value.validFrom || null,
    valid_to: value.validTo || null,
    terms_and_conditions: value.termsAndConditions || [],
    display_order: value.displayOrder,
  };
}

function comboUpdateToDocument(value) {
  const update = {};
  const fieldMap = {
    name: "name",
    slug: "slug",
    description: "description",
    roomTypesAllowed: "room_types_allowed",
    durationLabel: "duration_label",
    nights: "nights",
    allowedNights: "allowed_nights",
    days: "days",
    minGuests: "min_guests",
    maxGuests: "max_guests",
    basePrice: "base_price",
    priceType: "price_type",
    currency: "currency",
    includedServices: "included_services",
    suitableFor: "suitable_for",
    badgeLabel: "badge_label",
    imageUrl: "image_url",
    iconKey: "icon_key",
    isActive: "is_active",
    validFrom: "valid_from",
    validTo: "valid_to",
    termsAndConditions: "terms_and_conditions",
    displayOrder: "display_order",
  };

  for (const [payloadKey, documentKey] of Object.entries(fieldMap)) {
    if (Object.hasOwn(value, payloadKey)) {
      update[documentKey] = value[payloadKey] === undefined ? null : value[payloadKey];
    }
  }

  return update;
}

function normalizeComboFilterValue(value = "") {
  return String(value || "").trim().toLowerCase();
}

function comboMatchesFilters(combo, filters) {
  if (filters.roomType) {
    const roomType = normalizeComboFilterValue(filters.roomType);
    const allowed = (combo.room_types_allowed || []).map(normalizeComboFilterValue);
    if (
      allowed.length &&
      !allowed.includes("linh hoạt") &&
      !allowed.includes("linh-hoat") &&
      !allowed.some((item) => item.includes(roomType) || roomType.includes(item))
    ) {
      return false;
    }
  }

  if (filters.guestCount) {
    const guestCount = Number(filters.guestCount);
    if (guestCount < Number(combo.min_guests || 1)) return false;
    if (combo.max_guests && guestCount > Number(combo.max_guests)) return false;
  }

  if (filters.nights) {
    const allowedNights = combo.allowed_nights?.length ? combo.allowed_nights : [combo.nights];
    if (!allowedNights.map(Number).includes(Number(filters.nights))) return false;
  }

  if (filters.suitableFor) {
    const target = normalizeComboFilterValue(filters.suitableFor);
    const haystack = normalizeComboFilterValue(`${combo.suitable_for || ""} ${combo.name || ""}`);
    if (!haystack.includes(target)) return false;
  }

  return true;
}

function sortCombos(combos, sort) {
  const nextCombos = [...combos];
  if (sort === "price") {
    return nextCombos.sort((left, right) => left.base_price - right.base_price);
  }
  if (sort === "price_desc") {
    return nextCombos.sort((left, right) => right.base_price - left.base_price);
  }
  return nextCombos.sort((left, right) => left.display_order - right.display_order || left.base_price - right.base_price);
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

async function loadBellaRoom(
  roomId,
  { requireAvailable = false, includeInactive = false } = {},
) {
  const filter = { _id: roomId };
  if (!includeInactive) {
    filter.is_active = { $ne: false };
  }
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

async function findConflictingBooking(roomId, stay) {
  return Booking.findOne({
    room_id: roomId,
    status: { $in: ACTIVE_BOOKING_STATUSES },
    check_in_date: { $lt: stay.checkOut },
    check_out_date: { $gt: stay.checkIn },
  }).lean();
}

function calculateDiscountAmount(promotion, subtotal) {
  if (!promotion) {
    return 0;
  }

  if (promotion.type === "percentage") {
    const percentageDiscount = subtotal * (promotion.value / 100);
    return promotion.max_discount
      ? Math.min(percentageDiscount, promotion.max_discount)
      : percentageDiscount;
  }

  return Math.min(subtotal, promotion.value);
}

async function resolvePromotion({ promotionCode, room, stay, subtotal }) {
  const normalizedCode = normalizePromotionCode(promotionCode);
  if (!normalizedCode) {
    return {
      promotion: null,
      promotionSnapshot: null,
      discountAmount: 0,
    };
  }

  const promotion = await Promotion.findOne({ code: normalizedCode }).lean();
  if (!promotion) {
    return { error: "Promotion code is invalid" };
  }

  const promotionConfigurationError = validatePromotionPayload(
    {
      type: promotion.type,
      value: promotion.value,
      maxDiscount: promotion.max_discount,
      activeFrom: promotion.active_from,
      activeTo: promotion.active_to,
      usageLimit: promotion.usage_limit,
    },
    promotion.usage_count || 0,
  );
  if (promotionConfigurationError) {
    return { error: "Promotion is not available right now" };
  }

  const now = new Date();
  if (!promotion.is_active) {
    return { error: "Promotion is inactive" };
  }
  if (promotion.active_from && new Date(promotion.active_from) > now) {
    return { error: "Promotion is not active yet" };
  }
  if (promotion.active_to && new Date(promotion.active_to) < now) {
    return { error: "Promotion has expired" };
  }
  if (promotion.usage_limit && promotion.usage_count >= promotion.usage_limit) {
    return { error: "Promotion usage limit has been reached" };
  }
  if (promotion.min_nights && stay.nights < promotion.min_nights) {
    return { error: `Promotion requires at least ${promotion.min_nights} nights` };
  }
  if (promotion.min_spend && subtotal < promotion.min_spend) {
    return { error: "Booking subtotal does not meet this promotion's minimum spend" };
  }
  if (
    promotion.eligible_room_codes?.length &&
    !promotion.eligible_room_codes.includes(room.code)
  ) {
    return { error: "Promotion is not available for this room type" };
  }

  const discountAmount = Math.round(calculateDiscountAmount(promotion, subtotal));
  const promotionSnapshot = {
    promotion_id: promotion._id,
    code: promotion.code,
    name: promotion.name,
    type: promotion.type,
    value: promotion.value,
    discount_amount: discountAmount,
  };

  return { promotion, promotionSnapshot, discountAmount };
}

async function adjustPromotionUsage(booking, delta, session = null) {
  const promotionId = booking?.promotion_snapshot?.promotion_id;
  if (!promotionId) {
    return;
  }

  const query = Promotion.findById(promotionId);
  if (session) {
    query.session(session);
  }
  const promotion = await query;
  if (!promotion) {
    return;
  }

  promotion.usage_count = Math.max(0, (promotion.usage_count || 0) + delta);
  await promotion.save(session ? { session } : undefined);
}

async function expireStalePendingHolds(roomId, stay) {
  const now = new Date();
  const staleBookings = await Booking.find({
    room_id: roomId,
    status: "pending_payment",
    payment_expires_at: { $lte: now },
    check_in_date: { $lt: stay.checkOut },
    check_out_date: { $gt: stay.checkIn },
  });

  for (const booking of staleBookings) {
    const payment = await Payment.findOne({ booking_id: booking._id });
    const paymentStatus = getPaymentStatus(payment);
    if (CONFIRMED_PAYMENT_STATUSES.includes(paymentStatus)) {
      continue;
    }

    const previousStatus = booking.status;
    booking.status = "expired";
    booking.expired_at = booking.expired_at || now;

    const events = [
      buildOutboxEvent({
        topic: "booking-status-updated",
        eventKey: `${booking._id.toString()}:booking-expired:${now.getTime()}`,
        aggregateType: "booking",
        aggregateId: booking._id.toString(),
        payload: {
          id: booking._id.toString(),
          bookingReference: booking.booking_reference,
          userId: booking.user_id,
          roomId: booking.room_id.toString(),
          status: booking.status,
          paymentExpiresAt: booking.payment_expires_at || null,
          timestamp: now.toISOString(),
        },
      }),
    ];

    await withOptionalTransaction(async (session) => {
      await booking.save(session ? { session } : undefined);

      if (payment && OPEN_PAYMENT_STATUSES.includes(paymentStatus)) {
        payment.status = "expired";
        payment.payment_status = "expired";
        payment.status_reason = "booking_hold_expired";
        payment.payment_date = payment.payment_date || now;
        await payment.save(session ? { session } : undefined);
      }

      if (ACTIVE_BOOKING_STATUSES.includes(previousStatus)) {
        await adjustPromotionUsage(booking, -1, session);
      }

      await enqueueDomainEventsTransactional(events, session);
    });

    await recordAuditLog({
      action: "booking.hold_expired",
      actor: null,
      entityType: "booking",
      entityId: booking._id.toString(),
      metadata: {
        bookingReference: booking.booking_reference,
        previousStatus,
        paymentStatus,
      },
    });

    await invalidateBookingCache(booking.user_id);
  }

  if (staleBookings.length > 0) {
    triggerOutboxFlush();
  }
}

function serializeBookingListItem(booking) {
  return {
    ...booking,
    id: booking._id.toString(),
    bookingReference: booking.booking_reference,
    paymentExpiresAt: booking.payment_expires_at || null,
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
    promotion: booking.promotion_snapshot
      ? {
          code: booking.promotion_snapshot.code,
          name: booking.promotion_snapshot.name,
          type: booking.promotion_snapshot.type,
          value: booking.promotion_snapshot.value,
          discountAmount: booking.promotion_snapshot.discount_amount,
        }
      : null,
    combo: serializeComboSnapshot(booking.combo_snapshot),
    priceSnapshot: booking.price_snapshot
      ? {
          nights: booking.price_snapshot.nights,
          nightlyRate: booking.price_snapshot.nightly_rate,
          roomSubtotal: booking.price_snapshot.room_subtotal ?? booking.price_snapshot.subtotal,
          comboSubtotal: booking.price_snapshot.combo_subtotal || 0,
          subtotal: booking.price_snapshot.subtotal,
          discountAmount: booking.price_snapshot.discount_amount,
          serviceFee: booking.price_snapshot.service_fee || 0,
          total: booking.price_snapshot.total,
          currency: booking.price_snapshot.currency,
          breakdown: booking.price_snapshot.breakdown || null,
        }
      : null,
  };
}

function serializeBookingResponse(booking) {
  return {
    id: booking._id.toString(),
    bookingReference: booking.booking_reference,
    userId: booking.user_id,
    roomId: booking.room_id.toString(),
    checkInDate: booking.check_in_date,
    checkOutDate: booking.check_out_date,
    totalPrice: booking.total_price,
    numGuests: booking.num_guests,
    status: booking.status,
    paymentExpiresAt: booking.payment_expires_at || null,
    nights: booking.price_snapshot?.nights || null,
    promotion: booking.promotion_snapshot
      ? {
          code: booking.promotion_snapshot.code,
          name: booking.promotion_snapshot.name,
          discountAmount: booking.promotion_snapshot.discount_amount,
        }
      : null,
    combo: serializeComboSnapshot(booking.combo_snapshot),
    priceSnapshot: booking.price_snapshot
      ? {
          nights: booking.price_snapshot.nights,
          nightlyRate: booking.price_snapshot.nightly_rate,
          roomSubtotal: booking.price_snapshot.room_subtotal ?? booking.price_snapshot.subtotal,
          comboSubtotal: booking.price_snapshot.combo_subtotal || 0,
          subtotal: booking.price_snapshot.subtotal,
          discountAmount: booking.price_snapshot.discount_amount,
          serviceFee: booking.price_snapshot.service_fee || 0,
          total: booking.price_snapshot.total,
          currency: booking.price_snapshot.currency,
          breakdown: booking.price_snapshot.breakdown || null,
        }
      : null,
    guestContact: {
      fullName: booking.guest_full_name,
      email: booking.guest_email,
      phone: booking.guest_phone,
    },
  };
}

function serializeBookingRequest(bookingRequest) {
  return {
    id: bookingRequest._id.toString(),
    requestReference: bookingRequest.request_reference,
    source: bookingRequest.source,
    status: bookingRequest.status,
    roomId: bookingRequest.room_id?.toString?.() || bookingRequest.room_id || null,
    roomCode: bookingRequest.room_code,
    roomName: bookingRequest.room_name,
    checkInDate: bookingRequest.check_in_date,
    checkOutDate: bookingRequest.check_out_date,
    nights: bookingRequest.nights,
    numGuests: bookingRequest.num_guests,
    guestContact: {
      fullName: bookingRequest.guest_full_name,
      phone: bookingRequest.guest_phone,
      area: bookingRequest.guest_area,
      email: bookingRequest.guest_email,
    },
    note: bookingRequest.note,
    combo: bookingRequest.combo_snapshot
      ? serializeComboSnapshot(bookingRequest.combo_snapshot)
      : {
          slug: bookingRequest.combo_slug,
          name: bookingRequest.combo_name || "Không chọn combo",
        },
    estimatedTotal: bookingRequest.estimated_total,
    context: bookingRequest.context || {},
    createdAt: bookingRequest.createdAt,
    updatedAt: bookingRequest.updatedAt,
  };
}

function serializeRelatedPayment(payment) {
  if (!payment) {
    return null;
  }

  const id = payment._id?.toString?.() || payment.id;
  return {
    id,
    bookingId: payment.booking_id?.toString?.() || payment.booking_id || null,
    provider: payment.provider,
    providerSessionId: payment.provider_session_id || null,
    providerPaymentIntentId: payment.provider_intent_id || null,
    amount: payment.amount,
    currency: payment.currency,
    status: getPaymentStatus(payment),
    paidAt: payment.captured_at || payment.authorized_at || payment.payment_date || null,
  };
}

// -- GET /combos ---------------------------------------------------------------
router.get("/combos", async (req, res) => {
  try {
    const { error, value } = comboQuerySchema.validate(req.query);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    const combos = await Combo.find(buildActiveComboFilter(new Date())).lean();
    const filteredCombos = sortCombos(
      combos.filter((combo) => comboMatchesFilters(combo, value)),
      value.sort,
    );

    res.json({ combos: filteredCombos.map(serializeCombo) });
  } catch (error) {
    console.error("List combos error:", error);
    res.status(500).json({ error: "Failed to fetch combos" });
  }
});

// -- GET /combos/:slug ---------------------------------------------------------
router.get("/combos/:slug", async (req, res) => {
  try {
    const slug = String(req.params.slug || "").trim().toLowerCase();
    const combo = await Combo.findOne({ slug, ...buildActiveComboFilter(new Date()) }).lean();
    if (!combo) {
      return res.status(404).json({ error: "Combo not found" });
    }

    const relatedCombos = await Combo.find({
      _id: { $ne: combo._id },
      ...buildActiveComboFilter(new Date()),
    })
      .sort({ display_order: 1, base_price: 1 })
      .limit(3)
      .lean();

    res.json({
      combo: serializeCombo(combo),
      relatedCombos: relatedCombos.map(serializeCombo),
    });
  } catch (error) {
    console.error("Combo detail error:", error);
    res.status(500).json({ error: "Failed to fetch combo" });
  }
});

// -- POST /admin/combos --------------------------------------------------------
router.post("/admin/combos", authenticate, requireRole("admin"), async (req, res) => {
  try {
    const { error, value } = comboSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }
    if (value.validFrom && value.validTo && new Date(value.validTo) < new Date(value.validFrom)) {
      return res.status(400).json({ error: "Combo end date must be after start date" });
    }

    const combo = await Combo.create(comboPayloadToDocument(value));
    await recordAuditLog({
      action: "combo.created",
      actor: req.user,
      entityType: "combo",
      entityId: combo._id.toString(),
      metadata: { slug: combo.slug, basePrice: combo.base_price },
    });

    res.status(201).json({ message: "Combo created successfully", combo: serializeCombo(combo) });
  } catch (error) {
    console.error("Create combo error:", error);
    if (error.code === 11000) {
      return res.status(409).json({ error: "Combo slug already exists" });
    }
    res.status(500).json({ error: "Failed to create combo" });
  }
});

// -- PATCH /admin/combos/:id ---------------------------------------------------
router.patch("/admin/combos/:id", authenticate, requireRole("admin"), async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ error: "Invalid combo id" });
    }

    const { error, value } = updateComboSchema.validate(req.body, { noDefaults: true });
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }
    if (value.validFrom && value.validTo && new Date(value.validTo) < new Date(value.validFrom)) {
      return res.status(400).json({ error: "Combo end date must be after start date" });
    }

    const combo = await Combo.findByIdAndUpdate(req.params.id, { $set: comboUpdateToDocument(value) }, { new: true });
    if (!combo) {
      return res.status(404).json({ error: "Combo not found" });
    }

    await recordAuditLog({
      action: "combo.updated",
      actor: req.user,
      entityType: "combo",
      entityId: combo._id.toString(),
      metadata: { slug: combo.slug, isActive: combo.is_active },
    });

    res.json({ message: "Combo updated successfully", combo: serializeCombo(combo) });
  } catch (error) {
    console.error("Update combo error:", error);
    res.status(500).json({ error: "Failed to update combo" });
  }
});

// -- DELETE /admin/combos/:id --------------------------------------------------
router.delete("/admin/combos/:id", authenticate, requireRole("admin"), async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ error: "Invalid combo id" });
    }

    const combo = await Combo.findByIdAndUpdate(
      req.params.id,
      { $set: { is_active: false } },
      { new: true },
    );
    if (!combo) {
      return res.status(404).json({ error: "Combo not found" });
    }

    await recordAuditLog({
      action: "combo.deleted",
      actor: req.user,
      entityType: "combo",
      entityId: combo._id.toString(),
      metadata: { slug: combo.slug },
    });

    res.json({ message: "Combo deactivated successfully", combo: serializeCombo(combo) });
  } catch (error) {
    console.error("Delete combo error:", error);
    res.status(500).json({ error: "Failed to delete combo" });
  }
});

// -- POST /pricing/preview -----------------------------------------------------
router.post("/pricing/preview", async (req, res) => {
  try {
    const { error, value } = availabilityQuerySchema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    if (!mongoose.Types.ObjectId.isValid(value.roomId)) {
      return res.status(400).json({ error: "Invalid room id" });
    }

    const stay = validateStayDates(value.checkInDate, value.checkOutDate);
    if (stay.error) {
      return res.status(400).json({ error: stay.error });
    }

    const room = await loadBellaRoom(value.roomId, { requireAvailable: true });
    if (!room) {
      return res.status(404).json({ error: "Bella room not found or not available" });
    }

    if (value.numGuests > Number(room.capacity || 0)) {
      return res.status(400).json({ error: "Guest count exceeds room capacity" });
    }

    const pricing = await calculateBookingPrice({
      room,
      stay,
      guestCount: value.numGuests,
      comboId: value.comboId,
      comboSlug: value.comboSlug,
      promotionCode: value.promotionCode,
    });
    if (pricing.error) {
      return res.status(400).json({ error: pricing.error });
    }

    res.json({
      ...pricing.priceBreakdown,
      nights: stay.nights,
      combo: serializeComboSnapshot(pricing.comboSnapshot),
      promotion: pricing.promotionSnapshot
        ? {
            code: pricing.promotionSnapshot.code,
            name: pricing.promotionSnapshot.name,
            discountAmount: pricing.promotionSnapshot.discount_amount,
          }
        : null,
    });
  } catch (error) {
    console.error("Price preview error:", error);
    res.status(500).json({ error: "Failed to preview booking price" });
  }
});

// -- POST /promotions/validate -------------------------------------------------
router.post("/promotions/validate", async (req, res) => {
  try {
    const { error, value } = availabilityQuerySchema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    const stay = validateStayDates(value.checkInDate, value.checkOutDate);
    if (stay.error) {
      return res.status(400).json({ error: stay.error });
    }

    const room = await loadBellaRoom(value.roomId, { requireAvailable: true });
    if (!room) {
      return res.status(404).json({ error: "Bella room not found or not available" });
    }

    const pricing = await calculateBookingPrice({
      room,
      stay,
      guestCount: value.numGuests,
      comboId: value.comboId,
      comboSlug: value.comboSlug,
      promotionCode: value.promotionCode,
    });
    if (pricing.error) {
      return res.status(400).json({ error: pricing.error, valid: false });
    }

    res.json({
      valid: Boolean(pricing.promotionSnapshot),
      promotion: pricing.promotionSnapshot
        ? {
            code: pricing.promotionSnapshot.code,
            name: pricing.promotionSnapshot.name,
            discountAmount: pricing.promotionSnapshot.discount_amount,
          }
        : null,
      priceBreakdown: pricing.priceBreakdown,
    });
  } catch (error) {
    console.error("Promotion validate error:", error);
    res.status(500).json({ error: "Failed to validate promotion" });
  }
});

// -- GET /availability ----------------------------------------------------------
router.get("/availability", publicRateLimit, async (req, res) => {
  try {
    const { error, value } = availabilityQuerySchema.validate(req.query);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    if (!mongoose.Types.ObjectId.isValid(value.roomId)) {
      return res.status(400).json({ error: "Invalid room id" });
    }

    const stay = validateStayDates(value.checkInDate, value.checkOutDate);
    if (stay.error) {
      return res.status(400).json({ error: stay.error });
    }

    const room = await loadBellaRoom(value.roomId, { requireAvailable: true });
    if (!room) {
      return res.status(404).json({ error: "Bella room not found or not available" });
    }

    if (value.numGuests > Number(room.capacity || 0)) {
      return res.status(400).json({ error: "Guest count exceeds room capacity" });
    }

    await expireStalePendingHolds(value.roomId, stay);

    const conflict = await findConflictingBooking(value.roomId, stay);
    const pricing = await calculateBookingPrice({
      room,
      stay,
      guestCount: value.numGuests,
      comboId: value.comboId,
      comboSlug: value.comboSlug,
      promotionCode: value.promotionCode,
    });

    if (pricing.error) {
      return res.status(400).json({ error: pricing.error });
    }

    res.json({
      available: !conflict,
      roomId: value.roomId,
      checkInDate: value.checkInDate,
      checkOutDate: value.checkOutDate,
      nights: stay.nights,
      subtotal: pricing.roomSubtotal + pricing.comboSubtotal,
      roomSubtotal: pricing.roomSubtotal,
      comboSubtotal: pricing.comboSubtotal,
      discountAmount: pricing.discountAmount,
      serviceFee: pricing.serviceFee,
      totalPrice: pricing.finalAmount,
      finalAmount: pricing.finalAmount,
      priceBreakdown: pricing.priceBreakdown,
      combo: serializeComboSnapshot(pricing.comboSnapshot),
      promotion: pricing.promotionSnapshot
        ? {
            code: pricing.promotionSnapshot.code,
            name: pricing.promotionSnapshot.name,
            discountAmount: pricing.promotionSnapshot.discount_amount,
          }
        : null,
      reason: conflict ? "Room is not available for selected dates" : null,
    });
  } catch (error) {
    console.error("Availability error:", error);
    res.status(500).json({ error: "Failed to check room availability" });
  }
});

// -- POST /booking-requests -----------------------------------------------------
router.post("/booking-requests", publicRateLimit, async (req, res) => {
  try {
    const { error, value } = bookingRequestSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    const stay = validateStayDates(value.checkInDate, value.checkOutDate);
    if (stay.error) {
      return res.status(400).json({ error: stay.error });
    }

    let room = null;
    const hasRoomId = value.roomId && mongoose.Types.ObjectId.isValid(value.roomId);
    if (value.roomId && !hasRoomId) {
      return res.status(400).json({ error: "Invalid room id" });
    }

    if (hasRoomId) {
      room = await loadBellaRoom(value.roomId, { includeInactive: true });
      if (!room) {
        return res.status(404).json({ error: "Bella room not found" });
      }
    }

    let comboSnapshot = null;
    if (value.comboSlug) {
      const combo = await Combo.findOne({ slug: value.comboSlug }).lean();
      if (combo) {
        comboSnapshot = {
          combo_id: combo._id,
          slug: combo.slug,
          name: combo.name,
          price: Number(combo.base_price || 0),
          price_type: combo.price_type,
          included_services: combo.included_services || [],
          duration_label: combo.duration_label,
          suitable_for: combo.suitable_for,
        };
      }
    }

    const requestReference = await generateUniqueBookingRequestReference();
    const bookingRequest = new BookingRequest({
      request_reference: requestReference,
      source: "landing_page",
      room_id: room?._id || null,
      room_code: value.roomCode || room?.code || null,
      room_name: room?.localized_name?.vi || room?.room_type || value.roomName,
      check_in_date: stay.checkIn,
      check_out_date: stay.checkOut,
      nights: stay.nights,
      num_guests: value.numGuests,
      guest_full_name: value.guestFullName,
      guest_phone: value.guestPhone,
      guest_area: value.guestArea,
      guest_email: value.guestEmail || null,
      note: value.note || "",
      combo_slug: value.comboSlug || null,
      combo_name: comboSnapshot?.name || value.comboName || "Không chọn combo",
      combo_snapshot: comboSnapshot,
      estimated_total: Number(value.estimatedTotal || 0),
      context: {
        ...value.context,
        roomIsLive: value.context?.roomIsLive ?? Boolean(room?.is_available),
        userAgent: String(req.get("user-agent") || value.context?.userAgent || "").slice(0, 300),
      },
    });

    await bookingRequest.save();

    const bookingRequestCreatedEvent = buildOutboxEvent({
      topic: "booking-request-created",
      eventKey: `${bookingRequest._id.toString()}:booking-request-created`,
      aggregateType: "booking_request",
      aggregateId: bookingRequest._id.toString(),
      payload: {
        id: bookingRequest._id.toString(),
        requestReference,
        roomId: bookingRequest.room_id?.toString?.() || null,
        roomCode: bookingRequest.room_code,
        roomName: bookingRequest.room_name,
        checkInDate: bookingRequest.check_in_date,
        checkOutDate: bookingRequest.check_out_date,
        nights: bookingRequest.nights,
        numGuests: bookingRequest.num_guests,
        guestFullName: bookingRequest.guest_full_name,
        guestPhone: bookingRequest.guest_phone,
        guestArea: bookingRequest.guest_area,
        guestEmail: bookingRequest.guest_email,
        combo: serializeComboSnapshot(bookingRequest.combo_snapshot) || {
          slug: bookingRequest.combo_slug,
          name: bookingRequest.combo_name,
        },
        estimatedTotal: bookingRequest.estimated_total,
        note: bookingRequest.note,
        timestamp: new Date().toISOString(),
      },
    });

    await enqueueDomainEvents([bookingRequestCreatedEvent]);

    await recordAuditLog({
      action: "booking_request.created",
      actor: req.user,
      entityType: "booking_request",
      entityId: bookingRequest._id.toString(),
      metadata: {
        requestReference,
        roomCode: bookingRequest.room_code,
        comboSlug: bookingRequest.combo_slug,
      },
    });

    res.status(201).json({
      message: "Booking request received",
      bookingRequest: serializeBookingRequest(bookingRequest),
    });
  } catch (error) {
    console.error("Create booking request error:", error);
    res.status(500).json({ error: "Failed to create booking request" });
  }
});

// -- GET /booking-requests ------------------------------------------------------
router.get("/booking-requests", authenticate, requireRole("admin"), async (req, res) => {
  try {
    const { error, value } = bookingRequestListQuerySchema.validate(req.query);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    const where = value.status ? { status: value.status } : {};
    const [requests, total] = await Promise.all([
      BookingRequest.find(where)
        .sort({ createdAt: -1 })
        .skip((value.page - 1) * value.limit)
        .limit(value.limit)
        .lean(),
      BookingRequest.countDocuments(where),
    ]);

    res.json({
      bookingRequests: requests.map(serializeBookingRequest),
      pagination: {
        page: value.page,
        limit: value.limit,
        total,
        totalPages: Math.ceil(total / value.limit) || 1,
      },
    });
  } catch (error) {
    console.error("List booking requests error:", error);
    res.status(500).json({ error: "Failed to fetch booking requests" });
  }
});

// -- GET /lookup ----------------------------------------------------------------
router.get("/lookup", publicRateLimit, async (req, res) => {
  try {
    const { error, value } = bookingLookupSchema.validate(req.query);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    const booking = await Booking.findOne({
      booking_reference: value.reference,
      guest_email: value.email,
    })
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

    if (!booking || !booking.room_id?.hotel_id?.name || !isBellaHotelName(booking.room_id.hotel_id.name)) {
      return res.status(404).json({ error: "Booking not found" });
    }

    res.json({
      booking: {
        bookingReference: booking.booking_reference,
        status: booking.status,
        checkInDate: booking.check_in_date,
        checkOutDate: booking.check_out_date,
        totalPrice: booking.total_price,
        roomType: booking.room_id.room_type,
        roomNumber: booking.room_id.room_number,
        guestFullName: booking.guest_full_name,
        promotion: booking.promotion_snapshot
          ? {
              code: booking.promotion_snapshot.code,
              name: booking.promotion_snapshot.name,
              discountAmount: booking.promotion_snapshot.discount_amount,
          }
          : null,
        combo: serializeComboSnapshot(booking.combo_snapshot),
      },
    });
  } catch (error) {
    console.error("Booking lookup error:", error);
    res.status(500).json({ error: "Failed to lookup booking" });
  }
});

// -- GET /promotions ------------------------------------------------------------
router.get("/promotions", async (req, res) => {
  try {
    const promotions = await Promotion.find(buildActivePromotionFilter(new Date()))
      .sort({ createdAt: -1 })
      .lean();

    res.json({
      promotions: promotions.map(serializePromotion),
    });
  } catch (error) {
    console.error("List promotions error:", error);
    res.status(500).json({ error: "Failed to fetch promotions" });
  }
});

// -- GET /promotions/admin/all --------------------------------------------------
router.get("/promotions/admin/all", authenticate, requireRole("admin"), async (req, res) => {
  try {
    const promotions = await Promotion.find({}).sort({ createdAt: -1 }).lean();

    res.json({
      promotions: promotions.map(serializePromotion),
    });
  } catch (error) {
    console.error("Admin promotion list error:", error);
    res.status(500).json({ error: "Failed to fetch promotions" });
  }
});

// -- POST /promotions -----------------------------------------------------------
router.post("/promotions", authenticate, requireRole("admin"), async (req, res) => {
  try {
    const { error, value } = promotionSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    const promotionValidationError = validatePromotionPayload(value);
    if (promotionValidationError) {
      return res.status(400).json({ error: promotionValidationError });
    }

    const promotion = await Promotion.create({
      code: value.code,
      name: value.name,
      description: value.description || null,
      type: value.type,
      value: value.value,
      max_discount: value.maxDiscount || null,
      min_nights: value.minNights,
      min_spend: value.minSpend,
      active_from: value.activeFrom || null,
      active_to: value.activeTo || null,
      usage_limit: value.usageLimit || null,
      eligible_room_codes: normalizeEligibleRoomCodes(value.eligibleRoomCodes),
      is_active: value.isActive,
    });

    await recordAuditLog({
      action: "promotion.created",
      actor: req.user,
      entityType: "promotion",
      entityId: promotion._id.toString(),
      metadata: { code: promotion.code, type: promotion.type, value: promotion.value },
    });

    res.status(201).json({
      message: "Promotion created successfully",
      promotion: serializePromotion(promotion),
    });
  } catch (error) {
    console.error("Create promotion error:", error);
    if (error.code === 11000) {
      return res.status(409).json({ error: "Promotion code already exists" });
    }
    res.status(500).json({ error: "Failed to create promotion" });
  }
});

// -- PUT /promotions/:id --------------------------------------------------------
router.put("/promotions/:id", authenticate, requireRole("admin"), async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ error: "Invalid promotion id" });
    }

    const { error, value } = updatePromotionSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    const promotion = await Promotion.findById(req.params.id);
    if (!promotion) {
      return res.status(404).json({ error: "Promotion not found" });
    }

    const promotionValidationError = validatePromotionPayload(value, promotion.usage_count || 0);
    if (promotionValidationError) {
      return res.status(400).json({ error: promotionValidationError });
    }

    if (value.name !== undefined) promotion.name = value.name;
    if (value.description !== undefined) promotion.description = value.description || null;
    if (value.type !== undefined) promotion.type = value.type;
    if (value.value !== undefined) promotion.value = value.value;
    if (value.maxDiscount !== undefined) promotion.max_discount = value.maxDiscount || null;
    if (value.minNights !== undefined) promotion.min_nights = value.minNights;
    if (value.minSpend !== undefined) promotion.min_spend = value.minSpend;
    if (value.activeFrom !== undefined) promotion.active_from = value.activeFrom || null;
    if (value.activeTo !== undefined) promotion.active_to = value.activeTo || null;
    if (value.usageLimit !== undefined) promotion.usage_limit = value.usageLimit || null;
    if (value.eligibleRoomCodes !== undefined) {
      promotion.eligible_room_codes = normalizeEligibleRoomCodes(value.eligibleRoomCodes);
    }
    if (value.isActive !== undefined) promotion.is_active = value.isActive;
    await promotion.save();

    await recordAuditLog({
      action: "promotion.updated",
      actor: req.user,
      entityType: "promotion",
      entityId: promotion._id.toString(),
      metadata: { code: promotion.code, isActive: promotion.is_active },
    });

    res.json({
      message: "Promotion updated successfully",
      promotion: serializePromotion(promotion),
    });
  } catch (error) {
    console.error("Update promotion error:", error);
    res.status(500).json({ error: "Failed to update promotion" });
  }
});

// -- GET /admin/stats -----------------------------------------------------------
router.get("/admin/stats", authenticate, requireRole("admin"), async (req, res) => {
  try {
    const [
      totalBookings,
      pendingBookings,
      confirmedBookings,
      completedBookings,
      cancelledBookings,
      expiredBookings,
      totalBookingRequests,
      newBookingRequests,
      activePromotions,
      revenue,
    ] = await Promise.all([
      Booking.countDocuments({}),
      Booking.countDocuments({ status: "pending_payment" }),
      Booking.countDocuments({ status: "confirmed" }),
      Booking.countDocuments({ status: "completed" }),
      Booking.countDocuments({ status: "cancelled" }),
      Booking.countDocuments({ status: "expired" }),
      BookingRequest.countDocuments({}),
      BookingRequest.countDocuments({ status: "new" }),
      Promotion.countDocuments({ is_active: true }),
      Payment.aggregate([
        { $match: { $or: [{ status: "succeeded" }, { payment_status: "succeeded" }] } },
        {
          $group: {
            _id: null,
            totalRevenue: {
              $sum: {
                $ifNull: ["$amount_captured", "$amount"],
              },
            },
          },
        },
      ]),
    ]);

    res.json({
      bookings: {
        total: totalBookings,
        pending: pendingBookings,
        pendingPayment: pendingBookings,
        confirmed: confirmedBookings,
        completed: completedBookings,
        cancelled: cancelledBookings,
        expired: expiredBookings,
      },
      promotions: {
        active: activePromotions,
      },
      bookingRequests: {
        total: totalBookingRequests,
        new: newBookingRequests,
      },
      revenue: {
        succeededPayments: revenue[0]?.totalRevenue || 0,
        completedPayments: revenue[0]?.totalRevenue || 0,
      },
    });
  } catch (error) {
    console.error("Admin stats error:", error);
    res.status(500).json({ error: "Failed to fetch admin stats" });
  }
});

// -- GET /audit-logs ------------------------------------------------------------
router.get("/audit-logs", authenticate, requireRole("admin"), async (req, res) => {
  try {
    const { error, value } = auditLogQuerySchema.validate(req.query);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    const logs = await AuditLog.find({ service: "booking-service" })
      .sort({ createdAt: -1 })
      .limit(value.limit)
      .lean();

    res.json({
      logs: logs.map((log) => ({
        id: log._id.toString(),
        action: log.action,
        actorUserId: log.actor_user_id,
        actorRole: log.actor_role,
        entityType: log.entity_type,
        entityId: log.entity_id,
        metadata: log.metadata,
        createdAt: log.createdAt,
      })),
    });
  } catch (error) {
    console.error("Audit log fetch error:", error);
    res.status(500).json({ error: "Failed to fetch audit logs" });
  }
});

// -- POST /  (create booking) --------------------------------------------------
router.post("/", authenticate, bookingCreateRateLimit, async (req, res) => {
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
      comboId,
      comboSlug,
      guestFullName,
      guestEmail,
      guestPhone,
      specialRequests,
      promotionCode,
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

    await expireStalePendingHolds(roomId, stay);

    const conflict = await findConflictingBooking(roomId, stay);
    if (conflict) {
      return res.status(409).json({ error: "Room is not available for selected dates" });
    }

    const pricing = await calculateBookingPrice({
      room,
      stay,
      guestCount: numGuests,
      comboId,
      comboSlug,
      promotionCode,
    });
    if (pricing.error) {
      return res.status(400).json({ error: pricing.error });
    }

    const discountAmount = pricing.discountAmount || 0;
    const totalPrice = pricing.finalAmount;
    const bookingReference = await generateUniqueBookingReference();
    const paymentExpiresAt = getPaymentHoldExpiry();

    const booking = new Booking({
      booking_reference: bookingReference,
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
      combo_id: pricing.comboSnapshot?.combo_id || null,
      combo_snapshot: pricing.comboSnapshot,
      promotion_code: pricing.promotionSnapshot?.code || null,
      promotion_snapshot: pricing.promotionSnapshot,
      price_snapshot: pricing.priceSnapshot || buildPriceSnapshot({
        nights: stay.nights,
        nightlyRate,
        roomSubtotal: pricing.roomSubtotal,
        comboSubtotal: pricing.comboSubtotal,
        subtotal: pricing.roomSubtotal + pricing.comboSubtotal,
        discountAmount,
        serviceFee: pricing.serviceFee,
        total: totalPrice,
        priceBreakdown: pricing.priceBreakdown,
      }),
      payment_expires_at: paymentExpiresAt,
      status: "pending_payment",
    });

    const bookingCreatedEvent = buildOutboxEvent({
      topic: "booking-created",
      eventKey: `${booking._id.toString()}:booking-created`,
      aggregateType: "booking",
      aggregateId: booking._id.toString(),
      payload: {
        id: booking._id.toString(),
        bookingReference: booking.booking_reference,
        userId: booking.user_id,
        roomId: booking.room_id.toString(),
        checkInDate: booking.check_in_date,
        checkOutDate: booking.check_out_date,
        totalPrice: booking.total_price,
        subtotal: pricing.roomSubtotal + pricing.comboSubtotal,
        roomSubtotal: pricing.roomSubtotal,
        comboSubtotal: pricing.comboSubtotal,
        discountAmount,
        combo: serializeComboSnapshot(pricing.comboSnapshot),
        promotionCode: booking.promotion_code,
        numGuests: booking.num_guests,
        status: booking.status,
        paymentExpiresAt: booking.payment_expires_at,
        timestamp: new Date().toISOString(),
      },
    });

    await withOptionalTransaction(async (session) => {
      await booking.save(session ? { session } : undefined);
      if (pricing.promotionSnapshot) {
        await adjustPromotionUsage(booking, 1, session);
      }
      await enqueueDomainEventsTransactional([bookingCreatedEvent], session);
    });

    triggerOutboxFlush();

    await recordAuditLog({
      action: "booking.created",
      actor: req.user,
      entityType: "booking",
      entityId: booking._id.toString(),
      metadata: {
        bookingReference: booking.booking_reference,
        roomId: booking.room_id.toString(),
        totalPrice: booking.total_price,
        comboSlug: booking.combo_snapshot?.slug || null,
        promotionCode: booking.promotion_code,
      },
    });

    await invalidateBookingCache(userId);

    res.status(201).json({
      message: "Booking created successfully",
      booking: serializeBookingResponse(booking),
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

    const adminWantsAll =
      req.user.role === "admin" &&
      (value.scope === "all" || (!value.userId && value.scope !== "self"));

    if (value.userId && req.user.role !== "admin" && value.userId !== req.user.id) {
      return res.status(403).json({ error: "Access denied" });
    }

    const where = {};
    if (!adminWantsAll) {
      where.user_id = req.user.role === "admin" && value.userId ? value.userId : req.user.id;
    } else if (value.userId) {
      where.user_id = value.userId;
    }

    if (value.status) {
      where.status = value.status;
    }
    if (value.reference) {
      where.booking_reference = { $regex: escapeRegex(value.reference), $options: "i" };
    }
    if (value.guestEmail) {
      where.guest_email = value.guestEmail;
    }

    const [bookings, total] = await Promise.all([
      Booking.find(where)
        .sort({ createdAt: -1 })
        .skip((value.page - 1) * value.limit)
        .limit(value.limit)
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
        .lean(),
      Booking.countDocuments(where),
    ]);

    const bellaBookings = bookings.filter(
      (booking) =>
        booking.room_id?.hotel_id?.name && isBellaHotelName(booking.room_id.hotel_id.name),
    );

    res.json({
      bookings: bellaBookings.map(serializeBookingListItem),
      pagination: {
        page: value.page,
        limit: value.limit,
        total,
        totalPages: Math.ceil(total / value.limit) || 1,
      },
    });
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

    const payment = await findBookingPayment(booking._id);

    res.json({
      booking: {
        ...serializeBookingListItem(booking),
        payment: serializeRelatedPayment(payment),
      },
    });
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

    const room = await loadBellaRoom(booking.room_id.toString(), { includeInactive: true });
    if (!room) {
      return res.status(404).json({ error: "Booking not found" });
    }

    if (!canTransitionBooking(booking.status, value.status)) {
      return res.status(409).json({
        error: `Booking cannot move from ${booking.status} to ${value.status}`,
      });
    }

    const payment = await findBookingPayment(booking._id);
    const paymentStatus = getPaymentStatus(payment);
    if (value.status === "confirmed" && !isPaymentConfirmedForBooking(paymentStatus)) {
      return res.status(409).json({
        error: "Only paid Bella reservations can be marked as confirmed",
      });
    }

    if (value.status === "cancelled" && isPaymentBlockingCancellation(paymentStatus)) {
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

    const previousStatus = booking.status;
    booking.status = value.status;
    if (value.status === "confirmed" && !booking.confirmed_at) {
      booking.confirmed_at = new Date();
      booking.payment_expires_at = null;
    }
    if (value.status === "cancelled") {
      booking.cancelled_at = new Date();
    }
    if (value.status === "completed") {
      booking.completed_at = new Date();
    }
    if (value.status === "expired") {
      booking.expired_at = new Date();
    }
    const bookingStatusUpdatedEvent = buildOutboxEvent({
      topic: "booking-status-updated",
      eventKey: `${booking._id.toString()}:booking-status:${booking.status}:${Date.now()}`,
      aggregateType: "booking",
      aggregateId: booking._id.toString(),
      payload: {
        id: booking._id.toString(),
        bookingReference: booking.booking_reference,
        userId: booking.user_id,
        roomId: booking.room_id.toString(),
        status: booking.status,
        paymentExpiresAt: booking.payment_expires_at || null,
        timestamp: new Date().toISOString(),
      },
    });

    await withOptionalTransaction(async (session) => {
      await booking.save(session ? { session } : undefined);

      if (value.status === "cancelled" && ACTIVE_BOOKING_STATUSES.includes(previousStatus)) {
        await adjustPromotionUsage(booking, -1, session);
      }

      await enqueueDomainEventsTransactional([bookingStatusUpdatedEvent], session);
    });

    triggerOutboxFlush();

    await recordAuditLog({
      action: "booking.status_updated",
      actor: req.user,
      entityType: "booking",
      entityId: booking._id.toString(),
      metadata: {
        bookingReference: booking.booking_reference,
        previousStatus,
        nextStatus: booking.status,
      },
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

    const room = await loadBellaRoom(booking.room_id.toString(), { includeInactive: true });
    if (!room) {
      return res.status(404).json({ error: "Booking not found" });
    }

    if (!canTransitionBooking(booking.status, "cancelled")) {
      return res.status(409).json({ error: "This Bella booking can no longer be cancelled" });
    }

    const payment = await findBookingPayment(booking._id);
    const paymentStatus = getPaymentStatus(payment);
    if (isPaymentBlockingCancellation(paymentStatus)) {
      return res.status(409).json({
        error: "Paid Bella reservations cannot be cancelled here",
      });
    }

    const previousStatus = booking.status;
    booking.status = "cancelled";
    booking.cancelled_at = new Date();
    const bookingCancelledEvent = buildOutboxEvent({
      topic: "booking-cancelled",
      eventKey: `${booking._id.toString()}:booking-cancelled:${Date.now()}`,
      aggregateType: "booking",
      aggregateId: booking._id.toString(),
      payload: {
        id: booking._id.toString(),
        bookingReference: booking.booking_reference,
        userId: booking.user_id,
        roomId: booking.room_id.toString(),
        totalPrice: booking.total_price,
        timestamp: new Date().toISOString(),
      },
    });

    await withOptionalTransaction(async (session) => {
      await booking.save(session ? { session } : undefined);

      if (ACTIVE_BOOKING_STATUSES.includes(previousStatus)) {
        await adjustPromotionUsage(booking, -1, session);
      }

      await enqueueDomainEventsTransactional([bookingCancelledEvent], session);
    });

    triggerOutboxFlush();

    await recordAuditLog({
      action: "booking.cancelled",
      actor: req.user,
      entityType: "booking",
      entityId: booking._id.toString(),
      metadata: {
        bookingReference: booking.booking_reference,
        previousStatus,
      },
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
