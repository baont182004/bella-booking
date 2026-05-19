import mongoose from "mongoose";

function getMongoUri() {
  return process.env.MONGODB_URI || process.env.MONGO_URI || "mongodb://127.0.0.1:27017/bella_hotel";
}

export const BOOKING_STATUSES = [
  "pending_payment",
  "confirmed",
  "payment_failed",
  "cancelled",
  "completed",
  "expired",
];

export const PAYMENT_STATUSES = [
  "pending",
  "processing",
  "authorized",
  "succeeded",
  "failed",
  "cancelled",
  "refunded",
  "partially_refunded",
  "expired",
];

const userSchema = new mongoose.Schema(
  {
    email: { type: String, required: true },
    firstName: { type: String, required: true },
    lastName: { type: String, required: true },
    phone: { type: String },
    role: { type: String, enum: ["customer", "admin"], default: "customer" },
    sessionVersion: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true, collection: "users" },
);

const hotelSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    address: { type: String },
    city: { type: String, required: true },
    country: { type: String, required: true },
  },
  { timestamps: true, collection: "hotels" },
);

const roomSchema = new mongoose.Schema(
  {
    hotel_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Hotel",
      required: true,
    },
    room_number: { type: String, required: true },
    room_type: { type: String, required: true },
    price_per_night: { type: Number, required: true },
    capacity: { type: Number, required: true },
    is_available: { type: Boolean, default: true },
  },
  { timestamps: true, collection: "rooms" },
);

const bookingSchema = new mongoose.Schema(
  {
    booking_reference: { type: String },
    user_id: { type: String, required: true },
    room_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Room",
      required: true,
    },
    total_price: { type: Number, required: true, min: 0 },
    guest_email: { type: String },
    guest_full_name: { type: String },
    combo_snapshot: { type: mongoose.Schema.Types.Mixed, default: null },
    price_snapshot: { type: mongoose.Schema.Types.Mixed, default: null },
    payment_expires_at: { type: Date, default: null },
    confirmed_at: { type: Date, default: null },
    cancelled_at: { type: Date, default: null },
    completed_at: { type: Date, default: null },
    expired_at: { type: Date, default: null },
    status: {
      type: String,
      enum: BOOKING_STATUSES,
      default: "pending_payment",
    },
  },
  { timestamps: true, collection: "bookings" },
);

const paymentSchema = new mongoose.Schema(
  {
    booking_id: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      unique: true,
    },
    provider: { type: String, required: true, default: "mock" },
    provider_payment_id: { type: String, default: null },
    provider_intent_id: { type: String, default: null },
    provider_session_id: { type: String, default: null },
    provider_event_id: { type: String, default: null },
    processed_provider_event_ids: { type: [String], default: [] },
    provider_customer_id: { type: String, default: null },
    amount: { type: Number, required: true, min: 0 },
    currency: { type: String, required: true, default: "VND" },
    amount_authorized: { type: Number, default: 0, min: 0 },
    amount_captured: { type: Number, default: 0, min: 0 },
    amount_refunded: { type: Number, default: 0, min: 0 },
    payment_method: { type: String, default: "hosted_checkout" },
    payment_method_type: { type: String, default: "hosted_checkout" },
    card_brand: { type: String, default: null },
    card_last4: { type: String, default: null },
    billing_name: { type: String, default: null },
    billing_email: { type: String, default: null },
    idempotency_key: { type: String, default: null },
    checkout_session_expires_at: { type: Date, default: null },
    payment_status: {
      type: String,
      enum: PAYMENT_STATUSES,
      default: "pending",
    },
    status: {
      type: String,
      enum: PAYMENT_STATUSES,
      default: "pending",
    },
    status_reason: { type: String, default: null },
    failure_code: { type: String, default: null },
    failure_message: { type: String, default: null },
    authorized_at: { type: Date, default: null },
    captured_at: { type: Date, default: null },
    failed_at: { type: Date, default: null },
    refunded_at: { type: Date, default: null },
    webhook_verified_at: { type: Date, default: null },
    payment_date: { type: Date, default: null },
    failure_reason: { type: String, default: null },
    transaction_id: { type: String, default: null },
    refund_transaction_id: { type: String, default: null },
    refund_date: { type: Date, default: null },
    risk_flags: { type: [String], default: [] },
    provider_payload_summary: { type: mongoose.Schema.Types.Mixed, default: {} },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
    status_history: { type: [mongoose.Schema.Types.Mixed], default: [] },
  },
  { timestamps: true, collection: "payments" },
);

