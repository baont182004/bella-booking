import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { getPaymentRuntimeConfig } from "../config/paymentConfig.js";

const DEFAULT_PROVIDER = "mock";
const SIGNATURE_HEADER = "x-bella-mock-signature";

const actionConfigurations = {
  complete_visa: {
    eventType: "checkout.session.completed",
    status: "succeeded",
    cardBrand: "visa",
    cardLast4: "4242",
    paymentMethodType: "card",
  },
  complete_mastercard: {
    eventType: "checkout.session.completed",
    status: "succeeded",
    cardBrand: "mastercard",
    cardLast4: "4444",
    paymentMethodType: "card",
  },
  complete_bank_transfer: {
    eventType: "checkout.session.completed",
    status: "succeeded",
    paymentMethodType: "bank_transfer",
  },
  fail_declined: {
    eventType: "payment_intent.payment_failed",
    status: "failed",
    failureCode: "card_declined",
    failureMessage: "Sandbox card was declined by the mock provider.",
    paymentMethodType: "card",
  },
  fail_bank_transfer: {
    eventType: "payment_intent.payment_failed",
    status: "failed",
    failureCode: "bank_transfer_rejected",
    failureMessage: "Sandbox bank transfer was rejected by the mock provider.",
    paymentMethodType: "bank_transfer",
  },
  expire_session: {
    eventType: "checkout.session.expired",
    status: "expired",
    paymentMethodType: "hosted_checkout",
  },
  cancel_session: {
    eventType: "checkout.session.cancelled",
    status: "cancelled",
    paymentMethodType: "hosted_checkout",
  },
};

function getWebhookSecret() {
  return getPaymentRuntimeConfig().mock.webhookSecret;
}

function getPaymentPublicBaseUrl() {
  return getPaymentRuntimeConfig().paymentPublicBaseUrl;
}

function getFrontendPublicUrl() {
  return getPaymentRuntimeConfig().frontendPublicUrl;
}

function getCheckoutTtlMinutes() {
  return getPaymentRuntimeConfig().checkoutTtlMinutes;
}

function getWebhookToleranceSeconds() {
  return getPaymentRuntimeConfig().webhookToleranceSeconds;
}

function buildSignedPayload(rawBody, timestamp) {
  return `${timestamp}.${rawBody}`;
}

function computeSignature(rawBody, timestamp, secret = getWebhookSecret()) {
  return createHmac("sha256", secret)
    .update(buildSignedPayload(rawBody, timestamp))
    .digest("hex");
}

function buildSignatureHeader(rawBody, timestamp = Math.floor(Date.now() / 1000)) {
  return `t=${timestamp},v1=${computeSignature(rawBody, timestamp)}`;
}

function parseSignatureHeader(signatureHeader = "") {
  const parts = Object.fromEntries(
    signatureHeader
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean)
      .map((entry) => {
        const [key, value] = entry.split("=");
        return [key, value];
      }),
  );

  return {
    timestamp: Number(parts.t),
    signature: parts.v1,
  };
}

function compareSignatures(expected, actual) {
  const expectedBuffer = Buffer.from(expected, "utf8");
  const actualBuffer = Buffer.from(actual || "", "utf8");

  if (expectedBuffer.length !== actualBuffer.length) {
    return false;
  }

  return timingSafeEqual(expectedBuffer, actualBuffer);
}

function buildFrontendReturnUrl({ bookingId, sessionId }) {
  const returnUrl = new URL("/payments/return", getFrontendPublicUrl());
  returnUrl.searchParams.set("provider", DEFAULT_PROVIDER);
  returnUrl.searchParams.set("booking_id", bookingId);
  returnUrl.searchParams.set("session_id", sessionId);
  return returnUrl.toString();
}

function buildMockHostedCheckoutUrl({ sessionId, accessToken }) {
  const checkoutUrl = new URL(`/payments/hosted/mock/${sessionId}`, getPaymentPublicBaseUrl());
  checkoutUrl.searchParams.set("access_token", accessToken);
  return checkoutUrl.toString();
}

