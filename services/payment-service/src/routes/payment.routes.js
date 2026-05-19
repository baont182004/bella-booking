import express from "express";
import Joi from "joi";
import mongoose from "mongoose";
import { Payment } from "../config/database.js";
import { getPaymentRuntimeConfig } from "../config/paymentConfig.js";
import { authenticate, requireRole } from "../middleware/auth.js";
import { createRateLimiter } from "../middleware/rateLimit.js";
import { getPaymentProvider, listImplementedPaymentProviders } from "../providers/index.js";
import {
  acquirePaymentLock,
  createHostedCheckoutSession,
  getPaymentStatus,
  isPaymentSuccessful,
  loadBellaBookingById,
  loadOwnedBellaBooking,
  markBookingHoldExpiredIfNeeded,
  markPaymentExpiredIfNeeded,
  processVerifiedProviderEvent,
  recordAuditLog,
  refundPayment,
  releasePaymentLock,
  serializeBookingSummary,
  serializePayment,
} from "../services/paymentFlow.js";

const router = express.Router();

const paymentRateLimit = createRateLimiter({
  windowMs: 10 * 60 * 1000,
  maxRequests: 15,
  message: "Too many payment attempts. Please wait a moment and try again.",
  keyBuilder: (req) => `${String(req.ip || "unknown").replace(/^::ffff:/, "")}:${req.user?.id || "anonymous"}`,
  prefix: "payment-sensitive",
});

const checkoutSessionSchema = Joi.object({
  bookingId: Joi.string().required(),
  provider: Joi.string().valid(...listImplementedPaymentProviders()).optional(),
  paymentMethodType: Joi.string().valid("hosted_checkout", "card", "bank_transfer").default("hosted_checkout"),
  billingName: Joi.string().trim().min(2).max(120).optional(),
  billingEmail: Joi.string().trim().lowercase().email().optional(),
}).unknown(false);

const refundSchema = Joi.object({
  reason: Joi.string().trim().max(300).optional(),
}).unknown(false);

const hostedCheckoutActionSchema = Joi.object({
  action: Joi.string()
    .valid(
      "complete_visa",
      "complete_mastercard",
      "complete_bank_transfer",
      "fail_declined",
      "fail_bank_transfer",
      "expire_session",
      "cancel_session",
    )
    .required(),
  access_token: Joi.string().required(),
}).unknown(false);

function isHostedCheckoutAccessValid(payment, accessToken) {
  return payment?.metadata?.mockCheckout?.accessToken === accessToken;
}

async function processProviderCheckoutAction({ action, payment, booking }) {
  const provider = getPaymentProvider(payment.provider);
  if (typeof provider.createHostedCheckoutEvent !== "function") {
    const error = new Error("This payment provider does not support sandbox checkout actions");
    error.status = 400;
    throw error;
  }

  const event = provider.createHostedCheckoutEvent({
    action,
    payment,
    booking,
  });
  const rawBody = JSON.stringify(event);
  const verifiedEvent =
    typeof provider.buildSignatureHeader === "function"
      ? provider.verifyWebhook({
          rawBody,
          signatureHeader: provider.buildSignatureHeader(rawBody),
        })
      : event;
  const normalizedEvent = await provider.normalizeWebhookEvent(verifiedEvent);

  return processVerifiedProviderEvent({
    normalizedEvent,
    verifiedAt: new Date(),
  });
}

