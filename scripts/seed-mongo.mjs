import mongoose from "mongoose";
import bcrypt from "bcryptjs";

const mongoUri =
  process.env.MONGODB_URI ||
  "mongodb+srv://<user>:<password>@cluster0.mongodb.net/hotel_db?retryWrites=true&w=majority";

const userSchema = new mongoose.Schema(
  {
    email: String,
    password: String,
    firstName: String,
    lastName: String,
    phone: String,
    role: String,
  },
  { timestamps: true, collection: "users" },
);

const hotelSchema = new mongoose.Schema(
  {
    name: String,
    description: String,
    address: String,
    city: String,
    country: String,
    rating: Number,
    amenities: [String],
    images: [String],
  },
  { timestamps: true, collection: "hotels" },
);

const roomSchema = new mongoose.Schema(
  {
    hotel_id: mongoose.Schema.Types.ObjectId,
    room_number: String,
    room_type: String,
    description: String,
    price_per_night: Number,
    capacity: Number,
    amenities: [String],
    images: [String],
    is_available: Boolean,
  },
  { timestamps: true, collection: "rooms" },
);

const bookingSchema = new mongoose.Schema(
  {
    user_id: String,
    room_id: mongoose.Schema.Types.ObjectId,
    check_in_date: Date,
    check_out_date: Date,
    total_price: Number,
    num_guests: Number,
    status: String,
    special_requests: String,
  },
  { timestamps: true, collection: "bookings" },
);

const paymentSchema = new mongoose.Schema(
  {
    booking_id: mongoose.Schema.Types.ObjectId,
    amount: Number,
    payment_method: String,
    payment_status: String,
    transaction_id: String,
    payment_date: Date,
  },
  { timestamps: true, collection: "payments" },
);

const User = mongoose.model("User", userSchema);
const Hotel = mongoose.model("Hotel", hotelSchema);
const Room = mongoose.model("Room", roomSchema);
const Booking = mongoose.model("Booking", bookingSchema);
const Payment = mongoose.model("Payment", paymentSchema);

