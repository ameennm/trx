import { Hono } from 'hono';
import type { Env } from './worker-types.js';
import { cors, validateRelayBody, checkBlacklist, auditLog, adminAuth } from './middleware/security.js';
import { rateLimiter } from './middleware/rateLimiter.js';
import { submitInternalRelay } from './services/relayerService.js';
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
 *   GET  /api/nonce/:address   — Nonce endpoint (frontend fetches from contract directly)
 *   GET  /api/config/tokens    — Token configuration
 *   POST /api/relay            — Accept TIP-712 sig, validate, rent energy, broadcast
 *   GET  /api/history/:address — User transaction history from D1
 *   GET  /api/stats            — Profit & volume stats (admin)
 */

const app = new Hono<{ Bindings: Env }>();

// ─── Global Middleware ───────────────────────────────────────────────────────

// Apply CORS to all routes
app.use('*', cors);

// ─── Routes ─────────────────────────────────────────────────────────────────

app.get('/api/health', (c) => {
  const isMainnet = c.env.NETWORK_MODE === 'mainnet';
  return c.json({
    service: 'Z-Vault Pro API',
    version: '2.2.0',
    status: 'operational',
    network: c.env.NETWORK_MODE,
    usdtContract: isMainnet
      ? c.env.USDT_CONTRACT_MAINNET
      : c.env.USDT_CONTRACT_TESTNET,
    fees: {
      threshold: c.env.FEE_THRESHOLD_USDT || '5000',
      tier1: c.env.FEE_TIER_1_USDT || '1.00',
      tier2: c.env.FEE_TIER_2_USDT || '2.00',
      activation: c.env.ACTIVATION_FEE_USDT || '2.00'
    },
    timestamp: new Date().toISOString(),
  });
});

/**
 * Nonce fetch — backward compatibility endpoint.
 * The frontend now fetches nonces directly from the smart contract,
 * but this endpoint is kept for API completeness.
 */
app.get('/api/nonce/:address', async (c) => {
  const address = c.req.param('address');
  return c.json({ success: true, data: { address, nonce: '0', activated: true } });
});

/**
 * Token config — returns the supported token and current fee structure.
 * No longer proxies to GasFree; returns static config from env.
 */
app.get('/api/config/tokens', (c) => {
  const isMainnet = c.env.NETWORK_MODE === 'mainnet';
  const usdtContract = isMainnet
    ? c.env.USDT_CONTRACT_MAINNET
    : c.env.USDT_CONTRACT_TESTNET;

  return c.json({
    success: true,
    data: [
      {
        contract: usdtContract,
        symbol: 'USDT',
        decimals: 6,
        transferFee: c.env.FEE_TIER_1_USDT || '1.00',
        activationFee: c.env.ACTIVATION_FEE_USDT || '2.00',
        feeThreshold: c.env.FEE_THRESHOLD_USDT || '5000',
        transferFeeAboveThreshold: c.env.FEE_TIER_2_USDT || '2.00',
      }
    ],
  });
});

/**
 * Main relay endpoint — the core business logic.
 *
 * Flow:
 *  1. Rate limit check (max 10 req/min per IP)
 *  2. Validate request body (addresses + signature + message)
 *  3. Check recipient against blacklist
 *  4. Rent energy via Netts.io (or simulate on testnet)
 *  5. Broadcast signed TIP-712 via TronWeb to the TRON chain
 *  6. Log transaction + profit margin to D1
 *  7. Return tx hash to frontend
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
    // 3. Submit to Internal Relayer (Energy Rental + TronWeb Broadcast)
    const result = await submitInternalRelay(c.env, signature, message);
    const txHash = result.txHash;

    // 4. Calculate profit margin
    const platformFee = parseFloat(message.maxFee) / 1_000_000;
    const providerFee = result.providerFee; 
    const profit = (platformFee - providerFee).toFixed(6);

    // 5. Log success to D1
    await logTransaction(c.env.DB, {
      txId,
      userAddress,
      recipient,
      amount,
      fee: String(platformFee),
      providerFee: String(providerFee),
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
      message: 'Z-Vault Relayer transfer submitted successfully.',
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error';

    const platformFee = message.maxFee ? parseFloat(message.maxFee) / 1_000_000 : 1.00;
    // Log failure
    await logFailedTransaction(c.env.DB, txId, userAddress, recipient, amount, String(platformFee), msg, network);

    return c.json({ success: false, error: msg }, 500);
  }
});

/**
 * Rent Deposit Energy endpoint
 * Rents 65,000 energy from Netts.io directly to the user's Main Wallet.
 * This allows the "Top Up Vault" transaction (which is a standard TRC20 transfer) to be gasless.
 */
