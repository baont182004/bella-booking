import test from "node:test";
import assert from "node:assert/strict";
import {
  getPaymentRuntimeConfig,
  resetPaymentRuntimeConfigForTests,
  validatePaymentRuntimeConfig,
} from "../services/payment-service/src/config/paymentConfig.js";
import { getPaymentProvider } from "../services/payment-service/src/providers/index.js";
import stripeProvider, {
  resetStripeClientFactoryForTests,
  setStripeClientFactoryForTests,
} from "../services/payment-service/src/providers/stripeProvider.js";

const REQUIRED_STRIPE_ENV = {
  PAYMENT_PROVIDER: "stripe",
  PAYMENT_PUBLIC_BASE_URL: "https://payments-sandbox.bella.example",
  FRONTEND_PUBLIC_URL: "https://app-sandbox.bella.example",
  STRIPE_SECRET_KEY: "sk_test_1234567890abcdef",
  STRIPE_WEBHOOK_SECRET: "whsec_1234567890abcdef",
  STRIPE_API_VERSION: "2024-09-30.acacia",
};

function withEnv(overrides, fn) {
  const previousValues = new Map();
  const keys = new Set([...Object.keys(overrides), ...Object.keys(REQUIRED_STRIPE_ENV)]);

  for (const key of keys) {
    previousValues.set(key, process.env[key]);
  }

  for (const [key, value] of Object.entries({ ...REQUIRED_STRIPE_ENV, ...overrides })) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  resetPaymentRuntimeConfigForTests();
  resetStripeClientFactoryForTests();

  const restore = () => {
    for (const [key, value] of previousValues.entries()) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
    resetPaymentRuntimeConfigForTests();
    resetStripeClientFactoryForTests();
  };

  return Promise.resolve()
    .then(fn)
    .finally(restore);
}

function createFakeStripeClient(overrides = {}) {
  const calls = {
    checkoutCreate: [],
    checkoutRetrieve: [],
    checkoutExpire: [],
    refundCreate: [],
    paymentIntentRetrieve: [],
    chargeRetrieve: [],
    refundRetrieve: [],
    webhookConstruct: [],
  };

  const session = overrides.session || {
    id: "cs_test_123",
    object: "checkout.session",
    url: "https://checkout.stripe.com/c/pay/cs_test_123",
    status: "open",
    payment_status: "unpaid",
    currency: "vnd",
    amount_total: 1728000,
    customer: "cus_test_123",
    payment_intent: null,
    payment_method_types: ["card"],
    expires_at: Math.floor(Date.now() / 1000) + 1800,
    metadata: {
      bella_booking_id: "66f0aa000000000000000001",
      bella_booking_reference: "BEL-20260401-A10001",
      bella_payment_id: "66f0aa000000000000000101",
    },
  };

  const charge = overrides.charge || {
    id: "ch_test_123",
    object: "charge",
    amount: 1728000,
    amount_refunded: overrides.chargeAmountRefunded ?? 0,
    currency: "vnd",
    payment_intent: "pi_test_123",
    billing_details: {
      name: "Lana Nguyen",
      email: "lana.nguyen@example.com",
    },
    payment_method_details: {
      type: "card",
      card: {
        brand: "visa",
        last4: "4242",
        exp_month: 12,
        exp_year: 2030,
      },
    },
    metadata: {},
  };

  const paymentIntent = overrides.paymentIntent || {
    id: "pi_test_123",
    object: "payment_intent",
    amount: 1728000,
    amount_received: overrides.paymentIntentAmountReceived ?? 1728000,
    currency: "vnd",
    customer: "cus_test_123",
    latest_charge: charge,
    last_payment_error: overrides.lastPaymentError || null,
    metadata: {
      bella_booking_id: "66f0aa000000000000000001",
      bella_booking_reference: "BEL-20260401-A10001",
      bella_payment_id: "66f0aa000000000000000101",
    },
  };

  const refund = overrides.refund || {
    id: "re_test_123",
    object: "refund",
    status: "succeeded",
    amount: 1728000,
    currency: "vnd",
    created: Math.floor(Date.now() / 1000),
    payment_intent: paymentIntent.id,
    charge: charge.id,
    metadata: {
      bella_booking_id: "66f0aa000000000000000001",
      bella_booking_reference: "BEL-20260401-A10001",
      bella_payment_id: "66f0aa000000000000000101",
    },
  };

  const event = overrides.event || {
    id: "evt_test_123",
    type: "checkout.session.completed",
    created: Math.floor(Date.now() / 1000),
    data: {
      object: {
        ...session,
        payment_intent: paymentIntent.id,
        payment_status: "paid",
        status: "complete",
      },
    },
  };

  return {
    calls,
    event,
    client: {
      checkout: {
        sessions: {
          create: async (params, options) => {
            calls.checkoutCreate.push({ params, options });
            return session;
          },
          retrieve: async (sessionId) => {
            calls.checkoutRetrieve.push({ sessionId });
            return session;
          },
          expire: async (sessionId) => {
            calls.checkoutExpire.push({ sessionId });
            return { ...session, status: "expired" };
          },
        },
      },
      refunds: {
        create: async (params, options) => {
          calls.refundCreate.push({ params, options });
          return refund;
        },
        retrieve: async (refundId) => {
          calls.refundRetrieve.push({ refundId });
          return refund;
        },
      },
      paymentIntents: {
        retrieve: async (paymentIntentId, options) => {
          calls.paymentIntentRetrieve.push({ paymentIntentId, options });
          return paymentIntent;
        },
      },
      charges: {
        retrieve: async (chargeId) => {
          calls.chargeRetrieve.push({ chargeId });
          return charge;
        },
      },
      webhooks: {
        constructEvent: (rawBody, signatureHeader, webhookSecret) => {
          calls.webhookConstruct.push({ rawBody, signatureHeader, webhookSecret });
          return event;
        },
      },
    },
  };
}

