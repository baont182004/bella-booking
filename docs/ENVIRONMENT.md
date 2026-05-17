# Environment Files

This repo uses committed example files and ignored real env files. Do not commit real secrets.

## Intended Structure

```text
.
├── .env.example                    # committed example for local backend/Docker defaults
├── .env.local                      # ignored real local backend override
├── .env.prod.example               # committed example for AWS EC2 backend production
├── .env.prod                       # ignored real AWS EC2 backend production env
├── frontend/
│   ├── .env.example                # committed example for local frontend development
│   ├── .env.production.example     # committed example for Vercel production
│   └── .env.local                  # ignored real local frontend env
└── services/
    ├── booking-service/.env.example        # committed standalone-service example
    ├── hotel-service/.env.example          # committed standalone-service example
    ├── notification-service/.env.example   # committed standalone-service example
    ├── payment-service/.env.example        # committed standalone-service example
    └── user-service/.env.example           # committed standalone-service example
```

Avoid real `.env` files inside service directories. Use root `.env.local` for local Docker Compose overrides and root `.env.prod` for EC2 production.

## Local Development

Backend with Docker Compose can run with safe defaults:

```sh
docker compose up -d --build
```

For local overrides:

```sh
cp .env.example .env.local
nano .env.local
docker compose --env-file .env.local up -d --build
```

Frontend local overrides:

```sh
cp frontend/.env.example frontend/.env.local
nano frontend/.env.local
```

Leave `VITE_API_URL` blank for local development with separate service ports. Set it only when a gateway/proxy exposes all backend routes from one origin.

## Production Backend on AWS EC2

Create the real production env manually on the server:

```sh
cp .env.prod.example .env.prod
nano .env.prod
```

Then run:

```sh
docker compose -f docker-compose.prod.yml --env-file .env.prod config
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build
```

Required production values:

```text
NODE_ENV=production
FRONTEND_URL=https://bella-booking.vercel.app
CORS_ORIGINS=https://bella-booking.vercel.app,https://bella-booking-api.duckdns.org,http://localhost:5173,http://localhost:3000
BACKEND_PUBLIC_URL=https://bella-booking-api.duckdns.org
MONGO_URI=mongodb://mongo:27017/bella_booking
REDIS_HOST=redis
REDIS_PORT=6379
KAFKA_BOOTSTRAP_SERVERS=kafka:9092
JWT_SECRET=<real-secret>
```

Backward-compatible aliases are still supported:

```text
MONGODB_URI
KAFKA_BROKER
CORS_ORIGIN
```

Prefer the newer names in production:

```text
MONGO_URI
KAFKA_BOOTSTRAP_SERVERS
CORS_ORIGINS
```

## Vercel Frontend

Set frontend production env in the Vercel dashboard, not in a committed real file:

```text
VITE_API_URL=https://bella-booking-api.duckdns.org
```

`frontend/.env.production.example` is only documentation for this value.

## Files That Must Never Be Committed

```text
.env
.env.*
frontend/.env
frontend/.env.*
services/**/.env
services/**/.env.*
```

The only exceptions are committed example files:

```text
.env.example
.env.prod.example
frontend/.env.example
frontend/.env.production.example
services/**/.env.example
```

## Git Safety Checks

Check current changes:

```sh
git status
```

List env files tracked by Git:

```sh
git ls-files | grep env
```

Expected tracked env files are examples only. If a real env file is tracked, untrack it without deleting the local file:

```sh
git rm --cached .env
git rm --cached frontend/.env.local
git rm --cached services/*/.env
```

Run only the commands that match files actually tracked by Git.

## If A Secret Was Committed

1. Rotate the exposed secret immediately.
2. Remove the secret from the current tree.
3. Remove it from Git history if the repository is shared or public.
4. Force-push only after coordinating with collaborators.
5. Treat any old token, password, webhook secret, or private API key as compromised.
