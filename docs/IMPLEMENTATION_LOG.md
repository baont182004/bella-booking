# Implementation Log

## Completed

1. Added root scripts:
   - `npm run backend:up`
   - `npm run seed:demo`
   - `npm run test:api`
   - `npm run frontend:lint`
   - `npm run frontend:build`

2. Hardened authentication:
   - Required shared JWT secret usage with consistent issuer/audience.
   - Added `sessionVersion`-based token revocation.
   - Implemented authenticated logout that invalidates active tokens.
   - Added password change API with token refresh.

3. Expanded BELLA booking logic:
   - Booking reference generation.
   - Public booking lookup by reference + guest email.
   - Availability endpoint with server-side pricing.
   - Promotion CRUD and server-side promo validation.
   - Booking price snapshots stored with discounts.

4. Expanded payment behavior:
   - Demo failure card support using card numbers ending in `0002`.
   - Retry flow from failed payment to completed payment.
   - Refund metadata storage and payment audit logging.

5. Completed admin-critical backend features:
   - Room update/delete endpoints.
   - Admin stats endpoint.
   - Admin promotion listing and state toggling.
   - Admin user listing.
   - Audit log listing endpoint.

6. Completed frontend-facing demo surfaces:
   - Public booking lookup page.
   - Admin panel for rooms, bookings, promotions, users, and recent logs.
   - Profile update and password change in dashboard.
   - Promo-aware booking form with availability preview.
   - Booking reference visibility in customer flows.

7. Hardened runtime configuration:
   - Removed insecure fallback JWT secrets from `docker-compose.yml`.
   - Added explicit `CORS_ORIGIN` and `JWT_EXPIRES_IN` wiring for containerized services.
   - Switched required backend secrets to fail-fast compose interpolation.

8. Finalized release-facing polish:
   - Sanitized unexpected 5xx responses across services.
   - Returned CORS denials as explicit `403` errors.
   - Styled admin management and audit log lists.
   - Rewrote the root `README.md` around the verified BELLA run path.

## Supporting Commands

- Start services: `npm run backend:up`
- Seed demo data: `npm run seed:demo`
- Run API tests: `npm run test:api`
- Lint frontend: `npm run frontend:lint`
- Build frontend: `npm run frontend:build`
