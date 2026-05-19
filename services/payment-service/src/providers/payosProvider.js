import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { getPaymentReturnPath, getPaymentRuntimeConfig } from "../config/paymentConfig.js";

const PROVIDER_NAME = "payos";
const SIGNATURE_FIELD = "signature";
const PAYMENT_REQUESTS_PATH = "/v2/payment-requests";

let payosFetchFactory = () => globalThis.fetch;

function getPayosConfig() {
  return getPaymentRuntimeConfig().payos;
}

function getPayosFetch() {
  const client = payosFetchFactory();
  if (typeof client !== "function") {
    throw new Error("payOS fetch client is not available");
  }
  return client;
}

function sortObjDataByKey(object = {}) {
  return Object.keys(object)
    .sort()
    .reduce((nextObject, key) => {
      nextObject[key] = object[key];
      return nextObject;
    }, {});
}

function serializeSignatureValue(value) {
  if ([null, undefined, "undefined", "null"].includes(value)) {
    return "";
  }
  if (Array.isArray(value)) {
    return JSON.stringify(value.map((item) => (item && typeof item === "object" ? sortObjDataByKey(item) : item)));
  }
  return String(value);
}

export function buildPayosSignaturePayload(data = {}) {
  return Object.entries(sortObjDataByKey(data))
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${key}=${serializeSignatureValue(value)}`)
    .join("&");
}

export function createPayosSignature(data, checksumKey = getPayosConfig().checksumKey) {
  return createHmac("sha256", checksumKey)
    .update(buildPayosSignaturePayload(data))
    .digest("hex");
}

function compareSignatures(expected, actual) {
  const expectedBuffer = Buffer.from(expected || "", "utf8");
  const actualBuffer = Buffer.from(actual || "", "utf8");
  if (expectedBuffer.length !== actualBuffer.length) {
    return false;
  }
  return timingSafeEqual(expectedBuffer, actualBuffer);
}

function buildFrontendReturnUrl({ bookingId, sessionId, baseUrl = getPaymentRuntimeConfig().frontendPublicUrl }) {
  const returnUrl = new URL(getPaymentReturnPath(), baseUrl);
  returnUrl.searchParams.set("provider", PROVIDER_NAME);
  returnUrl.searchParams.set("booking_id", bookingId);
  if (sessionId) {
    returnUrl.searchParams.set("session_id", sessionId);
  }
  return returnUrl.toString();
}

function buildConfiguredPayosUrl(baseUrl, { bookingId, sessionId }) {
  const url = new URL(baseUrl);
  url.searchParams.set("provider", PROVIDER_NAME);
  url.searchParams.set("booking_id", bookingId);
  if (sessionId) {
    url.searchParams.set("session_id", sessionId);
  }
  return url.toString();
}

function buildPayosOrderCode(payment) {
  const paymentId = payment?._id?.toString?.() || "";
  const tail = paymentId.slice(-10);
  const parsedTail = Number.parseInt(tail || "0", 16);
  if (Number.isFinite(parsedTail) && parsedTail > 0) {
    return parsedTail;
  }
  return Date.now();
}

function buildPayosDescription(booking) {
  const reference = String(booking.booking_reference || booking._id?.toString?.() || "BELLA")
    .replace(/[^A-Za-z0-9]/g, "")
    .slice(-12);
  return `BELLA ${reference}`.slice(0, 25);
}

function normalizePayosStatus(value, success = false) {
  const status = String(value || "").trim().toUpperCase();
  if (success || status === "PAID" || status === "SUCCEEDED" || status === "SUCCESS") {
    return "succeeded";
  }
  if (status === "CANCELLED" || status === "CANCELED") {
    return "cancelled";
  }
  if (status === "EXPIRED") {
    return "expired";
  }
  if (status === "FAILED") {
    return "failed";
  }
  return "processing";
}

function sanitizePayloadSummary(summary = {}) {
  return Object.fromEntries(
    Object.entries(summary).filter(([, value]) => value !== undefined && value !== null && value !== ""),
  );
}

function buildFallbackEventId({ data = {}, status, signature }) {
  const signatureHash = createHash("sha256")
    .update(String(signature || "missing_signature"))
    .digest("hex")
    .slice(0, 24);
  const orderCode = data.orderCode === undefined || data.orderCode === null ? "unknown" : String(data.orderCode);

  return `${PROVIDER_NAME}:${orderCode}:${status}:${signatureHash}`;
}

async function requestPayos(path, { method = "GET", body = null } = {}) {
  const config = getPayosConfig();
  const response = await getPayosFetch()(`${config.apiBaseUrl}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "x-client-id": config.clientId,
      "x-api-key": config.apiKey,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.code !== "00") {
    const error = new Error(payload.desc || `payOS request failed with status ${response.status}`);
    error.status = response.status >= 400 && response.status < 500 ? 400 : 502;
    error.providerPayload = sanitizePayloadSummary({
      code: payload.code,
      desc: payload.desc,
    });
    throw error;
  }

  return payload;
}

