import test from "node:test";
import assert from "node:assert/strict";
import {
  calculateComboSubtotal,
  comboSupportsRoom,
  validateComboForStay,
} from "../services/booking-service/src/services/pricing.service.js";

const doubleRoom = {
  code: "sea-view-double-or-twin-room",
  room_type: "Sea View Double or Twin Room",
  category: "room",
};

test("fixed combo pricing uses base price from DB data", () => {
  const subtotal = calculateComboSubtotal({
    combo: { base_price: 899000, price_type: "fixed" },
    guestCount: 2,
  });

  assert.equal(subtotal, 899000);
});

test("per-person combo pricing multiplies by guest count", () => {
  const subtotal = calculateComboSubtotal({
    combo: { base_price: 2990000, price_type: "per_person" },
    guestCount: 3,
  });

  assert.equal(subtotal, 8970000);
});

test("combo room type matching accepts compatible Bella room aliases", () => {
  assert.equal(
    comboSupportsRoom(
      { room_types_allowed: ["double", "side-sea-view-deluxe-double-room"] },
      doubleRoom,
    ),
    true,
  );
});

test("combo validation rejects inactive combos and guest over max", () => {
  const inactiveError = validateComboForStay({
    combo: {
      is_active: false,
      room_types_allowed: ["double"],
      min_guests: 1,
      max_guests: 2,
      nights: 1,
      duration_label: "2N1Đ",
    },
    room: doubleRoom,
    guestCount: 2,
    nights: 1,
  });
  assert.match(inactiveError, /not active/i);

  const guestError = validateComboForStay({
    combo: {
      is_active: true,
      room_types_allowed: ["double"],
      min_guests: 1,
      max_guests: 2,
      nights: 1,
      duration_label: "2N1Đ",
    },
    room: doubleRoom,
    guestCount: 3,
    nights: 1,
  });
  assert.match(guestError, /up to 2/i);
});
