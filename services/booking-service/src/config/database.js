import mongoose from "mongoose";

function getMongoUri() {
  return process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/bella_hotel";
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
    description: { type: String },
    address: { type: String },
    city: { type: String, required: true },
    country: { type: String, required: true },
    rating: { type: Number, default: 0 },
    amenities: { type: [String], default: [] },
    images: { type: [String], default: [] },
  },
  { timestamps: true, collection: "hotels" },
);

const bedConfigSchema = new mongoose.Schema(
  {
    type: { type: String, required: true },
    quantity: { type: Number, required: true },
    label: { type: String, required: true },
  },
  { _id: false },
);

const roomSchema = new mongoose.Schema(
  {
    hotel_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Hotel",
      required: true,
    },
    code: { type: String },
    room_number: { type: String, required: true },
    room_type: { type: String, required: true },
    description: { type: String },
    localized_name: {
      vi: { type: String },
      en: { type: String, default: null },
    },
    category: {
      type: String,
      enum: ["room", "studio", "apartment"],
      default: "room",
    },
    summary: { type: String },
    area_sqm: { type: Number, default: null },
    bedroom_count: { type: Number, default: 1 },
    bathroom_count: { type: Number, default: 1 },
    max_adults: { type: Number, default: null },
    max_children: { type: Number, default: null },
    max_occupancy: { type: Number, default: null },
    bed_configs: { type: [bedConfigSchema], default: [] },
    spaces: { type: [String], default: [] },
    views: { type: [String], default: [] },
    bathroom_features: { type: [String], default: [] },
    price_per_night: { type: Number, required: true },
    capacity: { type: Number, required: true },
    amenities: { type: [String], default: [] },
    accessibility: {
      access_modes: { type: [String], default: [] },
      access_note: { type: String, default: null },
    },
    policies: {
      smoking: {
        type: String,
        enum: ["non_smoking", "smoking_allowed", "unknown"],
        default: "unknown",
      },
    },
    raw_source_name: { type: String },
    source: {
      type: {
        type: String,
        default: null,
      },
      file: { type: String, default: null },
    },
    data_warnings: { type: [String], default: [] },
    is_active: { type: Boolean, default: true },
    images: { type: [String], default: [] },
    is_available: { type: Boolean, default: true },
  },
  { timestamps: true, collection: "rooms" },
);

const priceSnapshotSchema = new mongoose.Schema(
  {
    nights: { type: Number, required: true, min: 1 },
    nightly_rate: { type: Number, required: true, min: 0 },
    room_subtotal: { type: Number, default: 0, min: 0 },
    combo_subtotal: { type: Number, default: 0, min: 0 },
    subtotal: { type: Number, required: true, min: 0 },
    discount_amount: { type: Number, default: 0, min: 0 },
    service_fee: { type: Number, default: 0, min: 0 },
    total: { type: Number, required: true, min: 0 },
    currency: { type: String, default: "VND" },
    breakdown: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { _id: false },
);

const promotionSnapshotSchema = new mongoose.Schema(
  {
    promotion_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Promotion",
      default: null,
    },
    code: { type: String, default: null },
    name: { type: String, default: null },
    type: { type: String, enum: ["percentage", "fixed"], default: null },
    value: { type: Number, default: null },
    discount_amount: { type: Number, default: 0, min: 0 },
  },
  { _id: false },
);

const comboSnapshotSchema = new mongoose.Schema(
  {
    combo_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Combo",
      default: null,
    },
    slug: { type: String, default: null },
    name: { type: String, default: null },
    price: { type: Number, default: 0, min: 0 },
    price_type: {
      type: String,
      enum: ["fixed", "per_person", "from_price", null],
      default: null,
    },
    included_services: { type: [String], default: [] },
    duration_label: { type: String, default: null },
    suitable_for: { type: String, default: null },
  },
  { _id: false },
);

