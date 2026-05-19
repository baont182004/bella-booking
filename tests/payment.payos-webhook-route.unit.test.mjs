import test from "node:test";
import assert from "node:assert/strict";
import { handleProviderWebhook } from "../services/payment-service/src/routes/payment.webhooks.js";
import {
  resetPaymentRuntimeConfigForTests,
} from "../services/payment-service/src/config/paymentConfig.js";
import payosProvider, {
  createPayosSignature,
} from "../services/payment-service/src/providers/payosProvider.js";

const PAYOS_ENV = {
  PAYMENT_PROVIDER: "payos",
  PAYMENT_PUBLIC_BASE_URL: "https://bella-booking-api.example.test",
  FRONTEND_PUBLIC_URL: "https://bella-booking.example.test",
  PAYOS_CLIENT_ID: "payos_client_test",
  PAYOS_API_KEY: "payos_api_key_test",
  PAYOS_CHECKSUM_KEY: "payos_checksum_test",
  PAYOS_RETURN_URL: "https://bella-booking.example.test/payments/return",
  PAYOS_CANCEL_URL: "https://bella-booking.example.test/payments/return",
  PAYOS_WEBHOOK_URL: "https://bella-booking-api.example.test/payments/webhooks/payos",
};

function withPayosEnv(fn) {
  const previousValues = new Map();
  for (const key of Object.keys(PAYOS_ENV)) {
    previousValues.set(key, process.env[key]);
    process.env[key] = PAYOS_ENV[key];
  }
  resetPaymentRuntimeConfigForTests();

  const restore = () => {
    for (const [key, value] of previousValues.entries()) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
    resetPaymentRuntimeConfigForTests();
  };

  return Promise.resolve()
    .then(fn)
    .finally(restore);
}

function createLogger() {
  return {
    info: () => {},
    warn: () => {},
    error: () => {},
  };
}

function createRequest(rawBody) {
  return {
    body: rawBody === null ? Buffer.alloc(0) : Buffer.from(rawBody),
    get: () => undefined,
  };
}

function createResponse() {
  return {
    statusCode: 200,
    payload: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.payload = payload;
      return this;
    },
  };
}

async function callPayosWebhook(rawBody, overrides = {}) {
  const response = createResponse();
  await handleProviderWebhook(createRequest(rawBody), response, "payos", {
    getProvider: () => payosProvider,
    findPaymentReference: async () => null,
    processEvent: async () => {
      throw new Error("processEvent should not be called");
    },
    logger: createLogger(),
    ...overrides,
  });
  return response;
}

function buildPayosWebhook(data, overrides = {}) {
  const payload = {
    code: "00",
    desc: "success",
    success: true,
    data,
    ...overrides,
  };

  return {
    ...payload,
    signature: createPayosSignature(data, PAYOS_ENV.PAYOS_CHECKSUM_KEY),
  };
}

test("payOS webhook route returns 400 for empty body", async () => {
  await withPayosEnv(async () => {
    const response = await callPayosWebhook(null);

    assert.equal(response.statusCode, 400);
    assert.match(response.payload.error, /body is required/i);
  });
});

test("payOS webhook route returns 400 for invalid signature", async () => {
  await withPayosEnv(async () => {
    const webhook = buildPayosWebhook({
      orderCode: 123456789,
      amount: 1728000,
      currency: "VND",
      code: "00",
      desc: "Thành công",
    });

    const response = await callPayosWebhook(
      JSON.stringify({
        ...webhook,
        signature: "invalid_signature",
      }),
    );

    assert.equal(response.statusCode, 400);
    assert.match(response.payload.error, /signature/i);
  });
});

test("payOS valid confirm webhook without a matching payment returns 200", async () => {
  await withPayosEnv(async () => {
    const webhook = buildPayosWebhook({
      orderCode: 123456789,
      amount: 3000,
      description: "VQRIO123",
      accountNumber: "12345678",
      reference: "TF230204212323",
      transactionDateTime: "2026-05-19 10:00:00",
      currency: "VND",
      paymentLinkId: "124c33293c43417ab7879e14c8d9eb18",
      code: "00",
      desc: "Thành công",
    });

    const response = await callPayosWebhook(JSON.stringify(webhook));

    assert.equal(response.statusCode, 200);
    assert.equal(response.payload.received, true);
    assert.equal(response.payload.ignored, true);
    assert.equal(response.payload.reason, "payment_not_found");
  });
});

test("payOS duplicate webhook returns 200 idempotently", async () => {
  await withPayosEnv(async () => {
    const webhook = buildPayosWebhook({
      orderCode: 123456789,
      amount: 1728000,
      currency: "VND",
      paymentLinkId: "payos_link_123",
      code: "00",
      desc: "Thành công",
    });

    const response = await callPayosWebhook(JSON.stringify(webhook), {
      findPaymentReference: async () => ({
        _id: "payment_123",
        booking_id: "booking_123",
      }),
      processEvent: async () => ({
        duplicate: true,
      }),
    });

    assert.equal(response.statusCode, 200);
    assert.equal(response.payload.received, true);
    assert.equal(response.payload.duplicate, true);
  });
});

test("payOS paid webhook with a matching payment returns succeeded payment and confirmed booking", async () => {
  await withPayosEnv(async () => {
    const webhook = buildPayosWebhook({
      orderCode: 123456789,
      amount: 1728000,
      currency: "VND",
      paymentLinkId: "payos_link_123",
      reference: "TF123",
      code: "00",
      desc: "Thành công",
    });

    let processedEvent = null;
    const response = await callPayosWebhook(JSON.stringify(webhook), {
      findPaymentReference: async () => ({
        _id: "payment_123",
        booking_id: "booking_123",
      }),
      processEvent: async ({ normalizedEvent }) => {
        processedEvent = normalizedEvent;
        return {
          duplicate: false,
          payment: {
            status: "succeeded",
          },
          booking: {
            status: "confirmed",
          },
        };
      },
    });

    assert.equal(processedEvent.status, "succeeded");
    assert.equal(response.statusCode, 200);
    assert.equal(response.payload.paymentStatus, "succeeded");
    assert.equal(response.payload.bookingStatus, "confirmed");
  });
});
