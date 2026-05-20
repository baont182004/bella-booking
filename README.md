# BELLA Hotel Booking System

BELLA is a single-property hotel booking system with a React frontend and Node.js microservices backend. The current repo state is demo/staging ready for the core customer, account, admin, promotion, and demo-payment flows.

## Verified Stack

- Frontend: React + Vite on `http://localhost:5173`
- User service: `http://localhost:3001`
- Hotel service: `http://localhost:3002`
- Booking service: `http://localhost:3003`
- Payment service: `http://localhost:3004`
- Notification service: `http://localhost:3005`
- Infrastructure: Docker Compose for Redis, Kafka, Zookeeper, and all backend services
- Database: MongoDB reachable through `MONGODB_URI` in the root `.env`

## Quick Start

1. Copy the root env file and fill in the required values.

```bash
cp .env.example .env
```

Required values:

- `MONGODB_URI`: use a MongoDB URI reachable from both Docker containers and local scripts
- `JWT_SECRET`: set a long random secret
- `SMTP_*`: optional for real email delivery; safe to leave as placeholders for demo use

2. Start the backend stack.

```bash
npm run backend:up
```

3. Seed demo data and flush cache.

```bash
npm run seed:demo
```

4. Start the frontend in a separate terminal.

```bash
cd frontend
npm install
npm run dev
```

## Demo Accounts

- Admin: `admin.bella@example.com` / `Password123!`
- Customer: `lana.nguyen@example.com` / `Password123!`
- Customer: `minh.tran@example.com` / `Password123!`

## Demo Payment Cards

- Success: `4111 1111 1111 1111`
- Forced failure: any card ending in `0002`, for example `4000 0000 0000 0002`

## Useful Commands

```bash
npm run backend:up
npm run backend:down
npm run install:services
npm run seed:demo
npm run test:api
npm run frontend:lint
npm run frontend:build
```

## What Works

- Public room browsing and room detail pages
- Availability checks before booking
- Booking creation with server-side price calculation
- Promotion validation and application on the server
- Booking lookup by reference and guest email
- Register, login, logout, profile update, and password change
- Admin dashboard for rooms, bookings, promotions, users, and audit logs
- Demo-safe payment flow with pending, paid, failed, and refunded states
- JWT auth with session invalidation, RBAC, rate limiting, and constrained CORS

## Verification

The current repo has been verified with:

```bash
npm run install:services
npm run test:api
npm run frontend:lint
npm run frontend:build
```

`npm run test:api` expects the Bella backend services to be running on ports `3001-3005`. If a different local service is bound to one of those ports, stop it before running the integration suite.

## Documentation

- [docs/QUICKSTART.md](docs/QUICKSTART.md)
- [docs/DEMO_GUIDE.md](docs/DEMO_GUIDE.md)
- [docs/AUDIT.md](docs/AUDIT.md)
- [docs/IMPLEMENTATION_LOG.md](docs/IMPLEMENTATION_LOG.md)
- [docs/SECURITY_REVIEW.md](docs/SECURITY_REVIEW.md)
- [docs/TEST_PLAN.md](docs/TEST_PLAN.md)
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)

