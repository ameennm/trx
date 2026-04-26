import type { Context, Next } from 'hono';

/**
 * Z-Vault Pro — Security Middleware
 *
 * 1. CORS: Allow only the configured frontend origin
 * 2. Request validation: Sanitize and validate relay request body
 * 3. Blacklist check: Reject transfers to known scam addresses
 * 4. Audit logging: Log every relay attempt
 */

// TRON address pattern (base58, starts with T, 34 chars)
const TRON_ADDRESS_RE = /^T[1-9A-HJ-NP-Za-km-z]{33}$/;

// Allowed origins — add your Cloudflare Pages domain here
const ALLOWED_ORIGINS = [
  'https://z-vault-pro.pages.dev',
  'https://z-vault-pro-frontend.pages.dev',
  'http://localhost:5173', // Vite dev server
  'http://localhost:4173', // Vite preview
];

/**
 * CORS middleware — allows frontend to call the Worker API.
 */
export async function cors(c: Context, next: Next) {
  const requestOrigin = c.req.header('Origin') || '';
  const isAllowed = ALLOWED_ORIGINS.includes(requestOrigin);
  
  // Reflect only if allowed; otherwise don't set CORS headers (browser will block)
  const origin = isAllowed ? requestOrigin : ALLOWED_ORIGINS[0];

  c.header('Access-Control-Allow-Origin', origin);
  c.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  c.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-admin-address');
  c.header('Access-Control-Max-Age', '86400');

  if (c.req.method === 'OPTIONS') {
    return c.body(null, 204);
  }

  await next();
}

/**
 * Admin authentication middleware.
 * Verifies that the x-admin-address header matches the treasury or a whitelisted admin.
 */
export async function adminAuth(c: Context, next: Next) {
  const adminAddress = c.req.header('x-admin-address');
  
  // The env type might not have TREASURY_ADDRESS defined explicitly here but it's passed at runtime
  const envTreasury = (c.env as any).TREASURY_ADDRESS;
  
  const allowed = [
    envTreasury,
    'TJBpgUDZEhyJ3GmgAM8DUdFoPCxfWZPuaX', // Testing account
    'TBjkHJyKRN2YhxCeeNM7A8QVgK7hG8ubkv', // Legacy treasury account
    'TYbhLzARFg6HnV3FBFiA68etPwKXtLisVZ'  // Active treasury account
  ].filter(Boolean);

  if (!adminAddress || !allowed.includes(adminAddress)) {
    // If we wanted we could audit log here, but we don't have DB type imported easily, so just reject
    return c.json({ success: false, error: 'Unauthorized: Admin access required.' }, 401);
  }
  await next();
}

/**
 * Validate a relay request body.
 * Returns an error message string if invalid, null if OK.
 */
export function validateRelayBody(body: unknown): string | null {
  if (!body || typeof body !== 'object') return 'Request body must be JSON.';

  const b = body as Record<string, unknown>;

  if (!b.signature || typeof b.signature !== 'string') {
    return 'Missing or invalid "signature" field.';
  }
  if (!b.userAddress || typeof b.userAddress !== 'string') {
    return 'Missing or invalid "userAddress" field.';
  }
  if (!TRON_ADDRESS_RE.test(b.userAddress as string)) {
    return '"userAddress" is not a valid TRON address.';
  }
  if (!b.recipient || typeof b.recipient !== 'string') {
    return 'Missing or invalid "recipient" field.';
  }
  if (!TRON_ADDRESS_RE.test(b.recipient as string)) {
    return '"recipient" is not a valid TRON address.';
  }
  if (!b.amount || typeof b.amount !== 'string') {
    return 'Missing or invalid "amount" field.';
  }
  const amount = parseFloat(b.amount as string);
  if (isNaN(amount) || amount <= 0) {
    return '"amount" must be a positive number.';
  }
  if (!b.message || typeof b.message !== 'object') {
    return 'Missing or invalid "message" field (TIP-712 payload).';
  }

  return null;
}

/**
 * Blacklist check — queries D1 to see if recipient is flagged.
 */
export async function checkBlacklist(
  db: D1Database,
  address: string,
): Promise<{ blocked: boolean; reason?: string }> {
  const row = await db
    .prepare('SELECT reason FROM blacklist WHERE address = ?')
    .bind(address)
    .first<{ reason: string }>();

  if (row) return { blocked: true, reason: row.reason };
  return { blocked: false };
}

/**
 * Audit logger — writes a security event to D1.
 */
export async function auditLog(
  db: D1Database,
  event: string,
  c: Context,
  details?: Record<string, unknown>,
): Promise<void> {
  const ip = c.req.header('CF-Connecting-IP') || c.req.header('X-Forwarded-For') || 'unknown';
  const ua = (c.req.header('User-Agent') || '').slice(0, 200);
  const now = Date.now();

  await db
    .prepare(
      `INSERT INTO audit_log (event, ip_address, user_agent, details, created_at)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .bind(event, ip, ua, details ? JSON.stringify(details) : null, now)
    .run();
}