paymentSchema.index(
  { provider: 1, provider_session_id: 1 },
  {
    unique: true,
    partialFilterExpression: { provider_session_id: { $type: "string" } },
  },
);
paymentSchema.index(
  { provider: 1, provider_payment_id: 1 },
  {
    unique: true,
    partialFilterExpression: { provider_payment_id: { $type: "string" } },
  },
);
paymentSchema.index(
  { provider: 1, provider_intent_id: 1 },
  {
    unique: true,
    partialFilterExpression: { provider_intent_id: { $type: "string" } },
  },
);
paymentSchema.index(
  { provider: 1, idempotency_key: 1 },
  {
    unique: true,
    partialFilterExpression: { idempotency_key: { $type: "string" } },
  },
);
paymentSchema.index({ status: 1, updatedAt: -1 });
paymentSchema.index({ processed_provider_event_ids: 1 });

const paymentWebhookEventSchema = new mongoose.Schema(
  {
    provider: { type: String, required: true, trim: true },
    provider_event_id: { type: String, required: true, trim: true },
    event_type: { type: String, required: true, trim: true },
    payment_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Payment",
      default: null,
    },
    booking_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Booking",
      default: null,
    },
    status: {
      type: String,
      enum: ["processing", "processed", "failed"],
      default: "processing",
    },
    processing_started_at: { type: Date, default: null },
    signature_verified_at: { type: Date, default: null },
    processed_at: { type: Date, default: null },
    payload_summary: { type: mongoose.Schema.Types.Mixed, default: {} },
    last_error: { type: String, default: null },
  },
  { timestamps: true, collection: "payment_webhook_events" },
);

paymentWebhookEventSchema.index(
  { provider: 1, provider_event_id: 1 },
  { unique: true },
);

const outboxEventSchema = new mongoose.Schema(
  {
    service: { type: String, required: true, trim: true },
    topic: { type: String, required: true, trim: true },
    event_key: { type: String, required: true, trim: true },
    aggregate_type: { type: String, required: true, trim: true },
    aggregate_id: { type: String, required: true, trim: true },
    payload: { type: mongoose.Schema.Types.Mixed, required: true },
    status: {
      type: String,
      enum: ["pending", "published", "failed"],
      default: "pending",
    },
    attempts: { type: Number, default: 0, min: 0 },
    next_attempt_at: { type: Date, default: Date.now },
    published_at: { type: Date, default: null },
    last_error: { type: String, default: null },
    locked_at: { type: Date, default: null },
  },
  { timestamps: true, collection: "payment_outbox_events" },
);

outboxEventSchema.index({ status: 1, next_attempt_at: 1, createdAt: 1 });
outboxEventSchema.index({ service: 1, topic: 1, event_key: 1 }, { unique: true });

const auditLogSchema = new mongoose.Schema(
  {
    service: { type: String, required: true, trim: true },
    action: { type: String, required: true, trim: true },
    actor_user_id: { type: String, default: null },
    actor_role: { type: String, default: null },
    entity_type: { type: String, required: true, trim: true },
    entity_id: { type: String, required: true, trim: true },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true, collection: "audit_logs" },
);

export const Hotel = mongoose.model("Hotel", hotelSchema);
export const Room = mongoose.model("Room", roomSchema);
export const Booking = mongoose.model("Booking", bookingSchema);
export const Payment = mongoose.model("Payment", paymentSchema);
export const PaymentWebhookEvent = mongoose.model(
  "PaymentWebhookEvent",
  paymentWebhookEventSchema,
);
export const PaymentOutboxEvent = mongoose.model(
  "PaymentOutboxEvent",
  outboxEventSchema,
);
export const AuditLog = mongoose.model("AuditLog", auditLogSchema);
export const User = mongoose.models.User || mongoose.model("User", userSchema);

export async function connectDatabase() {
  try {
    await mongoose.connect(getMongoUri());
    console.log("Connected to MongoDB via Mongoose");
  } catch (error) {
    console.error("Database connection error:", error);
    throw error;
  }
}

export async function testConnection() {
  if (mongoose.connection.readyState !== 1) {
    throw new Error("MongoDB connection not ready");
  }
  await mongoose.connection.db.admin().ping();
}
