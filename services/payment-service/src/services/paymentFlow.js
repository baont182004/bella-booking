import mongoose from "mongoose";
import { randomUUID } from "node:crypto";
import {
  AuditLog,
  Booking,
  Hotel,
  Payment,
  PaymentWebhookEvent,
  Room,
} from "../config/database.js";
import { getPaymentRuntimeConfig } from "../config/paymentConfig.js";
import { enqueueOutboxEvent, triggerOutboxFlush } from "../config/kafka.js";
import { getRedisClient } from "../config/redis.js";
import { getPaymentProvider } from "../providers/index.js";

const BELLA_HOTEL_NAME = "BELLA HOTEL Phu Quoc";
const PAYMENT_LOCK_TTL_SECONDS = 15;
const WEBHOOK_PROCESSING_LEASE_MS = 60_000;
const OPEN_PAYMENT_STATUSES = new Set(["pending", "requires_action", "processing"]);
const SUCCESS_PAYMENT_STATUSES = new Set(["authorized", "succeeded"]);
const TERMINAL_PAYMENT_STATUSES = new Set([
  "succeeded",
  "failed",
  "cancelled",
  "refunded",
  "partially_refunded",
  "expired",
]);

function normalizeHotelName(value) {
  return value?.trim().toLowerCase() || "";
}

function isBellaHotelName(value) {
  return normalizeHotelName(value) === normalizeHotelName(BELLA_HOTEL_NAME);
}

function dedupeStrings(values = []) {
  return [...new Set(values.filter(Boolean))];
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function isObjectId(value) {
  return mongoose.Types.ObjectId.isValid(value);
}

export function getPaymentStatus(payment) {
  return payment?.status || payment?.payment_status || "pending";
}

function setPaymentStatus(payment, status) {
  payment.status = status;
  payment.payment_status = status;
}

export function isPaymentSuccessful(status) {
  return SUCCESS_PAYMENT_STATUSES.has(status);
}

export function isPaymentTerminal(status) {
  return TERMINAL_PAYMENT_STATUSES.has(status);
}

function isPaymentOpen(status) {
  return OPEN_PAYMENT_STATUSES.has(status);
}

function appendPaymentStatusHistory(payment, entry = {}) {
  const currentHistory = Array.isArray(payment.status_history) ? payment.status_history : [];
  payment.status_history = [
    ...currentHistory.slice(-49),
    {
      at: entry.at || new Date(),
      previousStatus: entry.previousStatus || null,
      nextStatus: entry.nextStatus || getPaymentStatus(payment),
      previousBookingStatus: entry.previousBookingStatus || null,
      nextBookingStatus: entry.nextBookingStatus || null,
      providerEventId: entry.providerEventId || payment.provider_event_id || null,
      reason: entry.reason || payment.status_reason || null,
      source: entry.source || "payment-service",
    },
  ];
}

function sanitizeAuditValue(value, key = "") {
  const sensitiveKeyPattern =
    /secret|signature|authorization|raw[_-]?body|provider[_-]?payload|access[_-]?token/i;

  if (sensitiveKeyPattern.test(key)) {
    return "[redacted]";
  }

  if (Array.isArray(value)) {
    return value
      .map((item) => sanitizeAuditValue(item))
      .filter((item) => item !== undefined);
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .map(([entryKey, entryValue]) => [entryKey, sanitizeAuditValue(entryValue, entryKey)])
        .filter(([, entryValue]) => entryValue !== undefined),
    );
  }

  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean" ||
    value === null
  ) {
    return value;
  }

  return undefined;
}

function sanitizeAuditMetadata(metadata = {}) {
  const sanitized = sanitizeAuditValue(metadata);
  return sanitized && typeof sanitized === "object" && !Array.isArray(sanitized) ? sanitized : {};
}

function syncLegacyPaymentFields(payment) {
  const status = getPaymentStatus(payment);
  payment.payment_status = status;
  payment.payment_method = payment.payment_method_type || payment.payment_method || "hosted_checkout";
  payment.transaction_id =
    payment.provider_payment_id ||
    payment.provider_intent_id ||
    payment.provider_session_id ||
    payment.transaction_id ||
    null;
  payment.payment_date =
    payment.captured_at ||
    payment.authorized_at ||
    payment.failed_at ||
    payment.payment_date ||
    null;
  payment.failure_reason = payment.failure_message || payment.status_reason || null;
  payment.refund_transaction_id =
    status === "refunded" || status === "partially_refunded"
      ? payment.provider_event_id || payment.refund_transaction_id || null
      : null;
  payment.refund_date =
    status === "refunded" || status === "partially_refunded"
      ? payment.refunded_at || payment.refund_date || null
      : null;
}

function buildPaymentEventPayload(payment, booking) {
  return {
    id: payment._id.toString(),
    bookingId: payment.booking_id.toString(),
    bookingReference: booking.booking_reference || null,
    provider: payment.provider,
    providerPaymentId: payment.provider_payment_id || null,
    providerIntentId: payment.provider_intent_id || null,
    providerSessionId: payment.provider_session_id || null,
    amount: payment.amount,
    currency: payment.currency,
    amountAuthorized: payment.amount_authorized,
    amountCaptured: payment.amount_captured,
    amountRefunded: payment.amount_refunded,
    paymentMethodType: payment.payment_method_type,
    cardBrand: payment.card_brand,
    cardLast4: payment.card_last4,
    paymentStatus: getPaymentStatus(payment),
    failureCode: payment.failure_code,
    failureMessage: payment.failure_message,
    timestamp: new Date().toISOString(),
  };
}

