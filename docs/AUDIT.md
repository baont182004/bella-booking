# BELLA Audit

## Current Architecture

- `frontend`: React + Vite SPA for BELLA public pages, account pages, bookings, admin, and booking lookup.
- `services/user-service`: auth, profile, password change, logout/session invalidation, admin user list.
- `services/hotel-service`: BELLA hotel and room catalog with admin room CRUD.
- `services/booking-service`: availability checks, booking creation, promo engine, booking lookup, admin stats, audit logs.
- `services/payment-service`: demo-safe payment processing, retryable failed payments, refunds, audit logs.
- `services/notification-service`: Kafka-driven notifications plus admin send endpoint.

## Critical Gaps Found

- JWT logout previously only cleared the client; tokens stayed valid across services.
- No rate limiting on auth or booking/payment-sensitive actions.
- No booking reference or public booking lookup flow.
- No server-side promotion engine; frontend discounts were presentation-only.
- No availability-check endpoint ahead of booking creation.
- Admin UI was effectively absent; room CRUD was incomplete.
- Notification service auth hardening exposed a missing DB dependency.
- Frontend lint was failing and required docs/test artifacts were missing.

## High-Risk Areas Fixed

- Cross-service session revocation via `sessionVersion` checks on authenticated requests.
- Auth, booking, and payment rate limiting for demo/staging safety.
- Server-side promo validation and pricing calculation.
- Booking overlap enforcement with explicit availability checks.
- Public booking lookup constrained by booking reference plus guest email.
- Admin room update/delete and booking/promotion management surface.
- Demo-safe failed payment simulation and retry path.
- Consistent CORS allowlist and request body size limits across services.

## Remaining Limitations

- Frontend automation is limited to lint/build verification; API integration is the primary automated regression layer.
- Notification emails still depend on valid SMTP credentials if real delivery is required.
- Audit logs currently focus on booking/payment/promotion actions rather than every frontend interaction.
