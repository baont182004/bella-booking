import mongoose from "mongoose";

const mongoUri =
  process.env.MONGODB_URI ||
  "mongodb+srv://<user>:<password>@cluster0.mongodb.net/hotel_db?retryWrites=true&w=majority";

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
    user_id: { type: String, required: true },
    room_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Room",
      required: true,
    },
    total_price: { type: Number, required: true, min: 0 },
    status: {
      type: String,
      enum: ["pending", "confirmed", "cancelled", "completed"],
      default: "pending",
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
