# Bella Payment Integration Baseline

## Overview

This repo no longer accepts raw card details through Bella-owned frontend forms or backend payment APIs.

Current baseline:

- Frontend creates a booking in `pending`
- Frontend requests `POST /payments/checkout-sessions`
- Backend creates or reuses a hosted-checkout session through the payment provider abstraction
- Browser is redirected to the provider-hosted checkout page
- Provider success or failure is authoritative only after Bella processes a verified server-side event
- Frontend return page polls Bella backend for authoritative payment and booking status
- Authentication still uses a bearer token stored by the SPA today; payment data is kept out of browser storage, but a BFF + `HttpOnly` cookie migration remains a follow-up before real go-live

The default provider in this repo is `mock`, a sandbox hosted-checkout implementation designed to exercise:

- successful payment confirmation
- failed payment retry
- expired checkout session
- admin refund flow
- webhook signature verification and idempotency

## What Is Stored

Bella stores safe payment metadata only:

- `provider`
- `provider_payment_id`
- `provider_intent_id`
- `provider_session_id`
- `provider_event_id`
- `provider_customer_id`
- `amount`, `currency`
- `amount_authorized`, `amount_captured`, `amount_refunded`
- `payment_method_type`
- `card_brand`
- `card_last4`
- `card_exp_month`
- `card_exp_year`
- `billing_name`
- `billing_email`
- `status`, `status_reason`
- `failure_code`, `failure_message`
- `authorized_at`, `captured_at`, `failed_at`, `refunded_at`
- `webhook_verified_at`
- `idempotency_key`
- sanitized `provider_payload_summary`
- `risk_flags`

Legacy compatibility fields such as `payment_status`, `payment_date`, and `transaction_id` are still populated for older consumers and demo data migration, but they mirror the safe provider-derived model above.

## What Is Never Stored

Bella never stores:

- full card number typed into Bella-owned forms
- card security code typed into Bella-owned forms
- manual card expiration data typed into Bella-owned forms
- full provider webhook payloads containing unnecessary sensitive data
- raw cardholder input in localStorage, Redux, React context, Kafka payloads, or audit logs

## Current Flow

1. User selects room and stay dates.
2. Booking service creates a `pending` booking with server-side pricing snapshot and `payment_expires_at`.
3. Frontend requests `POST /payments/checkout-sessions`.
4. Payment service creates or reuses a provider checkout session.
5. Frontend is redirected to hosted checkout.
6. Provider completes, fails, or expires the session.
7. Bella verifies a signed provider event through `/payments/webhooks/:provider`. The local mock hosted-checkout simulator signs a synthetic event and sends it through the same provider verification path before state changes are applied.
8. Payment service updates the payment record idempotently.
9. Booking is confirmed only if the verified payment result is successful.
10. Outbox events are persisted and published after state changes for notifications and downstream consumers.
11. Frontend return page reads Bella status from backend instead of trusting query params.
12. Admin refunds follow provider abstraction plus the same authoritative state update path.

## Payment Status Model

Payment statuses:

- `pending`
- `requires_action`
- `processing`
- `authorized`
- `completed`
- `failed`
- `refunded`
- `partially_refunded`
- `expired`

Booking statuses relevant to payment:

- `pending`
- `confirmed`
- `expired`
- `cancelled`
- `completed`

## Idempotency Strategy

Checkout creation:

- per-booking Redis lock prevents duplicate session creation races
- active `requires_action` sessions are reused when still valid
- `idempotency_key` is stored on the payment record

Webhook processing:

- `payment_webhook_events` stores `provider + provider_event_id`
- processed events are returned as duplicates without changing state again
- failed processing attempts can be retried safely

Event publication:

- booking-service and payment-service both persist domain events into service-specific outbox collections
- a background outbox processor retries Kafka publication with backoff
- when `MONGODB_TRANSACTIONS_ENABLED=true`, state changes and outbox inserts commit in the same MongoDB transaction; when it is `false`, writes remain sequential best-effort and should not be treated as production-grade durability

## Canonical Env Model

Use these files:

- root `.env`
  Used by `docker compose` and repo-level scripts such as reset/seed helpers.
