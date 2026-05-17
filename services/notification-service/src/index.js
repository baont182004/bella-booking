import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';
import { initKafka, startConsumer } from './config/kafka.js';
import { connectDatabase, testConnection } from "./config/database.js";
import notificationRoutes from './routes/notification.routes.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3005;
const isDevelopment = process.env.NODE_ENV === "development";
let notificationDependenciesReady = false;
const allowedOrigins = (
  process.env.CORS_ORIGINS ||
  process.env.CORS_ORIGIN ||
  process.env.FRONTEND_URL ||
  "http://localhost:5173,http://127.0.0.1:5173,http://localhost:4173,http://127.0.0.1:4173"
)
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

// Middleware
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
app.use(morgan('combined'));
app.use(express.json({ limit: "32kb" }));

// Health check
app.get('/health', async (req, res) => {
  try {
    await testConnection();
    if (!notificationDependenciesReady) {
      throw new Error("Notification dependencies not ready");
    }

    res.json({ 
      status: 'healthy', 
      service: 'notification-service',
      timestamp: new Date().toISOString() 
    });
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      service: 'notification-service',
      error: 'Service dependency unavailable'
    });
  }
});

// Routes
app.use('/notifications', notificationRoutes);

// Error handler
app.use((err, req, res, next) => {
  console.error('Error:', err);
  const status = Number.isInteger(err.status) ? err.status : 500;
  const exposeMessage = status >= 400 && status < 500 && err.expose !== false;

  res.status(status).json({
    error: exposeMessage ? err.message : 'Internal Server Error',
    ...(isDevelopment && { stack: err.stack })
  });
});

// Initialize connections and start server
async function startServer() {
  try {
    await connectDatabase();
    await initKafka();
    await startConsumer();
    notificationDependenciesReady = true;
    
    app.listen(PORT, () => {
      console.log(`Notification Service running on port ${PORT}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();
