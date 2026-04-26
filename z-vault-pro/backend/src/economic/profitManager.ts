/**
 * Z-Vault Pro — Profit Management Engine
 * Calculates net profit per transaction based on real cost basis.
 *
 * Revenue model:
 *   User pays: $1.00 USDT (tier 1) or $2.00 USDT (tier 2)
 *   Platform cost: ~$0.60 USDT (energy rental via Netts.io, set in GASFREE_BASE_FEE)
 *   Net profit: Revenue - Cost = ~$0.40 USDT per transaction
 */

/**
 * Calculate and log the profit for a completed transaction.
 * @param platformFee - What the user paid (USDT)
 * @param providerCost - What energy rental cost (USDT, from GASFREE_BASE_FEE)
 */
export function logArbitrage(platformFee: number, providerCost: number) {
  const netProfit = platformFee - providerCost;
  const timestamp = new Date().toISOString();

  console.log(`\n  ╔════════════════════════════════════════════════╗`);
  console.log(`  ║ [Z-Vault] Transaction Profit Log               ║`);
  console.log(`  ║ 🔹 Platform Fee: $${platformFee.toFixed(2)} USDT                ║`);
  console.log(`  ║ 🔹 Energy Cost:  $${providerCost.toFixed(2)} USDT                ║`);
  console.log(`  ║ 💰 Net Profit:   $${netProfit.toFixed(2)} USDT                ║`);
  console.log(`  ║ 🕒 Time:         ${timestamp} ║`);
  console.log(`  ╚════════════════════════════════════════════════╝\n`);

  return {
    revenue: platformFee,
    cost: providerCost,
    profit: netProfit,
  };
}
