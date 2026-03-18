/**
 * Funding Tracker for Cloudflare Workers.
 * 
 * Uses in-memory Map (persists within a single worker instance).
 * In production, you'd use Cloudflare KV or D1 for persistence.
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
  if (record && !record.recovered) {
    return record.trxAdvanced;
  }
  return 0;
}

export function markRecovered(userAddress: string): void {
  const record = fundingLedger.get(userAddress);
  if (record) {
    record.recovered = true;
    fundingLedger.set(userAddress, record);
  }
}

export function hasBeenFunded(userAddress: string): boolean {
  return fundingLedger.has(userAddress);
}
