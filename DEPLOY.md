# Bella Booking Deployment

This repo is a monorepo. Deploy only `frontend` to Vercel. Deploy the backend services on AWS EC2 with Docker Compose.

## A. Vercel Frontend Deployment

1. Import GitHub repo `baont182004/bella-booking` into Vercel.
2. Set **Root Directory** to:
   ```text
   frontend
   ```
3. Set **Framework Preset** to Vite.
4. Set **Build Command** to:
   ```sh
   npm run build
   ```
5. Set **Output Directory** to:
   ```text
   dist
   ```
6. Set this Vercel environment variable:
   ```text
   VITE_API_URL=https://bella-booking-api.duckdns.org
   ```

Do not commit a real frontend production env file. Configure production frontend env values in the Vercel dashboard.

Do not deploy backend services to Vercel. Vercel should build only the `frontend` directory.

## B. DuckDNS

Set the DuckDNS domain:

```text
bella-booking-api.duckdns.org
```

to point to the AWS EC2 Public IPv4:

```text
54.252.220.84
```

Verify DNS:

```sh
nslookup bella-booking-api.duckdns.org
```

Expected result:

```text
54.252.220.84
```

## C. AWS EC2

Target server:

```text
OS: Ubuntu
Region: ap-southeast-2 / Asia Pacific Sydney
Public IPv4: 54.252.220.84
```

Security Group:

- Allow SSH port `22`, preferably only from your IP.
- Allow HTTP port `80` from the internet.
- Allow HTTPS port `443` from the internet.
- Do not open MongoDB `27017`, Redis `6379`, Kafka `9092`, Zookeeper `2181`, or backend service ports `3001-3005` to the internet.

## D. Server Setup

Install missing packages if needed:

```sh
sudo apt update
sudo apt install -y git nginx certbot python3-certbot-nginx
```

Docker and Docker Compose are already installed on the target host. If Docker needs enabling:

```sh
sudo systemctl enable --now docker
sudo usermod -aG docker ubuntu
```

Log out and back in after adding `ubuntu` to the `docker` group.

## E. Deploy Backend

Clone and enter the repo:

```sh
git clone https://github.com/baont182004/bella-booking.git
cd bella-booking
git checkout main
```

Create production env:

```sh
cp .env.prod.example .env.prod
nano .env.prod
```

Fill real secrets manually, especially:

- `JWT_SECRET`
- `MOCK_PAYMENT_WEBHOOK_SECRET`
- `DEMO_ADMIN_PASSWORD` if enabling demo admin bootstrap
- Stripe variables if `PAYMENT_PROVIDER=stripe`
- SMTP variables if sending real email
- `STAFF_NOTIFICATION_EMAIL` or `ADMIN_EMAIL` so booking request leads are routed to staff

The landing page lead flow stores records in MongoDB collection `booking_requests`. If production disables Mongoose auto-index creation, create these indexes before launch:

```js
db.booking_requests.createIndex({ request_reference: 1 }, { unique: true })
db.booking_requests.createIndex({ status: 1, createdAt: -1 })
db.booking_requests.createIndex({ guest_phone: 1, createdAt: -1 })
db.booking_requests.createIndex({ room_code: 1, check_in_date: 1 })
```

Validate and start:

```sh
docker compose -f docker-compose.prod.yml --env-file .env.prod config
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build
```

Check runtime:

```sh
docker ps
docker compose -f docker-compose.prod.yml --env-file .env.prod logs -f
```

Helper scripts are also available:

```sh
sh deploy/scripts/deploy.sh
sh deploy/scripts/logs.sh
sh deploy/scripts/restart.sh
```

## F. Configure Nginx

Copy the sample site:

```sh
sudo cp deploy/nginx/bella-booking-api.conf /etc/nginx/sites-available/bella-booking-api.conf
sudo ln -sf /etc/nginx/sites-available/bella-booking-api.conf /etc/nginx/sites-enabled/bella-booking-api.conf
sudo nginx -t
sudo systemctl restart nginx
```

The config proxies public API paths to localhost-only Docker port bindings:

- `/auth` and `/users` to user-service
- `/hotels` to hotel-service
- `/bookings`, `/combos`, and `/pricing` to booking-service
- `/payments` to payment-service
- `/notifications` to notification-service

It also accepts equivalent `/api/...` paths for future gateway-style clients.

If the Vite frontend is served by Nginx instead of Vercel, make sure React routes fall back to the SPA entry file so direct refresh on `/rooms`, `/rooms/:code`, `/admin`, and similar routes does not return 404:

```nginx
location / {
    try_files $uri $uri/ /index.html;
}
```

## G. Configure HTTPS

Port `80` must be open before running Certbot.

```sh
sudo certbot --nginx -d bella-booking-api.duckdns.org
```

Certbot will update the Nginx site for HTTPS and certificate renewal.

## H. Final Testing

Test backend over HTTP before Certbot:

```sh
curl http://bella-booking-api.duckdns.org/
curl http://bella-booking-api.duckdns.org/health
curl http://bella-booking-api.duckdns.org/hotels
```

Test backend over HTTPS after Certbot:

```sh
curl https://bella-booking-api.duckdns.org/
curl https://bella-booking-api.duckdns.org/health
curl https://bella-booking-api.duckdns.org/hotels
```

Test the Vercel frontend and confirm browser network calls go to:

```text
https://bella-booking-api.duckdns.org
```

They must not call `localhost`, `127.0.0.1`, or backend service ports in production.