- `services/payment-service/.env`
  Used when running payment-service directly outside compose.
- `services/booking-service/.env`
  Used when running booking-service directly outside compose.
- `services/user-service/.env`
  Used when running user-service directly outside compose.
- `frontend/.env`
  Used only by the Vite SPA for browser-visible service URLs.

Current service behavior:

- `PAYMENT_PROVIDER=mock` works today.
- `PAYMENT_PROVIDER=stripe` now uses a real Stripe hosted-checkout sandbox adapter.
- The webhook path is fixed in code and deliberately not configurable:
  `${PAYMENT_PUBLIC_BASE_URL}/payments/webhooks/${PAYMENT_PROVIDER}`
- The frontend return path is fixed in code and deliberately not configurable:
  `${FRONTEND_PUBLIC_URL}/payments/return`
- Bella currently assumes `VND` end-to-end. A runtime multi-currency env was intentionally not added yet because the frontend and booking snapshots are still VND-bound.

Service examples were updated in:

- `.env.example`
- `services/payment-service/.env.example`
- `services/booking-service/.env.example`
- `services/user-service/.env.example`
- `frontend/.env.example`

## Local Development Bootstrap

The root `.env` is required for `docker compose` in this repo.

- If `.env` is missing, `docker compose up` or `npm run backend:up` will fail before boot because compose requires values such as `JWT_SECRET`.
- The repo now includes a localhost-safe root `.env` copied from `.env.example`.
- `PAYMENT_PROVIDER=mock` is the default local path and does not require Stripe credentials.

### Ready to use as-is on localhost

These values are already safe defaults for a local mock run:

- `MONGODB_URI=mongodb://127.0.0.1:27017/bella_hotel`
- `MONGODB_URI_DOCKER=mongodb://mongo:27017/bella_hotel`
- `KAFKA_BROKER=localhost:9093`
- `REDIS_HOST=localhost`
- `REDIS_PORT=6379`
- `JWT_EXPIRES_IN=12h`
- `CORS_ORIGIN=http://localhost:5173,http://127.0.0.1:5173,http://localhost:4173,http://127.0.0.1:4173`
- `TRUST_PROXY=1`
- `FRONTEND_PUBLIC_URL=http://localhost:5173`
- `PAYMENT_PUBLIC_BASE_URL=http://localhost:3004`
- `PAYMENT_PROVIDER=mock`
- `PAYMENT_CHECKOUT_TTL_MINUTES=30`
- `PAYMENT_HOLD_WINDOW_MINUTES=30`
- `PAYMENT_WEBHOOK_TOLERANCE_SECONDS=300`
- `MONGODB_TRANSACTIONS_ENABLED=false`
- `SMTP_HOST=smtp.gmail.com`
- `SMTP_PORT=587`

### Variables you should review before running

- `JWT_SECRET`
  Required for backend boot. Replace the placeholder with a random secret before meaningful local testing.
- `MOCK_PAYMENT_WEBHOOK_SECRET`
  The mock provider can still work with the current placeholder in personal localhost testing, but replace it for any shared dev or staging environment.
- `SMTP_USER`, `SMTP_PASS`
  Optional for first local boot. Keep the placeholder values if you do not need email delivery yet.
- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`
  Can stay as placeholders while `PAYMENT_PROVIDER=mock`. They must be replaced before switching to Stripe.
- `FRONTEND_PUBLIC_URL`, `PAYMENT_PUBLIC_BASE_URL`
  Keep localhost defaults unless you run the frontend or payment-service on different hosts, ports, or a public tunnel.

### Generate a secure local `JWT_SECRET`

Use Node so the command works anywhere Node already runs for this repo:

```bash
node --input-type=module -e "import { randomBytes } from 'node:crypto'; console.log(randomBytes(48).toString('hex'))"
```

Paste the output into `JWT_SECRET=` in the root `.env`.

### Optional but recommended `frontend/.env`

The SPA already falls back to `http://localhost:3001` through `:3004` if `frontend/.env` is missing, so frontend boot is not blocked by it.

