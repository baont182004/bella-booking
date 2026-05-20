import test, { before } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHmac, randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import jwt from "../services/user-service/node_modules/jsonwebtoken/index.js";

const baseUrls = {
  user: process.env.USER_SERVICE_URL || "http://localhost:3001",
  hotel: process.env.HOTEL_SERVICE_URL || "http://localhost:3002",
  booking: process.env.BOOKING_SERVICE_URL || "http://localhost:3003",
  payment: process.env.PAYMENT_SERVICE_URL || "http://localhost:3004",
};

const state = {
  userToken: "",
  adminToken: "",
  otherUserToken: "",
  qaToken: "",
  hotelId: "",
  roomId: "",
  createdBookingId: "",
  createdBookingReference: "",
  createdBookingRequestCode: "",
  createdPaymentId: "",
  createdCheckoutSessionId: "",
  retryCheckoutSessionId: "",
};

function loadRootEnv() {
  const envPath = path.join(process.cwd(), ".env");
  if (!existsSync(envPath)) {
    return;
  }

  const contents = readFileSync(envPath, "utf8");
  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const separatorIndex = line.indexOf("=");
    if (separatorIndex < 0) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1).trim();
    process.env[key] = value;
  }
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function request(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });

  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }

  return { status: response.status, body };
}

async function waitForHealthyService(name, baseUrl, timeoutMs = 90000) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;

  while (Date.now() < deadline) {
    try {
      const healthResponse = await request(`${baseUrl}/health`);
      const status =
        healthResponse.body?.status ||
        healthResponse.body?.data?.status ||
        healthResponse.body?.data?.service;
      const serviceName =
        healthResponse.body?.service ||
        healthResponse.body?.data?.service ||
        "";
      if (
        healthResponse.status === 200 &&
        (status === "healthy" || status === "ok") &&
        (!serviceName || String(serviceName).includes(name))
      ) {
        return;
      }

      lastError = new Error(
        `${name} health returned ${healthResponse.status} ${JSON.stringify(healthResponse.body)}`,
      );
    } catch (error) {
      lastError = error;
    }

    await sleep(1000);
  }

  throw new Error(`Timed out waiting for ${name} to become healthy: ${lastError?.message || "unknown error"}`);
}

async function createBooking(token, overrides = {}) {
  return request(`${baseUrls.booking}/bookings`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      roomId: state.roomId,
      checkInDate: "2026-09-10",
      checkOutDate: "2026-09-12",
      numGuests: 2,
      guestFullName: "Lana Nguyen",
      guestEmail: "lana.nguyen@example.com",
      guestPhone: "+84901234567",
      ...overrides,
    }),
  });
}

function getMockWebhookSecret() {
  return process.env.MOCK_PAYMENT_WEBHOOK_SECRET || "bella-mock-webhook-secret";
}

function buildMockWebhookSignature(rawBody, timestamp = Math.floor(Date.now() / 1000)) {
  const signature = createHmac("sha256", getMockWebhookSecret())
    .update(`${timestamp}.${rawBody}`)
    .digest("hex");

  return `t=${timestamp},v1=${signature}`;
}

function buildMockWebhookEvent({
  bookingId,
  sessionId,
  intentId,
  paymentId = `mock_pay_${randomUUID().replace(/-/g, "").slice(0, 16)}`,
  type,
  amount,
  currency = "VND",
  cardBrand = null,
  cardLast4 = null,
  failureCode = null,
  failureMessage = null,
}) {
  return {
    id: `evt_${randomUUID().replace(/-/g, "").slice(0, 24)}`,
    type,
    created: Math.floor(Date.now() / 1000),
    data: {
      object: {
        bookingId,
        paymentId,
        paymentIntentId: intentId,
        sessionId,
        amount,
        currency,
        paymentMethod: {
          type: cardBrand ? "card" : "hosted_checkout",
          brand: cardBrand,
          last4: cardLast4,
        },
        billingDetails: {
          name: "Lana Nguyen",
          email: "lana.nguyen@example.com",
        },
        failureCode,
        failureMessage,
        riskFlags: [],
      },
    },
  };
}

before(async () => {
  loadRootEnv();

  await Promise.all(
    Object.entries(baseUrls).map(([name, baseUrl]) => waitForHealthyService(name, baseUrl)),
  );

  execFileSync(process.execPath, ["scripts/reset-demo-data.mjs"], {
    stdio: "inherit",
  });

  const userLogin = await request(`${baseUrls.user}/auth/login`, {
    method: "POST",
    body: JSON.stringify({
      email: "lana.nguyen@example.com",
      password: "Password123!",
    }),
  });
  const adminLogin = await request(`${baseUrls.user}/auth/login`, {
    method: "POST",
    body: JSON.stringify({
      email: "admin.bella@example.com",
      password: "Password123!",
    }),
  });
  const otherUserLogin = await request(`${baseUrls.user}/auth/login`, {
    method: "POST",
    body: JSON.stringify({
      email: "minh.tran@example.com",
      password: "Password123!",
    }),
  });

  assert.equal(userLogin.status, 200);
  assert.equal(adminLogin.status, 200);
  assert.equal(otherUserLogin.status, 200);

  state.userToken = userLogin.body.token;
  state.adminToken = adminLogin.body.token;
  state.otherUserToken = otherUserLogin.body.token;

  const hotels = await request(`${baseUrls.hotel}/hotels`);
  assert.equal(hotels.status, 200);
  state.hotelId = hotels.body.hotels[0].id;

  const rooms = await request(`${baseUrls.hotel}/hotels/${state.hotelId}/rooms?available=true`);
  assert.equal(rooms.status, 200);
  state.roomId = rooms.body.rooms[0].id;
});

