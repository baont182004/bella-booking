import express from "express";
import Joi from "joi";
import { Combo } from "../config/database.js";

const router = express.Router();
const CURRENCY = "VND";

const comboQuerySchema = Joi.object({
  roomType: Joi.string().trim().allow("").optional(),
  guestCount: Joi.number().integer().positive().optional(),
  guests: Joi.number().integer().positive().optional(),
  nights: Joi.number().integer().positive().optional(),
  suitableFor: Joi.string().trim().allow("").optional(),
  sort: Joi.string().valid("displayOrder", "price", "price_desc").default("displayOrder"),
}).unknown(false);

function normalizeComboFilterValue(value = "") {
  return String(value || "").trim().toLowerCase();
}

function normalizeRoomType(value = "") {
  return normalizeComboFilterValue(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\u00c0-\u1ef9]+/gi, "-")
    .replace(/^-|-$/g, "");
}

function serializeCombo(combo) {
  if (!combo) return null;

  return {
    id: combo._id.toString(),
    slug: combo.slug,
    name: combo.name,
    description: combo.description,
    imageUrl: combo.image_url,
    badgeLabel: combo.badge_label,
    basePrice: combo.base_price,
    priceType: combo.price_type,
    durationLabel: combo.duration_label,
    minGuests: combo.min_guests,
    maxGuests: combo.max_guests,
    suitableFor: combo.suitable_for,
    roomTypesAllowed: combo.room_types_allowed || [],
    includedServices: combo.included_services || [],
    termsAndConditions: combo.terms_and_conditions || [],
    displayOrder: combo.display_order,
    nights: combo.nights,
    allowedNights: combo.allowed_nights || [],
    days: combo.days,
    currency: combo.currency || CURRENCY,
    iconKey: combo.icon_key,
  };
}

function buildActiveComboFilter(now = new Date()) {
  return {
    is_active: true,
    $and: [
      { $or: [{ valid_from: null }, { valid_from: { $lte: now } }] },
      { $or: [{ valid_to: null }, { valid_to: { $gte: now } }] },
    ],
  };
}

function comboMatchesFilters(combo, filters) {
  if (filters.roomType) {
    const roomType = normalizeRoomType(filters.roomType);
    const allowed = (combo.room_types_allowed || []).map(normalizeRoomType);
    if (
      allowed.length &&
      !allowed.includes("linh-hoat") &&
      !allowed.includes("flexible") &&
      !allowed.some((item) => item.includes(roomType) || roomType.includes(item))
    ) {
      return false;
    }
  }

  const guestCount = filters.guestCount || filters.guests;
  if (guestCount) {
    const totalGuests = Number(guestCount);
    if (totalGuests < Number(combo.min_guests || 1)) return false;
    if (combo.max_guests && totalGuests > Number(combo.max_guests)) return false;
  }

  if (filters.nights) {
    const allowedNights = combo.allowed_nights?.length ? combo.allowed_nights : [combo.nights];
    if (!allowedNights.map(Number).includes(Number(filters.nights))) return false;
  }

  if (filters.suitableFor) {
    const target = normalizeComboFilterValue(filters.suitableFor);
    const haystack = normalizeComboFilterValue(`${combo.suitable_for || ""} ${combo.name || ""}`);
    if (!haystack.includes(target)) return false;
  }

  return true;
}

function sortCombos(combos, sort) {
  const nextCombos = [...combos];
  if (sort === "price") {
    return nextCombos.sort((left, right) => left.base_price - right.base_price);
  }
  if (sort === "price_desc") {
    return nextCombos.sort((left, right) => right.base_price - left.base_price);
  }
  return nextCombos.sort((left, right) => left.display_order - right.display_order || left.base_price - right.base_price);
}

// -- GET /combos ---------------------------------------------------------------
router.get("/", async (req, res) => {
  try {
    const { error, value } = comboQuerySchema.validate(req.query);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    const combos = await Combo.find(buildActiveComboFilter(new Date())).lean();
    const filteredCombos = sortCombos(
      combos.filter((combo) => comboMatchesFilters(combo, value)),
      value.sort,
    );

    res.json({ combos: filteredCombos.map(serializeCombo) });
  } catch (error) {
    console.error("List combos error:", error);
    res.status(500).json({ error: "Failed to fetch combos" });
  }
});

// -- GET /combos/:slug ---------------------------------------------------------
router.get("/:slug", async (req, res) => {
  try {
    const slug = String(req.params.slug || "").trim().toLowerCase();
    const combo = await Combo.findOne({ slug, ...buildActiveComboFilter(new Date()) }).lean();
    if (!combo) {
      return res.status(404).json({ error: "Không tìm thấy combo." });
    }

    const relatedCombos = await Combo.find({
      _id: { $ne: combo._id },
      ...buildActiveComboFilter(new Date()),
    })
      .sort({ display_order: 1, base_price: 1 })
      .limit(3)
      .lean();

    res.json({
      combo: serializeCombo(combo),
      relatedCombos: relatedCombos.map(serializeCombo),
    });
  } catch (error) {
    console.error("Combo detail error:", error);
    res.status(500).json({ error: "Failed to fetch combo" });
  }
});

export default router;
