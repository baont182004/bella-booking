import {
  isDeclaredPaymentProvider,
  isImplementedPaymentProvider,
  listDeclaredPaymentProviders,
} from "../providers/providerCatalog.js";

const DEFAULT_PAYMENT_PROVIDER = "mock";
const DEFAULT_PAYMENT_PUBLIC_BASE_URL = "http://localhost:3004";
const DEFAULT_FRONTEND_PUBLIC_URL = "http://localhost:5173";
const DEFAULT_CHECKOUT_TTL_MINUTES = 30;
const DEFAULT_WEBHOOK_TOLERANCE_SECONDS = 300;
const PAYMENT_RETURN_PATH = "/payments/return";
const PAYMENT_WEBHOOK_BASE_PATH = "/payments/webhooks";

let cachedConfig = null;

function trimEnv(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeBaseUrl(name, value, fallback) {
  const rawValue = trimEnv(value) || fallback;

  try {
    const url = new URL(rawValue);
    if (!["http:", "https:"].includes(url.protocol)) {
      throw new Error(`${name} must use http or https`);
    }

    url.pathname = url.pathname.replace(/\/+$/, "") || "/";
    url.search = "";
    url.hash = "";

    return url.toString().replace(/\/$/, "");
  } catch (error) {
    throw new Error(`${name} must be an absolute URL. Received "${rawValue}"`);
  }
}

function normalizePositiveInteger(name, value, fallback) {
  const rawValue = trimEnv(value);
  if (!rawValue) {
    return fallback;
  }

  const parsedValue = Number(rawValue);
  if (!Number.isInteger(parsedValue) || parsedValue <= 0) {
    throw new Error(`${name} must be a positive integer. Received "${rawValue}"`);
  }

  return parsedValue;
}

function normalizeProviderName(value) {
  return (trimEnv(value) || DEFAULT_PAYMENT_PROVIDER).toLowerCase();
}

function assertStripeKeyShape(name, value, pattern, description) {
  if (!value) {
    return;
  }

  if (!pattern.test(value)) {
    throw new Error(`${name} must look like ${description}`);
  }
}

function assertStripeApiVersionShape(value) {
  if (!value) {
    return;
  }

  if (!/^\d{4}-\d{2}-\d{2}(?:\.[A-Za-z0-9_]+)?$/.test(value)) {
    throw new Error(
      `STRIPE_API_VERSION must look like "2024-09-30.acacia" or "2024-09-30". Received "${value}"`,
    );
  }
}

function buildConfigError(messages = []) {
  const error = new Error(`Payment configuration error:\n- ${messages.join("\n- ")}`);
  error.name = "PaymentConfigurationError";
  return error;
}

export function getPaymentWebhookPath(provider) {
  return `${PAYMENT_WEBHOOK_BASE_PATH}/${provider}`;
}

export function getPaymentReturnPath() {
  return PAYMENT_RETURN_PATH;
}

export function getPaymentRuntimeConfig() {
  if (cachedConfig) {
    return cachedConfig;
  }

  const provider = normalizeProviderName(process.env.PAYMENT_PROVIDER);
  const validationMessages = [];

  if (!isDeclaredPaymentProvider(provider)) {
    validationMessages.push(
      `PAYMENT_PROVIDER="${provider}" is not supported. Allowed values: ${listDeclaredPaymentProviders().join(", ")}`,
    );
  }

  let paymentPublicBaseUrl;
  let frontendPublicUrl;
  let checkoutTtlMinutes;
  let webhookToleranceSeconds;

  try {
    paymentPublicBaseUrl = normalizeBaseUrl(
      "PAYMENT_PUBLIC_BASE_URL",
      process.env.PAYMENT_PUBLIC_BASE_URL,
      DEFAULT_PAYMENT_PUBLIC_BASE_URL,
    );
    frontendPublicUrl = normalizeBaseUrl(
      "FRONTEND_PUBLIC_URL",
      process.env.FRONTEND_PUBLIC_URL,
      DEFAULT_FRONTEND_PUBLIC_URL,
    );
    checkoutTtlMinutes = normalizePositiveInteger(
      "PAYMENT_CHECKOUT_TTL_MINUTES",
      process.env.PAYMENT_CHECKOUT_TTL_MINUTES,
      DEFAULT_CHECKOUT_TTL_MINUTES,
    );
    webhookToleranceSeconds = normalizePositiveInteger(
      "PAYMENT_WEBHOOK_TOLERANCE_SECONDS",
      process.env.PAYMENT_WEBHOOK_TOLERANCE_SECONDS,
      DEFAULT_WEBHOOK_TOLERANCE_SECONDS,
    );
  } catch (error) {
    validationMessages.push(error.message);
  }

  const mockWebhookSecret =
    trimEnv(process.env.MOCK_PAYMENT_WEBHOOK_SECRET) || "bella-mock-webhook-secret";
  const stripeSecretKey = trimEnv(process.env.STRIPE_SECRET_KEY);
  const stripeWebhookSecret = trimEnv(process.env.STRIPE_WEBHOOK_SECRET);
  const stripeApiVersion = trimEnv(process.env.STRIPE_API_VERSION);

  if (provider === "stripe") {
    if (!stripeSecretKey) {
      validationMessages.push("STRIPE_SECRET_KEY is required when PAYMENT_PROVIDER=stripe");
    }
    if (!stripeWebhookSecret) {
      validationMessages.push("STRIPE_WEBHOOK_SECRET is required when PAYMENT_PROVIDER=stripe");
    }

    try {
      assertStripeKeyShape(
        "STRIPE_SECRET_KEY",
        stripeSecretKey,
        /^(sk|rk)_(test|live)_[A-Za-z0-9]+$/,
        "`sk_test_...`, `sk_live_...`, `rk_test_...`, or `rk_live_...`",
      );
      assertStripeKeyShape(
        "STRIPE_WEBHOOK_SECRET",
        stripeWebhookSecret,
        /^whsec_[A-Za-z0-9]+$/,
        "`whsec_...`",
      );
      assertStripeApiVersionShape(stripeApiVersion);
    } catch (error) {
      validationMessages.push(error.message);
    }

    if (!isImplementedPaymentProvider("stripe")) {
      validationMessages.push(
        'PAYMENT_PROVIDER=stripe is configured, but the Stripe provider adapter is not available. Keep PAYMENT_PROVIDER=mock until `services/payment-service/src/providers/stripeProvider.js` is present and registered.',
      );
    }
  }

  if (validationMessages.length > 0) {
    throw buildConfigError(validationMessages);
  }

  cachedConfig = {
    provider,
    paymentPublicBaseUrl,
    frontendPublicUrl,
    checkoutTtlMinutes,
    webhookToleranceSeconds,
    paymentReturnPath: PAYMENT_RETURN_PATH,
    paymentWebhookBasePath: PAYMENT_WEBHOOK_BASE_PATH,
    frontendReturnUrl: `${frontendPublicUrl}${PAYMENT_RETURN_PATH}`,
    webhookUrls: Object.fromEntries(
      listDeclaredPaymentProviders().map((providerName) => [
        providerName,
        `${paymentPublicBaseUrl}${getPaymentWebhookPath(providerName)}`,
      ]),
    ),
    mock: {
      webhookSecret: mockWebhookSecret,
    },
    stripe: {
      secretKey: stripeSecretKey || null,
      webhookSecret: stripeWebhookSecret || null,
      apiVersion: stripeApiVersion || null,
    },
  };

  return cachedConfig;
}

export function validatePaymentRuntimeConfig() {
  return getPaymentRuntimeConfig();
}

export function resetPaymentRuntimeConfigForTests() {
  cachedConfig = null;
}
