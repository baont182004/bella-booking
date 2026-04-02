import mongoose from "mongoose";

const mongoUri =
  process.env.MONGODB_URI ||
  "mongodb+srv://<user>:<password>@cluster0.mongodb.net/hotel_db?retryWrites=true&w=majority";

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

const bookingSchema = new mongoose.Schema(
  {
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
      enum: ["pending", "confirmed", "cancelled", "completed"],
      default: "pending",
    },
    guest_full_name: { type: String, required: true },
    guest_email: { type: String, required: true },
    guest_phone: { type: String },
    special_requests: { type: String },
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
    amount: { type: Number, required: true, min: 0 },
    payment_method: {
      type: String,
      enum: ["pending", "credit_card", "debit_card"],
      required: true,
    },
    payment_status: {
      type: String,
      enum: ["pending", "completed", "refunded"],
      default: "pending",
    },
    transaction_id: { type: String, unique: true, sparse: true },
    payment_date: { type: Date },
  },
  { timestamps: true, collection: "payments" },
);

export const Hotel = mongoose.model("Hotel", hotelSchema);
export const Room = mongoose.model("Room", roomSchema);
export const Booking = mongoose.model("Booking", bookingSchema);
export const Payment = mongoose.model("Payment", paymentSchema);

export async function connectDatabase() {
  try {
    await mongoose.connect(mongoUri);
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