app.post(
  '/api/rent-deposit',
  rateLimiter,
  async (c) => {
    try {
      const body = await c.req.json();
      const { userAddress } = body;

      if (!userAddress || !/^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(userAddress)) {
        return c.json({ success: false, message: 'Invalid user address' }, 400);
      }

      // Rent 65,000 energy for a standard TRC20 transfer
      const energyNeeded = 65000;
      console.log(`[Rent-Deposit] Renting ${energyNeeded} energy to ${userAddress} for Top Up...`);
      
      const { rentEnergy } = await import('./services/feeeRental.js');
      
      await rentEnergy(c.env, energyNeeded, userAddress);

      return c.json({
        success: true,
        message: 'Energy rented successfully for deposit'
      });
    } catch (error: any) {
      console.error('[Rent-Deposit] Failed:', error);
      return c.json({ success: false, message: error.message || 'Energy rental failed' }, 500);
    }
  }
);

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
 * Admin stats — profit summary, lifetime totals, and treasury info.
 */
app.get('/api/stats', adminAuth, async (c) => {
  const [summary, lifetime] = await Promise.all([
    getProfitSummary(c.env.DB, 7),
    getLifetimeStats(c.env.DB),
  ]);

  // Get total withdrawn
  const withdrawn = await c.env.DB
    .prepare(`SELECT COALESCE(SUM(CAST(amount AS REAL)), 0) AS total_withdrawn, COUNT(*) AS withdrawal_count FROM withdrawals`)
    .first();

  return c.json({
    success: true,
    data: {
      lifetime,
      last7Days: summary,
      treasury: c.env.TREASURY_ADDRESS || 'Not configured',
      totalWithdrawn: withdrawn?.total_withdrawn || 0,
      withdrawalCount: withdrawn?.withdrawal_count || 0,
    },
  });
});

/**
 * Admin — Record a profit withdrawal to treasury.
 */
app.post('/api/admin/withdraw', adminAuth, async (c) => {
  const body = await c.req.json<{ amount: string; adminAddress: string }>();
  const { amount, adminAddress } = body;

  if (!amount || parseFloat(amount) <= 0) {
    return c.json({ success: false, error: 'Invalid withdrawal amount.' }, 400);
  }

  const treasury = c.env.TREASURY_ADDRESS;
  if (!treasury) {
    return c.json({ success: false, error: 'Treasury address not configured.' }, 500);
  }

  // Check available profit
  const lifetime = await getLifetimeStats(c.env.DB) as any;
  const totalProfit = parseFloat(lifetime?.total_profit || '0');
  const withdrawn = await c.env.DB
    .prepare(`SELECT COALESCE(SUM(CAST(amount AS REAL)), 0) AS total FROM withdrawals`)
    .first() as any;
  const totalWithdrawn = parseFloat(withdrawn?.total || '0');
  const available = totalProfit - totalWithdrawn;

  if (parseFloat(amount) > available) {
    return c.json({ success: false, error: `Insufficient profit. Available: $${available.toFixed(2)}` }, 400);
  }

  const id = crypto.randomUUID();
  const now = Date.now();

  await c.env.DB
    .prepare(`INSERT INTO withdrawals (id, amount, treasury, status, network, created_at) VALUES (?, ?, ?, 'recorded', ?, ?)`)
    .bind(id, amount, treasury, c.env.NETWORK_MODE, now)
    .run();

  await auditLog(c.env.DB, 'admin_withdrawal', c, { id, amount, treasury, adminAddress });

  return c.json({
    success: true,
    data: {
      id,
      amount,
      treasury,
      status: 'recorded',
      message: `Withdrawal of $${amount} USDT recorded. Funds will be swept to ${treasury}.`,
    },
  });
});

/**
 * Admin — Get withdrawal history.
 */
app.get('/api/admin/withdrawals', adminAuth, async (c) => {
  const { results } = await c.env.DB
    .prepare(`SELECT * FROM withdrawals ORDER BY created_at DESC LIMIT 50`)
    .all();

  return c.json({ success: true, data: results });
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