export async function createCheckoutSession({
  booking,
  payment,
  billingName,
  billingEmail,
}) {
  const config = getPayosConfig();
  const amount = Math.round(Number(booking.total_price || payment.amount || 0));
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new Error("payOS amount must be a positive VND integer");
  }

  const bookingId = booking._id.toString();
  const orderCode = buildPayosOrderCode(payment);
  const provisionalSessionId = String(orderCode);
  const returnUrl = buildConfiguredPayosUrl(config.returnUrl, {
    bookingId,
    sessionId: provisionalSessionId,
  });
  const cancelUrl = buildConfiguredPayosUrl(config.cancelUrl, {
    bookingId,
    sessionId: provisionalSessionId,
  });
  const description = buildPayosDescription(booking);
  const signaturePayload = {
    amount,
    cancelUrl,
    description,
    orderCode,
    returnUrl,
  };
  const expiresAt = new Date(Date.now() + getPaymentRuntimeConfig().checkoutTtlMinutes * 60 * 1000);
  const paymentData = {
    ...signaturePayload,
    buyerName: billingName || payment.billing_name || booking.guest_full_name || undefined,
    buyerEmail: billingEmail || payment.billing_email || booking.guest_email || undefined,
    webhookUrl: config.webhookUrl,
    items: [
      {
        name: `Bella ${booking.booking_reference || bookingId}`.slice(0, 120),
        quantity: 1,
        price: amount,
      },
    ],
    expiredAt: Math.floor(expiresAt.getTime() / 1000),
    signature: createPayosSignature(signaturePayload, config.checksumKey),
  };

  const payload = await requestPayos(PAYMENT_REQUESTS_PATH, {
    method: "POST",
    body: paymentData,
  });
  const data = payload.data || {};
  const providerSessionId = data.paymentLinkId || String(data.orderCode || orderCode);
  const qrCode = data.qrCode || data.qrCodeUrl || null;

  return {
    provider: PROVIDER_NAME,
    providerSessionId,
    providerIntentId: String(data.orderCode || orderCode),
    providerPaymentId: data.reference || null,
    checkoutUrl: data.checkoutUrl,
    qrCode,
    returnUrl: buildFrontendReturnUrl({
      bookingId,
      sessionId: providerSessionId,
    }),
    expiresAt,
    status: "pending",
    paymentMethodType: "bank_transfer",
    providerPayloadSummary: sanitizePayloadSummary({
      mode: "payos_payment_link",
      orderCode: data.orderCode || orderCode,
      paymentLinkId: providerSessionId,
      amount: data.amount || amount,
      currency: data.currency || "VND",
      status: data.status,
      checkoutUrl: data.checkoutUrl,
      qrCode,
      webhookUrl: config.webhookUrl,
    }),
    internalMetadata: {
      payos: {
        orderCode: data.orderCode || orderCode,
        paymentLinkId: providerSessionId,
        qrCode,
        checkoutUrl: data.checkoutUrl || null,
      },
    },
  };
}

