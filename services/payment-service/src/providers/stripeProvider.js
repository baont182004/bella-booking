import Stripe from "stripe";
import { getPaymentReturnPath, getPaymentRuntimeConfig } from "../config/paymentConfig.js";

const PROVIDER_NAME = "stripe";
const SIGNATURE_HEADER = "stripe-signature";
const MAX_STRIPE_SESSION_TTL_SECONDS = 24 * 60 * 60;
const MIN_STRIPE_SESSION_TTL_SECONDS = 30 * 60;
const ZERO_DECIMAL_CURRENCIES = new Set([
  "bif",
  "clp",
  "djf",
  "gnf",
  "jpy",
  "kmf",
  "krw",
  "mga",
  "pyg",
  "rwf",
  "ugx",
  "vnd",
  "vuv",
  "xaf",
  "xof",
  "xpf",
]);

let stripeClientFactory = createDefaultStripeClient;
let cachedStripeClient = null;

function getStripeConfig() {
  return getPaymentRuntimeConfig().stripe;
}

function createDefaultStripeClient() {
  const stripeConfig = getStripeConfig();
  const options = stripeConfig.apiVersion ? { apiVersion: stripeConfig.apiVersion } : undefined;
  return new Stripe(stripeConfig.secretKey, options);
}

function getStripeClient() {
  if (!cachedStripeClient) {
    cachedStripeClient = stripeClientFactory();
  }

  return cachedStripeClient;
}

