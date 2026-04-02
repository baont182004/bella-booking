import mongoose from "mongoose";

const mongoUri =
  process.env.MONGODB_URI ||
  "mongodb+srv://<user>:<password>@cluster0.mongodb.net/hotel_db?retryWrites=true&w=majority";

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

export const Hotel = mongoose.model("Hotel", hotelSchema);
export const Room = mongoose.model("Room", roomSchema);

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