const run = async () => {
  await mongoose.connect(mongoUri);

  await Promise.all([
    User.deleteMany({}),
    Hotel.deleteMany({}),
    Room.deleteMany({}),
    Booking.deleteMany({}),
    Payment.deleteMany({}),
  ]);

  const passwordHash = await bcrypt.hash("Password123!", 10);

  const users = await User.insertMany([
    {
      email: "lana.nguyen@example.com",
      password: passwordHash,
      firstName: "Lana",
      lastName: "Nguyen",
      phone: "+84 901 234 567",
      role: "customer",
    },
    {
      email: "minh.tran@example.com",
      password: passwordHash,
      firstName: "Minh",
      lastName: "Tran",
      phone: "+84 903 567 890",
      role: "customer",
    },
    {
      email: "admin.luxe@example.com",
      password: passwordHash,
      firstName: "Luxe",
      lastName: "Admin",
      phone: "+84 909 111 222",
      role: "admin",
    },
    {
      email: "huy.pham@example.com",
      password: passwordHash,
      firstName: "Huy",
      lastName: "Pham",
      phone: "+84 912 333 444",
      role: "customer",
    },
    {
      email: "mai.le@example.com",
      password: passwordHash,
      firstName: "Mai",
      lastName: "Le",
      phone: "+84 915 888 999",
      role: "customer",
    },
    {
      email: "khoa.vu@example.com",
      password: passwordHash,
      firstName: "Khoa",
      lastName: "Vu",
      phone: "+84 917 555 666",
      role: "customer",
    },
  ]);

  const hotels = await Hotel.insertMany([
    {
      name: "Luxe Riverfront",
      description: "Boutique hotel overlooking the river with sky lounge.",
      address: "12 Nguyen Hue",
      city: "Ho Chi Minh",
      country: "Vietnam",
      rating: 4.8,
      amenities: ["WiFi", "Infinity Pool", "Sky Bar", "Gym"],
      images: ["https://example.com/h1.jpg"],
    },
    {
      name: "Coastal Bloom Resort",
      description: "Beachfront resort with spa and private cabanas.",
      address: "88 Tran Phu",
      city: "Nha Trang",
      country: "Vietnam",
      rating: 4.6,
      amenities: ["Spa", "Private Beach", "Breakfast"],
      images: ["https://example.com/h2.jpg"],
    },
    {
      name: "Old Quarter Suites",
      description: "Quiet suites in the heart of the old quarter.",
      address: "5 Hang Bac",
      city: "Hanoi",
      country: "Vietnam",
      rating: 4.4,
      amenities: ["WiFi", "Cafe", "Airport Shuttle"],
      images: ["https://example.com/h3.jpg"],
    },
    {
      name: "Pinecrest Escape",
      description: "Mountain retreat with panoramic balconies.",
      address: "21 Langbiang",
      city: "Da Lat",
      country: "Vietnam",
      rating: 4.7,
      amenities: ["Fireplace", "Bike Rental", "Garden"],
      images: ["https://example.com/h4.jpg"],
    },
    {
      name: "Mekong Serenity",
      description: "Floating villas with curated local experiences.",
      address: "99 Chau Doc",
      city: "Can Tho",
      country: "Vietnam",
      rating: 4.5,
      amenities: ["Boat Tour", "Restaurant", "WiFi"],
      images: ["https://example.com/h5.jpg"],
    },
    {
      name: "Golden Skyline Hotel",
      description: "Business hotel with modern meeting spaces.",
      address: "35 Le Loi",
      city: "Da Nang",
      country: "Vietnam",
      rating: 4.3,
      amenities: ["Conference Room", "Gym", "Laundry"],
      images: ["https://example.com/h6.jpg"],
    },
  ]);

  const rooms = await Room.insertMany([
    {
      hotel_id: hotels[0]._id,
      room_number: "101",
      room_type: "River Deluxe",
      description: "River view with king bed.",
      price_per_night: 180,
      capacity: 2,
      amenities: ["WiFi", "Mini Bar"],
      images: ["https://example.com/r1.jpg"],
      is_available: true,
    },
    {
      hotel_id: hotels[0]._id,
      room_number: "202",
      room_type: "Sky Suite",
      description: "Corner suite with skyline view.",
      price_per_night: 260,
      capacity: 3,
      amenities: ["Balcony", "Bathtub"],
      images: ["https://example.com/r2.jpg"],
      is_available: true,
    },
    {
      hotel_id: hotels[1]._id,
      room_number: "B12",
      room_type: "Ocean Bungalow",
      description: "Private bungalow with deck.",
      price_per_night: 240,
      capacity: 2,
      amenities: ["Sea View", "Breakfast"],
      images: ["https://example.com/r3.jpg"],
      is_available: true,
    },
    {
      hotel_id: hotels[2]._id,
      room_number: "305",
      room_type: "Heritage Studio",
      description: "Cozy studio in the old quarter.",
      price_per_night: 120,
      capacity: 2,
      amenities: ["City View"],
      images: ["https://example.com/r4.jpg"],
      is_available: true,
    },
    {
      hotel_id: hotels[3]._id,
      room_number: "A7",
      room_type: "Mountain Loft",
      description: "Loft room with fireplace.",
      price_per_night: 150,
      capacity: 3,
      amenities: ["Fireplace", "Tea Bar"],
      images: ["https://example.com/r5.jpg"],
      is_available: true,
    },
    {
      hotel_id: hotels[4]._id,
      room_number: "F2",
      room_type: "Floating Villa",
      description: "Overwater villa with private patio.",
      price_per_night: 220,
      capacity: 4,
      amenities: ["Butler Service", "WiFi"],
      images: ["https://example.com/r6.jpg"],
      is_available: true,
    },
    {
      hotel_id: hotels[5]._id,
      room_number: "901",
      room_type: "Executive Twin",
      description: "Ideal for business stays.",
      price_per_night: 140,
      capacity: 2,
      amenities: ["Workspace", "Coffee"],
      images: ["https://example.com/r7.jpg"],
      is_available: true,
    },
    {
      hotel_id: hotels[5]._id,
      room_number: "1101",
      room_type: "Skyline Suite",
      description: "Panoramic city views.",
      price_per_night: 210,
      capacity: 3,
      amenities: ["Lounge", "Bathtub"],
      images: ["https://example.com/r8.jpg"],
      is_available: true,
    },
  ]);

  const bookings = await Booking.insertMany([
    {
      user_id: users[0]._id.toString(),
      room_id: rooms[0]._id,
      check_in_date: new Date("2026-04-10"),
      check_out_date: new Date("2026-04-13"),
      total_price: 540,
      num_guests: 2,
      status: "confirmed",
      special_requests: "High floor",
    },
    {
      user_id: users[1]._id.toString(),
      room_id: rooms[2]._id,
      check_in_date: new Date("2026-05-02"),
      check_out_date: new Date("2026-05-05"),
      total_price: 720,
      num_guests: 2,
      status: "pending",
      special_requests: "Late check-in",
    },
    {
      user_id: users[3]._id.toString(),
      room_id: rooms[3]._id,
      check_in_date: new Date("2026-03-18"),
      check_out_date: new Date("2026-03-20"),
      total_price: 240,
      num_guests: 1,
      status: "completed",
      special_requests: "Extra towels",
    },
    {
      user_id: users[4]._id.toString(),
      room_id: rooms[5]._id,
      check_in_date: new Date("2026-06-12"),
      check_out_date: new Date("2026-06-15"),
      total_price: 660,
      num_guests: 4,
      status: "confirmed",
      special_requests: "Boat tour",
    },
    {
      user_id: users[5]._id.toString(),
      room_id: rooms[7]._id,
      check_in_date: new Date("2026-07-01"),
      check_out_date: new Date("2026-07-03"),
      total_price: 420,
      num_guests: 2,
      status: "pending",
      special_requests: "Airport pickup",
    },
    {
      user_id: users[0]._id.toString(),
      room_id: rooms[4]._id,
      check_in_date: new Date("2026-08-20"),
      check_out_date: new Date("2026-08-22"),
      total_price: 300,
      num_guests: 2,
      status: "pending",
      special_requests: "Mountain view",
    },
  ]);

  await Payment.insertMany([
    {
      booking_id: bookings[0]._id,
      amount: bookings[0].total_price,
      payment_method: "credit_card",
      payment_status: "completed",
      transaction_id: "TXN-1001",
      payment_date: new Date("2026-03-25"),
    },
    {
      booking_id: bookings[3]._id,
      amount: bookings[3].total_price,
      payment_method: "paypal",
      payment_status: "completed",
      transaction_id: "TXN-1002",
      payment_date: new Date("2026-03-26"),
    },
    {
      booking_id: bookings[2]._id,
      amount: bookings[2].total_price,
      payment_method: "credit_card",
      payment_status: "refunded",
      transaction_id: "TXN-1003",
      payment_date: new Date("2026-03-10"),
    },
  ]);

  await mongoose.disconnect();
  console.log("Seed completed successfully");
};

run().catch((error) => {
  console.error("Seed failed:", error);
  process.exit(1);
});
