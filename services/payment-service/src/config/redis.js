import redis from "redis";

let redisClient;

export async function connectRedis() {
  try {
    redisClient = redis.createClient({
      socket: {
        host: process.env.REDIS_HOST || "localhost",
        port: process.env.REDIS_PORT || 6379,
      },
    });

    redisClient.on("error", (error) => console.error("Redis Client Error", error));
    redisClient.on("connect", () => console.log("Connected to Redis"));

    await redisClient.connect();
  } catch (error) {
    console.error("Redis connection error:", error);
    throw error;
  }
}

export function getRedisClient() {
  if (!redisClient) {
    throw new Error("Redis client not initialized");
  }

  return redisClient;
}
