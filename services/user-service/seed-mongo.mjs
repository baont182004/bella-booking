import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { readFileSync } from "node:fs";

const mongoUri =
  process.env.MONGODB_URI ||
  "mongodb+srv://<user>:<password>@cluster0.mongodb.net/hotel_db?retryWrites=true&w=majority";

const bellaMetadata = JSON.parse(
  readFileSync(new URL("../../data/bella-room-metadata.json", import.meta.url), "utf8"),
);

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

const bedConfigSchema = new mongoose.Schema(
  {
    type: String,
    quantity: Number,
    label: String,
  },
  { _id: false },
);

const roomSchema = new mongoose.Schema(
  {
    hotel_id: mongoose.Schema.Types.ObjectId,
    code: String,
    room_number: String,
    room_type: String,
    description: String,
    localized_name: {
      vi: String,
      en: String,
    },
    category: String,
    summary: String,
    area_sqm: Number,
    bedroom_count: Number,
    bathroom_count: Number,
    max_adults: Number,
    max_children: Number,
    max_occupancy: Number,
    bed_configs: [bedConfigSchema],
    spaces: [String],
    views: [String],
    bathroom_features: [String],
    price_per_night: Number,
    capacity: Number,
    amenities: [String],
    accessibility: {
      access_modes: [String],
      access_note: String,
    },
    policies: {
      smoking: String,
    },
    raw_source_name: String,
    source: {
      type: String,
      file: String,
    },
    data_warnings: [String],
    is_active: Boolean,
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
    guest_full_name: String,
    guest_email: String,
    guest_phone: String,
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

function totalFor(room, nights) {
  return room.price_per_night * nights;
}

const roomRuntimeConfigByCode = {
  "garden-family-room": {
    room_type: "Garden Family Room",
    room_number: "B101",
    price_per_night: 1196000,
    capacity: 4,
    images: ["/bella/bella-family.jpg", "/bella/bella-layout.jpg"],
  },
  "balcony-twin-room": {
    room_type: "Twin Balcony Room",
    room_number: "B203",
    price_per_night: 1000000,
    capacity: 2,
    images: ["/bella/bella-room-beds.jpg", "/bella/bella-room-detail.jpg"],
  },
  "sea-view-double-or-twin-room": {
    room_type: "Sea View Double or Twin Room",
    room_number: "B305",
    price_per_night: 960000,
    capacity: 3,
    images: ["/bella/bella-seafront.jpg", "/bella/bella-room-detail.jpg"],
  },
  "sea-view-studio": {
    room_type: "Sea View Studio",
    room_number: "B402",
    price_per_night: 1750000,
    capacity: 3,
    images: ["/bella/bella-layout.jpg", "/bella/bella-seafront.jpg"],
  },
  "side-sea-view-deluxe-double-room": {
    room_type: "Side Sea View Deluxe Double Room",
    room_number: "B407",
    price_per_night: 960000,
    capacity: 3,
    images: ["/bella/bella-arrival.jpg", "/bella/bella-room-beds.jpg"],
  },
  "two-bedroom-sea-view-apartment": {
    room_type: "Two-Bedroom Sea View Apartment",
    room_number: "B501",
    price_per_night: 3040000,
    capacity: 8,
    images: ["/bella/bella-exterior.jpg", "/bella/bella-seafront.jpg"],
  },
};

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
      email: "admin.bella@example.com",
      password: passwordHash,
      firstName: "Bella",
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

  const [bellaHotel] = await Hotel.insertMany([
    {
      name: "BELLA HOTEL Phu Quoc",
      description:
        "BELLA HOTEL Phu Quoc offers fast check-in and check-out, allergy-friendly rooms, free Wi-Fi throughout the property, airport transfer options, and a location close to Sunset Town landmarks in southern Phu Quoc.",
      address:
        "SOR209 Khu do thi Sun Premier Village Primavera, To 10, Khu, Dac khu Phu Quoc, An Thoi, Phu Quoc, Viet Nam",
      city: "Phu Quoc",
      country: "Vietnam",
      rating: 4.3,
      amenities: bellaMetadata.hotelAmenities,
      images: [
        "/bella/bella-hero.jpg",
        "/bella/bella-exterior.jpg",
        "/bella/bella-arrival.jpg",
      ],
    },
  ]);

  const rooms = await Room.insertMany(
    bellaMetadata.roomTypes.map((roomType) => {
      const runtime = roomRuntimeConfigByCode[roomType.code];

      if (!runtime) {
        throw new Error(`Missing runtime config for room type ${roomType.code}`);
      }

      return {
        hotel_id: bellaHotel._id,
        code: roomType.code,
        room_number: runtime.room_number,
        room_type: runtime.room_type,
        description: roomType.summary,
        localized_name: roomType.name,
        category: roomType.category,
        summary: roomType.summary,
        area_sqm: roomType.areaSqm,
        bedroom_count: roomType.bedroomCount,
        bathroom_count: roomType.bathroomCount,
        max_adults: roomType.maxAdults,
        max_children: roomType.maxChildren,
        max_occupancy: roomType.maxOccupancy,
        bed_configs: roomType.bedConfigs,
        spaces: roomType.spaces,
        views: roomType.views,
        bathroom_features: roomType.bathroomFeatures,
        price_per_night: runtime.price_per_night,
        capacity: runtime.capacity,
        amenities: roomType.amenities,
        accessibility: {
          access_modes: roomType.accessibility.accessModes,
          access_note: roomType.accessibility.accessNote,
        },
        policies: roomType.policies,
        raw_source_name: roomType.rawSourceName,
        source: roomType.source,
        data_warnings: roomType.dataWarnings,
        is_active: roomType.isActive,
        images: runtime.images,
        is_available: true,
      };
    }),
  );

  const bookings = await Booking.insertMany([
    {
      user_id: users[0]._id.toString(),
      room_id: rooms[0]._id,
      check_in_date: new Date("2026-04-10"),
      check_out_date: new Date("2026-04-13"),
      total_price: totalFor(rooms[0], 3),
      num_guests: 3,
      guest_full_name: `${users[0].firstName} ${users[0].lastName}`,
      guest_email: users[0].email,
      guest_phone: users[0].phone,
      status: "confirmed",
      special_requests: "High floor if available",
    },
    {
      user_id: users[1]._id.toString(),
      room_id: rooms[3]._id,
      check_in_date: new Date("2026-05-02"),
      check_out_date: new Date("2026-05-05"),
      total_price: totalFor(rooms[3], 3),
      num_guests: 2,
      guest_full_name: `${users[1].firstName} ${users[1].lastName}`,
      guest_email: users[1].email,
      guest_phone: users[1].phone,
      status: "pending",
      special_requests: "Late check-in",
    },
    {
      user_id: users[3]._id.toString(),
      room_id: rooms[1]._id,
      check_in_date: new Date("2026-03-18"),
      check_out_date: new Date("2026-03-20"),
      total_price: totalFor(rooms[1], 2),
      num_guests: 2,
      guest_full_name: `${users[3].firstName} ${users[3].lastName}`,
      guest_email: users[3].email,
      guest_phone: users[3].phone,
      status: "completed",
      special_requests: "Extra towels",
    },
    {
      user_id: users[4]._id.toString(),
      room_id: rooms[5]._id,
      check_in_date: new Date("2026-06-12"),
      check_out_date: new Date("2026-06-15"),
      total_price: totalFor(rooms[5], 3),
      num_guests: 6,
      guest_full_name: `${users[4].firstName} ${users[4].lastName}`,
      guest_email: users[4].email,
      guest_phone: users[4].phone,
      status: "confirmed",
      special_requests: "Quiet floor",
    },
    {
      user_id: users[5]._id.toString(),
      room_id: rooms[4]._id,
      check_in_date: new Date("2026-07-01"),
      check_out_date: new Date("2026-07-03"),
      total_price: totalFor(rooms[4], 2),
      num_guests: 2,
      guest_full_name: `${users[5].firstName} ${users[5].lastName}`,
      guest_email: users[5].email,
      guest_phone: users[5].phone,
      status: "pending",
      special_requests: "Sea-facing room if possible",
    },
    {
      user_id: users[0]._id.toString(),
      room_id: rooms[2]._id,
      check_in_date: new Date("2026-08-20"),
      check_out_date: new Date("2026-08-22"),
      total_price: totalFor(rooms[2], 2),
      num_guests: 2,
      guest_full_name: `${users[0].firstName} ${users[0].lastName}`,
      guest_email: users[0].email,
      guest_phone: users[0].phone,
      status: "pending",
      special_requests: "Arrival after 20:00",
    },
  ]);

  await Payment.insertMany([
    {
      booking_id: bookings[0]._id,
      amount: bookings[0].total_price,
      payment_method: "credit_card",
      payment_status: "completed",
      transaction_id: "TXN-BELLA-1001",
      payment_date: new Date("2026-03-25"),
    },
    {
      booking_id: bookings[3]._id,
      amount: bookings[3].total_price,
      payment_method: "debit_card",
      payment_status: "completed",
      transaction_id: "TXN-BELLA-1002",
      payment_date: new Date("2026-03-26"),
    },
    {
      booking_id: bookings[2]._id,
      amount: bookings[2].total_price,
      payment_method: "credit_card",
      payment_status: "refunded",
      transaction_id: "TXN-BELLA-1003",
      payment_date: new Date("2026-03-10"),
    },
  ]);

  await mongoose.disconnect();
  console.log("Seeded BELLA HOTEL Phu Quoc successfully");
};

run().catch((error) => {
  console.error("Seed failed:", error);
  process.exit(1);
});
