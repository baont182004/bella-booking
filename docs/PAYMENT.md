# Bella Booking Payment Flow

## Providers

`PAYMENT_PROVIDER` selects the payment adapter used by `payment-service`.

- `mock`: local/demo hosted checkout. Supports sandbox card and sandbox bank transfer.
- `stripe`: scaffolded hosted Checkout adapter. Requires real Stripe sandbox/live credentials.
- `payos`: hosted payOS payment link for Vietnamese bank QR checkout. Requires payOS sandbox/live credentials.

Keep `PAYMENT_PROVIDER=mock` for project demos unless real gateway credentials are configured.

Rollback from payOS to mock is only an env change plus payment-service rebuild:

```env
PAYMENT_PROVIDER=mock
```

## Required URLs

- `PAYMENT_PUBLIC_BASE_URL`: public API origin used to build hosted checkout and webhook URLs.
  - Production: `https://bella-booking-api.duckdns.org`
  - Local direct service: `http://localhost:3004`
- `FRONTEND_PUBLIC_URL`: public frontend origin used for payment return redirects.
  - Production: `https://bella-booking.vercel.app`
  - Local Vite: `http://localhost:5173`

The frontend return path is `/payments/return`. Provider webhooks are under:

- `POST /payments/webhooks/mock`
- `POST /payments/webhooks/stripe`
- `POST /payments/webhooks/payos`

## payOS QR Checkout

Set these variables when `PAYMENT_PROVIDER=payos`:

```env
PAYOS_CLIENT_ID=your_payos_client_id
PAYOS_API_KEY=your_payos_api_key
PAYOS_CHECKSUM_KEY=your_payos_checksum_key
PAYOS_RETURN_URL=https://bella-booking.vercel.app/payments/return
PAYOS_CANCEL_URL=https://bella-booking.vercel.app/payments/return
PAYOS_WEBHOOK_URL=https://bella-booking-api.duckdns.org/payments/webhooks/payos
PAYOS_API_BASE_URL=https://api-merchant.payos.vn
```

When the frontend sends `paymentMethodType=bank_transfer` and the active provider is `payos`, payment-service creates a payOS payment link. Bella still computes the amount from the booking in MongoDB; the frontend never sends or controls the payable amount.

payOS identifiers are mapped as follows:

- `Payment.provider_session_id`: `paymentLinkId` when payOS returns it, otherwise the numeric `orderCode`.
- `Payment.provider_intent_id`: numeric `orderCode`.
- `Payment.provider_payment_id`: payOS `reference` after a successful provider event.

The payOS return/cancel URL is only a UX redirect back to `/payments/return`. Booking confirmation only happens after `POST /payments/webhooks/payos` verifies the webhook checksum and processes the provider event.

Webhook verification uses the payOS `signature` value over the webhook `data` object with `PAYOS_CHECKSUM_KEY`. Duplicate webhook deliveries are deduplicated by provider event id before mutating payment or booking state.

Webhook behavior:

- Empty body, missing `data/signature`, or invalid signature returns `400`.
- A valid payOS test/confirm payload that does not match a Bella payment returns `200` with `reason=payment_not_found`.
- Duplicate webhook delivery returns `200` idempotently.
- Success after a booking has already expired/cancelled is not ignored: the payment is marked succeeded, a risk flag/status reason is stored, and the booking is left for manual review instead of silently confirming a stale hold.

To test QR checkout:

1. Configure a payOS sandbox account and set `PAYMENT_PROVIDER=payos`.
2. Register `PAYOS_WEBHOOK_URL` in payOS, or expose local payment-service with a tunnel for sandbox callbacks.
3. Create a booking, then create checkout with `paymentMethodType=bank_transfer`.
4. Open `checkoutSession.checkoutUrl` and complete or cancel the payOS flow.
5. Reload `/payments/return?booking_id=...&session_id=...`; the page reads backend state rather than trusting redirect query params.

## State Machine

Payment statuses:

- `pending`
- `processing`
- `succeeded`
- `failed`
- `cancelled`
- `expired`
- `refunded`
- `partially_refunded`

Booking statuses:

- `pending_payment`
- `confirmed`
- `payment_failed`
- `cancelled`
- `expired`
- `completed`