function stringOrNull(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizeCurrency(currency = "VND") {
  return String(currency || "VND").trim().toLowerCase();
}

function isZeroDecimalCurrency(currency) {
  return ZERO_DECIMAL_CURRENCIES.has(normalizeCurrency(currency));
}

function toStripeAmount(amount, currency = "VND") {
  const numericAmount = Number(amount || 0);
  if (!Number.isFinite(numericAmount) || numericAmount < 0) {
    throw new Error("Stripe amount must be a non-negative number");
  }

  if (isZeroDecimalCurrency(currency)) {
    return Math.round(numericAmount);
  }

  return Math.round(numericAmount * 100);
}

function fromStripeAmount(amount, currency = "VND") {
  const numericAmount = Number(amount || 0);
  if (!Number.isFinite(numericAmount) || numericAmount < 0) {
    return 0;
  }

  if (isZeroDecimalCurrency(currency)) {
    return numericAmount;
  }

  return numericAmount / 100;
}

function buildFrontendReturnUrl({ bookingId, sessionId }) {
  const returnUrl = new URL(getPaymentReturnPath(), getPaymentRuntimeConfig().frontendPublicUrl);
  returnUrl.searchParams.set("provider", PROVIDER_NAME);
  returnUrl.searchParams.set("booking_id", bookingId);
  if (sessionId) {
    returnUrl.searchParams.set("session_id", sessionId);
  }
  return returnUrl.toString();
}

function buildStripeReturnUrlTemplate({ bookingId }) {
  return buildFrontendReturnUrl({
    bookingId,
    sessionId: "__STRIPE_CHECKOUT_SESSION_ID__",
  }).replace("__STRIPE_CHECKOUT_SESSION_ID__", "{CHECKOUT_SESSION_ID}");
}

function clampStripeCheckoutTtlSeconds() {
  const configuredSeconds = getPaymentRuntimeConfig().checkoutTtlMinutes * 60;
  return Math.min(
    MAX_STRIPE_SESSION_TTL_SECONDS,
    Math.max(MIN_STRIPE_SESSION_TTL_SECONDS, configuredSeconds),
  );
}

function buildStripeMetadata({ booking, payment }) {
  return {
    bella_booking_id: booking._id.toString(),
    bella_booking_reference: booking.booking_reference || "",
    bella_payment_id: payment?._id?.toString() || "",
  };
}

function sanitizePayloadSummary(summary = {}) {
  return Object.fromEntries(
    Object.entries(summary).filter(([, value]) => value !== undefined && value !== null && value !== ""),
  );
}

function getObjectId(value) {
  if (!value) {
    return null;
  }

  return typeof value === "string" ? value : value.id || null;
}

function buildReconciliationEventId(eventType, objectId) {
  return `reconcile:${eventType}:${objectId || "unknown"}`;
}

function getStripeCheckoutSessionIdFromMetadata(metadata = {}) {
  return stringOrNull(metadata.bella_checkout_session_id);
}

function getBellaMetadata(...sources) {
  const metadata = Object.assign(
    {},
    ...sources
      .map((source) => source?.metadata)
      .filter((candidate) => candidate && typeof candidate === "object"),
  );

  return {
    bookingId: stringOrNull(metadata?.bella_booking_id),
    bookingReference: stringOrNull(metadata?.bella_booking_reference),
    paymentId: stringOrNull(metadata?.bella_payment_id),
    checkoutSessionId: getStripeCheckoutSessionIdFromMetadata(metadata),
  };
}

function getChargeFromPaymentIntent(paymentIntent) {
  const latestCharge = paymentIntent?.latest_charge;
  if (!latestCharge) {
    return null;
  }

  return typeof latestCharge === "string" ? null : latestCharge;
}

function getRefundStatus(refund) {
  if (refund?.status === "succeeded") {
    return "refunded";
  }

  return "processing";
}

function mapFailureCode(error) {
  return stringOrNull(error?.code) || stringOrNull(error?.decline_code) || null;
}

function mapFailureMessage(error) {
  return stringOrNull(error?.message) || null;
}

function getCardSummary(charge) {
  const card = charge?.payment_method_details?.card || null;
  return {
    brand: stringOrNull(card?.brand),
    last4: stringOrNull(card?.last4),
  };
}

function getBillingSummary({ session = null, paymentIntent = null, charge = null }) {
  const customerDetails = session?.customer_details || null;
  const billingDetails =
    charge?.billing_details || paymentIntent?.last_payment_error?.payment_method?.billing_details || null;

  return {
    name: stringOrNull(customerDetails?.name) || stringOrNull(billingDetails?.name) || null,
    email: stringOrNull(customerDetails?.email) || stringOrNull(billingDetails?.email) || null,
  };
}

function getPaymentMethodType({ session = null, charge = null, paymentIntent = null }) {
  const chargeType = stringOrNull(charge?.payment_method_details?.type);
  if (chargeType) {
    return chargeType;
  }

  const sessionMethodType =
    Array.isArray(session?.payment_method_types) && session.payment_method_types.length > 0
      ? stringOrNull(session.payment_method_types[0])
      : null;
  if (sessionMethodType) {
    return sessionMethodType;
  }

  const errorType = stringOrNull(paymentIntent?.last_payment_error?.payment_method?.type);
  return errorType || "hosted_checkout";
}

function buildNormalizedEvent({
  eventId,
  eventType,
  occurredAt,
  status,
  bookingId = null,
  bookingReference = null,
  paymentId = null,
  session = null,
  paymentIntent = null,
  charge = null,
  refund = null,
  failureCode = null,
  failureMessage = null,
  riskFlags = [],
}) {
  const metadata = getBellaMetadata(session, paymentIntent, charge, refund);
  const currency =
    stringOrNull(session?.currency) ||
    stringOrNull(paymentIntent?.currency) ||
    stringOrNull(charge?.currency) ||
    stringOrNull(refund?.currency) ||
    "vnd";
  const normalizedCurrency = currency.toUpperCase();
  const amountMinor =
    status === "refunded"
      ? charge?.amount_refunded ??
        refund?.amount ??
        paymentIntent?.amount_received ??
        session?.amount_total ??
        charge?.amount ??
        0
      : paymentIntent?.amount_received ??
        session?.amount_total ??
        paymentIntent?.amount ??
        charge?.amount ??
        refund?.amount ??
        0;
  const providerSessionId = getObjectId(session) || metadata.checkoutSessionId;
  const providerIntentId = getObjectId(paymentIntent) || getObjectId(refund?.payment_intent) || null;
  const providerPaymentId = getObjectId(charge) || getObjectId(refund?.charge) || null;
  const providerCustomerId = getObjectId(session?.customer) || getObjectId(paymentIntent?.customer) || null;
  const cardSummary = getCardSummary(charge);
  const billingSummary = getBillingSummary({ session, paymentIntent, charge });
  const paymentMethodType = getPaymentMethodType({ session, charge, paymentIntent });

  return {
    provider: PROVIDER_NAME,
    providerEventId: eventId,
    eventType,
    providerSessionId: providerSessionId || null,
    providerIntentId: providerIntentId || null,
    providerPaymentId: providerPaymentId || null,
    providerCustomerId: providerCustomerId || null,
    bookingId: bookingId || metadata.bookingId,
    bookingReference: bookingReference || metadata.bookingReference,
    bellaPaymentId: paymentId || metadata.paymentId,
    amount: fromStripeAmount(amountMinor, normalizedCurrency),
    currency: normalizedCurrency,
    status,
    paymentMethodType,
    cardBrand: cardSummary.brand,
    cardLast4: cardSummary.last4,
    billingName: billingSummary.name,
    billingEmail: billingSummary.email,
    failureCode,
    failureMessage,
    riskFlags,
    occurredAt,
    payloadSummary: sanitizePayloadSummary({
      eventType,
      providerSessionId,
      providerIntentId,
      providerPaymentId,
      providerCustomerId,
      amount: fromStripeAmount(amountMinor, normalizedCurrency),
      currency: normalizedCurrency,
      checkoutStatus: session?.status || null,
      checkoutPaymentStatus: session?.payment_status || null,
      paymentIntentStatus: paymentIntent?.status || null,
      refundStatus: refund?.status || null,
      paymentMethodType,
      cardBrand: cardSummary.brand,
      cardLast4: cardSummary.last4,
      failureCode,
      riskFlags,
    }),
  };
}

async function retrieveCheckoutSession(sessionId) {
  return getStripeClient().checkout.sessions.retrieve(sessionId);
}

async function retrievePaymentIntent(paymentIntentId) {
  if (!paymentIntentId) {
    return null;
  }

  return getStripeClient().paymentIntents.retrieve(paymentIntentId, {
    expand: ["latest_charge"],
  });
}

async function retrieveCharge(chargeId) {
  if (!chargeId) {
    return null;
  }

  return getStripeClient().charges.retrieve(chargeId);
}

async function retrieveRefund(refundId) {
  if (!refundId) {
    return null;
  }

  return getStripeClient().refunds.retrieve(refundId);
}

function isIgnorableStripeExpireError(error) {
  const message = String(error?.message || "");
  return (
    error?.code === "resource_missing" ||
    /already expired/i.test(message) ||
    /cannot expire/i.test(message) ||
    /isn't in an expireable state/i.test(message)
  );
}

async function normalizeCheckoutSessionLikeEvent({
  eventId,
  eventType,
  session,
  occurredAt,
  status,
}) {
  const paymentIntentId = getObjectId(session?.payment_intent);
  const paymentIntent = await retrievePaymentIntent(paymentIntentId);
  const charge = getChargeFromPaymentIntent(paymentIntent);
  const effectiveFailureCode = mapFailureCode(paymentIntent?.last_payment_error);
  const effectiveFailureMessage = mapFailureMessage(paymentIntent?.last_payment_error);

  return buildNormalizedEvent({
    eventId,
    eventType,
    occurredAt,
    status,
    session,
    paymentIntent,
    charge,
    failureCode: status === "failed" ? effectiveFailureCode || "payment_failed" : null,
    failureMessage:
      status === "failed"
        ? effectiveFailureMessage || "Stripe reported the Checkout Session payment as failed."
        : null,
  });
}

async function normalizePaymentIntentLikeEvent({
  eventId,
  eventType,
  paymentIntent,
  occurredAt,
  status,
}) {
  const hydratedPaymentIntent =
    paymentIntent?.object === "payment_intent" && paymentIntent.latest_charge && typeof paymentIntent.latest_charge !== "string"
      ? paymentIntent
      : await retrievePaymentIntent(getObjectId(paymentIntent));
  const charge = getChargeFromPaymentIntent(hydratedPaymentIntent);

  return buildNormalizedEvent({
    eventId,
    eventType,
    occurredAt,
    status,
    paymentIntent: hydratedPaymentIntent,
    charge,
    failureCode: status === "failed" ? mapFailureCode(hydratedPaymentIntent?.last_payment_error) : null,
    failureMessage:
      status === "failed"
        ? mapFailureMessage(hydratedPaymentIntent?.last_payment_error) ||
          "Stripe reported the PaymentIntent as failed."
        : null,
  });
}

async function normalizeChargeLikeEvent({
  eventId,
  eventType,
  charge,
  occurredAt,
  status,
}) {
  const hydratedCharge =
    charge?.object === "charge" && charge.payment_method_details
      ? charge
      : await retrieveCharge(getObjectId(charge));
  const paymentIntent = await retrievePaymentIntent(getObjectId(hydratedCharge?.payment_intent));

  return buildNormalizedEvent({
    eventId,
    eventType,
    occurredAt,
    status,
    paymentIntent,
    charge: hydratedCharge,
  });
}

async function normalizeRefundLikeEvent({
  eventId,
  eventType,
  refund,
  occurredAt,
}) {
  const hydratedRefund =
    refund?.object === "refund" && refund.status ? refund : await retrieveRefund(getObjectId(refund));
  const paymentIntent = await retrievePaymentIntent(getObjectId(hydratedRefund?.payment_intent));
  const charge =
    getChargeFromPaymentIntent(paymentIntent) || (await retrieveCharge(getObjectId(hydratedRefund?.charge)));
  const status = getRefundStatus(hydratedRefund);

  return buildNormalizedEvent({
    eventId,
    eventType,
    occurredAt,
    status,
    paymentIntent,
    charge,
    refund: hydratedRefund,
    failureCode: eventType === "refund.failed" ? "refund_failed" : null,
    failureMessage:
      eventType === "refund.failed"
        ? "Stripe reported that the refund request failed."
        : null,
    riskFlags: eventType === "refund.failed" ? ["stripe_refund_failed"] : [],
  });
}

export async function createCheckoutSession({
  booking,
  payment,
  billingName,
  billingEmail,
  idempotencyKey,
}) {
  const customerEmail = billingEmail || payment.billing_email || booking.guest_email || undefined;
  const customerName = billingName || payment.billing_name || booking.guest_full_name || undefined;
  const currency = normalizeCurrency(payment.currency || booking.price_snapshot?.currency || "VND");
  const bookingId = booking._id.toString();
  const successUrl = buildStripeReturnUrlTemplate({ bookingId });
  const cancelUrl = buildStripeReturnUrlTemplate({ bookingId });
  const expiresAtUnix = Math.floor(Date.now() / 1000) + clampStripeCheckoutTtlSeconds();
  const metadata = buildStripeMetadata({ booking, payment });
  const amountMinor = toStripeAmount(payment.amount || booking.total_price, currency);

  const session = await getStripeClient().checkout.sessions.create(
    {
      mode: "payment",
      success_url: successUrl,
      cancel_url: cancelUrl,
      client_reference_id: booking.booking_reference || bookingId,
      customer_email: customerEmail,
      payment_method_types: ["card"],
      expires_at: expiresAtUnix,
      metadata,
      payment_intent_data: {
        metadata,
      },
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency,
            unit_amount: amountMinor,
            product_data: {
              name: `Bella Hotel booking ${booking.booking_reference || bookingId}`,
              description: customerName
                ? `Hosted checkout for ${customerName}`
                : "Hosted checkout for Bella Hotel reservation",
            },
          },
        },
      ],
    },
    idempotencyKey ? { idempotencyKey } : undefined,
  );

  return {
    provider: PROVIDER_NAME,
    providerSessionId: session.id,
    providerIntentId: getObjectId(session.payment_intent),
    providerCustomerId: getObjectId(session.customer),
    checkoutUrl: session.url,
    returnUrl: buildFrontendReturnUrl({
      bookingId,
      sessionId: session.id,
    }),
    expiresAt: new Date((session.expires_at || expiresAtUnix) * 1000),
    status: "pending",
    paymentMethodType: "hosted_checkout",
    providerPayloadSummary: sanitizePayloadSummary({
      mode: "stripe_checkout",
      sessionStatus: session.status,
      paymentStatus: session.payment_status,
      customerEmail,
      customerName,
      expiresAt: new Date((session.expires_at || expiresAtUnix) * 1000).toISOString(),
    }),
  };
}

