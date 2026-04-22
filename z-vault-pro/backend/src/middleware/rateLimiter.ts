import type { Context, Next } from 'hono';
import type { Env } from '../worker-types.js';

/**
 * Z-Vault Pro — Rate Limiter Middleware
 *
 * Uses an in-memory Map keyed by IP address to enforce:
 *   - Max 10 relay requests per 60-second window per IP
 *   - Written to audit_log when limit exceeded
 *
 * Note: In-memory rate limiting resets on Worker cold starts.
 * For production hardening, use Cloudflare Rate Limiting API
 * or Durable Objects — this is sufficient for MVP.
 */

interface RateEntry {
  count: number;
  windowStart: number;
}

// In-memory rate limit store (per Worker instance)
const rateLimitStore = new Map<string, RateEntry>();

const WINDOW_MS   = 60_000; // 1 minute
const MAX_RELAY   = 10;      // relay requests per window

export async function rateLimiter(c: Context<{ Bindings: Env }>, next: Next) {
  const ip = c.req.header('CF-Connecting-IP') || c.req.header('X-Forwarded-For') || 'unknown';
  const now = Date.now();

  // Get or create rate entry for this IP
  let entry = rateLimitStore.get(ip);
  if (!entry || now - entry.windowStart > WINDOW_MS) {
    entry = { count: 0, windowStart: now };
  }

  entry.count += 1;
  rateLimitStore.set(ip, entry);

  if (entry.count > MAX_RELAY) {
    // Log to D1
    const db = c.env.DB;
    await db
      .prepare(
        `INSERT INTO audit_log (event, ip_address, details, created_at)
         VALUES ('rate_limit', ?, ?, ?)`,
      )
      .bind(ip, JSON.stringify({ count: entry.count }), now)
      .run();

    return c.json(
      { success: false, error: 'Rate limit exceeded. Max 10 relay requests per minute.' },
      429,
    );
  }

  await next();
}
