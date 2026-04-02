# PowerShell / Windows Checklist

Use this checklist to run the project on Windows with PowerShell.

## 1. Prerequisites

- [ ] Docker Desktop is installed.
- [ ] Docker Desktop is running.
- [ ] Node.js 18+ is installed.
- [ ] `npm` is available in PowerShell.
- [ ] Ports `3001-3005`, `5173`, `6379`, `9092`, `9093`, and `2181` are free.
- [ ] You have a working MongoDB connection string.

Quick checks:

```powershell
node -v
npm -v
docker --version
docker compose version
docker info
```

## 2. Create Root Environment File

- [ ] From the repository root, copy the root env template:

```powershell
Copy-Item .env.example .env
```

- [ ] Edit `.env` and set at least:
  - `MONGODB_URI`
  - `JWT_SECRET`
  - `SMTP_HOST`
  - `SMTP_PORT`
  - `SMTP_USER`
  - `SMTP_PASS`

Notes:

- `MONGODB_URI` is required for `user-service`, `hotel-service`, `booking-service`, and `payment-service`.
- SMTP values are only required if you want real email delivery from `notification-service`.
- If MongoDB Atlas is used, make sure your current IP is allowed in Atlas Network Access.

## 3. Start Backend Services

- [ ] Start Docker Desktop first.
- [ ] From repo root, build and start backend containers:

```powershell
docker compose up -d --build
```

- [ ] Check container state:

```powershell
docker compose ps
```

- [ ] Follow logs if something does not come up:

```powershell
docker compose logs -f
```

Service URLs:

- User Service: `http://localhost:3001`
- Hotel Service: `http://localhost:3002`
- Booking Service: `http://localhost:3003`
- Payment Service: `http://localhost:3004`
- Notification Service: `http://localhost:3005`

## 4. Verify Health Endpoints

- [ ] Check each backend endpoint:

```powershell
Invoke-RestMethod http://localhost:3001/health
Invoke-RestMethod http://localhost:3002/health
Invoke-RestMethod http://localhost:3003/health
Invoke-RestMethod http://localhost:3004/health
Invoke-RestMethod http://localhost:3005/health
```

Expected result:

- Services should return `status = healthy`.
- If a Mongo-backed service returns unhealthy, check `MONGODB_URI`.
- If booking/payment/notification fail, also check Kafka startup in Docker logs.

## 5. Seed Sample Data

- [ ] If you want test data, run the seed script from repo root:

```powershell
$env:MONGODB_URI = "<your MongoDB URI>"
node .\scripts\seed-mongo.mjs
```

- [ ] Confirm the script completes without error before testing the UI.

## 6. Start Frontend

- [ ] Open a second PowerShell window.
- [ ] Start the frontend:

```powershell
Set-Location .\frontend
npm run dev
```

- [ ] Open `http://localhost:5173`.

Notes:

- The frontend does not require `frontend\.env` for default local testing.
- It already falls back to:
  - `http://localhost:3001`
  - `http://localhost:3002`
  - `http://localhost:3003`
  - `http://localhost:3004`

## 7. Smoke Test Flow

- [ ] Register a user in the UI or via API.
- [ ] Log in.
- [ ] Open hotel list.
- [ ] Open hotel detail.
- [ ] Create a booking.
- [ ] Trigger payment.
- [ ] Check backend logs for Kafka-driven events.

## 8. Common Failures

- [ ] `docker info` fails:
  - Docker Desktop is not running.
- [ ] `MONGODB_URI` is empty in `docker compose config`:
  - Root `.env` is missing or not filled in.
- [ ] Atlas connection fails:
  - Wrong credentials, wrong database name, or missing IP allowlist entry.
- [ ] Kafka-dependent services keep restarting:
  - Check `docker compose logs kafka zookeeper booking-service payment-service notification-service`.
- [ ] Frontend loads but API calls fail:
  - Verify backend containers are healthy and ports are reachable.

## 9. Stop and Reset

- [ ] Stop everything:

```powershell
docker compose down
```

- [ ] Remove containers and volumes if you want a clean retry:

```powershell
docker compose down -v
```
