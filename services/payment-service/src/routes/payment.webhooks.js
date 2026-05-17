import express from "express";
import { getPaymentProvider } from "../providers/index.js";
import { processVerifiedProviderEvent } from "../services/paymentFlow.js";

const router = express.Router();

async function handleProviderWebhook(req, res, providerName) {
  try {
    const provider = getPaymentProvider(providerName);
    const rawBody = Buffer.isBuffer(req.body) ? req.body.toString("utf8") : "";
    if (!rawBody) {
      return res.status(400).json({ error: "Webhook body is required" });
    }

    const signatureHeader = req.get(provider.signatureHeader);

    const event = provider.verifyWebhook({
      rawBody,
      signatureHeader,
    });
    const normalizedEvent = await provider.normalizeWebhookEvent(event);
    if (!normalizedEvent) {
      return res.json({
        received: true,
        ignored: true,
        provider: providerName,
      });
    }
    const result = await processVerifiedProviderEvent({
      normalizedEvent,
      verifiedAt: new Date(),
    });

    if (result.inProgress) {
      return res.status(409).json({
        error: "Webhook event is already being processed",
      });
    }

    res.json({
      received: true,
      duplicate: result.duplicate || false,
      provider: providerName,
    });
  } catch (error) {
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

router.post("/", rawJsonBody, async (req, res) => {
  const providerName = req.query.provider || req.get("x-payment-provider") || process.env.PAYMENT_PROVIDER || "mock";
  return handleProviderWebhook(req, res, providerName);
});

router.post("/:provider", rawJsonBody, async (req, res) => {
  return handleProviderWebhook(req, res, req.params.provider);
});

export default router;
