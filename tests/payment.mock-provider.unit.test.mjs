import test from "node:test";
import assert from "node:assert/strict";
import mockProvider from "../services/payment-service/src/providers/mockProvider.js";
import {
  resetPaymentRuntimeConfigForTests,
} from "../services/payment-service/src/config/paymentConfig.js";

function withMockPaymentEnv(fn) {
  const previousValues = new Map();
  const overrides = {
    PAYMENT_PROVIDER: "mock",
    PAYMENT_PUBLIC_BASE_URL: "https://bella-booking-api.example.test",
    FRONTEND_PUBLIC_URL: "https://bella-booking.example.test",
    MOCK_PAYMENT_WEBHOOK_SECRET: "mock_test_secret_123",
    PAYMENT_WEBHOOK_TOLERANCE_SECONDS: "300",
  };

  for (const key of Object.keys(overrides)) {
    previousValues.set(key, process.env[key]);
    process.env[key] = overrides[key];
  }

  resetPaymentRuntimeConfigForTests();

  try {
    return fn();
  } finally {
    for (const [key, value] of previousValues.entries()) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
    resetPaymentRuntimeConfigForTests();
  }
}

const booking = {
  _id: { toString: () => "665000000000000000000001" },
  booking_reference: "BEL-20260518-ABC123",
  guest_email: "guest@example.test",
  guest_full_name: "Bella Guest",
};

const payment = {
  _id: { toString: () => "775000000000000000000001" },
  booking_id: { toString: () => "665000000000000000000001" },
  amount: 1290000,
  currency: "VND",
  billing_email: "guest@example.test",
  billing_name: "Bella Guest",
  provider_intent_id: "mock_int_test",
  provider_session_id: "mock_sess_test",
};

test("mock provider creates bank-transfer checkout metadata", () => {
  withMockPaymentEnv(() => {
    const checkoutSession = mockProvider.createCheckoutSession({
      booking,
      payment,
      paymentMethodType: "bank_transfer",
    });

    assert.equal(checkoutSession.provider, "mock");
    assert.match(checkoutSession.checkoutUrl, /^https:\/\/bella-booking-api\.example\.test\/payments\/hosted\/mock\//);
    assert.equal(checkoutSession.internalMetadata.requestedPaymentMethodType, "bank_transfer");
    assert.equal(checkoutSession.providerPayloadSummary.requestedPaymentMethodType, "bank_transfer");
  });
});

test("mock bank-transfer success normalizes to succeeded without card metadata", () => {
  const event = mockProvider.createHostedCheckoutEvent({
    action: "complete_bank_transfer",
    payment,
    booking,
  });
  const normalizedEvent = mockProvider.normalizeWebhookEvent(event);

  assert.equal(normalizedEvent.status, "succeeded");
  assert.equal(normalizedEvent.paymentMethodType, "bank_transfer");
  assert.equal(normalizedEvent.cardBrand, null);
  assert.equal(normalizedEvent.amount, 1290000);
});

test("mock provider verifies signed webhooks and rejects invalid signatures", () => {
  withMockPaymentEnv(() => {
    const event = mockProvider.createHostedCheckoutEvent({
      action: "cancel_session",
      payment,
      booking,
    });
    const rawBody = JSON.stringify(event);
    const signatureHeader = mockProvider.buildSignatureHeader(rawBody);

    assert.equal(mockProvider.verifyWebhook({ rawBody, signatureHeader }).id, event.id);
    assert.throws(
      () => mockProvider.verifyWebhook({ rawBody, signatureHeader: "t=1,v1=bad" }),
      /signature/i,
    );
  });
});
