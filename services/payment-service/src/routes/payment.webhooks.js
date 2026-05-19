import express from "express";
import { getPaymentProvider } from "../providers/index.js";
import {
  findPaymentReferenceForProviderEvent,
  processVerifiedProviderEvent,
} from "../services/paymentFlow.js";
import { createRateLimiter } from "../middleware/rateLimit.js";

const router = express.Router();
const webhookRateLimit = createRateLimiter({
  windowMs: 5 * 60 * 1000,
  maxRequests: 120,
  message: "Too many webhook requests",
  keyBuilder: (req) =>
    `${String(req.ip || "unknown").replace(/^::ffff:/, "")}:${req.params.provider || req.query.provider || "default"}`,
  prefix: "payment-webhook",
});

function isPayosProvider(providerName) {
  return String(providerName || "").toLowerCase() === "payos";
}

function parseJsonForLogging(rawBody) {
  try {
    return rawBody ? JSON.parse(rawBody) : null;
  } catch {
    return null;
  }
}

function getPayosPayloadSummary(payload) {
  const data = payload?.data || {};
  return {
    code: payload?.code || data.code || null,
    success: payload?.success ?? null,
    orderCode: data.orderCode ?? null,
    paymentLinkId: data.paymentLinkId || null,
    reference: data.reference || null,
  };
}

function isWebhookValidationError(error) {
  const message = error?.message || "";
  return (
    /body is required|missing .*data|missing .*signature|signature|invalid json|unexpected end|unexpected token/i.test(
      message,
    ) ||
    error instanceof SyntaxError
  );
}

function isPaymentNotFoundError(error) {
  return /payment not found for verified provider event/i.test(error?.message || "");
}

function isDuplicateWebhookError(error) {
  return error?.code === 11000 || /duplicate key|E11000/i.test(error?.message || "");
}

function getResultStatus(result) {
  return {
    duplicate: result?.duplicate || false,
    inProgress: result?.inProgress || false,
    paymentStatus: result?.payment?.status || result?.payment?.payment_status || null,
    bookingStatus: result?.booking?.status || null,
  };
}

export async function handleProviderWebhook(
  req,
  res,
  providerName,
  {
    getProvider = getPaymentProvider,
    processEvent = processVerifiedProviderEvent,
    findPaymentReference = findPaymentReferenceForProviderEvent,
    logger = console,
  } = {},
) {
  const isPayos = isPayosProvider(providerName);
  const rawBody = Buffer.isBuffer(req.body) ? req.body.toString("utf8") : "";
  const parsedPayload = parseJsonForLogging(rawBody);
  const payloadSummary = isPayos ? getPayosPayloadSummary(parsedPayload) : {};

  try {
    const provider = getProvider(providerName);

    if (isPayos) {
      logger.info("payos webhook received", payloadSummary);
    }

    if (!rawBody) {
      return res.status(400).json({ error: "Webhook body is required" });
    }

    const signatureHeader = req.get(provider.signatureHeader);

    let event;
    try {
      event = provider.verifyWebhook({
        rawBody,
        signatureHeader,
      });
      if (isPayos) {
        logger.info("payos webhook signature verification result", {
          valid: true,
          ...getPayosPayloadSummary(event),
        });
      }
    } catch (verificationError) {
      if (isPayos) {
        logger.warn("payos webhook signature verification result", {
          valid: false,
          ...payloadSummary,
          error: verificationError?.message || "Invalid payOS webhook",
        });
      }
      throw verificationError;
    }

    const normalizedEvent = await provider.normalizeWebhookEvent(event);
    if (!normalizedEvent) {
      if (isPayos) {
        logger.info("payos webhook final processed status", {
          ignored: true,
          ...payloadSummary,
        });
      }
      return res.json({
        received: true,
        ignored: true,
        provider: providerName,
      });
    }

    if (isPayos) {
      const matchingPayment = await findPaymentReference(normalizedEvent);
      if (!matchingPayment) {
        logger.warn("payos webhook matching payment not found", {
          ...getPayosPayloadSummary(event),
          providerEventId: normalizedEvent.providerEventId,
          providerIntentId: normalizedEvent.providerIntentId,
          providerSessionId: normalizedEvent.providerSessionId,
        });
        logger.info("payos webhook final processed status", {
          ignored: true,
          reason: "payment_not_found",
          providerEventId: normalizedEvent.providerEventId,
        });

        return res.status(200).json({
          received: true,
          ignored: true,
          provider: providerName,
          reason: "payment_not_found",
        });
      }

      logger.info("payos webhook matching payment found", {
        paymentId: matchingPayment._id?.toString?.() || String(matchingPayment._id || ""),
        bookingId: matchingPayment.booking_id?.toString?.() || String(matchingPayment.booking_id || ""),
        providerEventId: normalizedEvent.providerEventId,
      });
    }

    const result = await processEvent({
      normalizedEvent,
      verifiedAt: new Date(),
    });

    if (result.inProgress) {
      if (isPayos) {
        logger.info("payos webhook final processed status", {
          ...getResultStatus(result),
          providerEventId: normalizedEvent.providerEventId,
        });
      }
      return res.status(200).json({
        received: true,
        duplicate: true,
        inProgress: true,
        provider: providerName,
      });
    }

    if (isPayos) {
      logger.info("payos webhook final processed status", {
        ...getResultStatus(result),
        providerEventId: normalizedEvent.providerEventId,
      });
    }

    res.json({
      received: true,
      duplicate: result.duplicate || false,
      provider: providerName,
      ...getResultStatus(result),
    });
  } catch (error) {
    if (isPayos) {
      logger.error("payos webhook error", {
        ...payloadSummary,
        message: error?.message || "Unknown payOS webhook error",
        stack: error?.stack,
      });

      if (isWebhookValidationError(error)) {
        return res.status(400).json({
          error: error?.message || "Invalid payOS webhook payload",
        });
      }

      if (isPaymentNotFoundError(error)) {
        logger.warn("payos webhook matching payment not found", payloadSummary);
        logger.info("payos webhook final processed status", {
          ignored: true,
          reason: "payment_not_found",
        });
        return res.status(200).json({
          received: true,
          ignored: true,
          provider: providerName,
          reason: "payment_not_found",
        });
      }

      if (isDuplicateWebhookError(error)) {
        logger.info("payos webhook final processed status", {
          duplicate: true,
        });
        return res.status(200).json({
          received: true,
          duplicate: true,
          provider: providerName,
        });
      }

      logger.info("payos webhook final processed status", {
        processingError: true,
      });
      return res.status(200).json({
        received: true,
        provider: providerName,
        processingError: true,
      });
    }

    const message = error?.message || "";
    const status =
      /unsupported payment provider/i.test(message)
        ? 400
        : /signature/i.test(message) || /webhook/i.test(message)
          ? 400
          : Number.isInteger(error?.status)
            ? error.status
            : 500;

    console.error("Payment webhook error:", error);
    res.status(status).json({
      error: status === 400 ? error.message : "Failed to process payment webhook",
    });
  }
}

const rawJsonBody = express.raw({
  type: ["application/json", "application/*+json"],
  limit: "128kb",
});

router.post("/", webhookRateLimit, rawJsonBody, async (req, res) => {
  const providerName = req.query.provider || req.get("x-payment-provider") || process.env.PAYMENT_PROVIDER || "mock";
  return handleProviderWebhook(req, res, providerName);
});

router.post("/:provider", webhookRateLimit, rawJsonBody, async (req, res) => {
  return handleProviderWebhook(req, res, req.params.provider);
});

export default router;
