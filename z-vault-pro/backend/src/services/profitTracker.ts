// import type { Env } from '../worker-types.js';

/**
 * Z-Vault Pro — Profit Tracking Service
 *
 * Records every transaction margin:
 *   Platform Revenue: $1.00 USDT (flat fee charged to user)
 *   Provider Cost:    ~$0.60 USDT (actual GasFree provider charge)
 *   Net Profit:       ~$0.40 USDT → goes to TREASURY_ADDRESS
 *
 * Aggregates daily summaries in the profit_summary D1 table.
 */

interface ProfitEntry {
  txId: string;
  userAddress: string;
  recipient: string;
  amount: string;
  fee: string;          // Platform fee (what user paid)
  providerFee: string;  // What GasFree provider charged
  profit: string;       // fee - providerFee
  txHash: string;
  network: string;
}

/**
 * Log a completed transaction and calculate the profit margin.
 */
export async function logTransaction(
  db: D1Database,
  entry: ProfitEntry,
): Promise<void> {
  const now = Date.now();

  // Persist transaction record
  await db
    .prepare(
      `INSERT INTO transactions
        (id, user_address, recipient, amount, fee, provider_fee, profit, tx_hash, status, network, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'success', ?, ?, ?)`,
    )
    .bind(
      entry.txId,
      entry.userAddress,
      entry.recipient,
      entry.amount,
      entry.fee,
      entry.providerFee,
      entry.profit,
      entry.txHash,
      entry.network,
      now,
      now,
    )
    .run();

  // Update daily profit summary
  const date = new Date(now).toISOString().slice(0, 10); // YYYY-MM-DD
  await updateDailySummary(db, date, entry.fee, entry.providerFee, entry.profit);
}

/**
 * Log a failed or pending transaction.
 */
export async function logFailedTransaction(
  db: D1Database,
  txId: string,
  userAddress: string,
  recipient: string,
  amount: string,
  fee: string,
  error: string,
  network: string,
): Promise<void> {
  const now = Date.now();
  await db
    .prepare(
      `INSERT INTO transactions
        (id, user_address, recipient, amount, fee, status, network, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'failed', ?, ?, ?)`
    )
    .bind(txId, userAddress, recipient, amount, fee, network, now, now)
    .run();

  // Also write to audit log
  await db
    .prepare(
      `INSERT INTO audit_log (event, user_address, details, created_at)
       VALUES ('relay_error', ?, ?, ?)`,
    )
    .bind(userAddress, JSON.stringify({ txId, error }), now)
    .run();
}

/**
 * Upsert daily profit aggregates.
 */
async function updateDailySummary(
  db: D1Database,
  date: string,
  revenue: string,
  cost: string,
  profit: string,
): Promise<void> {
  // Try insert first; if date exists, update the aggregates
  await db
    .prepare(
      `INSERT INTO profit_summary (date, tx_count, total_revenue, total_cost, total_profit, updated_at)
       VALUES (?, 1, ?, ?, ?, ?)
       ON CONFLICT(date) DO UPDATE SET
         tx_count      = tx_count + 1,
         total_revenue = CAST(CAST(total_revenue AS REAL) + ? AS TEXT),
         total_cost    = CAST(CAST(total_cost    AS REAL) + ? AS TEXT),
         total_profit  = CAST(CAST(total_profit  AS REAL) + ? AS TEXT),
         updated_at    = ?`,
    )
    .bind(
      date,
      revenue, cost, profit, Date.now(),
      // ON CONFLICT values:
      revenue, cost, profit, Date.now(),
    )
    .run();
}

/**
 * Get profit summary for a date range.
 */
export async function getProfitSummary(
  db: D1Database,
  days: number = 7,
): Promise<unknown[]> {
  const { results } = await db
    .prepare(
      `SELECT * FROM profit_summary
       ORDER BY date DESC
       LIMIT ?`,
    )
    .bind(days)
    .all();

  return results;
}

/**
 * Get total all-time stats.
 */
export async function getLifetimeStats(db: D1Database): Promise<unknown> {
  const result = await db
    .prepare(
      `SELECT
         COUNT(*)          AS total_transactions,
         SUM(CAST(profit AS REAL))  AS total_profit,
         SUM(CAST(amount AS REAL))  AS total_volume,
         SUM(CAST(fee    AS REAL))  AS total_revenue
       FROM transactions
       WHERE status = 'success'`,
    )
    .first();

  return result;
}