export function createCheckoutSession({
  booking,
  payment,
  billingName,
  billingEmail,
  paymentMethodType = "hosted_checkout",
}) {
  const providerSessionId = `mock_sess_${randomUUID().replace(/-/g, "").slice(0, 24)}`;
  const providerIntentId = `mock_int_${randomUUID().replace(/-/g, "").slice(0, 24)}`;
  const checkoutAccessToken = randomUUID();
  const expiresAt = new Date(Date.now() + getCheckoutTtlMinutes() * 60 * 1000);

  return {
    provider: DEFAULT_PROVIDER,
    providerSessionId,
    providerIntentId,
    checkoutAccessToken,
    checkoutUrl: buildMockHostedCheckoutUrl({
      sessionId: providerSessionId,
      accessToken: checkoutAccessToken,
    }),
    returnUrl: buildFrontendReturnUrl({
      bookingId: booking._id.toString(),
      sessionId: providerSessionId,
    }),
    expiresAt,
    status: "pending",
    paymentMethodType: "hosted_checkout",
    providerPayloadSummary: {
      mode: "hosted_checkout",
      sandbox: true,
      requestedPaymentMethodType: paymentMethodType,
      expiresAt: expiresAt.toISOString(),
      billingEmail: billingEmail || payment.billing_email || booking.guest_email || null,
      billingName: billingName || payment.billing_name || booking.guest_full_name || null,
    },
    internalMetadata: {
      requestedPaymentMethodType: paymentMethodType,
    },
  };
}

export function createRefundEvent({ payment, booking, amount }) {
  const event = {
    id: `evt_${randomUUID().replace(/-/g, "").slice(0, 24)}`,
    type: "charge.refunded",
    created: Math.floor(Date.now() / 1000),
    data: {
      object: {
        bookingId: booking._id.toString(),
        paymentId: payment.provider_payment_id || `mock_pay_${randomUUID().slice(0, 8)}`,
        paymentIntentId: payment.provider_intent_id,
        sessionId: payment.provider_session_id,
        amount,
        currency: payment.currency || "VND",
        paymentMethod: {
          type: payment.payment_method_type || "card",
          brand: payment.card_brand,
          last4: payment.card_last4,
        },
        billingDetails: {
          name: payment.billing_name || booking.guest_full_name || null,
          email: payment.billing_email || booking.guest_email || null,
        },
      },
    },
  };

  return event;
}

export function createHostedCheckoutEvent({ action, payment, booking }) {
  const configuration = actionConfigurations[action];
  if (!configuration) {
    throw new Error("Unsupported sandbox checkout action");
  }

  return {
    id: `evt_${randomUUID().replace(/-/g, "").slice(0, 24)}`,
    type: configuration.eventType,
    created: Math.floor(Date.now() / 1000),
    data: {
      object: {
        bookingId: booking._id.toString(),
        paymentId:
          payment.provider_payment_id || `mock_pay_${randomUUID().replace(/-/g, "").slice(0, 16)}`,
        paymentIntentId: payment.provider_intent_id,
        sessionId: payment.provider_session_id,
        amount: payment.amount,
        currency: payment.currency || "VND",
        paymentMethod: {
          type: configuration.paymentMethodType,
          brand: configuration.cardBrand || null,
          last4: configuration.cardLast4 || null,
        },
        billingDetails: {
          name: payment.billing_name || booking.guest_full_name || null,
          email: payment.billing_email || booking.guest_email || null,
        },
        failureCode: configuration.failureCode || null,
        failureMessage: configuration.failureMessage || null,
        status: configuration.status,
        riskFlags: [],
      },
    },
  };
}