test("payment config fails fast when Stripe secrets are missing", async () => {
  await withEnv(
    {
      PAYMENT_PROVIDER: "stripe",
      STRIPE_SECRET_KEY: undefined,
      STRIPE_WEBHOOK_SECRET: undefined,
    },
    async () => {
      assert.throws(
        () => validatePaymentRuntimeConfig(),
        /STRIPE_SECRET_KEY is required when PAYMENT_PROVIDER=stripe/,
      );
    },
  );
});

test("provider registry returns the Stripe adapter when configured", async () => {
  await withEnv({}, async () => {
    const provider = getPaymentProvider("stripe");
    assert.equal(provider.name, "stripe");
    assert.equal(getPaymentRuntimeConfig().provider, "stripe");
  });
});

test("Stripe checkout session creation uses hosted checkout URLs, metadata, and idempotency", async () => {
  await withEnv({}, async () => {
    const fakeStripe = createFakeStripeClient();
    setStripeClientFactoryForTests(() => fakeStripe.client);

    const booking = {
      _id: "66f0aa000000000000000001",
      booking_reference: "BEL-20260401-A10001",
      total_price: 1728000,
      guest_full_name: "Lana Nguyen",
      guest_email: "lana.nguyen@example.com",
      price_snapshot: { currency: "VND" },
    };
    const payment = {
      _id: "66f0aa000000000000000101",
      amount: 1728000,
      currency: "VND",
      billing_email: null,
      billing_name: null,
    };

    const checkoutSession = await stripeProvider.createCheckoutSession({
      booking,
      payment,
      billingName: "Lana Nguyen",
      billingEmail: "lana.nguyen@example.com",
      idempotencyKey: "checkout:66f0aa000000000000000101",
    });

    assert.equal(checkoutSession.provider, "stripe");
    assert.equal(checkoutSession.providerSessionId, "cs_test_123");
    assert.equal(checkoutSession.checkoutUrl, "https://checkout.stripe.com/c/pay/cs_test_123");

    const [{ params, options }] = fakeStripe.calls.checkoutCreate;
    assert.equal(options.idempotencyKey, "checkout:66f0aa000000000000000101");
    assert.equal(params.mode, "payment");
    assert.equal(params.payment_method_types[0], "card");
    assert.match(params.success_url, /\/payments\/return\?provider=stripe/);
    assert.match(params.success_url, /session_id=\{CHECKOUT_SESSION_ID\}/);
    assert.equal(params.cancel_url, params.success_url);
    assert.equal(params.line_items[0].price_data.currency, "vnd");
    assert.equal(params.line_items[0].price_data.unit_amount, 1728000);
    assert.deepEqual(params.metadata, {
      bella_booking_id: "66f0aa000000000000000001",
      bella_booking_reference: "BEL-20260401-A10001",
      bella_payment_id: "66f0aa000000000000000101",
    });
    assert.deepEqual(params.payment_intent_data.metadata, params.metadata);
  });
});