If you want explicit frontend config, copy `frontend/.env.example` to `frontend/.env` and keep:

```dotenv
VITE_USER_SERVICE_URL=http://localhost:3001
VITE_HOTEL_SERVICE_URL=http://localhost:3002
VITE_BOOKING_SERVICE_URL=http://localhost:3003
VITE_PAYMENT_SERVICE_URL=http://localhost:3004
```

### Verify `.env` is being read correctly

1. Check compose interpolation:

```bash
docker compose --env-file .env config
```

2. Start backend containers:

```bash
npm run backend:up
```

3. Check container status:

```bash
docker compose ps
```

4. Check health endpoints:

```bash
curl.exe http://localhost:3001/health
curl.exe http://localhost:3002/health
curl.exe http://localhost:3003/health
curl.exe http://localhost:3004/health
```

5. Check payment-service startup log. For the mock path, you should see `provider=mock` and the derived webhook URL in logs:

```bash
docker compose logs payment-service --tail 50
```

## Payment Variables

### Shared payment and platform vars

- `PAYMENT_PROVIDER`
  Used by: root `.env`, `services/payment-service/.env`
  Secret?: no
  Who sets it: Bella engineers manually
  Allowed values now: `mock`, `stripe`
  Notes: keep `mock` as the safe default for local demos; switch to `stripe` when sandbox keys and webhook registration are ready
  Example: `PAYMENT_PROVIDER=mock`

- `PAYMENT_PUBLIC_BASE_URL`
  Used by: root `.env`, `services/payment-service/.env`
  Secret?: no
  Source: Bella payment-service public URL, reverse proxy URL, or local tunnel URL
  Example: `PAYMENT_PUBLIC_BASE_URL=https://payments-sandbox.bella.example`

- `FRONTEND_PUBLIC_URL`
  Used by: root `.env`, `services/payment-service/.env`
  Secret?: no
  Source: Bella frontend URL
  Example: `FRONTEND_PUBLIC_URL=https://app-sandbox.bella.example`

- `PAYMENT_CHECKOUT_TTL_MINUTES`
  Used by: root `.env`, `services/payment-service/.env`
  Secret?: no
  Source: Bella business decision
  Example: `PAYMENT_CHECKOUT_TTL_MINUTES=30`

- `PAYMENT_HOLD_WINDOW_MINUTES`
  Used by: root `.env`, `services/booking-service/.env`
  Secret?: no
  Source: Bella business decision
  Example: `PAYMENT_HOLD_WINDOW_MINUTES=30`

- `PAYMENT_WEBHOOK_TOLERANCE_SECONDS`
  Used by: root `.env`, `services/payment-service/.env`
  Secret?: no
  Source: Bella engineering choice
  Notes: replay tolerance used when verifying signed webhook timestamps
  Example: `PAYMENT_WEBHOOK_TOLERANCE_SECONDS=300`

- `MONGODB_TRANSACTIONS_ENABLED`
  Used by: root `.env`, `services/payment-service/.env`, `services/booking-service/.env`
  Secret?: no
  Source: Bella deployment topology
  Notes: set to `true` only on a MongoDB replica set
  Example: `MONGODB_TRANSACTIONS_ENABLED=true`

- `TRUST_PROXY`
  Used by: root `.env`, every backend service
  Secret?: no
  Source: Bella deployment topology
  Notes: use the exact trusted hop count, `true`, or `false`
  Example: `TRUST_PROXY=1`

### Mock-provider vars

- `MOCK_PAYMENT_WEBHOOK_SECRET`
  Used by: root `.env`, `services/payment-service/.env`
  Secret?: yes
  Source: Bella-generated shared secret for the built-in mock provider
  Notes: optional for localhost because payment-service falls back to `bella-mock-webhook-secret`, but set it explicitly in shared environments so signatures are stable
  Example: `MOCK_PAYMENT_WEBHOOK_SECRET=change_me_mock_webhook_secret`

### Stripe sandbox vars

- `STRIPE_SECRET_KEY`
  Used by: root `.env`, `services/payment-service/.env`
  Secret?: yes
  Source: Stripe Dashboard -> Developers -> API keys -> test mode or sandbox secret key
  Example: `STRIPE_SECRET_KEY=sk_test_...`