test("register and login flow works", async () => {
  const registerResponse = await request(`${baseUrls.user}/auth/register`, {
    method: "POST",
    body: JSON.stringify({
      email: "qa.bella@example.com",
      password: "Password123!",
      firstName: "QA",
      lastName: "Bella",
      phone: "+84 900 000 000",
    }),
  });

  assert.equal(registerResponse.status, 201);
  assert.equal(registerResponse.body.user.role, "customer");
  state.qaToken = registerResponse.body.token;

  const loginResponse = await request(`${baseUrls.user}/auth/login`, {
    method: "POST",
    body: JSON.stringify({
      email: "qa.bella@example.com",
      password: "Password123!",
    }),
  });

  assert.equal(loginResponse.status, 200);
  assert.ok(loginResponse.body.token);
});

test("weak passwords and duplicate registration are rejected", async () => {
  const weakPasswordResponse = await request(`${baseUrls.user}/auth/register`, {
    method: "POST",
    body: JSON.stringify({
      email: "weak.qa@example.com",
      password: "12345678",
      firstName: "Weak",
      lastName: "QA",
    }),
  });
  assert.equal(weakPasswordResponse.status, 400);

  const duplicateRegisterResponse = await request(`${baseUrls.user}/auth/register`, {
    method: "POST",
    body: JSON.stringify({
      email: "qa.bella@example.com",
      password: "Password123!",
      firstName: "QA",
      lastName: "Bella",
    }),
  });
  assert.equal(duplicateRegisterResponse.status, 409);
});

test("protected routes reject anonymous requests", async () => {
  const profileResponse = await request(`${baseUrls.user}/users/profile`);
  assert.equal(profileResponse.status, 401);
});

test("malformed or wrong-audience tokens are rejected", async () => {
  const malformedTokenResponse = await request(`${baseUrls.user}/users/profile`, {
    headers: { Authorization: "Bearer definitely-not-a-jwt" },
  });
  assert.equal(malformedTokenResponse.status, 401);

  const wrongAudienceToken = jwt.sign(
    {
      id: "bad-user-id",
      email: "bad@example.com",
      role: "customer",
      sessionVersion: 0,
    },
    process.env.JWT_SECRET,
    {
      expiresIn: "1h",
      issuer: "bella-user-service",
      audience: "wrong-audience",
    },
  );

  const wrongAudienceResponse = await request(`${baseUrls.user}/users/profile`, {
    headers: { Authorization: `Bearer ${wrongAudienceToken}` },
  });
  assert.equal(wrongAudienceResponse.status, 401);
});