function buildHostedCheckoutHtml({ viewModel, sessionId, accessToken }) {
  const requestedMethodLabel =
    viewModel.requestedPaymentMethodType === "bank_transfer"
      ? "Chuyển khoản ngân hàng sandbox"
      : viewModel.requestedPaymentMethodType === "card"
        ? "Thẻ sandbox"
        : "Hosted checkout sandbox";

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Bella Sandbox Checkout</title>
    <style>
      :root {
        color-scheme: light;
        font-family: "Segoe UI", "Helvetica Neue", Arial, sans-serif;
        --bg: #f6f1e8;
        --card: #fffaf3;
        --ink: #1f2a1f;
        --accent: #1d5c4f;
        --accent-soft: #d8eadf;
        --border: rgba(29, 92, 79, 0.14);
        --danger: #8f312d;
      }
      body {
        margin: 0;
        min-height: 100vh;
        background:
          radial-gradient(circle at top right, rgba(29, 92, 79, 0.12), transparent 36%),
          linear-gradient(180deg, #f8f4ed 0%, var(--bg) 100%);
        color: var(--ink);
      }
      main {
        max-width: 720px;
        margin: 0 auto;
        padding: 48px 20px 72px;
      }
      .card {
        background: var(--card);
        border: 1px solid var(--border);
        border-radius: 28px;
        box-shadow: 0 24px 80px rgba(36, 45, 39, 0.08);
        overflow: hidden;
      }
      .hero {
        padding: 28px 28px 18px;
        background: linear-gradient(135deg, rgba(29, 92, 79, 0.08), rgba(255, 255, 255, 0));
      }
      .eyebrow {
        margin: 0 0 8px;
        font-size: 12px;
        letter-spacing: 0.18em;
        text-transform: uppercase;
        color: #406158;
      }
      h1 {
        margin: 0 0 12px;
        font-size: clamp(28px, 4vw, 42px);
      }
      p {
        line-height: 1.6;
      }
      .note, .summary {
        margin: 0;
        color: #4c5b53;
      }
      .summary-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
        gap: 14px;
        padding: 0 28px 24px;
      }
      .summary-card {
        border: 1px solid var(--border);
        border-radius: 18px;
        padding: 16px;
        background: rgba(255, 255, 255, 0.7);
      }
      .summary-card span {
        display: block;
        font-size: 12px;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: #577067;
        margin-bottom: 6px;
      }
      .summary-card strong {
        font-size: 20px;
      }
      .actions {
        display: grid;
        gap: 14px;
        padding: 0 28px 28px;
      }
      form {
        margin: 0;
      }
      button {
        width: 100%;
        border: none;
        border-radius: 18px;
        padding: 16px 18px;
        text-align: left;
        cursor: pointer;
        font: inherit;
        color: white;
        background: var(--accent);
        box-shadow: 0 16px 40px rgba(29, 92, 79, 0.2);
      }
      button.secondary {
        background: #355f88;
      }
      button.danger {
        background: var(--danger);
      }
      button.neutral {
        background: #6d665f;
      }
      button span {
        display: block;
        opacity: 0.86;
        font-size: 13px;
        margin-top: 4px;
      }
      .footnote {
        padding: 0 28px 28px;
        font-size: 14px;
        color: #4c5b53;
      }
      code {
        background: rgba(29, 92, 79, 0.08);
        padding: 2px 6px;
        border-radius: 6px;
      }
    </style>
  </head>
  <body>
    <main>
      <section class="card">
        <div class="hero">
          <p class="eyebrow">Bella sandbox provider</p>
          <h1>Hosted checkout</h1>
          <p class="note">This sandbox page simulates a third-party hosted checkout. Bella does not collect raw card details here.</p>
        </div>
        <div class="summary-grid">
          <div class="summary-card">
            <span>Booking reference</span>
            <strong>${viewModel.bookingReference}</strong>
          </div>
          <div class="summary-card">
            <span>Amount</span>
            <strong>${Number(viewModel.paymentAmount || 0).toLocaleString("vi-VN")} ${viewModel.currency}</strong>
          </div>
          <div class="summary-card">
            <span>Requested method</span>
            <strong>${requestedMethodLabel}</strong>
          </div>
          <div class="summary-card">
            <span>Guest</span>
            <strong>${viewModel.guestName}</strong>
          </div>
          <div class="summary-card">
            <span>Session</span>
            <strong><code>${sessionId}</code></strong>
          </div>
        </div>
        <div class="actions">
          <form method="post" action="/payments/hosted/mock/${sessionId}/actions">
            <input type="hidden" name="access_token" value="${accessToken}" />
            <input type="hidden" name="action" value="complete_visa" />
            <button type="submit" data-testid="mock-checkout-success-visa">Complete as Visa sandbox<span>Success path. Stores only safe tokenized metadata: brand and last4.</span></button>
          </form>
          <form method="post" action="/payments/hosted/mock/${sessionId}/actions">
            <input type="hidden" name="access_token" value="${accessToken}" />
            <input type="hidden" name="action" value="complete_mastercard" />
            <button type="submit" class="secondary" data-testid="mock-checkout-success-mastercard">Complete as Mastercard sandbox<span>Alternate successful payment metadata for testing card brand handling.</span></button>
          </form>
          <form method="post" action="/payments/hosted/mock/${sessionId}/actions">
            <input type="hidden" name="access_token" value="${accessToken}" />
            <input type="hidden" name="action" value="complete_bank_transfer" />
            <button type="submit" class="secondary" data-testid="mock-checkout-success-bank">Complete bank transfer sandbox<span>Success path for bank checkout / manual transfer simulation.</span></button>
          </form>
          <form method="post" action="/payments/hosted/mock/${sessionId}/actions">
            <input type="hidden" name="access_token" value="${accessToken}" />
            <input type="hidden" name="action" value="fail_declined" />
            <button type="submit" class="danger" data-testid="mock-checkout-fail">Simulate decline<span>Provider rejects the payment. Booking stays unconfirmed until a later verified success.</span></button>
          </form>
          <form method="post" action="/payments/hosted/mock/${sessionId}/actions">
            <input type="hidden" name="access_token" value="${accessToken}" />
            <input type="hidden" name="action" value="fail_bank_transfer" />
            <button type="submit" class="danger" data-testid="mock-checkout-fail-bank">Reject bank transfer sandbox<span>Simulates a bank checkout rejection for demo and testing.</span></button>
          </form>
          <form method="post" action="/payments/hosted/mock/${sessionId}/actions">
            <input type="hidden" name="access_token" value="${accessToken}" />
            <input type="hidden" name="action" value="expire_session" />
            <button type="submit" class="neutral" data-testid="mock-checkout-expire">Expire checkout session<span>Marks the hosted session as expired and returns control to Bella.</span></button>
          </form>
          <form method="post" action="/payments/hosted/mock/${sessionId}/actions">
            <input type="hidden" name="access_token" value="${accessToken}" />
            <input type="hidden" name="action" value="cancel_session" />
            <button type="submit" class="neutral" data-testid="mock-checkout-cancel">Cancel checkout session<span>Simulates a user cancellation at the provider checkout page.</span></button>
          </form>
        </div>
        <p class="footnote">Authoritative booking confirmation only happens after Bella processes a verified provider event server-side. Returning to <code>${viewModel.returnUrl}</code> is UX only.</p>
      </section>
    </main>
  </body>
</html>`;
}

router.post("/", authenticate, async (req, res) => {
  res.status(410).json({
    error:
      "Direct card submission has been removed. Create a hosted checkout session instead.",
  });
});

async function createCheckoutSessionHandler(req, res) {
  let paymentLock = null;

  try {
    const { error, value } = checkoutSessionSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    paymentLock = await acquirePaymentLock(value.bookingId);
    if (!paymentLock) {
      return res.status(409).json({
        error: "Payment is already being prepared for this booking",
      });
    }

    const booking = await loadOwnedBellaBooking(req, res, value.bookingId);
    if (!booking) {
      return;
    }

    const holdExpiryResult = await markBookingHoldExpiredIfNeeded(booking, req.user);
    if (holdExpiryResult.expired) {
      return res.status(409).json({
        error: "This booking hold has expired. Please create a new Bella reservation.",
        booking: serializeBookingSummary(holdExpiryResult.booking),
      });
    }

    if (
      booking.status === "cancelled" ||
      booking.status === "completed" ||
      booking.status === "confirmed" ||
      booking.status === "expired"
    ) {
      return res.status(409).json({
        error: "This booking can no longer start checkout",
      });
    }
    if (!["pending_payment", "payment_failed"].includes(booking.status)) {
      return res.status(409).json({
        error: "Only pending-payment Bella reservations can start checkout here",
      });
    }
    if (!Number.isFinite(Number(booking.total_price)) || Number(booking.total_price) <= 0) {
      return res.status(409).json({ error: "Bella booking total is unavailable" });
    }

    const providerName = value.provider || getPaymentRuntimeConfig().provider;
    const { payment, checkoutSession } = await createHostedCheckoutSession({
      booking,
      actor: req.user,
      providerName,
      billingName: value.billingName,
      billingEmail: value.billingEmail,
      paymentMethodType: value.paymentMethodType,
    });

    res.status(checkoutSession.reused ? 200 : 201).json({
      message: checkoutSession.reused
        ? "Existing checkout session is still active"
        : "Checkout session created successfully",
      checkoutSession,
      payment: serializePayment(payment),
      booking: serializeBookingSummary(booking),
    });
  } catch (error) {
    console.error("Create checkout session error:", error);
    const status = Number.isInteger(error.status) ? error.status : 500;
    res.status(status).json({
      error: status === 500 ? "Failed to create checkout session" : error.message,
    });
  } finally {
    await releasePaymentLock(paymentLock);
  }
}

router.post(["/checkout-sessions", "/checkout"], authenticate, paymentRateLimit, createCheckoutSessionHandler);

router.get("/checkout-sessions/:sessionId/status", authenticate, async (req, res) => {
  let paymentLock = null;

  try {
    const payment = await Payment.findOne({ provider_session_id: req.params.sessionId });
    if (!payment) {
      return res.status(404).json({ error: "Payment session not found" });
    }

    paymentLock = await acquirePaymentLock(payment.booking_id.toString());
    if (!paymentLock) {
      return res.status(409).json({ error: "Payment status is already being refreshed" });
    }

    const lockedPayment = await Payment.findById(payment._id);
    if (!lockedPayment) {
      return res.status(404).json({ error: "Payment session not found" });
    }

    const booking = await loadOwnedBellaBooking(req, res, lockedPayment.booking_id.toString());
    if (!booking) {
      return;
    }

    await markPaymentExpiredIfNeeded(lockedPayment, booking, req.user);

    res.json({
      payment: serializePayment(lockedPayment),
      booking: serializeBookingSummary(booking),
    });
  } catch (error) {
    console.error("Get checkout session status error:", error);
    res.status(500).json({ error: "Failed to fetch checkout status" });
  } finally {
    await releasePaymentLock(paymentLock);
  }
});

router.post("/checkout-sessions/:sessionId/cancel", authenticate, paymentRateLimit, async (req, res) => {
  let paymentLock = null;

  try {
    const payment = await Payment.findOne({ provider_session_id: req.params.sessionId });
    if (!payment) {
      return res.status(404).json({ error: "Payment session not found" });
    }

    paymentLock = await acquirePaymentLock(payment.booking_id.toString());
    if (!paymentLock) {
      return res.status(409).json({ error: "Payment status is already being refreshed" });
    }

    const lockedPayment = await Payment.findById(payment._id);
    if (!lockedPayment) {
      return res.status(404).json({ error: "Payment session not found" });
    }

    const booking = await loadOwnedBellaBooking(req, res, lockedPayment.booking_id.toString());
    if (!booking) {
      return;
    }

    await markPaymentExpiredIfNeeded(lockedPayment, booking, req.user);
    const currentStatus = getPaymentStatus(lockedPayment);
    if (isPaymentSuccessful(currentStatus)) {
      return res.status(409).json({ error: "Paid sessions cannot be cancelled" });
    }
    if (["cancelled", "expired", "failed", "refunded", "partially_refunded"].includes(currentStatus)) {
      return res.json({
        message: "Payment session is already closed",
        payment: serializePayment(lockedPayment),
        booking: serializeBookingSummary(booking),
      });
    }

    await releasePaymentLock(paymentLock);
    paymentLock = null;

    const result = await processProviderCheckoutAction({
      action: "cancel_session",
      payment: lockedPayment,
      booking,
    });

    res.json({
      message: "Payment session cancelled successfully",
      payment: serializePayment(result.payment || lockedPayment),
      booking: serializeBookingSummary(result.booking || booking),
    });
  } catch (error) {
    console.error("Cancel checkout session error:", error);
    const status = Number.isInteger(error.status) ? error.status : 500;
    res.status(status).json({
      error: status === 500 ? "Failed to cancel checkout session" : error.message,
    });
  } finally {
    await releasePaymentLock(paymentLock);
  }
});

router.get("/hosted/mock/:sessionId", async (req, res) => {
  let paymentLock = null;

  try {
    const accessToken = String(req.query.access_token || "");
    const payment = await Payment.findOne({
      provider: "mock",
      provider_session_id: req.params.sessionId,
    });

    if (!payment || !isHostedCheckoutAccessValid(payment, accessToken)) {
      return res.status(404).send("Hosted checkout session not found");
    }

    paymentLock = await acquirePaymentLock(payment.booking_id.toString());
    if (!paymentLock) {
      return res.status(409).send("Hosted checkout session is already being refreshed");
    }

    const lockedPayment = await Payment.findById(payment._id);
    if (!lockedPayment || !isHostedCheckoutAccessValid(lockedPayment, accessToken)) {
      return res.status(404).send("Hosted checkout session not found");
    }

    const booking = await loadBellaBookingById(lockedPayment.booking_id.toString());
    if (!booking) {
      return res.status(404).send("Booking not found");
    }

    await markPaymentExpiredIfNeeded(lockedPayment, booking);

    const viewModel = getPaymentProvider("mock").getHostedCheckoutViewModel({
      payment: lockedPayment,
      booking,
    });

    res.setHeader("Cache-Control", "no-store");
    res.type("html").send(
      buildHostedCheckoutHtml({
        viewModel,
        sessionId: req.params.sessionId,
        accessToken,
      }),
    );
  } catch (error) {
    console.error("Render hosted checkout error:", error);
    res.status(500).send("Failed to render hosted checkout");
  } finally {
    await releasePaymentLock(paymentLock);
  }
});

router.post("/hosted/mock/:sessionId/actions", async (req, res) => {
  let paymentLock = null;

  try {
    const { error, value } = hostedCheckoutActionSchema.validate(req.body);
    if (error) {
      return res.status(400).send(error.details[0].message);
    }

    const payment = await Payment.findOne({
      provider: "mock",
      provider_session_id: req.params.sessionId,
    });
    if (!payment || !isHostedCheckoutAccessValid(payment, value.access_token)) {
      return res.status(404).send("Hosted checkout session not found");
    }

    paymentLock = await acquirePaymentLock(payment.booking_id.toString());
    if (!paymentLock) {
      return res.status(409).send("Checkout session is already being processed");
    }

    const lockedPayment = await Payment.findOne({
      provider: "mock",
      provider_session_id: req.params.sessionId,
    });
    if (!lockedPayment || !isHostedCheckoutAccessValid(lockedPayment, value.access_token)) {
      return res.status(404).send("Hosted checkout session not found");
    }

    const booking = await loadBellaBookingById(lockedPayment.booking_id.toString());
    if (!booking) {
      return res.status(404).send("Booking not found");
    }

    await releasePaymentLock(paymentLock);
    paymentLock = null;

    await processProviderCheckoutAction({
      action: value.action,
      payment: lockedPayment,
      booking,
    });

    res.redirect(getPaymentProvider("mock").buildReturnUrlForPayment(lockedPayment));
  } catch (error) {
    console.error("Hosted checkout action error:", error);
    const status = Number.isInteger(error.status) ? error.status : 500;
    res.status(status).send(status === 500 ? "Failed to process hosted checkout action" : error.message);
  } finally {
    await releasePaymentLock(paymentLock);
  }
});

router.get("/booking/:bookingId", authenticate, async (req, res) => {
  let paymentLock = null;

  try {
    const booking = await loadOwnedBellaBooking(req, res, req.params.bookingId);
    if (!booking) {
      return;
    }

    const payment = await Payment.findOne({ booking_id: booking._id });
    if (!payment) {
      return res.status(404).json({ error: "Payment not found for this booking" });
    }

    paymentLock = await acquirePaymentLock(booking._id.toString());
    if (!paymentLock) {
      return res.status(409).json({ error: "Payment status is already being refreshed" });
    }

    const lockedPayment = await Payment.findById(payment._id);
    if (!lockedPayment) {
      return res.status(404).json({ error: "Payment not found for this booking" });
    }
    const lockedBooking = await loadOwnedBellaBooking(req, res, req.params.bookingId);
    if (!lockedBooking) {
      return;
    }

    await markPaymentExpiredIfNeeded(lockedPayment, lockedBooking, req.user);

    res.json({
      payment: serializePayment(lockedPayment),
      booking: serializeBookingSummary(lockedBooking),
    });
  } catch (error) {
    console.error("Get payment by booking error:", error);
    res.status(500).json({ error: "Failed to fetch payment" });
  } finally {
    await releasePaymentLock(paymentLock);
  }
});

router.get("/:id", authenticate, async (req, res) => {
  let paymentLock = null;

  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ error: "Invalid payment id" });
    }

    const payment = await Payment.findById(req.params.id);
    if (!payment) {
      return res.status(404).json({ error: "Payment not found" });
    }

    paymentLock = await acquirePaymentLock(payment.booking_id.toString());
    if (!paymentLock) {
      return res.status(409).json({ error: "Payment status is already being refreshed" });
    }

    const lockedPayment = await Payment.findById(payment._id);
    if (!lockedPayment) {
      return res.status(404).json({ error: "Payment not found" });
    }

    const booking = await loadOwnedBellaBooking(req, res, lockedPayment.booking_id.toString());
    if (!booking) {
      return;
    }

    await markPaymentExpiredIfNeeded(lockedPayment, booking, req.user);

    res.json({
      payment: serializePayment(lockedPayment),
      booking: serializeBookingSummary(booking),
    });
  } catch (error) {
    console.error("Get payment error:", error);
    res.status(500).json({ error: "Failed to fetch payment" });
  } finally {
    await releasePaymentLock(paymentLock);
  }
});

router.post("/:id/refund", authenticate, requireRole("admin"), paymentRateLimit, async (req, res) => {
  let paymentLock = null;

  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ error: "Invalid payment id" });
    }

    const { error } = refundSchema.validate(req.body || {});
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    const payment = await Payment.findById(req.params.id);
    if (!payment) {
      return res.status(404).json({ error: "Payment not found" });
    }

    paymentLock = await acquirePaymentLock(payment.booking_id.toString());
    if (!paymentLock) {
      return res.status(409).json({ error: "Refund is already being processed for this payment" });
    }

    const lockedPayment = await Payment.findById(req.params.id);
    if (!lockedPayment) {
      return res.status(404).json({ error: "Payment not found" });
    }

    const booking = await loadBellaBookingById(lockedPayment.booking_id.toString());
    if (!booking) {
      return res.status(404).json({ error: "Booking not found" });
    }

    const status = getPaymentStatus(lockedPayment);
    if (!["authorized", "succeeded"].includes(status)) {
      return res.status(400).json({ error: "Only authorized or succeeded payments can be refunded" });
    }
    if (booking.status === "completed") {
      return res.status(409).json({
        error: "Completed stays cannot be refunded through this flow",
      });
    }

    const result = await refundPayment({
      payment: lockedPayment,
      booking,
      actor: req.user,
    });

    await recordAuditLog({
      action: "payment.refund.completed",
      actor: req.user,
      entityType: "payment",
      entityId: lockedPayment._id.toString(),
      metadata: {
        bookingId: booking._id.toString(),
        bookingReference: booking.booking_reference || null,
        provider: lockedPayment.provider,
        paymentStatus: getPaymentStatus(result.payment || lockedPayment),
      },
    });

    res.json({
      message:
        ["refunded", "partially_refunded"].includes(
          getPaymentStatus(result.payment || lockedPayment),
        )
          ? "Refund processed successfully"
          : "Refund requested and awaiting provider confirmation",
      payment: serializePayment(result.payment || lockedPayment),
      booking: serializeBookingSummary(result.booking || booking),
    });
  } catch (error) {
    console.error("Refund payment error:", error);
    const status = Number.isInteger(error.status) ? error.status : 500;
    res.status(status).json({ error: status === 500 ? "Failed to refund payment" : error.message });
  } finally {
    await releasePaymentLock(paymentLock);
  }
});

export default router;
