/**
 * Funding Tracker for Cloudflare Workers.
 * 
 * Three types of TRX advances:
 *   1. Approval Funding: TRX sent so users can approve the GasStation contract
 *   2. Welcome Gift: 10 TRX sent to new wallets as a welcome bonus
 *   3. Gas Top-ups: 5 TRX sent to existing users who run out of TRX
 * 
 * Uses in-memory Map (persists within a single worker instance).
 * In production, you'd use Cloudflare KV or D1 for persistence.
 */

interface GasTopupEntry {
  trxAmount: number;
  txHash: string;
  at: number;
  recovered: boolean;
}

interface FundingRecord {
  trxAdvanced: number;
  fundedAt: number;
  txHash: string;
  recovered: boolean;
  welcomeGiftTRX: number;
  welcomeGiftTxHash: string;
  welcomeGiftAt: number;
  welcomeGiftSent: boolean;
  gasTopups: GasTopupEntry[];
}

const fundingLedger = new Map<string, FundingRecord>();

function ensureRecord(userAddress: string): FundingRecord {
  if (!fundingLedger.has(userAddress)) {
    fundingLedger.set(userAddress, {
      trxAdvanced: 0,
      fundedAt: 0,
      txHash: '',
      recovered: false,
      welcomeGiftTRX: 0,
      welcomeGiftTxHash: '',
      welcomeGiftAt: 0,
      welcomeGiftSent: false,
      gasTopups: [],
    });
  }
  return fundingLedger.get(userAddress)!;
}

export function recordFunding(userAddress: string, trxAmount: number, txHash: string): void {
  const record = ensureRecord(userAddress);
  record.trxAdvanced = trxAmount;
  record.fundedAt = Date.now();
  record.txHash = txHash;
  record.recovered = false;
}

export function recordWelcomeGift(userAddress: string, trxAmount: number, txHash: string): void {
  const record = ensureRecord(userAddress);
  record.welcomeGiftTRX = trxAmount;
  record.welcomeGiftTxHash = txHash;
  record.welcomeGiftAt = Date.now();
  record.welcomeGiftSent = true;
}

export function hasReceivedWelcomeGift(userAddress: string): boolean {
  const record = fundingLedger.get(userAddress);
  return !!(record && record.welcomeGiftSent);
}

export function recordGasTopup(userAddress: string, trxAmount: number, txHash: string): void {
  const record = ensureRecord(userAddress);
  record.gasTopups.push({
    trxAmount,
    txHash,
    at: Date.now(),
    recovered: false,
  });
}

function getUnrecoveredGasTopups(userAddress: string): number {
  const record = fundingLedger.get(userAddress);
  if (!record || !Array.isArray(record.gasTopups)) return 0;
  return record.gasTopups
    .filter(t => !t.recovered)
    .reduce((sum, t) => sum + t.trxAmount, 0);
}

export function getUnrecoveredAdvance(userAddress: string): number {
  const record = fundingLedger.get(userAddress);
  if (!record) return 0;

  let total = 0;

  // Approval + welcome gift (only if not yet recovered)
  if (!record.recovered) {
    if (record.trxAdvanced > 0) total += record.trxAdvanced;
    if (record.welcomeGiftTRX > 0) total += record.welcomeGiftTRX;
  }

  // Gas top-ups (each tracked individually)
  total += getUnrecoveredGasTopups(userAddress);

  return total;
}

export function markRecovered(userAddress: string): void {
  const record = fundingLedger.get(userAddress);
  if (record) {
    record.recovered = true;
    // Also mark all gas topups as recovered
    if (Array.isArray(record.gasTopups)) {
      record.gasTopups.forEach(t => t.recovered = true);
    }
  }
}

export function hasBeenFunded(userAddress: string): boolean {
  const record = fundingLedger.get(userAddress);
  return !!(record && record.trxAdvanced > 0);
}