test("admin-only routes block non-admins", async () => {
  const roomCreateResponse = await request(
    `${baseUrls.hotel}/hotels/${state.hotelId}/rooms`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${state.userToken}` },
      body: JSON.stringify({
        roomNumber: "BLOCKED-1",
        roomType: "Blocked Test Room",
        pricePerNight: 1000000,
        capacity: 2,
      }),
    },
  );

  assert.equal(roomCreateResponse.status, 403);
});

test("availability endpoint returns promo-adjusted pricing", async () => {
  const availabilityResponse = await request(
    `${baseUrls.booking}/bookings/availability?roomId=${state.roomId}&checkInDate=2026-09-10&checkOutDate=2026-09-12&numGuests=2&promotionCode=BELLA10`,
  );

  assert.equal(availabilityResponse.status, 200);
  assert.equal(availabilityResponse.body.available, true);
  assert.equal(availabilityResponse.body.discountAmount, 192000);
  assert.equal(availabilityResponse.body.totalPrice, 1728000);
});

test("booking creation stores reference and promo server-side", async () => {
  const bookingResponse = await createBooking(state.userToken, {
    promotionCode: "BELLA10",
  });

  assert.equal(bookingResponse.status, 201);
  assert.match(bookingResponse.body.booking.bookingReference, /^BEL-/);
  assert.equal(bookingResponse.body.booking.totalPrice, 1728000);
  assert.equal(bookingResponse.body.booking.promotion.code, "BELLA10");

  state.createdBookingId = bookingResponse.body.booking.id;
  state.createdBookingReference = bookingResponse.body.booking.bookingReference;
});

test("landing booking request stores lead context without payment", async () => {
  const leadResponse = await request(`${baseUrls.booking}/bookings/booking-requests`, {
    method: "POST",
    body: JSON.stringify({
      roomId: state.roomId,
      roomCode: "bella-test-room",
      roomName: "Bella Test Room",
      checkInDate: "2026-10-10",
      checkOutDate: "2026-10-12",
      numGuests: 2,
      guestFullName: "Landing Guest",
      guestPhone: "+84901234567",
      guestArea: "TP.HCM",
      guestEmail: "landing.guest@example.com",
      noCombo: true,
      comboName: "Không chọn combo",
      estimatedTotal: 1200000,
      note: "Muốn nhân viên gọi lại.",
      context: {
        landingPath: "/rooms/bella-test-room?checkIn=2026-10-10&checkOut=2026-10-12#book",
        roomIsLive: true,
        roomSlug: "bella-test-room",
        roomPrice: 600000,
        roomCapacity: 2,
        roomBedSummary: "1 giường đôi",
      },
    }),
  });

  assert.equal(leadResponse.status, 201);
  assert.equal(leadResponse.body.success, true);
  assert.match(leadResponse.body.requestCode, /^BRQ-/);
  assert.equal(leadResponse.body.reservationRequest.requestCode, leadResponse.body.requestCode);
  assert.match(leadResponse.body.bookingRequest.requestReference, /^BRQ-/);
  assert.equal(leadResponse.body.bookingRequest.requestCode, leadResponse.body.requestCode);
  assert.equal(leadResponse.body.bookingRequest.status, "new");
  assert.equal(leadResponse.body.bookingRequest.noCombo, true);
  assert.equal(leadResponse.body.bookingRequest.guestContact.phone, "+84901234567");
  assert.equal(leadResponse.body.bookingRequest.combo.name, "Không chọn combo");
  assert.equal(leadResponse.body.bookingRequest.context.roomSlug, "bella-test-room");
  assert.equal(leadResponse.body.paymentUrl, undefined);
  assert.equal(leadResponse.body.checkoutSession, undefined);
  assert.equal(leadResponse.body.booking, undefined);
  assert.equal(leadResponse.body.bookingRequest.payment, undefined);
  state.createdBookingRequestCode = leadResponse.body.requestCode;
});

test("landing booking request validates payload and combo consistency", async () => {
  const invalidPhoneResponse = await request(`${baseUrls.booking}/bookings/booking-requests`, {
    method: "POST",
    body: JSON.stringify({
      roomId: state.roomId,
      roomName: "Bella Test Room",
      checkInDate: "2026-10-10",
      checkOutDate: "2026-10-12",
      numGuests: 2,
      guestFullName: "Landing Guest",
      guestPhone: "abc",
      guestArea: "TP.HCM",
      noCombo: true,
    }),
  });
  assert.equal(invalidPhoneResponse.status, 400);
  assert.equal(invalidPhoneResponse.body.success, false);
  assert.match(invalidPhoneResponse.body.error, /phone/i);
  assert.ok(Array.isArray(invalidPhoneResponse.body.details));

  const invalidDatesResponse = await request(`${baseUrls.booking}/bookings/booking-requests`, {
    method: "POST",
    body: JSON.stringify({
      roomId: state.roomId,
      roomName: "Bella Test Room",
      checkInDate: "2026-10-12",
      checkOutDate: "2026-10-10",
      numGuests: 2,
      guestFullName: "Landing Guest",
      guestPhone: "+84901234567",
      guestArea: "TP.HCM",
      noCombo: true,
    }),
  });
  assert.equal(invalidDatesResponse.status, 400);
  assert.match(invalidDatesResponse.body.error, /Ngày trả phòng/i);

  const comboConflictResponse = await request(`${baseUrls.booking}/bookings/booking-requests`, {
    method: "POST",
    body: JSON.stringify({
      roomId: state.roomId,
      roomName: "Bella Test Room",
      checkInDate: "2026-10-10",
      checkOutDate: "2026-10-12",
      numGuests: 2,
      guestFullName: "Landing Guest",
      guestPhone: "+84901234567",
      guestArea: "TP.HCM",
      noCombo: true,
      comboSlug: "some-combo",
    }),
  });
  assert.equal(comboConflictResponse.status, 400);
  assert.match(comboConflictResponse.body.error, /no combo|selected combo/i);

  const comboNameConflictResponse = await request(`${baseUrls.booking}/bookings/booking-requests`, {
    method: "POST",
    body: JSON.stringify({
      roomId: state.roomId,
      roomName: "Bella Test Room",
      checkInDate: "2026-10-10",
      checkOutDate: "2026-10-12",
      numGuests: 2,
      guestFullName: "Landing Guest",
      guestPhone: "+84901234567",
      guestArea: "TP.HCM",
      noCombo: true,
      comboName: "Combo spa",
    }),
  });
  assert.equal(comboNameConflictResponse.status, 400);
  assert.match(comboNameConflictResponse.body.error, /no combo|selected combo/i);
});

test("landing booking request accepts a selected existing combo", async () => {
  const combosResponse = await request(`${baseUrls.booking}/bookings/combos`);
  assert.equal(combosResponse.status, 200);
  const combo = combosResponse.body.combos[0];
  assert.ok(combo?.slug);

  const leadResponse = await request(`${baseUrls.booking}/bookings/booking-requests`, {
    method: "POST",
    body: JSON.stringify({
      roomId: state.roomId,
      roomName: "Bella Test Room",
      checkInDate: "2026-10-14",
      checkOutDate: "2026-10-16",
      numGuests: 2,
      guestFullName: "Combo Guest",
      guestPhone: "+84907654321",
      guestArea: "Hà Nội",
      noCombo: false,
      comboSlug: combo.slug,
    }),
  });

  assert.equal(leadResponse.status, 201);
  assert.equal(leadResponse.body.bookingRequest.noCombo, false);
  assert.equal(leadResponse.body.bookingRequest.combo.slug, combo.slug);
});

test("landing booking request accepts public payload aliases", async () => {
  const leadResponse = await request(`${baseUrls.booking}/bookings/booking-requests`, {
    method: "POST",
    body: JSON.stringify({
      roomTypeId: "family-suite",
      roomTypeName: "Family Suite",
      checkInDate: "2026-10-18",
      checkOutDate: "2026-10-20",
      guests: 3,
      fullName: "Alias Guest",
      phone: "+84901112233",
      address: "Đà Nẵng",
      noCombo: true,
    }),
  });

  assert.equal(leadResponse.status, 201);
  assert.equal(leadResponse.body.bookingRequest.guestContact.fullName, "Alias Guest");
  assert.equal(leadResponse.body.bookingRequest.guestContact.phone, "+84901112233");
  assert.equal(leadResponse.body.bookingRequest.numGuests, 3);
  assert.equal(leadResponse.body.bookingRequest.roomName, "Family Suite");
  assert.equal(leadResponse.body.bookingRequest.noCombo, true);
});

test("admin booking request list is protected and includes lead fields", async () => {
  const publicResponse = await request(`${baseUrls.booking}/bookings/booking-requests`);
  assert.equal(publicResponse.status, 401);

  const customerResponse = await request(`${baseUrls.booking}/bookings/booking-requests`, {
    headers: { Authorization: `Bearer ${state.userToken}` },
  });
  assert.equal(customerResponse.status, 403);

  const adminResponse = await request(`${baseUrls.booking}/bookings/booking-requests`, {
    headers: { Authorization: `Bearer ${state.adminToken}` },
  });
  assert.equal(adminResponse.status, 200);
  const createdLead = adminResponse.body.bookingRequests.find(
    (requestItem) => requestItem.requestReference === state.createdBookingRequestCode,
  );
  assert.ok(createdLead);
  assert.equal(createdLead.guestContact.fullName, "Landing Guest");
  assert.equal(createdLead.guestContact.phone, "+84901234567");
  assert.ok(createdLead.roomName);
  assert.equal(createdLead.combo.name, "Không chọn combo");

  const detailResponse = await request(`${baseUrls.booking}/bookings/booking-requests/${createdLead.id}`, {
    headers: { Authorization: `Bearer ${state.adminToken}` },
  });
  assert.equal(detailResponse.status, 200);
  assert.equal(detailResponse.body.bookingRequest.requestReference, state.createdBookingRequestCode);

  const statusResponse = await request(`${baseUrls.booking}/bookings/booking-requests/${createdLead.id}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${state.adminToken}` },
    body: JSON.stringify({ status: "contacted", internalNote: "Called guest once." }),
  });
  assert.equal(statusResponse.status, 200);
  assert.equal(statusResponse.body.bookingRequest.status, "contacted");
  assert.equal(statusResponse.body.bookingRequest.internalNote, "Called guest once.");

  const auditResponse = await request(`${baseUrls.booking}/bookings/audit-logs`, {
    headers: { Authorization: `Bearer ${state.adminToken}` },
  });
  assert.equal(auditResponse.status, 200);
  assert.ok(
    auditResponse.body.logs.some((log) => log.action === "sensitive.booking_request.list_viewed"),
  );
  assert.ok(
    auditResponse.body.logs.some((log) => log.action === "sensitive.booking_request.detail_viewed"),
  );
});

test("booking creation rejects missing rooms and invalid stay dates", async () => {
  const missingRoomResponse = await createBooking(state.userToken, {
    roomId: "66f0aa00000000000000ffff",
    checkInDate: "2026-12-01",
    checkOutDate: "2026-12-03",
  });
  assert.equal(missingRoomResponse.status, 404);

  const invalidDatesResponse = await createBooking(state.userToken, {
    checkInDate: "2026-12-05",
    checkOutDate: "2026-12-05",
  });
  assert.equal(invalidDatesResponse.status, 400);
});

test("overlapping bookings are rejected", async () => {
  const overlapResponse = await createBooking(state.userToken, {
    checkInDate: "2026-09-11",
    checkOutDate: "2026-09-13",
    guestPhone: undefined,
  });

  assert.equal(overlapResponse.status, 409);
});

test("public lookup finds bookings by reference and email", async () => {
  const lookupResponse = await request(
    `${baseUrls.booking}/bookings/lookup?reference=${state.createdBookingReference}&email=lana.nguyen@example.com`,
  );

  assert.equal(lookupResponse.status, 200);
  assert.equal(lookupResponse.body.booking.bookingReference, state.createdBookingReference);
});

test("invalid promotion codes are rejected", async () => {
  const invalidPromoResponse = await createBooking(state.userToken, {
    checkInDate: "2026-10-01",
    checkOutDate: "2026-10-03",
    promotionCode: "NOTREAL",
  });

  assert.equal(invalidPromoResponse.status, 400);
});

test("invalid admin promotion payloads are rejected", async () => {
  const invalidPromotionResponse = await request(`${baseUrls.booking}/bookings/promotions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${state.adminToken}` },
    body: JSON.stringify({
      code: "INVALIDPROMO",
      name: "Invalid Promo",
      description: "Should fail validation",
      type: "percentage",
      value: 120,
      minNights: 1,
      minSpend: 0,
      activeFrom: "2026-12-31T00:00:00.000Z",
      activeTo: "2026-01-01T00:00:00.000Z",
      eligibleRoomCodes: [],
      isActive: true,
    }),
  });

  assert.equal(invalidPromotionResponse.status, 400);
});

test("frontend payment flow uses hosted checkout instead of app-owned payment capture", () => {
  const bookingsSource = readFileSync(
    path.join(process.cwd(), "frontend", "src", "pages", "Bookings.jsx"),
    "utf8",
  );
  const roomDetailSource = readFileSync(
    path.join(process.cwd(), "frontend", "src", "pages", "RoomDetailPage.jsx"),
    "utf8",
  );

  assert.match(bookingsSource, /\/payments\/checkout-sessions/);
  assert.match(bookingsSource, /Tiếp tục thanh toán/i);
  assert.match(roomDetailSource, /\/bookings\/booking-requests/);
  assert.doesNotMatch(roomDetailSource, /post\("\/booking-requests"/);
  assert.doesNotMatch(roomDetailSource, /roomSlug/);
  assert.doesNotMatch(roomDetailSource, /\/payments\/checkout-sessions/);
  assert.match(roomDetailSource, /không tạo payment link/i);
});

test("legacy direct payment endpoint is retired and hosted checkout session is created instead", async () => {
  const legacyPaymentAttempt = await request(`${baseUrls.payment}/payments`, {
    method: "POST",
    headers: { Authorization: `Bearer ${state.userToken}` },
    body: JSON.stringify({
      bookingId: state.createdBookingId,
      legacyFlow: true,
    }),
  });

  assert.equal(legacyPaymentAttempt.status, 410);

  const forbiddenCheckout = await request(`${baseUrls.payment}/payments/checkout`, {
    method: "POST",
    headers: { Authorization: `Bearer ${state.otherUserToken}` },
    body: JSON.stringify({
      bookingId: state.createdBookingId,
    }),
  });
  assert.equal(forbiddenCheckout.status, 403);

  const checkoutWithClientAmount = await request(`${baseUrls.payment}/payments/checkout`, {
    method: "POST",
    headers: { Authorization: `Bearer ${state.userToken}` },
    body: JSON.stringify({
      bookingId: state.createdBookingId,
      amount: 1,
    }),
  });
  assert.equal(checkoutWithClientAmount.status, 400);

  const checkoutSessionResponse = await request(`${baseUrls.payment}/payments/checkout-sessions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${state.userToken}` },
    body: JSON.stringify({
      bookingId: state.createdBookingId,
      billingName: "Lana Nguyen",
      billingEmail: "lana.nguyen@example.com",
    }),
  });

  assert.equal(checkoutSessionResponse.status, 201);
  assert.equal(checkoutSessionResponse.body.payment.paymentStatus, "pending");
  assert.equal(checkoutSessionResponse.body.payment.cardLast4, null);
  assert.ok(checkoutSessionResponse.body.checkoutSession.checkoutUrl);

  state.createdPaymentId = checkoutSessionResponse.body.payment.id;
  state.createdCheckoutSessionId = checkoutSessionResponse.body.checkoutSession.sessionId;
});

test("booking remains pending_payment until a verified webhook confirms payment", async () => {
  const bookingBeforeWebhook = await request(
    `${baseUrls.booking}/bookings/${state.createdBookingId}`,
    {
      headers: { Authorization: `Bearer ${state.userToken}` },
    },
  );
  assert.equal(bookingBeforeWebhook.status, 200);
  assert.equal(bookingBeforeWebhook.body.booking.status, "pending_payment");

  const paymentBeforeWebhook = await request(
    `${baseUrls.payment}/payments/booking/${state.createdBookingId}`,
    {
      headers: { Authorization: `Bearer ${state.userToken}` },
    },
  );
  assert.equal(paymentBeforeWebhook.status, 200);
  assert.equal(paymentBeforeWebhook.body.payment.paymentStatus, "pending");
});

test("webhook signature rejection, failure path, retry path, and idempotency are enforced", async () => {
  const invalidWebhookPayload = JSON.stringify({
    id: "evt_invalid_signature",
    type: "checkout.session.completed",
    data: { object: { sessionId: state.createdCheckoutSessionId } },
  });

  const invalidWebhook = await request(`${baseUrls.payment}/payments/webhooks/mock`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-bella-mock-signature": "t=1,v1=invalid",
    },
    body: invalidWebhookPayload,
  });
  assert.equal(invalidWebhook.status, 400);

  const staleWebhook = await request(`${baseUrls.payment}/payments/webhooks/mock`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-bella-mock-signature": buildMockWebhookSignature(
        invalidWebhookPayload,
        Math.floor(Date.now() / 1000) - 601,
      ),
    },
    body: invalidWebhookPayload,
  });
  assert.equal(staleWebhook.status, 400);

  const paymentBeforeFailure = await request(
    `${baseUrls.payment}/payments/booking/${state.createdBookingId}`,
    {
      headers: { Authorization: `Bearer ${state.userToken}` },
    },
  );
  assert.equal(paymentBeforeFailure.status, 200);

  const failedEvent = buildMockWebhookEvent({
    bookingId: state.createdBookingId,
    sessionId: state.createdCheckoutSessionId,
    intentId: paymentBeforeFailure.body.payment.providerIntentId,
    paymentId: paymentBeforeFailure.body.payment.providerPaymentId || undefined,
    type: "payment_intent.payment_failed",
    amount: paymentBeforeFailure.body.payment.amount,
    failureCode: "card_declined",
    failureMessage: "Sandbox card was declined by the mock provider.",
  });
  const failedEventRaw = JSON.stringify(failedEvent);

  const failedWebhook = await request(`${baseUrls.payment}/payments/webhook`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-bella-mock-signature": buildMockWebhookSignature(failedEventRaw),
    },
    body: failedEventRaw,
  });
  assert.equal(failedWebhook.status, 200);
  assert.equal(failedWebhook.body.duplicate, false);

  const paymentAfterFailure = await request(
    `${baseUrls.payment}/payments/booking/${state.createdBookingId}`,
    {
      headers: { Authorization: `Bearer ${state.userToken}` },
    },
  );
  assert.equal(paymentAfterFailure.status, 200);
  assert.equal(paymentAfterFailure.body.payment.paymentStatus, "failed");
  assert.equal(paymentAfterFailure.body.payment.failureCode, "card_declined");
  assert.equal(paymentAfterFailure.body.payment.cardLast4, null);

  const bookingAfterFailure = await request(
    `${baseUrls.booking}/bookings/${state.createdBookingId}`,
    {
      headers: { Authorization: `Bearer ${state.userToken}` },
    },
  );
  assert.equal(bookingAfterFailure.status, 200);
  assert.equal(bookingAfterFailure.body.booking.status, "payment_failed");

  const retryCheckoutSession = await request(`${baseUrls.payment}/payments/checkout-sessions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${state.userToken}` },
    body: JSON.stringify({
      bookingId: state.createdBookingId,
    }),
  });
  assert.equal(retryCheckoutSession.status, 201);
  assert.equal(retryCheckoutSession.body.payment.paymentStatus, "pending");
  state.retryCheckoutSessionId = retryCheckoutSession.body.checkoutSession.sessionId;

  const staleSessionStatus = await request(
    `${baseUrls.payment}/payments/checkout-sessions/${state.createdCheckoutSessionId}/status`,
    {
      headers: { Authorization: `Bearer ${state.userToken}` },
    },
  );
  assert.equal(staleSessionStatus.status, 404);

  const successfulEvent = buildMockWebhookEvent({
    bookingId: state.createdBookingId,
    sessionId: state.retryCheckoutSessionId,
    intentId: retryCheckoutSession.body.payment.providerIntentId,
    paymentId: retryCheckoutSession.body.payment.providerPaymentId || undefined,
    type: "checkout.session.completed",
    amount: retryCheckoutSession.body.payment.amount,
    cardBrand: "visa",
    cardLast4: "4242",
  });
  const successfulEventRaw = JSON.stringify(successfulEvent);

  const successfulWebhook = await request(`${baseUrls.payment}/payments/webhook`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-bella-mock-signature": buildMockWebhookSignature(successfulEventRaw),
    },
    body: successfulEventRaw,
  });
  assert.equal(successfulWebhook.status, 200);
  assert.equal(successfulWebhook.body.duplicate, false);

  const duplicateWebhook = await request(`${baseUrls.payment}/payments/webhook`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-bella-mock-signature": buildMockWebhookSignature(successfulEventRaw),
    },
    body: successfulEventRaw,
  });
  assert.equal(duplicateWebhook.status, 200);
  assert.equal(duplicateWebhook.body.duplicate, true);

  const paymentAfterSuccess = await request(
    `${baseUrls.payment}/payments/booking/${state.createdBookingId}`,
    {
      headers: { Authorization: `Bearer ${state.userToken}` },
    },
  );
  assert.equal(paymentAfterSuccess.status, 200);
  assert.equal(paymentAfterSuccess.body.payment.paymentStatus, "succeeded");
  assert.equal(paymentAfterSuccess.body.payment.cardLast4, "4242");
  assert.equal(paymentAfterSuccess.body.payment.cardBrand, "visa");
  assert.equal(paymentAfterSuccess.body.payment.providerSessionId, state.retryCheckoutSessionId);

  const bookingAfterSuccess = await request(
    `${baseUrls.booking}/bookings/${state.createdBookingId}`,
    {
      headers: { Authorization: `Bearer ${state.userToken}` },
    },
  );
  assert.equal(bookingAfterSuccess.status, 200);
  assert.equal(bookingAfterSuccess.body.booking.status, "confirmed");
  assert.equal(bookingAfterSuccess.body.booking.payment.status, "succeeded");

  const repayConfirmedBooking = await request(`${baseUrls.payment}/payments/checkout`, {
    method: "POST",
    headers: { Authorization: `Bearer ${state.userToken}` },
    body: JSON.stringify({
      bookingId: state.createdBookingId,
    }),
  });
  assert.equal(repayConfirmedBooking.status, 409);
});

test("webhook success with mismatched amount does not confirm the booking", async () => {
  const mismatchBooking = await createBooking(state.userToken, {
    checkInDate: "2026-10-05",
    checkOutDate: "2026-10-07",
  });
  assert.equal(mismatchBooking.status, 201);

  const checkout = await request(`${baseUrls.payment}/payments/checkout`, {
    method: "POST",
    headers: { Authorization: `Bearer ${state.userToken}` },
    body: JSON.stringify({
      bookingId: mismatchBooking.body.booking.id,
    }),
  });
  assert.equal(checkout.status, 201);

  const mismatchedEvent = buildMockWebhookEvent({
    bookingId: mismatchBooking.body.booking.id,
    sessionId: checkout.body.checkoutSession.sessionId,
    intentId: checkout.body.payment.providerIntentId,
    type: "checkout.session.completed",
    amount: checkout.body.payment.amount - 1000,
    cardBrand: "visa",
    cardLast4: "4242",
  });
  const mismatchedRaw = JSON.stringify(mismatchedEvent);

  const webhookResponse = await request(`${baseUrls.payment}/payments/webhook`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-bella-mock-signature": buildMockWebhookSignature(mismatchedRaw),
    },
    body: mismatchedRaw,
  });
  assert.equal(webhookResponse.status, 200);

  const paymentAfterMismatch = await request(
    `${baseUrls.payment}/payments/booking/${mismatchBooking.body.booking.id}`,
    {
      headers: { Authorization: `Bearer ${state.userToken}` },
    },
  );
  assert.equal(paymentAfterMismatch.status, 200);
  assert.equal(paymentAfterMismatch.body.payment.paymentStatus, "failed");
  assert.equal(paymentAfterMismatch.body.payment.failureCode, "amount_mismatch");
  assert.equal(paymentAfterMismatch.body.booking.status, "payment_failed");

  const bookingAfterMismatch = await request(
    `${baseUrls.booking}/bookings/${mismatchBooking.body.booking.id}`,
    {
      headers: { Authorization: `Bearer ${state.userToken}` },
    },
  );
  assert.equal(bookingAfterMismatch.status, 200);
  assert.equal(bookingAfterMismatch.body.booking.status, "payment_failed");
});

test("concurrent checkout session attempts are harmless", async () => {
  const replayBooking = await createBooking(state.userToken, {
    checkInDate: "2026-10-10",
    checkOutDate: "2026-10-12",
  });
  assert.equal(replayBooking.status, 201);

  const [firstAttempt, secondAttempt] = await Promise.all([
    request(`${baseUrls.payment}/payments/checkout-sessions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${state.userToken}` },
      body: JSON.stringify({ bookingId: replayBooking.body.booking.id }),
    }),
    request(`${baseUrls.payment}/payments/checkout-sessions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${state.userToken}` },
      body: JSON.stringify({ bookingId: replayBooking.body.booking.id }),
    }),
  ]);

  const statuses = [firstAttempt.status, secondAttempt.status].sort((left, right) => left - right);
  assert.ok(
    JSON.stringify(statuses) === JSON.stringify([200, 201]) ||
      JSON.stringify(statuses) === JSON.stringify([201, 409]),
  );
});

test("expired checkout sessions move the booking to expired and cannot be paid again", async () => {
  const expiringBooking = await createBooking(state.userToken, {
    checkInDate: "2026-10-20",
    checkOutDate: "2026-10-22",
  });
  assert.equal(expiringBooking.status, 201);

  const expiringCheckout = await request(`${baseUrls.payment}/payments/checkout-sessions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${state.userToken}` },
    body: JSON.stringify({
      bookingId: expiringBooking.body.booking.id,
    }),
  });
  assert.equal(expiringCheckout.status, 201);

  const expiredEvent = buildMockWebhookEvent({
    bookingId: expiringBooking.body.booking.id,
    sessionId: expiringCheckout.body.checkoutSession.sessionId,
    intentId: expiringCheckout.body.payment.providerIntentId,
    type: "checkout.session.expired",
    amount: expiringCheckout.body.payment.amount,
  });
  const expiredEventRaw = JSON.stringify(expiredEvent);

  const expiredWebhook = await request(`${baseUrls.payment}/payments/webhook`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-bella-mock-signature": buildMockWebhookSignature(expiredEventRaw),
    },
    body: expiredEventRaw,
  });
  assert.equal(expiredWebhook.status, 200);

  const expiredPayment = await request(
    `${baseUrls.payment}/payments/booking/${expiringBooking.body.booking.id}`,
    {
      headers: { Authorization: `Bearer ${state.userToken}` },
    },
  );
  assert.equal(expiredPayment.status, 200);
  assert.equal(expiredPayment.body.payment.paymentStatus, "expired");
  assert.equal(expiredPayment.body.booking.status, "expired");

  const renewedCheckout = await request(`${baseUrls.payment}/payments/checkout-sessions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${state.userToken}` },
    body: JSON.stringify({
      bookingId: expiringBooking.body.booking.id,
    }),
  });
  assert.equal(renewedCheckout.status, 409);
});

test("booking ownership and IDOR protections are enforced", async () => {
  const forbiddenBooking = await request(`${baseUrls.booking}/bookings/${state.createdBookingId}`, {
    headers: { Authorization: `Bearer ${state.otherUserToken}` },
  });

  assert.equal(forbiddenBooking.status, 403);
});

test("password changes revoke old sessions and issue a new token", async () => {
  const passwordChangeResponse = await request(`${baseUrls.user}/users/password`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${state.qaToken}` },
    body: JSON.stringify({
      currentPassword: "Password123!",
      newPassword: "ChangedPassword123!",
    }),
  });
  assert.equal(passwordChangeResponse.status, 200);
  assert.ok(passwordChangeResponse.body.token);

  const oldProfileResponse = await request(`${baseUrls.user}/users/profile`, {
    headers: { Authorization: `Bearer ${state.qaToken}` },
  });
  assert.equal(oldProfileResponse.status, 401);

  const newProfileResponse = await request(`${baseUrls.user}/users/profile`, {
    headers: { Authorization: `Bearer ${passwordChangeResponse.body.token}` },
  });
  assert.equal(newProfileResponse.status, 200);
});