- `STRIPE_WEBHOOK_SECRET`
  Used by: root `.env`, `services/payment-service/.env`
  Secret?: yes
  Source: Stripe Workbench -> Webhooks -> select endpoint -> reveal signing secret
  Example: `STRIPE_WEBHOOK_SECRET=whsec_...`

- `STRIPE_API_VERSION`
  Used by: root `.env`, `services/payment-service/.env`
  Secret?: no
  Source: Stripe Dashboard default API version, or the explicit API version you choose when creating the webhook endpoint
  Notes: optional; leave blank if you want the current Stripe adapter to use Stripe SDK/account defaults
  Example: `STRIPE_API_VERSION=2024-09-30.acacia`

### Frontend URL vars

- `VITE_USER_SERVICE_URL`
  Used by: `frontend/.env`
  Secret?: no
  Source: Bella user-service browser URL
  Example: `VITE_USER_SERVICE_URL=http://localhost:3001`

- `VITE_HOTEL_SERVICE_URL`
  Used by: `frontend/.env`
  Secret?: no
  Source: Bella hotel-service browser URL
  Example: `VITE_HOTEL_SERVICE_URL=http://localhost:3002`

- `VITE_BOOKING_SERVICE_URL`
  Used by: `frontend/.env`
  Secret?: no
  Source: Bella booking-service browser URL
  Example: `VITE_BOOKING_SERVICE_URL=http://localhost:3003`

- `VITE_PAYMENT_SERVICE_URL`
  Used by: `frontend/.env`
  Secret?: no
  Source: Bella payment-service browser URL
  Example: `VITE_PAYMENT_SERVICE_URL=http://localhost:3004`

No publishable provider key is required today because Bella does not embed Stripe.js or Elements in the SPA. The current hosted-checkout baseline redirects the browser to a provider URL created server-side.

## Variables That Need Manual Input

- `JWT_SECRET`
  Used for: signing and verifying Bella JWTs across backend services
  Secret?: yes
  Where it comes from: generated by Bella developers locally or stored in a secret manager
  Example format: `JWT_SECRET=4aab3f...`

- `MOCK_PAYMENT_WEBHOOK_SECRET`
  Used for: signing mock-provider webhook payloads
  Secret?: yes
  Where it comes from: generated locally by Bella developers
  Example format: `MOCK_PAYMENT_WEBHOOK_SECRET=local-mock-webhook-secret-123`

- `STRIPE_SECRET_KEY`
  Used for: server-to-server Stripe API calls when `PAYMENT_PROVIDER=stripe`
  Secret?: yes
  Where it comes from: Stripe Dashboard -> Developers -> API keys -> test mode secret key
  Example format: `STRIPE_SECRET_KEY=sk_test_...`

- `STRIPE_WEBHOOK_SECRET`
  Used for: verifying `Stripe-Signature` on raw webhook requests
  Secret?: yes
  Where it comes from: Stripe Workbench -> Webhooks -> Bella endpoint -> Signing secret
  Example format: `STRIPE_WEBHOOK_SECRET=whsec_...`

- `SMTP_USER`
  Used for: authenticating notification-service to an SMTP server
  Secret?: yes
  Where it comes from: your SMTP provider account, for example a Gmail address or mail service username
  Example format: `SMTP_USER=bella.notifications@example.com`

- `SMTP_PASS`
  Used for: authenticating notification-service to an SMTP server
  Secret?: yes
  Where it comes from: SMTP app password, provider-issued credential, or mail relay password
  Example format: `SMTP_PASS=abcd1234appsecret`

- `FRONTEND_PUBLIC_URL`
  Used for: composing the hosted-checkout return URL that points back to Bella
  Secret?: no
  Where it comes from: the actual frontend URL users open in the browser
  Example format: `FRONTEND_PUBLIC_URL=http://localhost:5173`

- `PAYMENT_PUBLIC_BASE_URL`
  Used for: composing the public webhook endpoint and provider return references
  Secret?: no
  Where it comes from: the public URL for payment-service, or `http://localhost:3004` in pure localhost mock testing
  Example format: `PAYMENT_PUBLIC_BASE_URL=http://localhost:3004`