export async function getReusableCheckoutSession({ payment, booking }) {
  if (!payment?.provider_intent_id && !payment?.provider_session_id) {
    return null;
  }

  const lookupId = payment.provider_intent_id || payment.provider_session_id;
  const payload = await requestPayos(`${PAYMENT_REQUESTS_PATH}/${lookupId}`);
  const data = payload.data || {};
  const normalizedStatus = normalizePayosStatus(data.status);
  if (normalizedStatus !== "processing" || !data.checkoutUrl) {
    return null;
  }

  return {
    provider: PROVIDER_NAME,
    sessionId: data.id || payment.provider_session_id,
    checkoutUrl: data.checkoutUrl,
    qrCode: data.qrCode || data.qrCodeUrl || payment.provider_payload_summary?.qrCode || null,
    expiresAt: payment.checkout_session_expires_at,
    returnUrl: buildFrontendReturnUrl({
      bookingId: booking._id.toString(),
      sessionId: data.id || payment.provider_session_id,
    }),
    reused: true,
  };
}

export async function expireCheckoutSession({ payment }) {
  const lookupId = payment?.provider_intent_id || payment?.provider_session_id;
  if (!lookupId) {
    return null;
  }

  try {
    return await requestPayos(`${PAYMENT_REQUESTS_PATH}/${lookupId}/cancel`, {
      method: "POST",
      body: {
        cancellationReason: "Bella checkout session replaced or expired",
      },
    });
  } catch (error) {
    if (/cannot be cancelled|không thể hủy|not found|không tồn tại/i.test(error.message)) {
      return null;
    }
    throw error;
  }
}

export function verifyWebhook({ rawBody }) {
  const payload = typeof rawBody === "string" ? JSON.parse(rawBody) : rawBody;
  if (!payload?.data || !payload?.signature) {
    throw new Error("Missing payOS webhook data or signature");
  }

  const expectedSignature = createPayosSignature(payload.data, getPayosConfig().checksumKey);
  if (!compareSignatures(expectedSignature, payload.signature)) {
    throw new Error("Invalid payOS webhook signature");
  }

  return payload;
}

export function normalizeWebhookEvent(event) {
  const data = event?.data || {};
  const status = normalizePayosStatus(data.status || data.code, event?.success === true && data.code === "00");
  const orderCode = data.orderCode === undefined || data.orderCode === null ? null : String(data.orderCode);
  const providerEventId = data.reference ||
    (data.paymentLinkId ? `${PROVIDER_NAME}:${data.paymentLinkId}:${status}` : null) ||
    buildFallbackEventId({ data, status, signature: event?.signature });

  return {
    provider: PROVIDER_NAME,
    providerEventId,
    eventType: `payos.payment.${status}`,
    providerSessionId: data.paymentLinkId || null,
    providerIntentId: orderCode,
    providerPaymentId: data.reference || null,
    providerCustomerId: null,
    bookingId: null,
    amount: Number(data.amount || 0),
    currency: data.currency || "VND",
    status,
    paymentMethodType: "bank_transfer",
    cardBrand: null,
    cardLast4: null,
    billingName: data.counterAccountName || null,
    billingEmail: null,
    failureCode: status === "failed" ? data.code || "payos_failed" : null,
    failureMessage: status === "failed" ? data.desc || event?.desc || "payOS payment failed" : null,
    riskFlags: [],
    occurredAt: data.transactionDateTime ? new Date(data.transactionDateTime) : new Date(),
    payloadSummary: sanitizePayloadSummary({
      orderCode,
      paymentLinkId: data.paymentLinkId,
      reference: data.reference,
      amount: Number(data.amount || 0),
      currency: data.currency || "VND",
      status,
      code: data.code,
      desc: data.desc || event?.desc,
      transactionDateTime: data.transactionDateTime,
    }),
  };
}

export function buildReturnUrlForPayment(payment) {
  return buildFrontendReturnUrl({
    bookingId: payment.booking_id.toString(),
    sessionId: payment.provider_session_id || payment.provider_intent_id,
  });
}

export function setPayosFetchFactoryForTests(factory) {
  payosFetchFactory = factory || (() => globalThis.fetch);
}

export function resetPayosFetchFactoryForTests() {
  payosFetchFactory = () => globalThis.fetch;
}

export default {
  name: PROVIDER_NAME,
  signatureHeader: SIGNATURE_FIELD,
  createCheckoutSession,
  getReusableCheckoutSession,
  expireCheckoutSession,
  verifyWebhook,
  normalizeWebhookEvent,
  buildReturnUrlForPayment,
};