export async function getReusableCheckoutSession({ payment, booking }) {
  if (!payment?.provider_session_id) {
    return null;
  }

  try {
    const session = await retrieveCheckoutSession(payment.provider_session_id);
    if (!session?.url || session.status !== "open" || session.payment_status === "paid") {
      return null;
    }

    return {
      provider: PROVIDER_NAME,
      sessionId: session.id,
      checkoutUrl: session.url,
      expiresAt: new Date(session.expires_at * 1000),
      returnUrl: buildFrontendReturnUrl({
        bookingId: booking._id.toString(),
        sessionId: session.id,
      }),
      reused: true,
    };
  } catch (error) {
    if (error?.code === "resource_missing") {
      return null;
    }

    throw error;
  }
}

export async function expireCheckoutSession({ payment }) {
  if (!payment?.provider_session_id) {
    return null;
  }

  try {
    const session = await retrieveCheckoutSession(payment.provider_session_id);
    if (!session || session.status !== "open" || session.payment_status === "paid") {
      return session;
    }

    return await getStripeClient().checkout.sessions.expire(payment.provider_session_id);
  } catch (error) {
    if (isIgnorableStripeExpireError(error)) {
      return null;
    }

    throw error;
  }
}

export function verifyWebhook({ rawBody, signatureHeader }) {
  if (!signatureHeader) {
    throw new Error("Missing Stripe webhook signature");
  }

  try {
    return getStripeClient().webhooks.constructEvent(
      rawBody,
      signatureHeader,
      getStripeConfig().webhookSecret,
    );
  } catch (error) {
    throw new Error(`Invalid Stripe webhook signature: ${error.message}`);
  }
}