## Mock Webhook Setup

Webhook endpoint:

- `POST ${PAYMENT_PUBLIC_BASE_URL}/payments/webhooks/mock`

Header:

- `x-bella-mock-signature`

Signature format:

- `t=<unix timestamp>,v1=<hex hmac sha256>`
- HMAC input is `<timestamp>.<raw request body>`
- secret is `MOCK_PAYMENT_WEBHOOK_SECRET`

The local hosted-checkout page under `/payments/hosted/mock/:sessionId` simulates provider behavior without requiring raw card input.

## How To Obtain And Set Sandbox Vars

### 1. Decide which provider Bella should boot with

- For the current repo: set `PAYMENT_PROVIDER=mock`
- To run the real Stripe sandbox adapter: set `PAYMENT_PROVIDER=stripe` after `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, and a public `PAYMENT_PUBLIC_BASE_URL` are ready

### 2. Decide Bella public URLs

- `FRONTEND_PUBLIC_URL`
  This is the browser URL for the Bella SPA. In local dev it is usually `http://localhost:5173`.
- `PAYMENT_PUBLIC_BASE_URL`
  This is the public URL for payment-service. In local mock mode it can stay `http://localhost:3004`. For Stripe dashboard webhooks it must become a public HTTPS URL, usually through:
  - a sandbox deployment URL
  - an ingress/reverse proxy URL
  - a local tunnel such as `ngrok` or Cloudflare Tunnel

Derived URLs:

- frontend return URL:
  `${FRONTEND_PUBLIC_URL}/payments/return`
- provider webhook URL:
  `${PAYMENT_PUBLIC_BASE_URL}/payments/webhooks/${PAYMENT_PROVIDER}`

### 3. Obtain Stripe sandbox keys

Use Stripe’s official docs for API keys and webhooks:

- API keys: https://docs.stripe.com/keys
- Webhooks: https://docs.stripe.com/webhooks
- Test mode / sandboxes: https://docs.stripe.com/testing-use-cases

In the Stripe Dashboard:

1. Sign in to Stripe.
2. Switch to **test mode** or open a **sandbox** environment.
3. Open **Developers** -> **API keys**.
4. Copy the sandbox secret key that starts with `sk_test_` and place it in:
   - root `.env` as `STRIPE_SECRET_KEY` when using compose
   - or `services/payment-service/.env` when running payment-service directly
5. Do not place this value in `frontend/.env`.

### 4. Obtain a Stripe webhook signing secret

In the Stripe Dashboard:

1. Open **Workbench** -> **Webhooks**.
2. Click **Create an event destination**.
3. Choose **Account** for events from your own Stripe account.
4. Choose the event types Bella will need first:
   - `checkout.session.completed`
   - `checkout.session.async_payment_succeeded`
   - `checkout.session.async_payment_failed`
   - `checkout.session.expired`
   - `payment_intent.succeeded`
   - `payment_intent.payment_failed`
   - `charge.refunded`
   - `refund.created`
   - `refund.updated`
   - `refund.failed`
5. Choose **Webhook endpoint** as the destination type.
6. Set the endpoint URL to:
   - `${PAYMENT_PUBLIC_BASE_URL}/payments/webhooks/stripe`
7. Choose the API version for the endpoint, or rely on the account default.
8. Save the endpoint.
9. Re-open that endpoint and reveal the **Signing secret**.
10. Copy the `whsec_...` value into `STRIPE_WEBHOOK_SECRET`.

Notes:

- Stripe uses a different signing secret for each endpoint.
- Stripe uses a different signing secret for test mode and live mode.
- Bella verifies Stripe signatures against the raw webhook body at `POST /payments/webhooks/stripe`.

### 5. Optional: pin a Stripe API version

If Bella wants a pinned version for the current Stripe adapter:

1. Check the default API version in the Stripe Developers Dashboard or the endpoint version chosen in Workbench.
2. Copy it into `STRIPE_API_VERSION`.
3. Leave `STRIPE_API_VERSION` blank if you want the current Stripe adapter to use Stripe SDK/account defaults.

