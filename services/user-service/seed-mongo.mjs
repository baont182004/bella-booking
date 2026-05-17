import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { readFileSync } from "node:fs";

const mongoUri =
  process.env.MONGODB_URI ||
  "mongodb://127.0.0.1:27017/bella_hotel";

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
    sessionVersion: { type: Number, default: 0 },
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
    source: mongoose.Schema.Types.Mixed,
    data_warnings: [String],
    is_active: Boolean,
    images: [String],
    is_available: Boolean,
  },
  { timestamps: true, collection: "rooms" },
);

const bookingSchema = new mongoose.Schema(
  {
    booking_reference: String,
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
    combo_id: mongoose.Schema.Types.ObjectId,
    combo_snapshot: mongoose.Schema.Types.Mixed,
    promotion_code: String,
    promotion_snapshot: mongoose.Schema.Types.Mixed,
    price_snapshot: mongoose.Schema.Types.Mixed,
    payment_expires_at: Date,
    confirmed_at: Date,
    cancelled_at: Date,
    completed_at: Date,
    expired_at: Date,
  },
  { timestamps: true, collection: "bookings" },
);

const comboSchema = new mongoose.Schema(
  {
    name: String,
    slug: String,
    description: String,
    room_types_allowed: [String],
    duration_label: String,
    nights: Number,
    allowed_nights: [Number],
    days: Number,
    min_guests: Number,
    max_guests: Number,
    base_price: Number,
    price_type: String,
    currency: String,
    included_services: [String],
    suitable_for: String,
    badge_label: String,
    image_url: String,
    icon_key: String,
    is_active: Boolean,
    valid_from: Date,
    valid_to: Date,
    terms_and_conditions: [String],
    display_order: Number,
  },
  { timestamps: true, collection: "combos" },
);

const promotionSchema = new mongoose.Schema(
  {
    code: String,
    name: String,
    description: String,
    type: String,
    value: Number,
    max_discount: Number,
    min_nights: Number,
    min_spend: Number,
    active_from: Date,
    active_to: Date,
    usage_limit: Number,
    usage_count: Number,
    eligible_room_codes: [String],
    is_active: Boolean,
  },
  { timestamps: true, collection: "promotions" },
);

const paymentSchema = new mongoose.Schema(
  {
    booking_id: mongoose.Schema.Types.ObjectId,
    provider: String,
    provider_payment_id: String,
    provider_intent_id: String,
    provider_session_id: String,
    provider_event_id: String,
    provider_customer_id: String,
    amount: Number,
    currency: String,
    amount_authorized: Number,
    amount_captured: Number,
    amount_refunded: Number,
    payment_method: String,
    payment_method_type: String,
    card_brand: String,
    card_last4: String,
    billing_name: String,
    billing_email: String,
    idempotency_key: String,
    checkout_session_expires_at: Date,
    payment_status: String,
    status: String,
    status_reason: String,
    failure_code: String,
    failure_message: String,
    authorized_at: Date,
    captured_at: Date,
    failed_at: Date,
    refunded_at: Date,
    webhook_verified_at: Date,
    transaction_id: String,
    payment_date: Date,
    failure_reason: String,
    refund_transaction_id: String,
    refund_date: Date,
    risk_flags: [String],
    provider_payload_summary: mongoose.Schema.Types.Mixed,
    metadata: mongoose.Schema.Types.Mixed,
  },
  { timestamps: true, collection: "payments" },
);

const User = mongoose.model("User", userSchema);
const Hotel = mongoose.model("Hotel", hotelSchema);
const Room = mongoose.model("Room", roomSchema);
const Booking = mongoose.model("Booking", bookingSchema);
const Combo = mongoose.model("Combo", comboSchema);
const Promotion = mongoose.model("Promotion", promotionSchema);
const Payment = mongoose.model("Payment", paymentSchema);

function totalFor(room, nights) {
  return room.price_per_night * nights;
}

