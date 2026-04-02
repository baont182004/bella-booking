# Quick Start Guide

## Prerequisites

- Docker and Docker Compose installed
- At least 4GB of RAM available for Docker
- Ports 3001-3005, 6379, 9092, 2181 available

## Starting the Application

### Option 1: Using the start script (Linux/Mac)

```bash
chmod +x start.sh
./start.sh
```

### Option 2: Manual Docker Compose

```bash
# Start all services
export MONGODB_URI=mongodb+srv://<user>:<password>@cluster0.mongodb.net/hotel_db?retryWrites=true&w=majority
docker-compose up -d

# View logs
docker-compose logs -f

# Stop all services
docker-compose down
```

## Testing the API

### 1. Health Check

```bash
curl http://localhost:3001/health
```

### 2. Register a User

```bash
curl -X POST http://localhost:3001/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "john@example.com",
    "password": "password123",
    "firstName": "John",
    "lastName": "Doe",
    "phone": "+1234567890"
  }'
```

### 3. Login

```bash
curl -X POST http://localhost:3001/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "john@example.com",
    "password": "password123"
  }'
```

Save the token from the response!

### 4. Create a Hotel

```bash
curl -X POST http://localhost:3002/hotels \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Grand Plaza Hotel",
    "description": "Luxury hotel in the city center",
    "address": "123 Main St",
    "city": "New York",
    "country": "USA",
    "rating": 4.5,
    "amenities": ["WiFi", "Pool", "Gym"],
    "images": ["https://example.com/hotel.jpg"]
  }'
```

### 5. Create a Room

```bash
curl -X POST http://localhost:3002/hotels/<hotelId>/rooms \
  -H "Content-Type: application/json" \
  -d '{
    "roomNumber": "101",
    "roomType": "Deluxe Suite",
    "description": "Spacious room with city view",
    "pricePerNight": 200,
    "capacity": 2,
    "amenities": ["King Bed", "TV", "Mini Bar"],
    "images": ["https://example.com/room.jpg"]
  }'
```

### 6. Create a Booking

```bash
curl -X POST http://localhost:3003/bookings \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "<userId>",
    "roomId": "<roomId>",
    "checkInDate": "2026-02-01",
    "checkOutDate": "2026-02-05",
    "numGuests": 2
  }'
```

### 7. Process Payment

```bash
curl -X POST http://localhost:3004/payments \
  -H "Content-Type: application/json" \
  -d '{
    "bookingId": "<bookingId>",
    "amount": 800,
    "paymentMethod": "credit_card"
  }'
```

## API Testing

The repository no longer ships a bundled Postman collection. Use the cURL examples in this guide or create a Postman collection from the live endpoints you actually need.

## Viewing Logs

```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f user-service
docker-compose logs -f hotel-service
docker-compose logs -f booking-service
docker-compose logs -f payment-service
docker-compose logs -f notification-service

docker-compose logs -f redis
docker-compose logs -f kafka
```

## Database Access

MongoDB Atlas is managed and accessed via its connection string.

### Redis

```bash
docker exec -it hotel-redis redis-cli
```

## Common Issues

### Port Already in Use

```bash
# Find process using a port
lsof -i :3001

# Kill the process
kill -9 <PID>
```

### Reset Everything

```bash
docker-compose down -v
docker-compose up --build -d
```

### Check Service Status

```bash
docker-compose ps
```

## Architecture Overview

```
┌-------------┐
│   Client    │
└------┬------┘
    │
    ▼
┌--------┐ ┌--------┐ ┌--------┐ ┌--------┐ ┌--------┐
│  User  │ │ Hotel  │ │Booking │ │Payment │ │Notific.│
│Service │ │Service │ │Service │ │Service │ │Service │
└---┬----┘ └---┬----┘ └---┬----┘ └---┬----┘ └---┬----┘
    │          │          │          │          │
    └----┬-----┴------┬---┴----┬-----┴----------┘
      │            │        │
    ┌----▼----┐  ┌----▼----┐  ┌----▼----┐
    │MongoDB  │  │  Redis  │  │  Kafka  │
    │ Atlas   │  └---------┘  └---------┘
    └---------┘
```

## Next Steps

1. Configure email settings in `.env` for notifications
2. Add authentication to Hotel/Room creation endpoints
3. Implement room availability checking with date ranges
4. Add review and rating system
5. Implement search with filters
6. Add payment gateway integration (Stripe, PayPal)
7. Add API rate limiting per user
8. Implement comprehensive logging and monitoring
9. Add unit and integration tests
10. Set up CI/CD pipeline
