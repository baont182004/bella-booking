import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import dotenv from "dotenv";
import bookingRoutes from "./routes/booking.routes.js";
import { connectDatabase, testConnection } from "./config/database.js";
import { connectRedis } from "./config/redis.js";
import { initKafka, startOutboxProcessor } from "./config/kafka.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3003;
const isDevelopment = process.env.NODE_ENV === "development";
const allowedOrigins = (
  process.env.CORS_ORIGINS ||
  process.env.CORS_ORIGIN ||
  process.env.FRONTEND_URL ||
  "http://localhost:5173,http://127.0.0.1:5173,http://localhost:4173,http://127.0.0.1:4173"
)
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

function parseTrustProxySetting(value) {
  if (value === undefined || value === null || value === "") {
    return 1;
  }
  if (value === "true") {
    return true;
  }
  if (value === "false") {
    return false;
  }
  const numericValue = Number(value);
  return Number.isInteger(numericValue) ? numericValue : value;
}

app.set("trust proxy", parseTrustProxySetting(process.env.TRUST_PROXY));

app.use(helmet());
app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      const corsError = new Error("Origin not allowed by CORS");
      corsError.status = 403;
      corsError.expose = true;
      return callback(corsError);
    },
  }),
);
app.use(morgan("combined"));
app.use(express.json({ limit: "32kb" }));

app.get("/health", async (req, res) => {
  try {
    await testConnection();
    res.json({
      status: "healthy",
      service: "booking-service",
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(503).json({
      status: "unhealthy",
      service: "booking-service",
      error: "Service dependency unavailable",
    });
  }
});

app.use("/bookings", bookingRoutes);
app.use("/", bookingRoutes);

app.use((err, req, res, next) => {
  console.error("Error:", err);
  const status = Number.isInteger(err.status) ? err.status : 500;
  const exposeMessage = status >= 400 && status < 500 && err.expose !== false;

  res.status(status).json({
    error: exposeMessage ? err.message : "Internal Server Error",
    ...(isDevelopment && { stack: err.stack }),
  });
});

async function startServer() {
  try {
    await connectDatabase();
    await connectRedis();
    await initKafka();
    startOutboxProcessor();

    app.listen(PORT, () => {
      console.log(`Booking Service running on port ${PORT}`);
    });
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
}

startServer();