Important guards:

- `succeeded` payment is never downgraded by late failed/cancelled/expired webhooks.
- `confirmed` booking is never expired by stale hold checks.
- A booking with an already succeeded payment is confirmed instead of expired if a hold expiry check runs late.
- Checkout creation is locked per booking and reuses a live provider session/link for the same provider and payment method.

## Mock Security

`MOCK_PAYMENT_WEBHOOK_SECRET` signs mock webhook payloads with HMAC SHA-256. The signature is sent in:

```text
x-bella-mock-signature: t=<unix_timestamp>,v1=<signature>
```

`PAYMENT_WEBHOOK_TOLERANCE_SECONDS` limits accepted signature timestamp age.

## User Flow

1. User creates a booking through `POST /bookings`.
2. Booking is stored as `pending_payment` with `payment_expires_at`.
3. User starts checkout through `POST /payments/checkout-sessions`.
4. Backend calculates amount from the booking. The frontend never sends amount.
5. Payment-service creates or reuses one active payment session for the booking.
6. Mock hosted checkout allows:
   - Visa success
   - Mastercard success
   - Bank transfer success
   - Card failure
   - Bank transfer failure
   - Expire session
   - Cancel session
7. Provider result is processed through the same verified-event path used by webhooks.
8. Successful payment moves payment to `succeeded` and booking to `confirmed`.
9. Failed payment moves booking to `payment_failed`.
10. Cancelled or expired payment releases the hold by moving booking to `cancelled` or `expired`.

## Demo Commands

Create checkout for card:

```sh
curl -X POST "$API/payments/checkout-sessions" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"bookingId":"BOOKING_ID","paymentMethodType":"card"}'
```

Create checkout for bank transfer:

```sh
curl -X POST "$API/payments/checkout-sessions" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"bookingId":"BOOKING_ID","paymentMethodType":"bank_transfer"}'
```

Read checkout status:

```sh
curl "$API/payments/checkout-sessions/SESSION_ID/status" \
  -H "Authorization: Bearer $TOKEN"
```

Cancel checkout:

```sh
curl -X POST "$API/payments/checkout-sessions/SESSION_ID/cancel" \
  -H "Authorization: Bearer $TOKEN"
```

Mock success/failure/expired/cancel actions are available from the hosted mock checkout page returned in `checkoutSession.checkoutUrl`.

Admin reconciliation for payOS:

```sh
curl -X POST "$API/payments/PAYMENT_ID/reconcile" \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

Admin payment list:

```sh
curl "$API/payments/admin/payments?status=pending&provider=payos" \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

## Troubleshooting

- Webhook `400`: payload is malformed or signature does not match `PAYOS_CHECKSUM_KEY`.
- Webhook `500`: should not happen for payOS after hardening; check `payment-service` logs for `payos webhook error`.
- `payment_not_found`: payOS sent a valid confirm/test payload or a webhook for an orderCode not created by this environment.
- Invalid signature: confirm the payOS channel checksum key and make sure the raw JSON body is proxied unchanged by Nginx.
- Booking not confirmed: check `payments.status`, `payments.risk_flags`, webhook logs, and run admin reconciliation.
- Frontend does not show QR: verify `POST /payments/checkout-sessions` returns `checkoutSession.checkoutUrl` or `checkoutSession.qrCode`.
- CORS/API URL: `FRONTEND_PUBLIC_URL`, `PAYMENT_PUBLIC_BASE_URL`, and Nginx `/payments` proxy must match production domains.

## Deployment Notes

Nginx must proxy `/payments` to `payment-service:3004`. Do not expose service port `3004` publicly; keep Docker bound to `127.0.0.1`.

No real card data is collected by Bella in mock or Stripe hosted checkout flows.

Production rebuild:

```sh
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build payment-service booking-service
```

Frontend changes require a Vercel redeploy. Backend-only payOS env changes only require rebuilding/restarting `payment-service`.

Refund policy: user cancellation before payment cancels the booking/hold. After a succeeded payment, user self-cancel is blocked and support/admin review is required. Admin refund exists only where the selected provider adapter supports it; do not mark real money refunded manually without an operations process.
