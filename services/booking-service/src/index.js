import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import dotenv from "dotenv";
import bookingRoutes from "./routes/booking.routes.js";
import { connectDatabase, getDatabaseStatus, testConnection } from "./config/database.js";
import { connectRedis, getRedisStatus, testRedisConnection } from "./config/redis.js";
import { getKafkaStatus, initKafka, startOutboxProcessor } from "./config/kafka.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3003;
const isDevelopment = process.env.NODE_ENV === "development";
const dependencyRetryMs = Number(process.env.STARTUP_DEPENDENCY_RETRY_MS || 10000);
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

app.get("/", (req, res) => {
  res.json({
    status: "ok",
    service: "booking-service",
    timestamp: new Date().toISOString(),
  });
});

app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    service: "booking-service",
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.round(process.uptime()),
  });
});

app.get("/ready", async (req, res) => {
  const checks = {
    mongo: { ok: false, ...getDatabaseStatus() },
    redis: { ok: false, ...getRedisStatus() },
    kafka: { ok: getKafkaStatus().connected, required: false, ...getKafkaStatus() },
  };

  try {
    await testConnection();
    checks.mongo.ok = true;
  } catch (error) {
    checks.mongo.error = error?.message || "MongoDB unavailable";
  }

  try {
    await testRedisConnection();
    checks.redis.ok = true;
  } catch (error) {
    checks.redis.error = error?.message || "Redis unavailable";
  }

  const ready = checks.mongo.ok && checks.redis.ok;
  res.status(ready ? 200 : 503).json({
    status: ready ? "ready" : "not_ready",
    service: "booking-service",
    timestamp: new Date().toISOString(),
    checks,
  });
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

function retryInBackground(label, task) {
  const run = async () => {
    try {
      await task();
    } catch (error) {
      console.error(`[startup] ${label} retry failed:`, error);
      const timer = setTimeout(run, dependencyRetryMs);
      timer.unref?.();
    }
  };

  const timer = setTimeout(run, dependencyRetryMs);
  timer.unref?.();
}

async function connectDependencies() {
  console.log("[startup] Connecting to MongoDB...");
  try {
    await connectDatabase();
    console.log("[startup] MongoDB connection ready.");
  } catch (error) {
    console.error("[startup] MongoDB connection failed; HTTP server remains up and will retry.", error);
    retryInBackground("MongoDB", async () => {
      console.log("[startup] Retrying MongoDB connection...");
      await connectDatabase();
      console.log("[startup] MongoDB connection ready after retry.");
    });
  }

  console.log("[startup] Connecting to Redis...");
  const redisConnected = await connectRedis({ throwOnFailure: false });
  if (redisConnected) {
    console.log("[startup] Redis connection ready.");
  } else {
    console.error("[startup] Redis connection failed; rate limiting/locks degrade and will retry.");
    retryInBackground("Redis", async () => {
      console.log("[startup] Retrying Redis connection...");
      const connected = await connectRedis({ throwOnFailure: false });
      if (!connected) {
        throw new Error(getRedisStatus().lastError || "Redis unavailable");
      }
      console.log("[startup] Redis connection ready after retry.");
    });
  }

  console.log("[startup] Connecting to Kafka...");
  const kafkaConnected = await initKafka({ throwOnFailure: false });
  if (kafkaConnected) {
    console.log("[startup] Kafka connection ready.");
  } else {
    console.error("[startup] Kafka unavailable; outbox publish will retry in background.");
  }

  console.log("[startup] Starting booking outbox processor...");
  startOutboxProcessor();
  console.log("[startup] Booking outbox processor started.");
}

async function startServer() {
  try {
    console.log("[startup] Booking service booting...");
    console.log("[startup] Express middleware and routes configured.");

    app.listen(PORT, () => {
      console.log(`Booking Service running on port ${PORT}`);
      void connectDependencies();
    });
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
}

startServer();
