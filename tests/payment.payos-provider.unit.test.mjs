import test from "node:test";
import assert from "node:assert/strict";
import {
  getPaymentRuntimeConfig,
  resetPaymentRuntimeConfigForTests,
  validatePaymentRuntimeConfig,
} from "../services/payment-service/src/config/paymentConfig.js";
import { getPaymentProvider } from "../services/payment-service/src/providers/index.js";
import payosProvider, {
  createPayosSignature,
  resetPayosFetchFactoryForTests,
  setPayosFetchFactoryForTests,
} from "../services/payment-service/src/providers/payosProvider.js";

const REQUIRED_PAYOS_ENV = {
  PAYMENT_PROVIDER: "payos",
  PAYMENT_PUBLIC_BASE_URL: "https://bella-booking-api.example.test",
  FRONTEND_PUBLIC_URL: "https://bella-booking.example.test",
  PAYOS_CLIENT_ID: "payos_client_test",
  PAYOS_API_KEY: "payos_api_key_test",
  PAYOS_CHECKSUM_KEY: "payos_checksum_test",
  PAYOS_RETURN_URL: "https://bella-booking.example.test/payments/return",
  PAYOS_CANCEL_URL: "https://bella-booking.example.test/payments/return",
  PAYOS_WEBHOOK_URL: "https://bella-booking-api.example.test/payments/webhooks/payos",
  PAYOS_API_BASE_URL: "https://api-merchant.payos.vn",
};

function withPayosEnv(overrides, fn) {
  const previousValues = new Map();
  const keys = new Set([...Object.keys(REQUIRED_PAYOS_ENV), ...Object.keys(overrides)]);

  for (const key of keys) {
    previousValues.set(key, process.env[key]);
  }

  for (const [key, value] of Object.entries({ ...REQUIRED_PAYOS_ENV, ...overrides })) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  resetPaymentRuntimeConfigForTests();
  resetPayosFetchFactoryForTests();

  const restore = () => {
    for (const [key, value] of previousValues.entries()) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
    resetPaymentRuntimeConfigForTests();
    resetPayosFetchFactoryForTests();
  };

  return Promise.resolve()
    .then(fn)
    .finally(restore);
}

const booking = {
  _id: { toString: () => "665000000000000000000001" },
  booking_reference: "BEL-20260518-ABC123",
  guest_email: "guest@example.test",
  guest_full_name: "Bella Guest",
  total_price: 1728000,
  price_snapshot: { currency: "VND" },
};

const payment = {
  _id: { toString: () => "775000000000000000000001" },
  booking_id: { toString: () => "665000000000000000000001" },
  amount: 1,
  currency: "VND",
  billing_email: "tampered@example.test",
  billing_name: "Tampered Amount",
};

function buildSignedPayosWebhook(data, overrides = {}) {
  return {
    code: "00",
    desc: "success",
    success: true,
    data,
    signature: createPayosSignature(data, REQUIRED_PAYOS_ENV.PAYOS_CHECKSUM_KEY),
    ...overrides,
  };
}

test("payment config fails fast when payOS secrets are missing", async () => {
  await withPayosEnv(
    {
      PAYOS_CLIENT_ID: undefined,
      PAYOS_API_KEY: undefined,
      PAYOS_CHECKSUM_KEY: undefined,
    },
    async () => {
      assert.throws(
        () => validatePaymentRuntimeConfig(),
        /PAYOS_CLIENT_ID is required when PAYMENT_PROVIDER=payos/,
      );
    },
  );
});

test("provider registry returns the payOS adapter when configured", async () => {
  await withPayosEnv({}, async () => {
    const provider = getPaymentProvider("payos");
    assert.equal(provider.name, "payos");
    assert.equal(getPaymentRuntimeConfig().provider, "payos");
  });
});

