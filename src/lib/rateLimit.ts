import IORedis from "ioredis";

const connection = new IORedis(process.env.REDIS_URL || "redis://redis:6379", {
  maxRetriesPerRequest: null,
  lazyConnect: true,
});

connection.on("error", () => {
  // Rate limiting is best-effort — a Redis hiccup should not lock
  // legitimate users out of login.
});

// Fixed-window counter. Returns false once `limit` calls for the same
// key land inside `windowSeconds`. Fails open on Redis errors.
export async function checkRateLimit(key: string, limit: number, windowSeconds: number) {
  try {
    const count = await connection.incr(key);
    if (count === 1) await connection.expire(key, windowSeconds);
    return count <= limit;
  } catch {
    return true;
  }
}
