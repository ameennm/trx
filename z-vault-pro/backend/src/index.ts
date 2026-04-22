import { Hono } from 'hono';
import type { Env } from './worker-types.js';
import { cors, validateRelayBody, checkBlacklist, auditLog } from './middleware/security.js';
import { rateLimiter } from './middleware/rateLimiter.js';
import {
  getAccountInfo,
  getSupportedTokens,
  submitGasFreeTransfer,
} from './services/gasfreeProxy.js';
import {
  logTransaction,
  logFailedTransaction,
  getProfitSummary,
  getLifetimeStats,
} from './services/profitTracker.js';

/**
 * Z-Vault Pro — Cloudflare Workers Backend
 * Framework: Hono
 * Database:  Cloudflare D1 (SQLite)
 *
 * Routes:
 *   GET  /api/health           — Service health check
 *   GET  /api/nonce/:address   — Proxy GasFree nonce fetch
 *   GET  /api/config/tokens    — Proxy supported token list
 *   POST /api/relay            — Accept TIP-712 sig, validate, forward to GasFree, log
 *   GET  /api/history/:address — User transaction history from D1
 *   GET  /api/stats            — Profit & volume stats (admin)
 */

const app = new Hono<{ Bindings: Env }>();

// ─── Global Middleware ───────────────────────────────────────────────────────

// Apply CORS to all routes
app.use('*', cors);

// ─── Routes ─────────────────────────────────────────────────────────────────

/**
 * Health check — confirms service is alive and shows network mode.
 */
app.get('/api/health', (c) => {
  const isMainnet = c.env.NETWORK_MODE === 'mainnet';
  return c.json({
    service: 'Z-Vault Pro API',
    version: '2.0.0',
    status: 'operational',
    network: c.env.NETWORK_MODE,
    usdtContract: isMainnet
      ? c.env.USDT_CONTRACT_MAINNET
      : c.env.USDT_CONTRACT_TESTNET,
    platformFee: c.env.PLATFORM_FEE_USDT,
    timestamp: new Date().toISOString(),
  });
});

/**
 * Nonce fetch — proxy to GasFree provider.
 * Frontend needs the nonce before assembling the TIP-712 message.
 */
app.get('/api/nonce/:address', async (c) => {
  const address = c.req.param('address');

  try {
    const account = await getAccountInfo(c.env, address);
    return c.json({ success: true, data: account });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return c.json({ success: false, error: msg }, 502);
  }
});

/**
 * Token config — proxy to GasFree provider.
 * Returns supported tokens and their current fees.
 */
app.get('/api/config/tokens', async (c) => {
  try {
    const tokens = await getSupportedTokens(c.env);
    return c.json({ success: true, data: tokens });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return c.json({ success: false, error: msg }, 502);
  }
});

/**
 * Main relay endpoint — the core business logic.
 *
 * Flow:
 *  1. Rate limit check (max 10 req/min per IP)
 *  2. Validate request body (addresses + signature + message)
 *  3. Check recipient against blacklist
 *  4. Forward signed TIP-712 to GasFree provider
 *  5. Log transaction + profit margin to D1
 *  6. Return tx hash to frontend
 */
app.post('/api/relay', rateLimiter, async (c) => {
  const body = await c.req.json().catch(() => null);

  // 1. Request validation
  const validationError = validateRelayBody(body);
  if (validationError) {
    return c.json({ success: false, error: validationError }, 400);
  }

  const { signature, userAddress, recipient, amount, message } =
    body as {
      signature: string;
      userAddress: string;
      recipient: string;
      amount: string;
      message: Record<string, string>;
    };

  // Log the attempt
  await auditLog(c.env.DB, 'relay_attempt', c, { userAddress, recipient, amount });

  // 2. Blacklist check
  const { blocked, reason } = await checkBlacklist(c.env.DB, recipient);
  if (blocked) {
    await auditLog(c.env.DB, 'blacklist_hit', c, { recipient, reason });
    return c.json(
      { success: false, error: `Recipient address blocked: ${reason}` },
      403,
    );
  }

  // Generate a unique tx ID for tracking
  const txId = crypto.randomUUID();
  const network = c.env.NETWORK_MODE;

  try {
    // 3. Submit to GasFree provider
    const result = await submitGasFreeTransfer(c.env, signature, message);

    // 4. Extract result fields (GasFree may use different field names)
    const txHash = result.txHash || (result as any).traceId || (result as any).transactionHash || (result as any).hash || txId;
    const resultFee = result.fee || (result as any).actualFee || '0';

    // 5. Calculate profit margin
    const platformFee = parseFloat(c.env.PLATFORM_FEE_USDT);
    const providerFee = parseFloat(resultFee);
    const profit = (platformFee - providerFee).toFixed(6);

    // 6. Log success to D1
    await logTransaction(c.env.DB, {
      txId,
      userAddress,
      recipient,
      amount,
      fee: c.env.PLATFORM_FEE_USDT,
      providerFee: String(resultFee),
      profit,
      txHash: String(txHash),
      network,
    });

    await auditLog(c.env.DB, 'relay_success', c, {
      txId,
      txHash: String(txHash),
      profit,
    });

    return c.json({
      success: true,
      txHash: String(txHash),
      txId,
      profit: `$${profit}`,
      message: 'GasFree transfer submitted successfully.',
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error';

    // Log failure
    await logFailedTransaction(c.env.DB, txId, userAddress, recipient, amount, msg, network);

    return c.json({ success: false, error: msg }, 500);
  }
});

/**
 * Transaction history — returns user's tx records from D1.
 */
app.get('/api/history/:address', async (c) => {
  const address = c.req.param('address');
  const { results } = await c.env.DB
    .prepare(
      `SELECT id, recipient, amount, fee, tx_hash, status, created_at, network
       FROM transactions
       WHERE user_address = ?
       ORDER BY created_at DESC
       LIMIT 50`,
    )
    .bind(address)
    .all();

  return c.json({ success: true, data: results });
});

/**
 * Admin stats — profit summary and lifetime totals.
 */
app.get('/api/stats', async (c) => {
  const [summary, lifetime] = await Promise.all([
    getProfitSummary(c.env.DB, 7),
    getLifetimeStats(c.env.DB),
  ]);

  return c.json({
    success: true,
    data: { lifetime, last7Days: summary },
  });
});

// ─── 404 Fallback ────────────────────────────────────────────────────────────

app.notFound((c) =>
  c.json({ success: false, error: 'Route not found.' }, 404),
);

app.onError((err, c) => {
  console.error('[Z-Vault Error]', err);
  return c.json({ success: false, error: 'Internal server error.' }, 500);
});

export default app;