const bookingSchema = new mongoose.Schema(
  {
    booking_reference: { type: String, unique: true, sparse: true },
    user_id: { type: String, required: true },
    room_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Room",
      required: true,
    },
    check_in_date: { type: Date, required: true },
    check_out_date: { type: Date, required: true },
    total_price: { type: Number, required: true, min: 0 },
    num_guests: { type: Number, required: true, min: 1 },
    status: {
      type: String,
      enum: BOOKING_STATUSES,
      default: "pending_payment",
    },
    guest_full_name: { type: String, required: true },
    guest_email: { type: String, required: true },
    guest_phone: { type: String },
    special_requests: { type: String },
    combo_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Combo",
      default: null,
    },
    combo_snapshot: { type: comboSnapshotSchema, default: null },
    promotion_code: { type: String, default: null },
    promotion_snapshot: { type: promotionSnapshotSchema, default: null },
    price_snapshot: { type: priceSnapshotSchema, default: null },
    payment_expires_at: { type: Date, default: null },
    confirmed_at: { type: Date, default: null },
    cancelled_at: { type: Date, default: null },
    completed_at: { type: Date, default: null },
    expired_at: { type: Date, default: null },
  },
  { timestamps: true, collection: "bookings" },
);

bookingSchema.index({ room_id: 1, check_in_date: 1, check_out_date: 1, status: 1 });
bookingSchema.index({ user_id: 1, status: 1, createdAt: -1 });

const comboSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, lowercase: true, trim: true },
    description: { type: String, default: "" },
    room_types_allowed: { type: [String], default: [] },
    duration_label: { type: String, required: true },
    nights: { type: Number, required: true, min: 1 },
    allowed_nights: { type: [Number], default: [] },
    days: { type: Number, required: true, min: 1 },
    min_guests: { type: Number, default: 1, min: 1 },
    max_guests: { type: Number, default: null, min: 1 },
    base_price: { type: Number, required: true, min: 0 },
    price_type: {
      type: String,
      enum: ["fixed", "per_person", "from_price"],
      default: "fixed",
    },
    currency: { type: String, default: "VND" },
    included_services: { type: [String], default: [] },
    suitable_for: { type: String, default: "" },
    badge_label: { type: String, default: "" },
    image_url: { type: String, default: "" },
    icon_key: { type: String, default: "" },
    is_active: { type: Boolean, default: true },
    valid_from: { type: Date, default: null },
    valid_to: { type: Date, default: null },
    terms_and_conditions: { type: [String], default: [] },
    display_order: { type: Number, default: 100 },
  },
  { timestamps: true, collection: "combos" },
);

comboSchema.index({ slug: 1 }, { unique: true });
comboSchema.index({ is_active: 1, display_order: 1, base_price: 1 });
comboSchema.index({ room_types_allowed: 1 });

const promotionSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true, uppercase: true, trim: true },
    name: { type: String, required: true, trim: true },
    description: { type: String, default: null },
    type: { type: String, enum: ["percentage", "fixed"], required: true },
    value: { type: Number, required: true, min: 0 },
    max_discount: { type: Number, default: null, min: 0 },
    min_nights: { type: Number, default: 1, min: 1 },
    min_spend: { type: Number, default: 0, min: 0 },
    active_from: { type: Date, default: null },
    active_to: { type: Date, default: null },
    usage_limit: { type: Number, default: null, min: 1 },
    usage_count: { type: Number, default: 0, min: 0 },
    eligible_room_codes: { type: [String], default: [] },
    is_active: { type: Boolean, default: true },
  },
  { timestamps: true, collection: "promotions" },
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
  { timestamps: true, collection: "booking_outbox_events" },
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

auditLogSchema.index({ createdAt: -1 });

export const Hotel = mongoose.model("Hotel", hotelSchema);
export const Room = mongoose.model("Room", roomSchema);
export const Booking = mongoose.model("Booking", bookingSchema);
export const Combo = mongoose.model("Combo", comboSchema);
export const Promotion = mongoose.model("Promotion", promotionSchema);
export const Payment = mongoose.model("Payment", paymentSchema);
export const BookingOutboxEvent = mongoose.model("BookingOutboxEvent", outboxEventSchema);
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
