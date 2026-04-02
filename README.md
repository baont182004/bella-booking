# Hotel Booking System - Full Stack Application

A complete hotel booking system with microservices backend and modern React frontend.

## 🏗️ Architecture

### Backend (Microservices)

- **User Service** (Port 3001) - User authentication and management
- **Hotel Service** (Port 3002) - Hotel and room management
- **Booking Service** (Port 3003) - Reservation handling
- **Payment Service** (Port 3004) - Payment processing
- **Notification Service** (Port 3005) - Email/SMS notifications

### Frontend

- **React App** (Port 5173) - Modern SPA with Vite, React Router, and plain CSS

### Infrastructure

- **MongoDB Atlas** - Primary database
- **Redis** (Port 6379) - Caching layer
- **Kafka + Zookeeper** (Ports 9092, 2181) - Event streaming

## ✨ Features

- 🔐 User authentication with JWT
- 🏨 Hotel browsing and search
- 🛏️ Room selection and booking
- 💳 Payment processing
- 📧 Email notifications
- 👤 User profile management
- 📱 Responsive design
- 🚀 Microservices architecture
- 📊 Real-time event streaming with Kafka
- ⚡ Redis caching for performance

## 🚀 Prerequisites

- Docker and Docker Compose
- Node.js 18+ (for frontend development)
- npm or yarn

## ⚡ Quick Start

### Option 1: Automated Setup (Recommended)

```bash
# Run the setup script
chmod +x setup.sh
./setup.sh

# Start frontend
cd frontend
npm run dev
```

### Option 2: Manual Setup

**1. Start Backend Services**

```bash
# Configure the root .env file first

# Start all backend services
docker-compose up -d

# Check service health
docker-compose ps
```

**2. Start Frontend**

```bash
cd frontend
npm install
cp .env.example .env
npm run dev
```

### 🌐 Access the Application

- **Frontend**: http://localhost:5173
- **API Documentation**: See [docs/QUICKSTART.md](docs/QUICKSTART.md)

## 📖 Documentation

- **[Quick Start Guide](docs/QUICKSTART.md)** - Local run, seed, and API examples
- **[Architecture Documentation](docs/ARCHITECTURE.md)** - Service topology and runtime notes
- **[PowerShell Windows Checklist](docs/POWERSHELL_WINDOWS_CHECKLIST.md)** - Windows-specific run and debug steps

## 🎯 User Flow

1. **Register/Login** → Create account or sign in
2. **Browse Hotels** → Search and filter hotels by location
3. **Select Room** → View hotel details and available rooms
4. **Book Room** → Choose dates and complete booking
5. **Make Payment** → Process payment (simulated)
6. **Manage Bookings** → View and manage your reservations

## 📸 Screenshots

### Home Page

Modern landing page with hero section and features

### Hotel Listing

Browse hotels with search and filter options

### Booking Flow

Seamless booking experience with date selection and payment

### User Dashboard

Manage bookings and profile in one place

## 🛠️ Development

### Backend Development

Run individual services locally:

```bash
# Example: User Service
cd services/user-service
npm install
npm run dev
```

### Frontend Development

```bash
cd frontend
npm install
npm run dev
```

The frontend calls backend services directly. Configure the base URL in the frontend context if needed.

### Viewing Logs

```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f user-service

# Frontend (in separate terminal)
cd frontend && npm run dev
```

## 🔧 Technology Stack

### Backend

- **Runtime**: Node.js 18
- **Framework**: Express.js
- **Database**: MongoDB Atlas
- **Cache**: Redis 7
- **Message Broker**: Apache Kafka 7.5
- **Authentication**: JWT (jsonwebtoken)
### Project Structure

```
adv-backend/
├-- services/                   # Backend microservices
│   ├-- user-service/           # User & Auth service
│   ├-- hotel-service/          # Hotel management
│   ├-- booking-service/        # Booking management
│   ├-- payment-service/        # Payment processing
│   └-- notification-service/   # Email notifications
├-- frontend/                   # React + Vite frontend
│   ├-- src/
│   │   ├-- components/         # Reusable components
│   │   ├-- pages/              # Page components
│   │   ├-- context/            # Context providers
│   │   └-- services/           # API services
│   ├-- public/
│   └-- package.json
├-- data/                       # Bella metadata and normalized content
├-- docs/                       # Project documentation
├-- scripts/                    # Seed and sync scripts
├-- docker-compose.yml          # Docker services config
├-- setup.sh                    # Automated setup script
├-- start.sh                    # Backend startup script
├-- .env                        # Environment variables
└-- README.md                  # This file
```

## Service Communication

- **Synchronous**: REST APIs via direct service endpoints
- **Asynchronous**: Kafka events for booking confirmations, payments, and notifications

## Kafka Topics

- `booking-created` - Published when a new booking is created
- `payment-processed` - Published when payment is completed
- `booking-confirmed` - Published when booking is confirmed
- `notification-request` - Published to trigger notifications

## Testing

```bash
# Run tests for all services
docker-compose exec user-service npm test
# ... repeat for other services
```

## Monitoring

- View logs: `docker-compose logs -f [service-name]`
- MongoDB Atlas: Access via your Atlas connection string
- Redis: Access via `localhost:6379`
- Kafka: Access via `localhost:9092`

## Production Deployment

1. Update environment variables in `.env`
2. Use production-ready configurations
3. Set up proper logging and monitoring
4. Configure SSL/TLS certificates
5. Set up database backups
6. Configure Kafka replication

## Contributing

1. Fork the repository
2. Create your feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