function buildBookingStatusPayload(booking) {
  return {
    id: booking._id.toString(),
    bookingReference: booking.booking_reference || null,
    userId: booking.user_id,
    roomId: booking.room_id.toString(),
    status: booking.status,
    paymentExpiresAt: booking.payment_expires_at || null,
    timestamp: new Date().toISOString(),
  };
}

async function queueOutboxEvents(events = [], { session = null, flush = true } = {}) {
  for (const event of events) {
    await enqueueOutboxEvent({
      ...event,
      session,
    });
  }

  if (events.length > 0 && flush) {
    triggerOutboxFlush();
  }
}

async function persistPaymentArtifacts({
  payment,
  booking,
  eventRecord = null,
  outboxEvents = [],
}) {
  await withOptionalTransaction(async (session) => {
    await payment.save(session ? { session } : undefined);
    if (booking?.isModified()) {
      await booking.save(session ? { session } : undefined);
    }
    if (eventRecord) {
      await eventRecord.save(session ? { session } : undefined);
    }
    await queueOutboxEvents(outboxEvents, { session, flush: false });
  });

  if (outboxEvents.length > 0) {
    triggerOutboxFlush();
  }
}

export function serializePayment(payment) {
  if (!payment) {
    return null;
  }

  const status = getPaymentStatus(payment);
  return {
    id: payment._id.toString(),
    bookingId: payment.booking_id.toString(),
    provider: payment.provider,
    providerPaymentId: payment.provider_payment_id || null,
    providerIntentId: payment.provider_intent_id || null,
    providerSessionId: payment.provider_session_id || null,
    providerCustomerId: payment.provider_customer_id || null,
    amount: payment.amount,
    currency: payment.currency,
    amountAuthorized: payment.amount_authorized || 0,
    amountCaptured: payment.amount_captured || 0,
    amountRefunded: payment.amount_refunded || 0,
    paymentMethod: payment.payment_method_type || payment.payment_method || null,
    paymentMethodType: payment.payment_method_type || payment.payment_method || null,
    cardBrand: payment.card_brand || null,
    cardLast4: payment.card_last4 || null,
    billingName: payment.billing_name || null,
    billingEmail: payment.billing_email || null,
    paymentStatus: status,
    status,
    statusReason: payment.status_reason || null,
    failureCode: payment.failure_code || null,
    failureMessage: payment.failure_message || null,
    authorizedAt: payment.authorized_at || null,
    capturedAt: payment.captured_at || null,
    failedAt: payment.failed_at || null,
    refundedAt: payment.refunded_at || null,
    webhookVerifiedAt: payment.webhook_verified_at || null,
    checkoutSessionExpiresAt: payment.checkout_session_expires_at || null,
    riskFlags: payment.risk_flags || [],
    providerPayloadSummary: payment.provider_payload_summary || {},
  };
}

export function serializeBookingSummary(booking) {
  if (!booking) {
    return null;
  }

  return {
    id: booking._id.toString(),
    bookingReference: booking.booking_reference || null,
    status: booking.status,
    totalPrice: booking.total_price,
    paymentExpiresAt: booking.payment_expires_at || null,
    confirmedAt: booking.confirmed_at || null,
    cancelledAt: booking.cancelled_at || null,
    expiredAt: booking.expired_at || null,
    combo: booking.combo_snapshot
      ? {
          name: booking.combo_snapshot.name,
          slug: booking.combo_snapshot.slug,
          price: booking.combo_snapshot.price,
          durationLabel: booking.combo_snapshot.duration_label,
          suitableFor: booking.combo_snapshot.suitable_for,
          includedServices: booking.combo_snapshot.included_services || [],
        }
      : null,
  };
}

export async function recordAuditLog({
  action,
  actor,
  entityType,
  entityId,
  metadata = {},
}) {
  try {
    await AuditLog.create({
      service: "payment-service",
      action,
      actor_user_id: actor?.id || null,
      actor_role: actor?.role || null,
      entity_type: entityType,
      entity_id: entityId,
      metadata: sanitizeAuditMetadata(metadata),
    });
  } catch (error) {
    console.error("Payment audit log error:", error);
  }
}

export async function acquirePaymentLock(resourceId) {
  const redis = getRedisClient();
  const lockKey = `lock:payment:${resourceId}`;
  const lockToken = randomUUID();
  const acquired = await redis.set(lockKey, lockToken, {
    NX: true,
    EX: PAYMENT_LOCK_TTL_SECONDS,
  });

  if (acquired !== "OK") {
    return null;
  }

  return { lockKey, lockToken };
}

export async function releasePaymentLock(lock) {
  if (!lock) {
    return;
  }

  const redis = getRedisClient();
  const currentToken = await redis.get(lock.lockKey);
  if (currentToken === lock.lockToken) {
    await redis.del(lock.lockKey);
  }
}

async function acquirePaymentLockWithRetry(resourceId, attempts = 20, delayMs = 100) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const lock = await acquirePaymentLock(resourceId);
    if (lock) {
      return lock;
    }

    if (attempt < attempts - 1) {
      await sleep(delayMs);
    }
  }

  return null;
}

export function canAccessBooking(req, booking) {
  return req.user?.role === "admin" || booking.user_id === req.user?.id;
}

export async function loadBellaBookingById(bookingId) {
  return Booking.findById(bookingId).populate({
    path: "room_id",
    model: Room,
    select: "room_number room_type hotel_id is_available is_active",
    populate: {
      path: "hotel_id",
      model: Hotel,
      select: "name address city country",
    },
  });
}

