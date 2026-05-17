import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';
import hotelRoutes from './routes/hotel.routes.js';
import { connectDatabase, testConnection } from './config/database.js';
import { connectRedis } from './config/redis.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3002;
const isDevelopment = process.env.NODE_ENV === "development";
const allowedOrigins = (
  process.env.CORS_ORIGIN ||
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
    res.json({ 
      status: 'healthy', 
      service: 'hotel-service',
      timestamp: new Date().toISOString() 
    });
  } catch (error) {
    res.status(503).json({ 
      status: 'unhealthy', 
      service: 'hotel-service',
      error: 'Service dependency unavailable' 
    });
  }
});

// Routes
app.use('/hotels', hotelRoutes);

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
    await connectRedis();
    
    app.listen(PORT, () => {
      console.log(`Hotel Service running on port ${PORT}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();