test("Stripe webhook verification uses the raw body and configured webhook secret", async () => {
  await withEnv({}, async () => {
    const fakeStripe = createFakeStripeClient();
    setStripeClientFactoryForTests(() => fakeStripe.client);

    const rawBody = JSON.stringify({ id: "evt_test_123" });
    const event = stripeProvider.verifyWebhook({
      rawBody,
      signatureHeader: "t=123,v1=signed",
    });

    assert.equal(event.id, "evt_test_123");
    assert.deepEqual(fakeStripe.calls.webhookConstruct[0], {
      rawBody,
      signatureHeader: "t=123,v1=signed",
      webhookSecret: "whsec_1234567890abcdef",
    });
  });
});

test("Stripe webhook verification rejects invalid signatures", async () => {
  await withEnv({}, async () => {
    const fakeStripe = createFakeStripeClient();
    fakeStripe.client.webhooks.constructEvent = () => {
      throw new Error("No signatures found matching the expected signature for payload");
    };
    setStripeClientFactoryForTests(() => fakeStripe.client);

    assert.throws(
      () =>
        stripeProvider.verifyWebhook({
          rawBody: JSON.stringify({ id: "evt_test_123" }),
          signatureHeader: "t=123,v1=invalid",
        }),
      /Invalid Stripe webhook signature/,
    );
  });
});

test("Stripe webhook normalization stores only safe payment metadata from hosted checkout success", async () => {
  await withEnv({}, async () => {
    const fakeStripe = createFakeStripeClient();
    setStripeClientFactoryForTests(() => fakeStripe.client);

    const normalizedEvent = await stripeProvider.normalizeWebhookEvent(fakeStripe.event);

    assert.equal(normalizedEvent.provider, "stripe");
    assert.equal(normalizedEvent.providerEventId, "evt_test_123");
    assert.equal(normalizedEvent.providerSessionId, "cs_test_123");
    assert.equal(normalizedEvent.providerIntentId, "pi_test_123");
    assert.equal(normalizedEvent.providerPaymentId, "ch_test_123");
    assert.equal(normalizedEvent.providerCustomerId, "cus_test_123");
    assert.equal(normalizedEvent.status, "succeeded");
    assert.equal(normalizedEvent.currency, "VND");
    assert.equal(normalizedEvent.amount, 1728000);
    assert.equal(normalizedEvent.paymentMethodType, "card");
    assert.equal(normalizedEvent.cardBrand, "visa");
    assert.equal(normalizedEvent.cardLast4, "4242");
    assert.equal(normalizedEvent.billingEmail, "lana.nguyen@example.com");
    assert.ok(!Object.prototype.hasOwnProperty.call(normalizedEvent.payloadSummary, "cardNumber"));
    assert.ok(!Object.prototype.hasOwnProperty.call(normalizedEvent.payloadSummary, "cvv"));
  });
});

test("Stripe provider reuses open checkout sessions and can expire stale sessions", async () => {
  await withEnv({}, async () => {
    const fakeStripe = createFakeStripeClient();
    setStripeClientFactoryForTests(() => fakeStripe.client);

    const payment = {
      provider_session_id: "cs_test_123",
    };
    const booking = {
      _id: "66f0aa000000000000000001",
    };

    const reusable = await stripeProvider.getReusableCheckoutSession({ payment, booking });
    assert.equal(reusable.sessionId, "cs_test_123");
    assert.equal(reusable.reused, true);

    await stripeProvider.expireCheckoutSession({ payment });
    assert.equal(fakeStripe.calls.checkoutExpire.length, 1);
    assert.equal(fakeStripe.calls.checkoutExpire[0].sessionId, "cs_test_123");
  });
});

test("Stripe refund mapping uses the Refunds API and returns a normalized refund event", async () => {
  await withEnv({}, async () => {
    const fakeStripe = createFakeStripeClient({
      chargeAmountRefunded: 1728000,
    });
    setStripeClientFactoryForTests(() => fakeStripe.client);

    const result = await stripeProvider.refundPayment({
      payment: {
        _id: "66f0aa000000000000000101",
        provider_intent_id: "pi_test_123",
        provider_payment_id: "ch_test_123",
        currency: "VND",
      },
      booking: {
        _id: "66f0aa000000000000000001",
        booking_reference: "BEL-20260401-A10001",
      },
      amount: 1728000,
      idempotencyKey: "refund:66f0aa000000000000000101:1728000",
    });

    const [{ params, options }] = fakeStripe.calls.refundCreate;
    assert.equal(params.payment_intent, "pi_test_123");
    assert.equal(params.amount, 1728000);
    assert.equal(options.idempotencyKey, "refund:66f0aa000000000000000101:1728000");
    assert.equal(result.normalizedEvent.status, "refunded");
    assert.equal(result.normalizedEvent.providerPaymentId, "ch_test_123");
    assert.equal(result.normalizedEvent.amount, 1728000);
  });
});