export async function loadOwnedBellaBooking(req, res, bookingId) {
  if (!isObjectId(bookingId)) {
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

function touchBookingStatusTimestamps(booking, status, timestamp) {
  if (status === "confirmed" && !booking.confirmed_at) {
    booking.confirmed_at = timestamp;
  }
  if (status === "cancelled") {
    booking.cancelled_at = timestamp;
  }
  if (status === "completed") {
    booking.completed_at = timestamp;
  }
  if (status === "expired") {
    booking.expired_at = timestamp;
  }
}

function applyPaymentMetadata(payment, normalizedEvent) {
  payment.provider = normalizedEvent.provider || payment.provider || "mock";
  payment.provider_payment_id = normalizedEvent.providerPaymentId || payment.provider_payment_id || null;
  payment.provider_intent_id = normalizedEvent.providerIntentId || payment.provider_intent_id || null;
  payment.provider_session_id = normalizedEvent.providerSessionId || payment.provider_session_id || null;
  payment.provider_event_id = normalizedEvent.providerEventId || payment.provider_event_id || null;
  payment.provider_customer_id =
    normalizedEvent.providerCustomerId || payment.provider_customer_id || null;
  payment.payment_method_type = normalizedEvent.paymentMethodType || payment.payment_method_type || "hosted_checkout";
  payment.payment_method = payment.payment_method_type;
  payment.card_brand = normalizedEvent.cardBrand || payment.card_brand || null;
  payment.card_last4 = normalizedEvent.cardLast4 || payment.card_last4 || null;
  payment.billing_name = normalizedEvent.billingName || payment.billing_name || null;
  payment.billing_email = normalizedEvent.billingEmail || payment.billing_email || null;
  payment.currency = normalizedEvent.currency || payment.currency || "VND";
  if (
    normalizedEvent.status !== "refunded" &&
    normalizedEvent.status !== "partially_refunded" &&
    (!Number.isFinite(Number(payment.amount)) || Number(payment.amount) <= 0)
  ) {
    payment.amount = Number(normalizedEvent.amount || 0);
  }
  payment.risk_flags = dedupeStrings([
    ...(payment.risk_flags || []),
    ...(normalizedEvent.riskFlags || []),
  ]);
  payment.provider_payload_summary = {
    ...(payment.provider_payload_summary || {}),
    ...(normalizedEvent.payloadSummary || {}),
  };
}

function validateProviderAmountMatchesBooking({ payment, booking, normalizedEvent }) {
  const expectedAmount = Number(payment.amount);
  const bookingAmount = Number(booking.total_price);
  const providerAmount = Number(normalizedEvent.amount);
  const expectedCurrency = String(payment.currency || booking.price_snapshot?.currency || "VND").toUpperCase();
  const providerCurrency = String(normalizedEvent.currency || expectedCurrency).toUpperCase();

  if (
    !Number.isFinite(expectedAmount) ||
    !Number.isFinite(bookingAmount) ||
    !Number.isFinite(providerAmount) ||
    expectedAmount !== bookingAmount ||
    providerAmount !== expectedAmount ||
    providerCurrency !== expectedCurrency
  ) {
    return {
      ok: false,
      reason: `provider_amount_mismatch expected=${expectedAmount} ${expectedCurrency} booking=${bookingAmount} provider=${providerAmount} ${providerCurrency}`,
    };
  }

  return { ok: true };
}

function validateRoomCanBeConfirmed(booking) {
  if (!booking?.room_id || booking.room_id.is_active === false || booking.room_id.is_available === false) {
    return {
      ok: false,
      reason: "room_unavailable_before_payment_confirmation",
    };
  }

  return { ok: true };
}

function buildOutboxEventsForTransition({
  payment,
  booking,
  previousPaymentStatus,
  previousBookingStatus,
}) {
  const events = [];
  const paymentStatus = getPaymentStatus(payment);
  const paymentPayload = buildPaymentEventPayload(payment, booking);

  if (paymentStatus !== previousPaymentStatus) {
    let topic = "payment-updated";
    if (paymentStatus === "succeeded" || paymentStatus === "authorized") {
      topic = "payment-processed";
    } else if (paymentStatus === "failed") {
      topic = "payment-failed";
    } else if (paymentStatus === "refunded" || paymentStatus === "partially_refunded") {
      topic = "payment-refunded";
    } else if (paymentStatus === "expired") {
      topic = "payment-expired";
    }

    events.push({
      topic,
      eventKey: `${payment._id.toString()}:${paymentStatus}:${payment.provider_event_id || payment.updatedAt?.toISOString() || "state"}`,
      aggregateType: "payment",
      aggregateId: payment._id.toString(),
      payload: paymentPayload,
    });
  }

  if (booking.status !== previousBookingStatus) {
    events.push({
      topic: "booking-status-updated",
      eventKey: `${booking._id.toString()}:${booking.status}:${payment.provider_event_id || booking.updatedAt?.toISOString() || "state"}`,
      aggregateType: "booking",
      aggregateId: booking._id.toString(),
      payload: buildBookingStatusPayload(booking),
    });
  }

  if (paymentStatus === "succeeded" || paymentStatus === "authorized") {
    events.push({
      topic: "notification-request",
      eventKey: `notification:payment-success:${payment._id.toString()}:${payment.provider_event_id || paymentStatus}`,
      aggregateType: "payment",
      aggregateId: payment._id.toString(),
      payload: {
        type: "payment-success",
        userId: booking.user_id,
        bookingId: booking._id.toString(),
        bookingReference: booking.booking_reference || null,
        amount: payment.amount,
        provider: payment.provider,
        paymentStatus,
        timestamp: new Date().toISOString(),
      },
    });
  } else if (paymentStatus === "failed") {
    events.push({
      topic: "notification-request",
      eventKey: `notification:payment-failed:${payment._id.toString()}:${payment.provider_event_id || paymentStatus}`,
      aggregateType: "payment",
      aggregateId: payment._id.toString(),
      payload: {
        type: "payment-failed",
        userId: booking.user_id,
        bookingId: booking._id.toString(),
        bookingReference: booking.booking_reference || null,
        amount: payment.amount,
        provider: payment.provider,
        paymentStatus,
        timestamp: new Date().toISOString(),
      },
    });
  } else if (paymentStatus === "refunded" || paymentStatus === "partially_refunded") {
    events.push({
      topic: "notification-request",
      eventKey: `notification:payment-refunded:${payment._id.toString()}:${payment.provider_event_id || paymentStatus}`,
      aggregateType: "payment",
      aggregateId: payment._id.toString(),
      payload: {
        type: "payment-refunded",
        userId: booking.user_id,
        bookingId: booking._id.toString(),
        bookingReference: booking.booking_reference || null,
        amount: payment.amount_refunded || payment.amount,
        provider: payment.provider,
        paymentStatus,
        timestamp: new Date().toISOString(),
      },
    });
  }

  return events;
}

export async function markPaymentExpiredIfNeeded(payment, booking, actor = null) {
  const currentStatus = getPaymentStatus(payment);
  const expiresAt = payment.checkout_session_expires_at;

  if (!expiresAt || !isPaymentOpen(currentStatus) || expiresAt > new Date()) {
    return { expired: false, payment, booking };
  }

  const previousPaymentStatus = currentStatus;
  const previousBookingStatus = booking.status;
  const timestamp = new Date();

  setPaymentStatus(payment, "expired");
  payment.status_reason = "checkout_session_expired";
  payment.failure_code = null;
  payment.failure_message = null;
  payment.failed_at = null;

  if (booking.status === "pending_payment") {
    booking.status = "expired";
    touchBookingStatusTimestamps(booking, "expired", timestamp);
  }

  syncLegacyPaymentFields(payment);
  await persistPaymentArtifacts({
    payment,
    booking,
    outboxEvents: buildOutboxEventsForTransition({
      payment,
      booking,
      previousPaymentStatus,
      previousBookingStatus,
    }),
  });

  await recordAuditLog({
    action: "payment.expired",
    actor,
    entityType: "payment",
    entityId: payment._id.toString(),
    metadata: {
      bookingId: booking._id.toString(),
      bookingReference: booking.booking_reference || null,
      provider: payment.provider,
    },
  });

  return { expired: true, payment, booking };
}

export async function markBookingHoldExpiredIfNeeded(booking, actor = null) {
  if (
    booking.status !== "pending_payment" ||
    !booking.payment_expires_at ||
    booking.payment_expires_at > new Date()
  ) {
    return { expired: false, booking };
  }

  const previousBookingStatus = booking.status;
  const timestamp = new Date();
  const payment = await Payment.findOne({ booking_id: booking._id });
  const previousPaymentStatus = getPaymentStatus(payment);

  if (isPaymentSuccessful(previousPaymentStatus)) {
    booking.status = "confirmed";
    booking.payment_expires_at = null;
    booking.expired_at = null;
    touchBookingStatusTimestamps(booking, "confirmed", timestamp);

    await withOptionalTransaction(async (session) => {
      await booking.save(session ? { session } : undefined);
      await queueOutboxEvents(
        [
          {
            topic: "booking-status-updated",
            eventKey: `${booking._id.toString()}:confirmed-after-paid-hold:${timestamp.getTime()}`,
            aggregateType: "booking",
            aggregateId: booking._id.toString(),
            payload: buildBookingStatusPayload(booking),
          },
        ],
        { session, flush: false },
      );
    });
    triggerOutboxFlush();

    await recordAuditLog({
      action: "booking.hold_expiry_skipped_paid",
      actor,
      entityType: "booking",
      entityId: booking._id.toString(),
      metadata: {
        bookingReference: booking.booking_reference || null,
        previousBookingStatus,
        previousPaymentStatus,
        reason: "payment_already_succeeded",
      },
    });

    return { expired: false, booking, payment };
  }

  booking.status = "expired";
  touchBookingStatusTimestamps(booking, "expired", timestamp);

  await withOptionalTransaction(async (session) => {
    await booking.save(session ? { session } : undefined);
    if (payment && isPaymentOpen(previousPaymentStatus)) {
      setPaymentStatus(payment, "expired");
      payment.status_reason = "booking_hold_expired";
      syncLegacyPaymentFields(payment);
      await payment.save(session ? { session } : undefined);
    }
    await queueOutboxEvents(
      [
        {
          topic: "booking-status-updated",
          eventKey: `${booking._id.toString()}:expired:${timestamp.getTime()}`,
          aggregateType: "booking",
          aggregateId: booking._id.toString(),
          payload: buildBookingStatusPayload(booking),
        },
      ],
      { session, flush: false },
    );
  });
  triggerOutboxFlush();

  await recordAuditLog({
    action: "booking.hold_expired",
    actor,
    entityType: "booking",
    entityId: booking._id.toString(),
    metadata: {
      bookingReference: booking.booking_reference || null,
      previousBookingStatus,
      previousPaymentStatus,
    },
  });

  return { expired: true, booking };
}

export async function createHostedCheckoutSession({
  booking,
  actor,
  providerName,
  billingName,
  billingEmail,
  paymentMethodType = "hosted_checkout",
}) {
  const provider = getPaymentProvider(providerName);
  let payment = await Payment.findOne({ booking_id: booking._id });

  if (!payment) {
    payment = new Payment({
      booking_id: booking._id,
      amount: booking.total_price,
      currency: booking.price_snapshot?.currency || "VND",
      provider: provider.name,
      payment_method: "hosted_checkout",
      payment_method_type: paymentMethodType,
      status: "pending",
      payment_status: "pending",
    });
  }

  await markPaymentExpiredIfNeeded(payment, booking, actor);

  const currentStatus = getPaymentStatus(payment);
  const nextIdempotencyKey = randomUUID();
  if (isPaymentSuccessful(currentStatus)) {
    throw Object.assign(new Error("Đơn đặt phòng này đã thanh toán thành công."), { status: 409 });
  }
  if (currentStatus === "refunded" || currentStatus === "partially_refunded") {
    throw Object.assign(new Error("Refunded payments cannot be reprocessed here"), { status: 409 });
  }

  const existingAccessToken = payment.metadata?.mockCheckout?.accessToken;
  const requestedPaymentMethodType = paymentMethodType || "hosted_checkout";
  const existingPaymentMethodType = payment.payment_method_type || "hosted_checkout";
  if (
    currentStatus === "pending" &&
    payment.provider === provider.name &&
    (requestedPaymentMethodType === "hosted_checkout" ||
      existingPaymentMethodType === requestedPaymentMethodType) &&
    payment.provider_session_id &&
    payment.checkout_session_expires_at &&
    payment.checkout_session_expires_at > new Date()
  ) {
    if (payment.provider === "mock" && existingAccessToken) {
      const checkoutUrl = new URL(
        `/payments/hosted/mock/${payment.provider_session_id}`,
        getPaymentRuntimeConfig().paymentPublicBaseUrl,
      );
      checkoutUrl.searchParams.set("access_token", existingAccessToken);

      return {
        payment,
        checkoutSession: {
          provider: payment.provider,
          sessionId: payment.provider_session_id,
          checkoutUrl: checkoutUrl.toString(),
          qrCode: payment.provider_payload_summary?.qrCode || null,
          expiresAt: payment.checkout_session_expires_at,
          paymentMethodType: payment.payment_method_type || "hosted_checkout",
          reused: true,
        },
      };
    }

    if (typeof provider.getReusableCheckoutSession === "function") {
      const reusableCheckoutSession = await provider.getReusableCheckoutSession({
        payment,
        booking,
      });

      if (reusableCheckoutSession?.checkoutUrl) {
        return {
          payment,
          checkoutSession: {
            provider: payment.provider,
            sessionId: payment.provider_session_id,
            checkoutUrl: reusableCheckoutSession.checkoutUrl,
            qrCode: reusableCheckoutSession.qrCode || payment.provider_payload_summary?.qrCode || null,
            expiresAt: reusableCheckoutSession.expiresAt || payment.checkout_session_expires_at,
            returnUrl: reusableCheckoutSession.returnUrl || provider.buildReturnUrlForPayment(payment),
            paymentMethodType: payment.payment_method_type || "hosted_checkout",
            reused: true,
          },
        };
      }
    }
  }

  if (
    payment.provider === provider.name &&
    payment.provider_session_id &&
    typeof provider.expireCheckoutSession === "function" &&
    !isPaymentSuccessful(currentStatus)
  ) {
    await provider.expireCheckoutSession({
      payment,
      booking,
    });
  }

  const checkoutSession = await provider.createCheckoutSession({
    booking,
    payment,
    billingName,
    billingEmail,
    paymentMethodType,
    idempotencyKey: nextIdempotencyKey,
  });

  payment.provider = checkoutSession.provider;
  payment.provider_payment_id = checkoutSession.providerPaymentId || null;
  payment.provider_intent_id = checkoutSession.providerIntentId;
  payment.provider_session_id = checkoutSession.providerSessionId;
  payment.provider_customer_id = checkoutSession.providerCustomerId || null;
  payment.idempotency_key = nextIdempotencyKey;
  payment.amount = booking.total_price;
  payment.currency = booking.price_snapshot?.currency || "VND";
  payment.payment_method_type = checkoutSession.paymentMethodType || paymentMethodType;
  payment.payment_method = payment.payment_method_type;
  payment.billing_name = billingName || payment.billing_name || booking.guest_full_name || null;
  payment.billing_email = billingEmail || payment.billing_email || booking.guest_email || null;
  payment.checkout_session_expires_at = checkoutSession.expiresAt;
  payment.provider_payload_summary = {
    ...(payment.provider_payload_summary || {}),
    ...(checkoutSession.providerPayloadSummary || {}),
  };
  payment.metadata = {
    ...(payment.metadata || {}),
    ...(checkoutSession.internalMetadata || {}),
  };
  if (provider.name === "mock") {
    payment.metadata.mockCheckout = {
      accessToken: checkoutSession.checkoutAccessToken,
      returnUrl: checkoutSession.returnUrl,
    };
  }
  payment.failure_code = null;
  payment.failure_message = null;
  payment.status_reason = null;
  payment.failed_at = null;
  payment.provider_event_id = null;
  payment.card_brand = null;
  payment.card_last4 = null;
  payment.amount_authorized = 0;
  payment.amount_captured = 0;
  payment.amount_refunded = 0;
  if (provider.name !== "mock" && payment.metadata?.mockCheckout) {
    delete payment.metadata.mockCheckout;
  }
  setPaymentStatus(payment, checkoutSession.status || "pending");
  syncLegacyPaymentFields(payment);

  if (booking.status === "payment_failed") {
    booking.status = "pending_payment";
  }
  if (booking.status === "pending_payment") {
    booking.payment_expires_at = checkoutSession.expiresAt;
  }

  await withOptionalTransaction(async (session) => {
    await payment.save(session ? { session } : undefined);
    if (booking.isModified()) {
      await booking.save(session ? { session } : undefined);
    }
  });

  await recordAuditLog({
    action: "payment.checkout_session.created",
    actor,
    entityType: "payment",
    entityId: payment._id.toString(),
    metadata: {
      bookingId: booking._id.toString(),
      bookingReference: booking.booking_reference || null,
      provider: payment.provider,
      providerSessionId: payment.provider_session_id,
      paymentMethodType: payment.payment_method_type,
      amount: payment.amount,
      currency: payment.currency,
      reused: false,
    },
  });

  return {
    payment,
    checkoutSession: {
      provider: payment.provider,
      sessionId: payment.provider_session_id,
      checkoutUrl: checkoutSession.checkoutUrl,
      qrCode: checkoutSession.qrCode || checkoutSession.providerPayloadSummary?.qrCode || null,
      expiresAt: checkoutSession.expiresAt,
      returnUrl: checkoutSession.returnUrl,
      paymentMethodType: payment.payment_method_type,
      reused: false,
    },
  };
}

async function beginWebhookEvent(normalizedEvent, verifiedAt) {
  let eventRecord = await PaymentWebhookEvent.findOne({
    provider: normalizedEvent.provider,
    provider_event_id: normalizedEvent.providerEventId,
  });

  if (eventRecord?.status === "processed") {
    return { duplicate: true, eventRecord };
  }

  if (!eventRecord) {
    try {
      eventRecord = await PaymentWebhookEvent.create({
        provider: normalizedEvent.provider,
        provider_event_id: normalizedEvent.providerEventId,
        event_type: normalizedEvent.eventType,
        status: "processing",
        processing_started_at: verifiedAt,
        signature_verified_at: verifiedAt,
        payload_summary: normalizedEvent.payloadSummary || {},
      });
      return { duplicate: false, inProgress: false, eventRecord };
    } catch (error) {
      if (error?.code === 11000) {
        eventRecord = await PaymentWebhookEvent.findOne({
          provider: normalizedEvent.provider,
          provider_event_id: normalizedEvent.providerEventId,
        });
        if (eventRecord?.status === "processed") {
          return { duplicate: true, eventRecord };
        }
      } else {
        throw error;
      }
    }
  }

  if (eventRecord?.status === "processed") {
    return { duplicate: true, inProgress: false, eventRecord };
  }

  const isFreshProcessingLease =
    eventRecord?.status === "processing" &&
    eventRecord?.processing_started_at &&
    verifiedAt.getTime() - new Date(eventRecord.processing_started_at).getTime() <
      WEBHOOK_PROCESSING_LEASE_MS;
  if (isFreshProcessingLease) {
    return { duplicate: true, inProgress: true, eventRecord };
  }

  const claimedEventRecord = await PaymentWebhookEvent.findOneAndUpdate(
    {
      _id: eventRecord._id,
      status: eventRecord.status,
      processing_started_at: eventRecord.processing_started_at || null,
    },
    {
      $set: {
        event_type: normalizedEvent.eventType,
        status: "processing",
        processing_started_at: verifiedAt,
        signature_verified_at: verifiedAt,
        last_error: null,
        payload_summary: normalizedEvent.payloadSummary || eventRecord.payload_summary || {},
      },
    },
    { new: true },
  );

  if (!claimedEventRecord) {
    const latestEventRecord = await PaymentWebhookEvent.findById(eventRecord._id);
    if (latestEventRecord?.status === "processed") {
      return { duplicate: true, inProgress: false, eventRecord: latestEventRecord };
    }

    return { duplicate: true, inProgress: true, eventRecord: latestEventRecord || eventRecord };
  }

  return { duplicate: false, inProgress: false, eventRecord: claimedEventRecord };
}

export async function findPaymentReferenceForProviderEvent(normalizedEvent) {
  if (normalizedEvent.bellaPaymentId && isObjectId(normalizedEvent.bellaPaymentId)) {
    const paymentByMetadataId = await Payment.findById(normalizedEvent.bellaPaymentId);
    if (paymentByMetadataId) {
      return paymentByMetadataId;
    }
  }

  if (normalizedEvent.providerSessionId) {
    const paymentBySession = await Payment.findOne({
      provider: normalizedEvent.provider,
      provider_session_id: normalizedEvent.providerSessionId,
    });
    if (paymentBySession) {
      return paymentBySession;
    }
  }

  if (normalizedEvent.providerIntentId) {
    const paymentByIntent = await Payment.findOne({
      provider: normalizedEvent.provider,
      provider_intent_id: normalizedEvent.providerIntentId,
    });
    if (paymentByIntent) {
      return paymentByIntent;
    }
  }

  if (normalizedEvent.providerPaymentId) {
    const paymentByProviderId = await Payment.findOne({
      provider: normalizedEvent.provider,
      provider_payment_id: normalizedEvent.providerPaymentId,
    });
    if (paymentByProviderId) {
      return paymentByProviderId;
    }
  }

  if (normalizedEvent.bookingId && isObjectId(normalizedEvent.bookingId)) {
    const paymentByBooking = await Payment.findOne({
      booking_id: normalizedEvent.bookingId,
      provider: normalizedEvent.provider,
    });
    if (paymentByBooking) {
      return paymentByBooking;
    }
  }

  return null;
}

async function findPaymentForProviderEvent(normalizedEvent) {
  const payment = await findPaymentReferenceForProviderEvent(normalizedEvent);
  if (payment) {
    return payment;
  }

  throw new Error("Payment not found for verified provider event");
}

export async function processVerifiedProviderEvent({
  normalizedEvent,
  verifiedAt = new Date(),
}) {
  const startState = await beginWebhookEvent(normalizedEvent, verifiedAt);
  if (startState.duplicate) {
    return { duplicate: true, inProgress: startState.inProgress || false };
  }

  const { eventRecord } = startState;
  let paymentLock = null;

  try {
    const paymentReference = await findPaymentForProviderEvent(normalizedEvent);
    paymentLock = await acquirePaymentLockWithRetry(paymentReference.booking_id.toString());
    if (!paymentLock) {
      throw Object.assign(new Error("Payment update is already being processed"), {
        status: 409,
      });
    }

    const payment = await Payment.findById(paymentReference._id);
    if (!payment) {
      throw new Error("Payment not found for verified provider event");
    }
    const booking = await loadBellaBookingById(payment.booking_id.toString());
    if (!booking) {
      throw new Error("Booking not found for verified provider event");
    }

    const previousPaymentStatus = getPaymentStatus(payment);
    const previousBookingStatus = booking.status;
    const now = verifiedAt;

    applyPaymentMetadata(payment, normalizedEvent);
    payment.webhook_verified_at = now;

    const normalizedStatus = normalizedEvent.status;
    if (normalizedEvent.providerEventId) {
      payment.processed_provider_event_ids = dedupeStrings([
        ...(payment.processed_provider_event_ids || []),
        normalizedEvent.providerEventId,
      ]);
    }

    if (
      normalizedStatus === "succeeded" ||
      normalizedStatus === "completed" ||
      normalizedStatus === "authorized"
    ) {
      if (getPaymentStatus(payment) !== "refunded" && getPaymentStatus(payment) !== "partially_refunded") {
        const amountValidation = validateProviderAmountMatchesBooking({
          payment,
          booking,
          normalizedEvent,
        });

        const roomValidation = validateRoomCanBeConfirmed(booking);

        if ((!amountValidation.ok || !roomValidation.ok) && !isPaymentSuccessful(previousPaymentStatus)) {
          setPaymentStatus(payment, "failed");
          payment.failure_code = !amountValidation.ok ? "amount_mismatch" : "room_unavailable";
          payment.failure_message = !amountValidation.ok
            ? "Verified provider event amount did not match the booking total."
            : "Room was no longer available when the verified provider event arrived.";
          payment.status_reason = payment.failure_message;
          payment.failed_at = now;
          payment.risk_flags = dedupeStrings([
            ...(payment.risk_flags || []),
            !amountValidation.ok ? amountValidation.reason : roomValidation.reason,
          ]);
          if (booking.status === "pending_payment") {
            booking.status = "payment_failed";
          }
        } else {
          setPaymentStatus(payment, normalizedStatus === "authorized" ? "authorized" : "succeeded");
          payment.amount_authorized = normalizedEvent.amount || payment.amount_authorized || payment.amount;
          payment.amount_captured =
            normalizedStatus === "authorized"
              ? payment.amount_captured || 0
              : normalizedEvent.amount || payment.amount_captured || payment.amount;
          payment.authorized_at = payment.authorized_at || now;
          if (normalizedStatus !== "authorized") {
            payment.captured_at = payment.captured_at || now;
          }
          payment.failure_code = null;
          payment.failure_message = null;
          payment.status_reason = null;
          payment.failed_at = null;

          if (booking.status === "pending_payment" || booking.status === "payment_failed") {
            booking.status = "confirmed";
            booking.payment_expires_at = null;
            booking.expired_at = null;
            payment.status_reason = "succeeded_by_webhook";
            touchBookingStatusTimestamps(booking, "confirmed", now);
          } else if (!["confirmed", "completed"].includes(booking.status)) {
            payment.risk_flags = dedupeStrings([
              ...(payment.risk_flags || []),
              `booking_${booking.status}_before_payment_confirmation`,
              `late_success_after_${booking.status}`,
            ]);
            payment.status_reason = `late_success_after_${booking.status}`;
            console.error("Payment succeeded after booking reached a terminal state", {
              paymentId: payment._id.toString(),
              bookingId: booking._id.toString(),
              bookingReference: booking.booking_reference || null,
              previousPaymentStatus,
              previousBookingStatus,
              provider: payment.provider,
              providerEventId: normalizedEvent.providerEventId,
            });
          }
        }
      }
    } else if (normalizedStatus === "failed") {
      if (isPaymentOpen(previousPaymentStatus)) {
        setPaymentStatus(payment, "failed");
        payment.failure_code = normalizedEvent.failureCode || payment.failure_code || "payment_failed";
        payment.failure_message =
          normalizedEvent.failureMessage || payment.failure_message || "Payment failed";
        payment.status_reason = payment.failure_message;
        payment.failed_at = now;
        if (booking.status === "pending_payment") {
          booking.status = "payment_failed";
        }
      }
    } else if (normalizedStatus === "expired") {
      if (isPaymentOpen(previousPaymentStatus)) {
        setPaymentStatus(payment, "expired");
        payment.status_reason = "checkout_session_expired";
        payment.failure_code = null;
        payment.failure_message = null;
        payment.failed_at = null;
        if (booking.status === "pending_payment") {
          booking.status = "expired";
          touchBookingStatusTimestamps(booking, "expired", now);
        }
      }
    } else if (normalizedStatus === "cancelled") {
      if (isPaymentOpen(previousPaymentStatus)) {
        setPaymentStatus(payment, "cancelled");
        payment.status_reason = "payment_cancelled";
        payment.failure_code = null;
        payment.failure_message = null;
        payment.failed_at = null;
        if (booking.status === "pending_payment") {
          booking.status = "cancelled";
          touchBookingStatusTimestamps(booking, "cancelled", now);
        }
      }
    } else if (normalizedStatus === "refunded") {
      if (previousPaymentStatus === "succeeded" || previousPaymentStatus === "authorized") {
        payment.amount_refunded = normalizedEvent.amount || payment.amount_captured || payment.amount;
        setPaymentStatus(
          payment,
          payment.amount_refunded < (payment.amount_captured || payment.amount)
            ? "partially_refunded"
            : "refunded",
        );
        payment.refunded_at = now;
        payment.status_reason = "refund_processed";
        if (booking.status === "pending_payment" || booking.status === "confirmed") {
          booking.status = "cancelled";
          touchBookingStatusTimestamps(booking, "cancelled", now);
        }
      }
    }

    syncLegacyPaymentFields(payment);
    appendPaymentStatusHistory(payment, {
      at: now,
      previousStatus: previousPaymentStatus,
      nextStatus: getPaymentStatus(payment),
      previousBookingStatus,
      nextBookingStatus: booking.status,
      providerEventId: normalizedEvent.providerEventId,
      reason: payment.status_reason || normalizedEvent.failureCode || normalizedStatus,
      source: "provider_webhook",
    });
    eventRecord.payment_id = payment._id;
    eventRecord.booking_id = booking._id;
    eventRecord.status = "processed";
    eventRecord.processing_started_at = null;
    eventRecord.processed_at = now;
    eventRecord.last_error = null;

    await persistPaymentArtifacts({
      payment,
      booking,
      eventRecord,
      outboxEvents: buildOutboxEventsForTransition({
        payment,
        booking,
        previousPaymentStatus,
        previousBookingStatus,
      }),
    });

    await recordAuditLog({
      action: `payment.webhook.${getPaymentStatus(payment)}`,
      actor: null,
      entityType: "payment",
      entityId: payment._id.toString(),
      metadata: {
        bookingId: booking._id.toString(),
        bookingReference: booking.booking_reference || null,
        provider: payment.provider,
        providerEventId: normalizedEvent.providerEventId,
        eventType: normalizedEvent.eventType,
        paymentStatus: getPaymentStatus(payment),
      },
    });

    return {
      duplicate: false,
      payment,
      booking,
    };
  } catch (error) {
    eventRecord.status = "failed";
    eventRecord.processing_started_at = null;
    eventRecord.last_error = error?.message || "Unknown provider event processing error";
    await eventRecord.save();
    throw error;
  } finally {
    await releasePaymentLock(paymentLock);
  }
}

export async function reconcilePayment({ payment, booking, actor }) {
  const provider = getPaymentProvider(payment.provider);
  if (typeof provider.getProviderPaymentStatus !== "function") {
    await recordAuditLog({
      action: "payment.reconciliation_skipped",
      actor,
      entityType: "payment",
      entityId: payment._id.toString(),
      metadata: {
        bookingId: booking._id.toString(),
        provider: payment.provider,
        reason: "provider_status_query_not_supported",
      },
    });

    return {
      reconciled: false,
      reason: "provider_status_query_not_supported",
      payment,
      booking,
    };
  }

  let normalizedEvent;
  try {
    normalizedEvent = await provider.getProviderPaymentStatus({
      payment,
      booking,
    });
  } catch (error) {
    await recordAuditLog({
      action: "payment.reconciliation_failed",
      actor,
      entityType: "payment",
      entityId: payment._id.toString(),
      metadata: {
        bookingId: booking._id.toString(),
        provider: payment.provider,
        providerSessionId: payment.provider_session_id || null,
        providerIntentId: payment.provider_intent_id || null,
        reason: error?.message || "provider_status_query_failed",
      },
    });
    throw error;
  }

  if (!normalizedEvent || normalizedEvent.status === "processing") {
    await recordAuditLog({
      action: "payment.reconciliation_no_change",
      actor,
      entityType: "payment",
      entityId: payment._id.toString(),
      metadata: {
        bookingId: booking._id.toString(),
        provider: payment.provider,
        providerSessionId: payment.provider_session_id || null,
        providerIntentId: payment.provider_intent_id || null,
        providerStatus: normalizedEvent?.status || null,
      },
    });

    return {
      reconciled: false,
      reason: "provider_status_not_terminal",
      payment,
      booking,
    };
  }

  const result = await processVerifiedProviderEvent({
    normalizedEvent: {
      ...normalizedEvent,
      providerEventId: normalizedEvent.providerEventId || `reconcile:${payment._id.toString()}:${normalizedEvent.status}`,
    },
    verifiedAt: new Date(),
  });

  await recordAuditLog({
    action: "payment.reconciliation_run",
    actor,
    entityType: "payment",
    entityId: payment._id.toString(),
    metadata: {
      bookingId: booking._id.toString(),
      provider: payment.provider,
      providerSessionId: payment.provider_session_id || null,
      providerIntentId: payment.provider_intent_id || null,
      providerStatus: normalizedEvent.status,
      duplicate: result.duplicate || false,
    },
  });

  return {
    reconciled: true,
    ...result,
  };
}

export async function refundPayment({ payment, booking, actor }) {
  const provider = getPaymentProvider(payment.provider);
  const refundAmount = payment.amount_captured || payment.amount_authorized || payment.amount;
  let result = { payment, booking };

  if (typeof provider.refundPayment === "function") {
    const providerResult = await provider.refundPayment({
      payment,
      booking,
      actor,
      amount: refundAmount,
      idempotencyKey: `refund:${payment._id.toString()}:${refundAmount}`,
    });

    if (providerResult?.normalizedEvent) {
      result = await processVerifiedProviderEvent({
        normalizedEvent: providerResult.normalizedEvent,
        verifiedAt: new Date(),
      });
    }
  } else {
    const refundEvent = provider.createRefundEvent({
      payment,
      booking,
      amount: refundAmount,
    });

    const normalizedEvent = await provider.normalizeWebhookEvent(refundEvent);
    result = await processVerifiedProviderEvent({
      normalizedEvent,
      verifiedAt: new Date(),
    });
  }

  await recordAuditLog({
    action: "payment.refund.requested",
    actor,
    entityType: "payment",
    entityId: payment._id.toString(),
    metadata: {
      bookingId: booking._id.toString(),
      bookingReference: booking.booking_reference || null,
      provider: payment.provider,
      providerSessionId: payment.provider_session_id,
    },
  });

  return result;
}