export async function normalizeWebhookEvent(event) {
  if (!event?.type) {
    throw new Error("Stripe webhook event type is missing");
  }

  const occurredAt = event.created ? new Date(event.created * 1000) : new Date();

  switch (event.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded":
      return normalizeCheckoutSessionLikeEvent({
        eventId: event.id,
        eventType: event.type,
        session: event.data.object,
        occurredAt,
        status: "succeeded",
      });
    case "checkout.session.expired":
      return normalizeCheckoutSessionLikeEvent({
        eventId: event.id,
        eventType: event.type,
        session: event.data.object,
        occurredAt,
        status: "expired",
      });
    case "checkout.session.async_payment_failed":
      return normalizeCheckoutSessionLikeEvent({
        eventId: event.id,
        eventType: event.type,
        session: event.data.object,
        occurredAt,
        status: "failed",
      });
    case "payment_intent.succeeded":
      return normalizePaymentIntentLikeEvent({
        eventId: event.id,
        eventType: event.type,
        paymentIntent: event.data.object,
        occurredAt,
        status: "succeeded",
      });
    case "payment_intent.payment_failed":
      return normalizePaymentIntentLikeEvent({
        eventId: event.id,
        eventType: event.type,
        paymentIntent: event.data.object,
        occurredAt,
        status: "failed",
      });
    case "charge.refunded":
      return normalizeChargeLikeEvent({
        eventId: event.id,
        eventType: event.type,
        charge: event.data.object,
        occurredAt,
        status: "refunded",
      });
    case "refund.created":
    case "refund.updated":
    case "refund.failed":
      return normalizeRefundLikeEvent({
        eventId: event.id,
        eventType: event.type,
        refund: event.data.object,
        occurredAt,
      });
    default:
      return null;
  }
}