test("refund flow remains admin-only and blocks completed stays", async () => {
  const nonAdminRefundResponse = await request(
    `${baseUrls.payment}/payments/${state.createdPaymentId}/refund`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${state.userToken}` },
    },
  );
  assert.equal(nonAdminRefundResponse.status, 403);

  const paidBooking = await createBooking(state.userToken, {
    checkInDate: "2026-11-10",
    checkOutDate: "2026-11-12",
  });
  assert.equal(paidBooking.status, 201);

  const checkoutResponse = await request(`${baseUrls.payment}/payments/checkout-sessions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${state.userToken}` },
    body: JSON.stringify({
      bookingId: paidBooking.body.booking.id,
    }),
  });
  assert.equal(checkoutResponse.status, 201);

  const paidWebhookEvent = buildMockWebhookEvent({
    bookingId: paidBooking.body.booking.id,
    sessionId: checkoutResponse.body.checkoutSession.sessionId,
    intentId: checkoutResponse.body.payment.providerIntentId,
    type: "checkout.session.completed",
    amount: checkoutResponse.body.payment.amount,
    cardBrand: "mastercard",
    cardLast4: "4444",
  });
  const paidWebhookRaw = JSON.stringify(paidWebhookEvent);

  const paidWebhookResponse = await request(`${baseUrls.payment}/payments/webhook`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-bella-mock-signature": buildMockWebhookSignature(paidWebhookRaw),
    },
    body: paidWebhookRaw,
  });
  assert.equal(paidWebhookResponse.status, 200);

  const markCompletedResponse = await request(
    `${baseUrls.booking}/bookings/${paidBooking.body.booking.id}/status`,
    {
      method: "PUT",
      headers: { Authorization: `Bearer ${state.adminToken}` },
      body: JSON.stringify({ status: "completed" }),
    },
  );
  assert.equal(markCompletedResponse.status, 200);

  const refundResponse = await request(
    `${baseUrls.payment}/payments/${checkoutResponse.body.payment.id}/refund`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${state.adminToken}` },
    },
  );
  assert.equal(refundResponse.status, 409);
});

