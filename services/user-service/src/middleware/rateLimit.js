import { getRedisClient } from "../config/redis.js";

function formatWindowMinutes(windowMs) {
  return Math.max(1, Math.round(windowMs / 60000));
}

function normalizeClientIp(ipAddress = "") {
  return ipAddress ? ipAddress.replace(/^::ffff:/, "") : "unknown";
}

export function createRateLimiter({
  windowMs,
  maxRequests,
  message,
  keyBuilder = (req) => normalizeClientIp(req.ip),
  prefix = "rate-limit",
}) {
  return async (req, res, next) => {
    try {
      const redis = getRedisClient();
      const requestKey = `${prefix}:${keyBuilder(req)}`;
      const totalHits = await redis.incr(requestKey);

      if (totalHits === 1) {
        await redis.pExpire(requestKey, windowMs);
      }

      if (totalHits > maxRequests) {
        const ttlMs = await redis.pTTL(requestKey);
        const retryAfterSeconds = Math.max(1, Math.ceil(ttlMs / 1000));
        res.setHeader("Retry-After", retryAfterSeconds);
        return res.status(429).json({
          error:
            message ||
            `Too many requests. Try again in ${formatWindowMinutes(windowMs)} minutes.`,
        });
      }

      next();
    } catch (error) {
      console.error("User rate limiter error:", error);
      next();
    }
  };
}