function buildPriceSnapshot({ nights, nightlyRate, discountAmount = 0 }) {
  const subtotal = nightlyRate * nights;
  return {
    nights,
    nightly_rate: nightlyRate,
    subtotal,
    discount_amount: discountAmount,
    total: subtotal - discountAmount,
    currency: "VND",
  };
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

const bellaCombos = [
  {
    name: "Chill Nhẹ",
    slug: "chill-nhe",
    description: "Gói nghỉ nhanh 2N1Đ cho cặp đôi muốn đổi gió tại Phú Quốc với phòng Double và xe máy nửa ngày.",
    room_types_allowed: ["double", "sea-view-double-or-twin-room", "side-sea-view-deluxe-double-room"],
    duration_label: "2N1Đ",
    nights: 1,
    allowed_nights: [1],
    days: 2,
    min_guests: 2,
    max_guests: 2,
    base_price: 899000,
    price_type: "fixed",
    currency: "VND",
    included_services: ["Phòng", "Nước suối", "Minibar cơ bản", "Check-in sớm", "Thuê xe máy 1 buổi"],
    suitable_for: "Cặp đôi, nghỉ nhanh",
    badge_label: "Best Seller",
    image_url: "/bella/sea-view-double-or-twin-room/sea-view-double-or-twin-room-01.jpg",
    icon_key: "sparkles",
    is_active: true,
    valid_from: new Date("2026-01-01T00:00:00.000Z"),
    valid_to: new Date("2026-12-31T23:59:59.999Z"),
    terms_and_conditions: ["Áp dụng theo tình trạng phòng trống.", "Check-in sớm cần được Bella xác nhận trước."],
    display_order: 1,
  },
  {
    name: "Năng Động Khám Phá",
    slug: "nang-dong-kham-pha",
    description: "Gói trải nghiệm Nam đảo cho 2 khách, kết hợp lưu trú, tour, lặn san hô và di chuyển thuận tiện.",
    room_types_allowed: ["double", "sea-view-double-or-twin-room", "side-sea-view-deluxe-double-room"],
    duration_label: "2N1Đ",
    nights: 1,
    allowed_nights: [1],
    days: 2,
    min_guests: 2,
    max_guests: 2,
    base_price: 1290000,
    price_type: "fixed",
    currency: "VND",
    included_services: ["Phòng", "Tour Nam Đảo", "Lặn san hô", "Xe máy 1 ngày", "Đưa đón sân bay 1 chiều"],
    suitable_for: "Gen Z, thích trải nghiệm",
    badge_label: "Hot Deal",
    image_url: "/bella/bella-seafront.jpg",
    icon_key: "compass",
    is_active: true,
    valid_from: new Date("2026-01-01T00:00:00.000Z"),
    valid_to: new Date("2026-12-31T23:59:59.999Z"),
    terms_and_conditions: ["Lịch tour phụ thuộc thời tiết.", "Vui lòng cung cấp giờ bay khi cần đưa đón."],
    display_order: 2,
  },
  {
    name: "Công Tác Hết Mình",
    slug: "cong-tac-het-minh",
    description: "Gói 2N1Đ cho nhóm 3-4 khách cần phòng Business, bữa BBQ và phương tiện di chuyển trong ngày.",
    room_types_allowed: ["business", "studio", "sea-view-studio"],
    duration_label: "2N1Đ",
    nights: 1,
    allowed_nights: [1],
    days: 2,
    min_guests: 3,
    max_guests: 4,
    base_price: 1590000,
    price_type: "fixed",
    currency: "VND",
    included_services: ["Phòng", "BBQ tối", "2 xe máy/ngày", "Trái cây", "Nước"],
    suitable_for: "Nhóm bạn hoặc nhóm công tác",
    badge_label: "Team Pick",
    image_url: "/bella/sea-view-studio/sea-view-studio-01.jpg",
    icon_key: "briefcase",
    is_active: true,
    valid_from: new Date("2026-01-01T00:00:00.000Z"),
    valid_to: new Date("2026-12-31T23:59:59.999Z"),
    terms_and_conditions: ["BBQ cần đặt trước tối thiểu 24 giờ.", "Số lượng xe tùy theo tình trạng thực tế."],
    display_order: 3,
  },
  {
    name: "Gia Đình Thảnh Thơi",
    slug: "gia-dinh-thanh-thoi",
    description: "Gói gia đình 2N1Đ với phòng Family 2PN, đưa đón sân bay hai chiều và bữa sáng cho 4 người.",
    room_types_allowed: ["family", "family-2pn", "garden-family-room", "two-bedroom-sea-view-apartment"],
    duration_label: "2N1Đ",
    nights: 1,
    allowed_nights: [1],
    days: 2,
    min_guests: 3,
    max_guests: 4,
    base_price: 2490000,
    price_type: "fixed",
    currency: "VND",
    included_services: ["Phòng", "Đưa đón sân bay 2 chiều", "Ăn sáng 4 người", "Trái cây", "Hỗ trợ tour"],
    suitable_for: "Gia đình",
    badge_label: "Family Pick",
    image_url: "/bella/garden-family-room/garden-family-room-01.jpg",
    icon_key: "family",
    is_active: true,
    valid_from: new Date("2026-01-01T00:00:00.000Z"),
    valid_to: new Date("2026-12-31T23:59:59.999Z"),
    terms_and_conditions: ["Bữa sáng áp dụng tối đa 4 người.", "Đưa đón sân bay cần xác nhận lịch trước."],
    display_order: 4,
  },
  {
    name: "Stay & Relax",
    slug: "stay-and-relax",
    description: "Gói 3N2Đ dành cho kỳ nghỉ dài hơn, kèm bữa tối, xe máy 2 ngày, giặt ủi và late check-out.",
    room_types_allowed: ["double", "triple", "sea-view-double-or-twin-room", "side-sea-view-deluxe-double-room"],
    duration_label: "3N2Đ",
    nights: 2,
    allowed_nights: [2],
    days: 3,
    min_guests: 2,
    max_guests: 3,
    base_price: 1990000,
    price_type: "from_price",
    currency: "VND",
    included_services: ["2 đêm", "1 bữa tối", "Xe máy 2 ngày", "Giặt ủi", "Late check-out"],
    suitable_for: "Nghỉ dưỡng dài ngày",
    badge_label: "Relax Choice",
    image_url: "/bella/bella-room-detail.jpg",
    icon_key: "waves",
    is_active: true,
    valid_from: new Date("2026-01-01T00:00:00.000Z"),
    valid_to: new Date("2026-12-31T23:59:59.999Z"),
    terms_and_conditions: ["Giá từ tùy hạng phòng thực tế.", "Late check-out phụ thuộc công suất phòng."],
    display_order: 5,
  },
  {
    name: "All-in Phú Quốc",
    slug: "all-in-phu-quoc",
    description: "Gói trọn gói lưu trú, tour 4 đảo, cáp treo, ăn uống, xe và đưa đón sân bay cho hành trình gọn nhẹ.",
    room_types_allowed: ["linh hoạt"],
    duration_label: "2N1Đ hoặc 3N2Đ",
    nights: 1,
    allowed_nights: [1, 2],
    days: 2,
    min_guests: 1,
    max_guests: null,
    base_price: 2990000,
    price_type: "per_person",
    currency: "VND",
    included_services: ["Lưu trú", "Tour 4 đảo", "Cáp treo", "Ăn uống", "Xe", "Đưa đón sân bay"],
    suitable_for: "Trọn gói",
    badge_label: "All-in",
    image_url: "/bella/bella-exterior.jpg",
    icon_key: "map",
    is_active: true,
    valid_from: new Date("2026-01-01T00:00:00.000Z"),
    valid_to: new Date("2026-12-31T23:59:59.999Z"),
    terms_and_conditions: ["Giá hiển thị theo người, từ 2.990.000 VNĐ.", "Gói 3N2Đ có thể điều chỉnh theo lịch trình thực tế."],
    display_order: 6,
  },
];

const run = async () => {
  await mongoose.connect(mongoUri);

  await Promise.all([
    User.deleteMany({}),
    Hotel.deleteMany({}),
    Room.deleteMany({}),
    Booking.deleteMany({}),
    Combo.deleteMany({}),
    Promotion.deleteMany({}),
    Payment.deleteMany({}),
  ]);

  await Booking.collection.dropIndexes().catch(() => {});
  await Combo.collection.dropIndexes().catch(() => {});
  await Promotion.collection.dropIndexes().catch(() => {});
  await Payment.collection.dropIndexes().catch(() => {});

  await Booking.collection.createIndex({ booking_reference: 1 }, { unique: true, sparse: true });
  await Combo.collection.createIndex({ slug: 1 }, { unique: true });
  await Combo.collection.createIndex({ is_active: 1, display_order: 1, base_price: 1 });
  await Promotion.collection.createIndex({ code: 1 }, { unique: true });
  await Payment.collection.createIndex({ booking_id: 1 }, { unique: true });
  await Payment.collection.createIndex(
    { provider: 1, provider_session_id: 1 },
    {
      unique: true,
      partialFilterExpression: { provider_session_id: { $type: "string" } },
    },
  );
  await Payment.collection.createIndex(
    { provider: 1, provider_payment_id: 1 },
    {
      unique: true,
      partialFilterExpression: { provider_payment_id: { $type: "string" } },
    },
  );
  await Payment.collection.createIndex(
    { provider: 1, provider_intent_id: 1 },
    {
      unique: true,
      partialFilterExpression: { provider_intent_id: { $type: "string" } },
    },
  );
  await Payment.collection.createIndex(
    { provider: 1, idempotency_key: 1 },
    {
      unique: true,
      partialFilterExpression: { idempotency_key: { $type: "string" } },
    },
  );
  await Payment.collection.createIndex(
    { transaction_id: 1 },
    { unique: true, sparse: true },
  );

  const passwordHash = await bcrypt.hash("Password123!", 10);

  const users = await User.insertMany([
    {
      email: "lana.nguyen@example.com",
      password: passwordHash,
      firstName: "Lana",
      lastName: "Nguyen",
      phone: "+84 901 234 567",
      role: "customer",
      sessionVersion: 0,
    },
    {
      email: "minh.tran@example.com",
      password: passwordHash,
      firstName: "Minh",
      lastName: "Tran",
      phone: "+84 903 567 890",
      role: "customer",
      sessionVersion: 0,
    },
    {
      email: "admin.bella@example.com",
      password: passwordHash,
      firstName: "Bella",
      lastName: "Admin",
      phone: "+84 909 111 222",
      role: "admin",
      sessionVersion: 0,
    },
    {
      email: "huy.pham@example.com",
      password: passwordHash,
      firstName: "Huy",
      lastName: "Pham",
      phone: "+84 912 333 444",
      role: "customer",
      sessionVersion: 0,
    },
    {
      email: "mai.le@example.com",
      password: passwordHash,
      firstName: "Mai",
      lastName: "Le",
      phone: "+84 915 888 999",
      role: "customer",
      sessionVersion: 0,
    },
    {
      email: "khoa.vu@example.com",
      password: passwordHash,
      firstName: "Khoa",
      lastName: "Vu",
      phone: "+84 917 555 666",
      role: "customer",
      sessionVersion: 0,
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

  await Combo.bulkWrite(
    bellaCombos.map((combo) => ({
      updateOne: {
        filter: { slug: combo.slug },
        update: { $set: combo },
        upsert: true,
      },
    })),
  );

  const promotions = await Promotion.insertMany([
    {
      code: "BELLA10",
      name: "Bella Direct 10%",
      description: "10% off direct Bella reservations for stays of at least 2 nights.",
      type: "percentage",
      value: 10,
      max_discount: 400000,
      min_nights: 2,
      min_spend: 1500000,
      active_from: new Date("2026-01-01T00:00:00.000Z"),
      active_to: new Date("2026-12-31T23:59:59.999Z"),
      usage_limit: 100,
      usage_count: 1,
      eligible_room_codes: [],
      is_active: true,
    },
    {
      code: "SUITE5",
      name: "Suite Upgrade Offer",
      description: "Fixed discount for the Bella sea view studio and apartment categories.",
      type: "fixed",
      value: 250000,
      max_discount: null,
      min_nights: 2,
      min_spend: 2000000,
      active_from: new Date("2026-01-01T00:00:00.000Z"),
      active_to: new Date("2026-12-31T23:59:59.999Z"),
      usage_limit: 50,
      usage_count: 1,
      eligible_room_codes: ["sea-view-studio", "two-bedroom-sea-view-apartment"],
      is_active: true,
    },
    {
      code: "FLASH20",
      name: "Flash Sale 20%",
      description: "Promo kept inactive for admin testing.",
      type: "percentage",
      value: 20,
      max_discount: 500000,
      min_nights: 1,
      min_spend: 0,
      active_from: new Date("2026-01-01T00:00:00.000Z"),
      active_to: new Date("2026-12-31T23:59:59.999Z"),
      usage_limit: 20,
      usage_count: 0,
      eligible_room_codes: [],
      is_active: false,
    },
  ]);

  const bookings = await Booking.insertMany([
    {
      booking_reference: "BEL-20260401-A10001",
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
      confirmed_at: new Date("2026-03-25"),
      special_requests: "High floor if available",
      promotion_code: null,
      promotion_snapshot: null,
      price_snapshot: buildPriceSnapshot({
        nights: 3,
        nightlyRate: rooms[0].price_per_night,
      }),
    },
    {
      booking_reference: "BEL-20260401-A10002",
      user_id: users[1]._id.toString(),
      room_id: rooms[3]._id,
      check_in_date: new Date("2026-05-02"),
      check_out_date: new Date("2026-05-05"),
      total_price: totalFor(rooms[3], 3),
      num_guests: 2,
      guest_full_name: `${users[1].firstName} ${users[1].lastName}`,
      guest_email: users[1].email,
      guest_phone: users[1].phone,
      status: "pending_payment",
      payment_expires_at: new Date("2026-05-01T12:30:00.000Z"),
      special_requests: "Late check-in",
      promotion_code: null,
      promotion_snapshot: null,
      price_snapshot: buildPriceSnapshot({
        nights: 3,
        nightlyRate: rooms[3].price_per_night,
      }),
    },
    {
      booking_reference: "BEL-20260401-A10003",
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
      confirmed_at: new Date("2026-03-08"),
      completed_at: new Date("2026-03-20"),
      special_requests: "Extra towels",
      promotion_code: null,
      promotion_snapshot: null,
      price_snapshot: buildPriceSnapshot({
        nights: 2,
        nightlyRate: rooms[1].price_per_night,
      }),
    },
    {
      booking_reference: "BEL-20260401-A10004",
      user_id: users[4]._id.toString(),
      room_id: rooms[5]._id,
      check_in_date: new Date("2026-06-12"),
      check_out_date: new Date("2026-06-15"),
      total_price: totalFor(rooms[5], 3) - 250000,
      num_guests: 6,
      guest_full_name: `${users[4].firstName} ${users[4].lastName}`,
      guest_email: users[4].email,
      guest_phone: users[4].phone,
      status: "confirmed",
      confirmed_at: new Date("2026-03-26"),
      special_requests: "Quiet floor",
      promotion_code: promotions[1].code,
      promotion_snapshot: {
        promotion_id: promotions[1]._id,
        code: promotions[1].code,
        name: promotions[1].name,
        type: promotions[1].type,
        value: promotions[1].value,
        discount_amount: 250000,
      },
      price_snapshot: buildPriceSnapshot({
        nights: 3,
        nightlyRate: rooms[5].price_per_night,
        discountAmount: 250000,
      }),
    },
    {
      booking_reference: "BEL-20260401-A10005",
      user_id: users[5]._id.toString(),
      room_id: rooms[4]._id,
      check_in_date: new Date("2026-07-01"),
      check_out_date: new Date("2026-07-03"),
      total_price: totalFor(rooms[4], 2),
      num_guests: 2,
      guest_full_name: `${users[5].firstName} ${users[5].lastName}`,
      guest_email: users[5].email,
      guest_phone: users[5].phone,
      status: "pending_payment",
      payment_expires_at: new Date("2026-07-01T10:30:00.000Z"),
      special_requests: "Sea-facing room if possible",
      promotion_code: null,
      promotion_snapshot: null,
      price_snapshot: buildPriceSnapshot({
        nights: 2,
        nightlyRate: rooms[4].price_per_night,
      }),
    },
    {
      booking_reference: "BEL-20260401-A10006",
      user_id: users[0]._id.toString(),
      room_id: rooms[2]._id,
      check_in_date: new Date("2026-08-20"),
      check_out_date: new Date("2026-08-22"),
      total_price: totalFor(rooms[2], 2) - 192000,
      num_guests: 2,
      guest_full_name: `${users[0].firstName} ${users[0].lastName}`,
      guest_email: users[0].email,
      guest_phone: users[0].phone,
      status: "pending_payment",
      payment_expires_at: new Date("2026-08-19T12:30:00.000Z"),
      special_requests: "Arrival after 20:00",
      promotion_code: promotions[0].code,
      promotion_snapshot: {
        promotion_id: promotions[0]._id,
        code: promotions[0].code,
        name: promotions[0].name,
        type: promotions[0].type,
        value: promotions[0].value,
        discount_amount: 192000,
      },
      price_snapshot: buildPriceSnapshot({
        nights: 2,
        nightlyRate: rooms[2].price_per_night,
        discountAmount: 192000,
      }),
    },
  ]);

  await Payment.insertMany([
    {
      booking_id: bookings[0]._id,
      provider: "mock",
      provider_payment_id: "mock_pay_seed_1001",
      provider_intent_id: "mock_int_seed_1001",
      provider_session_id: "mock_sess_seed_1001",
      provider_event_id: "evt_seed_1001",
      amount: bookings[0].total_price,
      currency: "VND",
      amount_authorized: bookings[0].total_price,
      amount_captured: bookings[0].total_price,
      amount_refunded: 0,
      payment_method: "card",
      payment_method_type: "card",
      card_brand: "visa",
      card_last4: "4242",
      billing_name: `${users[0].firstName} ${users[0].lastName}`,
      billing_email: users[0].email,
      payment_status: "succeeded",
      status: "succeeded",
      transaction_id: "TXN-BELLA-1001",
      payment_date: new Date("2026-03-25"),
      authorized_at: new Date("2026-03-25"),
      captured_at: new Date("2026-03-25"),
      webhook_verified_at: new Date("2026-03-25"),
      provider_payload_summary: {
        eventType: "checkout.session.completed",
        sandbox: true,
      },
    },
    {
      booking_id: bookings[3]._id,
      provider: "mock",
      provider_payment_id: "mock_pay_seed_1002",
      provider_intent_id: "mock_int_seed_1002",
      provider_session_id: "mock_sess_seed_1002",
      provider_event_id: "evt_seed_1002",
      amount: bookings[3].total_price,
      currency: "VND",
      amount_authorized: bookings[3].total_price,
      amount_captured: bookings[3].total_price,
      amount_refunded: 0,
      payment_method: "card",
      payment_method_type: "card",
      card_brand: "mastercard",
      card_last4: "4444",
      billing_name: `${users[4].firstName} ${users[4].lastName}`,
      billing_email: users[4].email,
      payment_status: "succeeded",
      status: "succeeded",
      transaction_id: "TXN-BELLA-1002",
      payment_date: new Date("2026-03-26"),
      authorized_at: new Date("2026-03-26"),
      captured_at: new Date("2026-03-26"),
      webhook_verified_at: new Date("2026-03-26"),
      provider_payload_summary: {
        eventType: "checkout.session.completed",
        sandbox: true,
      },
    },
    {
      booking_id: bookings[2]._id,
      provider: "mock",
      provider_payment_id: "mock_pay_seed_1003",
      provider_intent_id: "mock_int_seed_1003",
      provider_session_id: "mock_sess_seed_1003",
      provider_event_id: "evt_seed_1003_refund",
      amount: bookings[2].total_price,
      currency: "VND",
      amount_authorized: bookings[2].total_price,
      amount_captured: bookings[2].total_price,
      amount_refunded: bookings[2].total_price,
      payment_method: "card",
      payment_method_type: "card",
      card_brand: "visa",
      card_last4: "4242",
      billing_name: `${users[3].firstName} ${users[3].lastName}`,
      billing_email: users[3].email,
      payment_status: "refunded",
      status: "refunded",
      transaction_id: "TXN-BELLA-1003",
      payment_date: new Date("2026-03-10"),
      failure_reason: null,
      authorized_at: new Date("2026-03-10"),
      captured_at: new Date("2026-03-10"),
      refund_transaction_id: "RFN-BELLA-1003",
      refund_date: new Date("2026-03-11"),
      refunded_at: new Date("2026-03-11"),
      webhook_verified_at: new Date("2026-03-11"),
      provider_payload_summary: {
        eventType: "charge.refunded",
        sandbox: true,
      },
    },
    {
      booking_id: bookings[1]._id,
      provider: "mock",
      provider_intent_id: "mock_int_seed_1004",
      provider_session_id: "mock_sess_seed_1004",
      provider_event_id: "evt_seed_1004",
      amount: bookings[1].total_price,
      currency: "VND",
      amount_authorized: 0,
      amount_captured: 0,
      amount_refunded: 0,
      payment_method: "hosted_checkout",
      payment_method_type: "hosted_checkout",
      billing_name: `${users[1].firstName} ${users[1].lastName}`,
      billing_email: users[1].email,
      payment_status: "failed",
      status: "failed",
      status_reason: "Sandbox card was declined by the mock provider.",
      failure_code: "card_declined",
      failure_message: "Sandbox card was declined by the mock provider.",
      transaction_id: "FAIL-BELLA-1004",
      payment_date: new Date("2026-04-02"),
      failure_reason: "Demo payment declined for this test card.",
      failed_at: new Date("2026-04-02"),
      webhook_verified_at: new Date("2026-04-02"),
      provider_payload_summary: {
        eventType: "payment_intent.payment_failed",
        sandbox: true,
      },
    },
  ]);

  await mongoose.disconnect();
  console.log("Seeded BELLA HOTEL Phu Quoc successfully");
};

run().catch((error) => {
  console.error("Seed failed:", error);
  process.exit(1);
});
