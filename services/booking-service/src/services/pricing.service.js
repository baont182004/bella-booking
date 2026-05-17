import mongoose from "mongoose";
import { Combo, Promotion, Room, Hotel } from "../config/database.js";

const BELLA_HOTEL_NAME = "BELLA HOTEL Phu Quoc";
const CURRENCY = "VND";

function normalize(value = "") {
  return String(value || "").trim().toLowerCase();
}

function normalizeCode(value = "") {
  return normalize(value).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function hasActiveWindow(document, now = new Date()) {
  return (
    document?.is_active !== false &&
    (!document.valid_from || new Date(document.valid_from) <= now) &&
    (!document.valid_to || new Date(document.valid_to) >= now)
  );
}

function hasActivePromotionWindow(promotion, now = new Date()) {
  return (
    promotion?.is_active !== false &&
    (!promotion.active_from || new Date(promotion.active_from) <= now) &&
    (!promotion.active_to || new Date(promotion.active_to) >= now) &&
    (!promotion.usage_limit || Number(promotion.usage_count || 0) < Number(promotion.usage_limit))
  );
}

function getRoomAliases(room) {
  return [
    room.code,
    room.room_type,
    room.localized_name?.vi,
    room.localized_name?.en,
    room.raw_source_name,
    room.category,
  ]
    .map(normalizeCode)
    .filter(Boolean);
}

export function serializeCombo(combo) {
  if (!combo) return null;

  return {
    id: combo._id.toString(),
    name: combo.name,
    slug: combo.slug,
    description: combo.description,
    roomTypesAllowed: combo.room_types_allowed || [],
    durationLabel: combo.duration_label,
    nights: combo.nights,
    allowedNights: combo.allowed_nights || [],
    days: combo.days,
    minGuests: combo.min_guests,
    maxGuests: combo.max_guests,
    basePrice: combo.base_price,
    priceType: combo.price_type,
    currency: combo.currency || CURRENCY,
    includedServices: combo.included_services || [],
    suitableFor: combo.suitable_for,
    badgeLabel: combo.badge_label,
    imageUrl: combo.image_url,
    iconKey: combo.icon_key,
    isActive: combo.is_active,
    validFrom: combo.valid_from,
    validTo: combo.valid_to,
    termsAndConditions: combo.terms_and_conditions || [],
    displayOrder: combo.display_order,
  };
}

export function buildActiveComboFilter(now = new Date()) {
  return {
    is_active: true,
    $and: [
      { $or: [{ valid_from: null }, { valid_from: { $lte: now } }] },
      { $or: [{ valid_to: null }, { valid_to: { $gte: now } }] },
    ],
  };
}

export function comboSupportsRoom(combo, room) {
  const allowed = (combo.room_types_allowed || []).map(normalizeCode).filter(Boolean);
  if (!allowed.length || allowed.includes("linh-hoat") || allowed.includes("flexible")) {
    return true;
  }

  const roomAliases = getRoomAliases(room);
  return allowed.some((item) => roomAliases.some((alias) => alias.includes(item) || item.includes(alias)));
}

export function validateComboForStay({ combo, room, guestCount, nights, now = new Date() }) {
  if (!combo) {
    return "Combo not found";
  }

  if (!hasActiveWindow(combo, now)) {
    return "Combo is not active or no longer valid";
  }

  if (!comboSupportsRoom(combo, room)) {
    return "Combo is not available for this room type";
  }

  if (guestCount < Number(combo.min_guests || 1)) {
    return `Combo requires at least ${combo.min_guests || 1} guest(s)`;
  }

  if (combo.max_guests && guestCount > Number(combo.max_guests)) {
    return `Combo supports up to ${combo.max_guests} guest(s)`;
  }

  const allowedNights = combo.allowed_nights?.length ? combo.allowed_nights : [combo.nights];
  if (!allowedNights.map(Number).includes(Number(nights))) {
    return `Combo is valid for ${combo.duration_label}`;
  }

  return null;
}

export function calculateComboSubtotal({ combo, guestCount }) {
  if (!combo) return 0;

  const basePrice = Number(combo.base_price || 0);
  if (combo.price_type === "per_person") {
    return Math.round(basePrice * Number(guestCount || 1));
  }

  return Math.round(basePrice);
}

export function calculateDiscountAmount(promotion, subtotal) {
  if (!promotion) return 0;

  if (promotion.type === "percentage") {
    const discount = subtotal * (Number(promotion.value || 0) / 100);
    return Math.round(promotion.max_discount ? Math.min(discount, promotion.max_discount) : discount);
  }

  return Math.round(Math.min(subtotal, Number(promotion.value || 0)));
}

export async function resolvePromotionForPricing({ promotionCode, room, nights, subtotal }) {
  const code = String(promotionCode || "").trim().toUpperCase();
  if (!code) {
    return { promotion: null, promotionSnapshot: null, discountAmount: 0 };
  }

  const promotion = await Promotion.findOne({ code }).lean();
  if (!promotion) return { error: "Promotion code is invalid" };
  if (!hasActivePromotionWindow(promotion)) return { error: "Promotion is not available right now" };
  if (promotion.min_nights && nights < Number(promotion.min_nights)) {
    return { error: `Promotion requires at least ${promotion.min_nights} nights` };
  }
  if (promotion.min_spend && subtotal < Number(promotion.min_spend)) {
    return { error: "Booking subtotal does not meet this promotion's minimum spend" };
  }
  if (
    promotion.eligible_room_codes?.length &&
    !promotion.eligible_room_codes.map(normalizeCode).includes(normalizeCode(room.code))
  ) {
    return { error: "Promotion is not available for this room type" };
  }

  const discountAmount = Math.min(calculateDiscountAmount(promotion, subtotal), subtotal);
  return {
    promotion,
    promotionSnapshot: {
      promotion_id: promotion._id,
      code: promotion.code,
      name: promotion.name,
      type: promotion.type,
      value: promotion.value,
      discount_amount: discountAmount,
    },
    discountAmount,
  };
}

export async function loadBellaRoomForPricing(roomId) {
  if (!mongoose.Types.ObjectId.isValid(roomId)) return null;

  const room = await Room.findOne({ _id: roomId, is_active: { $ne: false }, is_available: true })
    .populate({
      path: "hotel_id",
      model: Hotel,
      select: "name address city country",
    })
    .lean();

  if (!room || normalize(room.hotel_id?.name) !== normalize(BELLA_HOTEL_NAME)) {
    return null;
  }

  return room;
}

export async function calculateBookingPrice({
  room,
  stay,
  guestCount,
  comboId,
  comboSlug,
  promotionCode,
}) {
  const nightlyRate = Number(room.price_per_night || 0);
  if (!Number.isFinite(nightlyRate) || nightlyRate <= 0) {
    return { error: "Current Bella room pricing is unavailable" };
  }

  const roomSubtotal = Math.round(stay.nights * nightlyRate);
  let combo = null;
  let comboSubtotal = 0;
  let comboSnapshot = null;

  if (comboId || comboSlug) {
    if (comboId && !mongoose.Types.ObjectId.isValid(comboId)) {
      return { error: "Invalid combo id" };
    }
    const comboQuery = comboId
      ? { _id: comboId }
      : { slug: String(comboSlug || "").trim().toLowerCase() };
    combo = await Combo.findOne(comboQuery).lean();
    const comboError = validateComboForStay({
      combo,
      room,
      guestCount,
      nights: stay.nights,
    });
    if (comboError) return { error: comboError };

    comboSubtotal = calculateComboSubtotal({ combo, guestCount });
    comboSnapshot = {
      combo_id: combo._id,
      slug: combo.slug,
      name: combo.name,
      price: comboSubtotal,
      price_type: combo.price_type,
      included_services: combo.included_services || [],
      duration_label: combo.duration_label,
      suitable_for: combo.suitable_for,
    };
  }

  const subtotalBeforeDiscount = roomSubtotal + comboSubtotal;
  const promotionResult = await resolvePromotionForPricing({
    promotionCode,
    room,
    nights: stay.nights,
    subtotal: subtotalBeforeDiscount,
  });
  if (promotionResult.error) return { error: promotionResult.error };

  const discountAmount = Math.min(promotionResult.discountAmount || 0, subtotalBeforeDiscount);
  const serviceFee = 0;
  const finalAmount = Math.max(0, subtotalBeforeDiscount + serviceFee - discountAmount);
  const priceBreakdown = {
    roomSubtotal,
    comboSubtotal,
    discountAmount,
    serviceFee,
    finalAmount,
    currency: CURRENCY,
    items: [
      {
        key: "room",
        label: "Giá phòng",
        amount: roomSubtotal,
      },
      ...(comboSnapshot
        ? [
            {
              key: "combo",
              label: comboSnapshot.name,
              amount: comboSubtotal,
            },
          ]
        : []),
      ...(discountAmount
        ? [
            {
              key: "promotion",
              label: promotionResult.promotionSnapshot?.code || "Ưu đãi",
              amount: -discountAmount,
            },
          ]
        : []),
    ],
  };

  return {
    roomSubtotal,
    comboSubtotal,
    discountAmount,
    serviceFee,
    finalAmount,
    currency: CURRENCY,
    nightlyRate,
    combo,
    comboSnapshot,
    promotion: promotionResult.promotion || null,
    promotionSnapshot: promotionResult.promotionSnapshot,
    priceBreakdown,
    priceSnapshot: {
      nights: stay.nights,
      nightly_rate: nightlyRate,
      room_subtotal: roomSubtotal,
      combo_subtotal: comboSubtotal,
      subtotal: subtotalBeforeDiscount,
      discount_amount: discountAmount,
      service_fee: serviceFee,
      total: finalAmount,
      currency: CURRENCY,
      breakdown: priceBreakdown,
    },
  };
}
