import redis from 'redis';

let redisClient;
let redisStatus = {
  connected: false,
  lastError: null,
};

async function connectRedis({ throwOnFailure = true } = {}) {
  try {
    if (redisClient?.isReady) {
      redisStatus = { connected: true, lastError: null };
      return true;
    }

    redisClient = redis.createClient({
      socket: {
        host: process.env.REDIS_HOST || 'localhost',
        port: process.env.REDIS_PORT || 6379
      }
    });

    redisClient.on('error', (err) => {
      redisStatus = { connected: false, lastError: err?.message || "Redis client error" };
      console.error('Redis Client Error', err);
    });
    redisClient.on('connect', () => console.log('Connected to Redis'));
    redisClient.on('ready', () => {
      redisStatus = { connected: true, lastError: null };
    });
    redisClient.on('end', () => {
      redisStatus = { connected: false, lastError: "Redis connection closed" };
    });

    await redisClient.connect();
    redisStatus = { connected: true, lastError: null };
    return true;
  } catch (error) {
    redisStatus = { connected: false, lastError: error?.message || "Redis connection error" };
    console.error('Redis connection error:', error);
    try {
      await redisClient?.disconnect();
    } catch {
      // Ignore cleanup errors after a failed connection attempt.
    }
    redisClient = null;
    if (throwOnFailure) {
      throw error;
    }
    return false;
  }
}

function getRedisClient() {
  if (!redisClient?.isReady) {
    throw new Error('Redis client not initialized');
  }
  return redisClient;
}

function getRedisStatus() {
  return {
    connected: Boolean(redisClient?.isReady && redisStatus.connected),
    lastError: redisStatus.lastError,
  };
}

async function testRedisConnection() {
  const client = getRedisClient();
  await client.ping();
}

export {
  connectRedis,
  getRedisClient,
  getRedisStatus,
  testRedisConnection
};