### 6. Local development when Stripe needs a public webhook URL

You have two safe patterns:

- Public HTTPS tunnel
  Set `PAYMENT_PUBLIC_BASE_URL` to the tunnel URL and register `${PAYMENT_PUBLIC_BASE_URL}/payments/webhooks/stripe` in Stripe.
- Stripe CLI forwarding
  Once the Stripe adapter exists, run:

  ```bash
  stripe listen --forward-to http://localhost:3004/payments/webhooks/stripe
  ```

  Stripe CLI prints a temporary `whsec_...` signing secret. Use that value for local-only testing instead of the Dashboard endpoint secret.

### 7. Where to paste values in this repo

- Using `docker compose`
  Paste shared values into the root `.env`
- Running services directly
  Paste payment vars into `services/payment-service/.env`
  Paste booking hold vars into `services/booking-service/.env`
  Paste frontend service URLs into `frontend/.env`
  When those direct-run services still depend on the repo's docker-compose Kafka broker, use `KAFKA_BROKER=localhost:9093`. The internal `kafka:9092` address only works from inside the compose network.

### 8. Verify env loading works

Expected behavior after this env prep:

1. `PAYMENT_PROVIDER=mock`
   payment-service should boot successfully.
2. `PAYMENT_PROVIDER=stripe` with missing `STRIPE_SECRET_KEY` or `STRIPE_WEBHOOK_SECRET`
   payment-service should fail at startup with a clear configuration error.
3. `PAYMENT_PROVIDER=stripe` with valid keys and the Stripe SDK installed
   payment-service should boot successfully and log the derived Stripe webhook URL without printing secrets.
4. When payment-service boots successfully, it logs the active provider, public base URLs, and derived webhook URL without printing secrets.

## Concrete Stripe Sandbox Example

Use Stripe test mode as the first real-provider target for this repo.

### Example root `.env` snippet for docker compose

```dotenv
PAYMENT_PROVIDER=stripe
FRONTEND_PUBLIC_URL=http://localhost:5173
PAYMENT_PUBLIC_BASE_URL=https://bella-payments.ngrok-free.app
PAYMENT_CHECKOUT_TTL_MINUTES=30
PAYMENT_HOLD_WINDOW_MINUTES=30
PAYMENT_WEBHOOK_TOLERANCE_SECONDS=300
STRIPE_SECRET_KEY=sk_test_1234567890abcdef
STRIPE_WEBHOOK_SECRET=whsec_1234567890abcdef
STRIPE_API_VERSION=2024-09-30.acacia
MONGODB_TRANSACTIONS_ENABLED=false
```

### Example `services/payment-service/.env` snippet when running only payment-service

```dotenv
PORT=3004
NODE_ENV=development
MONGODB_URI=mongodb://127.0.0.1:27017/bella_hotel
REDIS_HOST=localhost
REDIS_PORT=6379
KAFKA_BROKER=localhost:9093
JWT_SECRET=change_me_to_a_long_random_secret
CORS_ORIGIN=http://localhost:5173
TRUST_PROXY=1
PAYMENT_PROVIDER=stripe
PAYMENT_PUBLIC_BASE_URL=https://bella-payments.ngrok-free.app
FRONTEND_PUBLIC_URL=http://localhost:5173
PAYMENT_CHECKOUT_TTL_MINUTES=30
PAYMENT_WEBHOOK_TOLERANCE_SECONDS=300
STRIPE_SECRET_KEY=sk_test_1234567890abcdef
STRIPE_WEBHOOK_SECRET=whsec_1234567890abcdef
STRIPE_API_VERSION=2024-09-30.acacia
MONGODB_TRANSACTIONS_ENABLED=false
```

### Stripe dashboard source of each value

- `STRIPE_SECRET_KEY`
  Dashboard -> Developers -> API keys -> sandbox/test secret key
- `STRIPE_WEBHOOK_SECRET`
  Workbench -> Webhooks -> select Bella webhook endpoint -> reveal signing secret
