import mongoose from "mongoose";

function getMongoUri() {
  return process.env.MONGODB_URI || process.env.MONGO_URI || "mongodb://127.0.0.1:27017/bella_hotel";
}

const userSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true, trim: true },
    password: { type: String, required: true },
    firstName: { type: String, required: true },
    lastName: { type: String, required: true },
    phone: { type: String },
    role: { type: String, enum: ["customer", "admin"], default: "customer" },
    sessionVersion: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true, collection: "users" },
);

export const User = mongoose.model("User", userSchema);

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