test("payment endpoints validate identifiers before lookup", async () => {
  const invalidPaymentLookup = await request(`${baseUrls.payment}/payments/not-a-valid-id`, {
    headers: { Authorization: `Bearer ${state.adminToken}` },
  });
  assert.equal(invalidPaymentLookup.status, 400);

  const invalidRefund = await request(`${baseUrls.payment}/payments/not-a-valid-id/refund`, {
    method: "POST",
    headers: { Authorization: `Bearer ${state.adminToken}` },
  });
  assert.equal(invalidRefund.status, 400);
});

test("admin can refund an authorized payment after verified success", async () => {
  const refundableBooking = await createBooking(state.userToken, {
    checkInDate: "2026-11-20",
    checkOutDate: "2026-11-22",
  });
  assert.equal(refundableBooking.status, 201);

  const refundableCheckout = await request(`${baseUrls.payment}/payments/checkout-sessions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${state.userToken}` },
    body: JSON.stringify({
      bookingId: refundableBooking.body.booking.id,
    }),
  });
  assert.equal(refundableCheckout.status, 201);

  const refundableEvent = buildMockWebhookEvent({
    bookingId: refundableBooking.body.booking.id,
    sessionId: refundableCheckout.body.checkoutSession.sessionId,
    intentId: refundableCheckout.body.payment.providerIntentId,
    type: "checkout.session.completed",
    amount: refundableCheckout.body.payment.amount,
    cardBrand: "visa",
    cardLast4: "4242",
  });
  const refundableEventRaw = JSON.stringify(refundableEvent);

  const refundableWebhook = await request(`${baseUrls.payment}/payments/webhook`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-bella-mock-signature": buildMockWebhookSignature(refundableEventRaw),
    },
    body: refundableEventRaw,
  });
  assert.equal(refundableWebhook.status, 200);

  const refundResponse = await request(
    `${baseUrls.payment}/payments/${refundableCheckout.body.payment.id}/refund`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${state.adminToken}` },
    },
  );
  assert.equal(refundResponse.status, 200);
  assert.equal(refundResponse.body.payment.paymentStatus, "refunded");

  const refundedBooking = await request(
    `${baseUrls.booking}/bookings/${refundableBooking.body.booking.id}`,
    {
      headers: { Authorization: `Bearer ${state.userToken}` },
    },
  );
  assert.equal(refundedBooking.status, 200);
  assert.equal(refundedBooking.body.booking.status, "cancelled");
});

test("room deletion archives booked rooms instead of removing history", async () => {
  const deleteRoomResponse = await request(
    `${baseUrls.hotel}/hotels/${state.hotelId}/rooms/${state.roomId}`,
    {
      method: "DELETE",
      headers: { Authorization: `Bearer ${state.adminToken}` },
    },
  );
  assert.equal(deleteRoomResponse.status, 200);
  assert.equal(deleteRoomResponse.body.room.is_active, false);
  assert.equal(deleteRoomResponse.body.room.is_available, false);

  const roomsResponse = await request(`${baseUrls.hotel}/hotels/${state.hotelId}/rooms`);
  assert.equal(roomsResponse.status, 200);
  assert.equal(
    roomsResponse.body.rooms.some((room) => room.id === state.roomId),
    false,
  );

  const historicalLookupResponse = await request(
    `${baseUrls.booking}/bookings/lookup?reference=BEL-20260401-A10001&email=lana.nguyen@example.com`,
  );
  assert.equal(historicalLookupResponse.status, 200);
});

test("logout revokes the current token", async () => {
  const logoutResponse = await request(`${baseUrls.user}/auth/logout`, {
    method: "POST",
    headers: { Authorization: `Bearer ${state.userToken}` },
  });
  assert.equal(logoutResponse.status, 200);

  const revokedProfile = await request(`${baseUrls.user}/users/profile`, {
    headers: { Authorization: `Bearer ${state.userToken}` },
  });
  assert.equal(revokedProfile.status, 401);
});

test("admin room CRUD remains available after hardening", async () => {
  const createRoomResponse = await request(`${baseUrls.hotel}/hotels/${state.hotelId}/rooms`, {
    method: "POST",
    headers: { Authorization: `Bearer ${state.adminToken}` },
    body: JSON.stringify({
      roomNumber: "QA-101",
      roomType: "QA Demo Room",
      description: "Created during integration test.",
      pricePerNight: 1200000,
      capacity: 2,
      amenities: ["wifi"],
      images: [],
      isAvailable: true,
    }),
  });

  assert.equal(createRoomResponse.status, 201);
  const roomId = createRoomResponse.body.room.id;

  const updateRoomResponse = await request(
    `${baseUrls.hotel}/hotels/${state.hotelId}/rooms/${roomId}`,
    {
      method: "PUT",
      headers: { Authorization: `Bearer ${state.adminToken}` },
      body: JSON.stringify({
        pricePerNight: 1250000,
        isAvailable: false,
      }),
    },
  );
  assert.equal(updateRoomResponse.status, 200);
  assert.equal(updateRoomResponse.body.room.is_available, false);

  const deleteRoomResponse = await request(
    `${baseUrls.hotel}/hotels/${state.hotelId}/rooms/${roomId}`,
    {
      method: "DELETE",
      headers: { Authorization: `Bearer ${state.adminToken}` },
    },
  );
  assert.equal(deleteRoomResponse.status, 200);
});