export async function refundPayment({ payment, booking, amount, idempotencyKey }) {
  const amountMinor = toStripeAmount(amount, payment.currency || "VND");
  const refund = await getStripeClient().refunds.create(
    {
      ...(payment.provider_intent_id
        ? { payment_intent: payment.provider_intent_id }
        : { charge: payment.provider_payment_id }),
      amount: amountMinor,
      metadata: buildStripeMetadata({ booking, payment }),
    },
    {
      idempotencyKey:
        idempotencyKey ||
        `bella_refund_${payment._id.toString()}_${amountMinor}_${payment.provider_intent_id || payment.provider_payment_id || "stripe"}`,
    },
  );

  if (refund.status === "failed" || refund.status === "canceled") {
    throw new Error("Stripe refund request failed");
  }

  return {
    normalizedEvent: await normalizeRefundLikeEvent({
      eventId: buildReconciliationEventId("refund", refund.id),
      eventType: "refund.created",
      refund,
      occurredAt: refund.created ? new Date(refund.created * 1000) : new Date(),
    }),
    providerResponseSummary: sanitizePayloadSummary({
      refundId: refund.id,
      refundStatus: refund.status,
    }),
  };
}

export function buildReturnUrlForPayment(payment) {
  return buildFrontendReturnUrl({
    bookingId: payment.booking_id.toString(),
    sessionId: payment.provider_session_id,
  });
}

export function setStripeClientFactoryForTests(factory) {
  stripeClientFactory = factory || createDefaultStripeClient;
  cachedStripeClient = null;
}

export function resetStripeClientFactoryForTests() {
  stripeClientFactory = createDefaultStripeClient;
  cachedStripeClient = null;
}

export default {
  name: PROVIDER_NAME,
  signatureHeader: SIGNATURE_HEADER,
  createCheckoutSession,
  getReusableCheckoutSession,
  expireCheckoutSession,
  verifyWebhook,
  normalizeWebhookEvent,
  refundPayment,
  buildReturnUrlForPayment,
};