- `STRIPE_API_VERSION`
  Dashboard default API version or the version explicitly chosen when creating the webhook endpoint

### URL composition for the current Stripe adapter

- Webhook URL to register in Stripe:
  `${PAYMENT_PUBLIC_BASE_URL}/payments/webhooks/stripe`
- Bella return URL base:
  `${FRONTEND_PUBLIC_URL}/payments/return`
- Recommended success URL:
  `${FRONTEND_PUBLIC_URL}/payments/return?provider=stripe&booking_id={BOOKING_ID}&session_id={CHECKOUT_SESSION_ID}`
- Recommended cancel URL:
  `${FRONTEND_PUBLIC_URL}/payments/return?provider=stripe&booking_id={BOOKING_ID}&session_id={CHECKOUT_SESSION_ID}`

That keeps Bella’s return page non-authoritative. The frontend still asks Bella backend for the real payment state after redirect.

## Local Mock Testing

1. Prepare root `.env`:
   - `Copy-Item .env.example .env`
   - or keep the existing root `.env` already created from `.env.example`
2. Replace at minimum:
   - `JWT_SECRET`
   - optionally `MOCK_PAYMENT_WEBHOOK_SECRET`
3. Optionally prepare frontend env:
   - `Copy-Item frontend/.env.example frontend/.env`
4. Start backend services:
   - `npm run backend:up`
5. Confirm infrastructure and APIs are reachable:
   - `docker compose ps`
   - `curl.exe http://localhost:3001/health`
   - `curl.exe http://localhost:3002/health`
   - `curl.exe http://localhost:3003/health`
   - `curl.exe http://localhost:3004/health`
6. Seed demo data:
   - `npm run seed:demo`
7. Start the frontend:
   - `npm --prefix frontend install`
   - `npm --prefix frontend run dev`
8. Open `http://localhost:5173`
9. Create a booking from the room detail page.
10. Click the hosted-checkout button returned by Bella.
11. On the mock provider page choose one of:
   - `Complete as Visa sandbox`
   - `Complete as Mastercard sandbox`
   - `Simulate decline`
   - `Expire checkout session`
12. After redirect, confirm `/payments/return` shows Bella backend status instead of trusting the redirect alone.

## Stripe Sandbox Connection Checklist

To connect a real Stripe sandbox account on this repo:

1. Set `PAYMENT_PROVIDER=stripe` in the root `.env` or `services/payment-service/.env`.
2. Replace `STRIPE_SECRET_KEY` with the test secret key from Stripe Developers -> API keys.
3. Replace `STRIPE_WEBHOOK_SECRET` with the signing secret from Stripe Workbench -> Webhooks.
4. Optionally set `STRIPE_API_VERSION` if you want to pin the adapter to a known Stripe API version.
5. Expose `PAYMENT_PUBLIC_BASE_URL` over public HTTPS. Localhost alone is not enough for Stripe dashboard webhooks.
6. Register `POST ${PAYMENT_PUBLIC_BASE_URL}/payments/webhooks/stripe` in Stripe Workbench.
7. Restart payment-service or rerun `npm run backend:up`.
8. Check payment-service logs. If Stripe vars are missing or malformed while `PAYMENT_PROVIDER=stripe`, startup should fail fast with a payment configuration error.
9. Keep Bella frontend on hosted checkout only. Do not add app-owned card capture.
10. Verify Stripe sends the enabled events to Bella and that duplicate deliveries return `duplicate: true`.
11. If Mongo transactions are available in your deployment, enable `MONGODB_TRANSACTIONS_ENABLED=true`.
12. Keep `mock` available in lower environments for deterministic demo scenarios and fallback testing.

## Known Follow-Ups

- JWT is still client-stored. A BFF + `HttpOnly` cookie migration is still recommended for production.
- Outbox is implemented with retry persistence; transaction support is available behind `MONGODB_TRANSACTIONS_ENABLED` and should be enabled on replica-set deployments.
- Stripe is wired for sandbox hosted checkout, but production still needs TLS-backed deployment hardening, webhook monitoring/alerting, and full end-to-end sandbox validation against a live Stripe test account.
