# Test Plan

## Automated

### API Integration

Command:

```bash
npm run install:services
npm run test:api
```

Notes:

- The API harness waits for backend health endpoints before seeding and executing requests, so it is stable immediately after `npm run backend:up`.
- The suite expects Bella services on ports `3001-3005`. A health response from another service means the local port is occupied and the integration run is invalid.

Coverage:

- register and login
- anonymous protected-route rejection
- admin-only route protection
- room retrieval
- availability with promotion pricing
- booking creation with booking reference
- landing booking-request lead creation without payment URL or checkout session
- booking-request validation for phone, stay dates, room context, and combo/no-combo consistency
- admin-only booking-request list access
- overlap rejection
- public booking lookup
- invalid promo rejection
- failed payment then successful retry
- booking IDOR protection
- logout token revocation
- admin room CRUD

### Frontend Quality Gates

Commands:

```bash
npm run frontend:lint
npm run frontend:build
```

## Manual Demo Checks

1. Open `http://localhost:5173`.
2. Browse rooms from the home page.
3. Open a room detail page.
4. Check availability with `BELLA10`.
5. Create a booking and confirm the booking reference appears.
6. Try a failed payment with card `4000 0000 0000 0002`.
7. Retry payment with card `4111 1111 1111 1111`.
8. Log in as admin and open `/admin`.
9. Create, toggle, and delete a room.
10. Create or pause a promotion.
