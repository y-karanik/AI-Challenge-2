// Simple in-memory token bucket. Per-process, best-effort.
// Survives within a single Worker isolate; not strictly distributed.
type Bucket = { tokens: number; updatedAt: number };
const buckets = new Map<string, Bucket>();

export function rateLimit(key: string, capacity: number, refillPerMinute: number) {
  const now = Date.now();
  const refillRate = refillPerMinute / 60_000; // tokens per ms
  const b = buckets.get(key) ?? { tokens: capacity, updatedAt: now };
  const elapsed = now - b.updatedAt;
  b.tokens = Math.min(capacity, b.tokens + elapsed * refillRate);
  b.updatedAt = now;
  if (b.tokens < 1) {
    buckets.set(key, b);
    throw new Error("Too many requests. Please slow down and try again in a moment.");
  }
  b.tokens -= 1;
  buckets.set(key, b);
}