test("payOS checkout creation uses backend booking amount, headers, URLs, and signature", async () => {
  await withPayosEnv({}, async () => {
    const calls = [];
    setPayosFetchFactoryForTests(() => async (url, options) => {
      const body = JSON.parse(options.body);
      calls.push({ url, options, body });
      return {
        ok: true,
        status: 200,
        json: async () => ({
          code: "00",
          desc: "success",
          data: {
            orderCode: body.orderCode,
            paymentLinkId: "payos_link_123",
            checkoutUrl: "https://pay.payos.vn/web/payos_link_123",
            qrCode: "data:image/png;base64,QRDATA",
            amount: body.amount,
            currency: "VND",
            status: "PENDING",
          },
        }),
      };
    });

    const checkoutSession = await payosProvider.createCheckoutSession({
      booking,
      payment,
      billingName: "Bella Guest",
      billingEmail: "guest@example.test",
    });

    assert.equal(checkoutSession.provider, "payos");
    assert.equal(checkoutSession.paymentMethodType, "bank_transfer");
    assert.equal(checkoutSession.checkoutUrl, "https://pay.payos.vn/web/payos_link_123");
    assert.equal(checkoutSession.qrCode, "data:image/png;base64,QRDATA");
    assert.equal(checkoutSession.providerSessionId, "payos_link_123");

    const [{ url, options, body }] = calls;
    assert.equal(url, "https://api-merchant.payos.vn/v2/payment-requests");
    assert.equal(options.headers["x-client-id"], "payos_client_test");
    assert.equal(options.headers["x-api-key"], "payos_api_key_test");
    assert.equal(body.amount, booking.total_price);
    assert.notEqual(body.amount, payment.amount);
    assert.equal(body.webhookUrl, REQUIRED_PAYOS_ENV.PAYOS_WEBHOOK_URL);
    assert.match(body.returnUrl, /\/payments\/return\?provider=payos/);
    assert.match(body.cancelUrl, /\/payments\/return\?provider=payos/);
    assert.equal(
      body.signature,
      createPayosSignature(
        {
          amount: body.amount,
          cancelUrl: body.cancelUrl,
          description: body.description,
          orderCode: body.orderCode,
          returnUrl: body.returnUrl,
        },
        REQUIRED_PAYOS_ENV.PAYOS_CHECKSUM_KEY,
      ),
    );
  });
});

test("payOS webhook verification accepts valid checksum and rejects invalid checksum", async () => {
  await withPayosEnv({}, async () => {
    const webhook = buildSignedPayosWebhook({
      orderCode: 123456789,
      paymentLinkId: "payos_link_123",
      reference: "TF123",
      amount: 1728000,
      currency: "VND",
      code: "00",
      desc: "success",
      transactionDateTime: "2026-05-19 10:00:00",
    });

    const verifiedEvent = payosProvider.verifyWebhook({ rawBody: JSON.stringify(webhook) });
    const normalizedEvent = payosProvider.normalizeWebhookEvent(verifiedEvent);

    assert.equal(normalizedEvent.provider, "payos");
    assert.equal(normalizedEvent.status, "succeeded");
    assert.equal(normalizedEvent.providerIntentId, "123456789");
    assert.equal(normalizedEvent.providerSessionId, "payos_link_123");
    assert.equal(normalizedEvent.providerPaymentId, "TF123");
    assert.equal(normalizedEvent.amount, 1728000);

    assert.throws(
      () =>
        payosProvider.verifyWebhook({
          rawBody: JSON.stringify({ ...webhook, signature: "bad_signature" }),
        }),
      /signature/i,
    );
  });
});

test("payOS failed, cancelled, and expired webhooks normalize to terminal statuses", async () => {
  await withPayosEnv({}, async () => {
    const cases = [
      { providerStatus: "FAILED", expected: "failed" },
      { providerStatus: "CANCELLED", expected: "cancelled" },
      { providerStatus: "EXPIRED", expected: "expired" },
    ];

    for (const { providerStatus, expected } of cases) {
      const event = buildSignedPayosWebhook(
        {
          orderCode: 123456789,
          paymentLinkId: "payos_link_123",
          amount: 1728000,
          currency: "VND",
          status: providerStatus,
          code: providerStatus,
          desc: providerStatus.toLowerCase(),
        },
        { success: false },
      );

      const verifiedEvent = payosProvider.verifyWebhook({ rawBody: JSON.stringify(event) });
      const normalizedEvent = payosProvider.normalizeWebhookEvent(verifiedEvent);
      assert.equal(normalizedEvent.status, expected);
    }
  });
});

test("payOS duplicate webhook payloads produce the same provider event id", async () => {
  await withPayosEnv({}, async () => {
    const webhook = buildSignedPayosWebhook({
      orderCode: 123456789,
      paymentLinkId: "payos_link_123",
      amount: 1728000,
      currency: "VND",
      status: "CANCELLED",
      code: "CANCELLED",
      desc: "cancelled",
    });

    const first = payosProvider.normalizeWebhookEvent(
      payosProvider.verifyWebhook({ rawBody: JSON.stringify(webhook) }),
    );
    const second = payosProvider.normalizeWebhookEvent(
      payosProvider.verifyWebhook({ rawBody: JSON.stringify(webhook) }),
    );

    assert.equal(first.providerEventId, second.providerEventId);
    assert.equal(first.providerEventId, "payos:payos_link_123:cancelled");
  });
});
