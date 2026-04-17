import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

function getRedis(): Redis | null {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  return new Redis({ url, token });
}

const redis = getRedis();

const guestLimiter = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(
        Number(process.env.RATE_LIMIT_GUEST_PER_MIN ?? 30),
        "1 m",
      ),
      prefix: "rl_guest",
    })
  : null;

const apiKeyLimiter = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(
        Number(process.env.RATE_LIMIT_API_KEY_PER_MIN ?? 60),
        "1 m",
      ),
      prefix: "rl_apikey",
    })
  : null;

export function clientIp(request: Request): string {
  const fwd = request.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]?.trim() || "unknown";
  const real = request.headers.get("x-real-ip");
  if (real) return real;
  return "unknown";
}

export async function rateLimitGuest(request: Request): Promise<{
  ok: boolean;
  headers?: Record<string, string>;
}> {
  if (!guestLimiter) return { ok: true };
  const ip = clientIp(request);
  const { success, limit, remaining, reset } = await guestLimiter.limit(ip);
  const headers = {
    "X-RateLimit-Limit": String(limit),
    "X-RateLimit-Remaining": String(remaining),
    "X-RateLimit-Reset": String(reset),
  };
  return { ok: success, headers };
}

export async function rateLimitApiKey(
  apiKeyId: string,
): Promise<{ ok: boolean; headers?: Record<string, string> }> {
  if (!apiKeyLimiter) return { ok: true };
  const { success, limit, remaining, reset } =
    await apiKeyLimiter.limit(apiKeyId);
  const headers = {
    "X-RateLimit-Limit": String(limit),
    "X-RateLimit-Remaining": String(remaining),
    "X-RateLimit-Reset": String(reset),
  };
  return { ok: success, headers };
}
