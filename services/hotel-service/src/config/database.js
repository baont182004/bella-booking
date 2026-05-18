import mongoose from "mongoose";

function getMongoUri() {
  return process.env.MONGODB_URI || process.env.MONGO_URI || "mongodb://127.0.0.1:27017/bella_hotel";
}

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
    address: { type: String, required: true },
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

roomSchema.index({ hotel_id: 1, room_number: 1 }, { unique: true });
roomSchema.index(
  { hotel_id: 1, code: 1 },
  {
    unique: true,
    partialFilterExpression: { code: { $type: "string" } },
  },
);

const bookingSchema = new mongoose.Schema(
  {
    room_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Room",
      required: true,
    },
    status: {
      type: String,
      enum: ["pending_payment", "confirmed", "payment_failed", "cancelled", "completed", "expired"],
      default: "pending_payment",
    },
  },
  { timestamps: true, collection: "bookings" },
);

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

export const Hotel = mongoose.model("Hotel", hotelSchema);
export const Room = mongoose.model("Room", roomSchema);
export const Booking = mongoose.model("Booking", bookingSchema);
export const Combo = mongoose.models.Combo || mongoose.model("Combo", comboSchema);
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
