# Bella Booking Payment Flow

## Providers

`PAYMENT_PROVIDER` selects the payment adapter used by `payment-service`.

- `mock`: local/demo hosted checkout. Supports sandbox card and sandbox bank transfer.
- `stripe`: scaffolded hosted Checkout adapter. Requires real Stripe sandbox/live credentials.

Keep `PAYMENT_PROVIDER=mock` for project demos unless real gateway credentials are configured.

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

## Deployment Notes

Nginx must proxy `/payments` to `payment-service:3004`. Do not expose service port `3004` publicly; keep Docker bound to `127.0.0.1`.

No real card data is collected by Bella in mock or Stripe hosted checkout flows.
