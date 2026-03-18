/**
 * Funding Tracker for Cloudflare Workers.
 * 
 * Tracks TRX sent to users for approval gas.
 * The relayer sends 5 TRX so the user can approve the GasStation contract.
 * This is recovered from their first USDT transfer fee.
 * 
 * Uses in-memory Map (single worker instance).
 * For production persistence, use Cloudflare KV or D1.
 */

interface FundingRecord {
  trxAdvanced: number;
  fundedAt: number;
  txHash: string;
  recovered: boolean;
}

const fundingLedger = new Map<string, FundingRecord>();

export function recordFunding(userAddress: string, trxAmount: number, txHash: string): void {
  fundingLedger.set(userAddress, {
    trxAdvanced: trxAmount,
    fundedAt: Date.now(),
    txHash,
    recovered: false,
  });
}

export function getUnrecoveredAdvance(userAddress: string): number {
  const record = fundingLedger.get(userAddress);
  if (!record || record.recovered) return 0;
  return record.trxAdvanced;
}

export function markRecovered(userAddress: string): void {
  const record = fundingLedger.get(userAddress);
  if (record) {
    record.recovered = true;
  }
}

export function hasBeenFunded(userAddress: string): boolean {
  const record = fundingLedger.get(userAddress);
  return !!(record && record.trxAdvanced > 0);
}