export function normalizeWebhookEvent(event) {
  const object = event?.data?.object || {};
  const eventType = event?.type || "unknown";

  let status = "processing";
  if (eventType === "checkout.session.completed") {
    status = "succeeded";
  } else if (eventType === "payment_intent.payment_failed") {
    status = "failed";
  } else if (eventType === "charge.refunded") {
    status = "refunded";
  } else if (eventType === "checkout.session.expired") {
    status = "expired";
  } else if (eventType === "checkout.session.cancelled") {
    status = "cancelled";
  }

  return {
    provider: DEFAULT_PROVIDER,
    providerEventId: event?.id,
    eventType,
    providerSessionId: object.sessionId || null,
    providerIntentId: object.paymentIntentId || null,
    providerPaymentId: object.paymentId || null,
    bookingId: object.bookingId || null,
    amount: Number(object.amount || 0),
    currency: object.currency || "VND",
    status,
    paymentMethodType: object.paymentMethod?.type || "hosted_checkout",
    cardBrand: object.paymentMethod?.brand || null,
    cardLast4: object.paymentMethod?.last4 || null,
    billingName: object.billingDetails?.name || null,
    billingEmail: object.billingDetails?.email || null,
    failureCode: object.failureCode || null,
    failureMessage: object.failureMessage || null,
    riskFlags: Array.isArray(object.riskFlags) ? object.riskFlags : [],
    occurredAt: event?.created ? new Date(event.created * 1000) : new Date(),
    payloadSummary: {
      eventType,
      providerSessionId: object.sessionId || null,
      providerIntentId: object.paymentIntentId || null,
      providerPaymentId: object.paymentId || null,
      amount: Number(object.amount || 0),
      currency: object.currency || "VND",
      paymentMethodType: object.paymentMethod?.type || "hosted_checkout",
      cardBrand: object.paymentMethod?.brand || null,
      cardLast4: object.paymentMethod?.last4 || null,
      failureCode: object.failureCode || null,
      riskFlags: Array.isArray(object.riskFlags) ? object.riskFlags : [],
    },
  };
}

export function verifyWebhook({ rawBody, signatureHeader }) {
  const { timestamp, signature } = parseSignatureHeader(signatureHeader);
  if (!timestamp || !signature) {
    throw new Error("Missing webhook signature");
  }

  const maxAgeSeconds = getWebhookToleranceSeconds();
  if (Math.abs(Math.floor(Date.now() / 1000) - timestamp) > maxAgeSeconds) {
    throw new Error("Webhook signature timestamp is too old");
  }

  const expectedSignature = computeSignature(rawBody, timestamp);
  if (!compareSignatures(expectedSignature, signature)) {
    throw new Error("Invalid webhook signature");
  }

  return JSON.parse(rawBody);
}

export function getHostedCheckoutViewModel({ payment, booking }) {
  return {
    provider: DEFAULT_PROVIDER,
    paymentAmount: payment.amount,
    currency: payment.currency || "VND",
    requestedPaymentMethodType:
      payment.metadata?.requestedPaymentMethodType ||
      payment.payment_method_type ||
      "hosted_checkout",
    bookingReference: booking.booking_reference || booking._id.toString(),
    guestName: payment.billing_name || booking.guest_full_name || "Bella guest",
    returnUrl: buildFrontendReturnUrl({
      bookingId: booking._id.toString(),
      sessionId: payment.provider_session_id,
    }),
    signatureHeaderName: SIGNATURE_HEADER,
  };
}

export function buildReturnUrlForPayment(payment) {
  return buildFrontendReturnUrl({
    bookingId: payment.booking_id.toString(),
    sessionId: payment.provider_session_id,
  });
}

export function getWebhookSignatureHeaderName() {
  return SIGNATURE_HEADER;
}

export default {
  name: DEFAULT_PROVIDER,
  signatureHeader: SIGNATURE_HEADER,
  createCheckoutSession,
  createHostedCheckoutEvent,
  createRefundEvent,
  normalizeWebhookEvent,
  verifyWebhook,
  buildSignatureHeader,
  getHostedCheckoutViewModel,
  buildReturnUrlForPayment,
};
