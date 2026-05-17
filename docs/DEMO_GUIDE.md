# BELLA Demo Guide

## Start

```bash
cp .env.example .env
npm run backend:up
npm run seed:demo
cd frontend
npm run dev
```

Root `.env` requirements:

- Set `MONGODB_URI` to a MongoDB instance reachable from Docker containers and local scripts.
- Set `JWT_SECRET` to a long random value.
- `SMTP_*` values are optional for demo mode unless real email delivery is required.

Frontend:

- `http://localhost:5173`

Backend services:

- user: `http://localhost:3001`
- hotel: `http://localhost:3002`
- booking: `http://localhost:3003`
- payment: `http://localhost:3004`
- notification: `http://localhost:3005`

## Demo Accounts

- Admin: `admin.bella@example.com` / `Password123!`
- Customer: `lana.nguyen@example.com` / `Password123!`
- Customer: `minh.tran@example.com` / `Password123!`

## Suggested Demo Flow

1. Open the public site and browse rooms.
2. Use `/lookup` with a seeded booking reference after creating or inspecting a booking.
3. Log in as `lana.nguyen@example.com`.
4. Open a room detail page and apply promo code `BELLA10`.
5. Check availability, create a booking, and note the booking reference.
6. Use payment card `4000 0000 0000 0002` to demonstrate a failed payment.
7. Retry with `4111 1111 1111 1111` to confirm the booking.
8. Open `/bookings` to review the confirmed booking.
9. Log in as `admin.bella@example.com` and open `/admin`.
10. Review stats, toggle promotions, update booking status, and manage rooms.

## Cache and Data Reset

Use this when you want a clean BELLA demo state:

```bash
npm run seed:demo
```

That command reseeds MongoDB and flushes Redis cache entries used by the services.
