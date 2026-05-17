# Security Review

## Controls Added

- Session invalidation:
  - Tokens now carry `sessionVersion`.
  - All auth middlewares verify current session state from MongoDB.
  - Logout revokes the current session across services.

- Rate limiting:
  - Auth endpoints in `user-service`.
  - Booking creation and public lookup in `booking-service`.
  - Payment submission in `payment-service`.

- Server-side validation:
  - Rejected unknown payload fields on auth, profile, booking, payment, and promo routes.
  - Enforced room capacity, stay date rules, booking overlap prevention, and promo eligibility.

- Access control:
  - Admin-only room CRUD, promotion CRUD, audit log access, and user listing.
  - Booking ownership enforced for customer booking reads.
  - Public booking lookup limited to booking reference plus matching guest email.

- Input handling:
  - Regex search inputs are escaped before Mongo regex usage in hotel/user/booking queries.
  - CORS is constrained by `CORS_ORIGIN`.
  - JSON payload size is capped to `32kb`.

- Runtime hardening:
  - Removed weak fallback JWT secrets from `docker-compose.yml`.
  - Backend containers now fail fast when required secrets are missing.
  - Unexpected 5xx errors return a generic message instead of reflecting raw internal exceptions.
  - CORS denials are surfaced as `403` client errors instead of ambiguous server failures.

## Security Regression Evidence

- Unauthorized access to `/users/profile` returns `401`.
- Non-admin access to admin room creation returns `403`.
- Other users cannot fetch another user’s booking by ID.
- Invalid promo codes return `400`.
- Logout invalidates the token and subsequent protected requests return `401`.
- Overlapping booking attempts return `409`.

## Residual Risk

- SMTP credentials remain external; email transport hardening depends on deployment secrets.
- Rate limits are in-memory per service, which is acceptable for demo/staging but not ideal for multi-instance production scaling.
