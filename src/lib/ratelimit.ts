/**
 * Rate Limiting Configuration
 * Environment variables required:
 * - UPSTASH_REDIS_REST_URL: The REST URL for the Upstash Redis instance
 * - UPSTASH_REDIS_REST_TOKEN: The REST Token for the Upstash Redis instance
 */

import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

const url = process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN;

let ratelimit: Ratelimit | null = null;

if (url && token) {
  const redis = new Redis({
    url,
    token,
  });

  ratelimit = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(10, "60 s"),
  });
}

export async function checkRateLimit(identifier: string) {
  if (!ratelimit) {
    console.warn(
      "Upstash Redis rate limiting is skipped: UPSTASH_REDIS_REST_URL or UPSTASH_REDIS_REST_TOKEN environment variables are missing."
    );
    return {
      success: true,
      limit: 10,
      remaining: 10,
      reset: 0,
    };
  }

  try {
    return await ratelimit.limit(identifier);
  } catch (error) {
    console.error("Error evaluating rate limit with Upstash Redis:", error);
    // Fail open gracefully if Redis service encounters an error
    return {
      success: true,
      limit: 10,
      remaining: 10,
      reset: 0,
    };
  }
}

/**
 * Extracts the client IP robustly from request headers for Vercel / serverless environments.
 * - Prefers `x-forwarded-for` (first IP in the list)
 * - Fallback to `x-real-ip`
 * - Fallback to "anonymous"
 */
export function getClientIp(req: Request): string {
  const xForwardedFor = req.headers.get("x-forwarded-for");
  if (xForwardedFor) {
    const firstIp = xForwardedFor.split(",")[0]?.trim();
    if (firstIp) {
      return firstIp;
    }
  }

  const xRealIp = req.headers.get("x-real-ip");
  if (xRealIp && xRealIp.trim()) {
    return xRealIp.trim();
  }

  return "anonymous";
}
