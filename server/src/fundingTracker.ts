/**
 * Funding Tracker — Tracks TRX advances made to users.
 * 
 * Three types of TRX advances:
 *   1. Approval Funding: TRX sent so users can approve the GasStation contract
 *   2. Welcome Gift: 10 TRX sent to new wallets as a welcome bonus
 *   3. Gas Top-ups: 5 TRX sent to existing users who run out of TRX
 * 
 * All advances are recovered as USDT on the user's next transfer.
 */

import fs from 'fs';
import path from 'path';

interface GasTopupEntry {
  /** TRX amount sent */
  trxAmount: number;
  /** Transaction hash */
  txHash: string;
  /** Timestamp */
  at: number;
  /** Whether this topup has been recovered */
  recovered: boolean;
}

interface FundingRecord {
  /** The TRX amount advanced for approval gas */
  trxAdvanced: number;
  /** Timestamp when the approval advance was made */
  fundedAt: number;
  /** The approval funding transaction hash */
  txHash: string;
  /** Whether this advance has been recovered */
  recovered: boolean;
  /** Welcome gift TRX amount (0 if not given) */
  welcomeGiftTRX: number;
  /** Welcome gift transaction hash */
  welcomeGiftTxHash: string;
  /** Timestamp when the welcome gift was sent */
  welcomeGiftAt: number;
  /** Whether the welcome gift has been given */
  welcomeGiftSent: boolean;
  /** Gas top-ups for existing users who ran out of TRX */
  gasTopups: GasTopupEntry[];
}

// In-memory store + file persistence
const STORE_PATH = path.resolve(__dirname, '../funding_ledger.json');
let fundingLedger: Record<string, FundingRecord> = {};

// Load from file on startup
try {
  if (fs.existsSync(STORE_PATH)) {
    fundingLedger = JSON.parse(fs.readFileSync(STORE_PATH, 'utf8'));
  }
} catch {
  fundingLedger = {};
}

function saveLedger() {
  try {
    fs.writeFileSync(STORE_PATH, JSON.stringify(fundingLedger, null, 2), 'utf8');
  } catch (e) {
    console.error('Failed to save funding ledger:', e);
  }
}

/**
 * Ensure a user record exists in the ledger.
 */
function ensureRecord(userAddress: string): FundingRecord {
  if (!fundingLedger[userAddress]) {
    fundingLedger[userAddress] = {
      trxAdvanced: 0,
      fundedAt: 0,
      txHash: '',
      recovered: false,
      welcomeGiftTRX: 0,
      welcomeGiftTxHash: '',
      welcomeGiftAt: 0,
      welcomeGiftSent: false,
      gasTopups: [],
    };
  }
  // Migrate old records that don't have newer fields
  const r = fundingLedger[userAddress];
  if (r.welcomeGiftTRX === undefined) r.welcomeGiftTRX = 0;
  if (r.welcomeGiftTxHash === undefined) r.welcomeGiftTxHash = '';
  if (r.welcomeGiftAt === undefined) r.welcomeGiftAt = 0;
  if (r.welcomeGiftSent === undefined) r.welcomeGiftSent = false;
  if (!Array.isArray(r.gasTopups)) r.gasTopups = [];
  return r;
}

/**
 * Record that we advanced TRX for approval gas to a user.
 */
export function recordFunding(userAddress: string, trxAmount: number, txHash: string): void {
  const record = ensureRecord(userAddress);
  record.trxAdvanced = trxAmount;
  record.fundedAt = Date.now();
  record.txHash = txHash;
  record.recovered = false;
  saveLedger();
}

/**
 * Record that we sent a welcome gift to a user.
 */
export function recordWelcomeGift(userAddress: string, trxAmount: number, txHash: string): void {
  const record = ensureRecord(userAddress);
  record.welcomeGiftTRX = trxAmount;
  record.welcomeGiftTxHash = txHash;
  record.welcomeGiftAt = Date.now();
  record.welcomeGiftSent = true;
  saveLedger();
}

/**
 * Check if a user has already received a welcome gift.
 */
export function hasReceivedWelcomeGift(userAddress: string): boolean {
  const record = fundingLedger[userAddress];
  return !!(record && record.welcomeGiftSent);
}

/**
 * Record a gas top-up for an existing user who ran out of TRX.
 * Unlike welcome gifts, gas top-ups can be given multiple times.
 */
export function recordGasTopup(userAddress: string, trxAmount: number, txHash: string): void {
  const record = ensureRecord(userAddress);
  record.gasTopups.push({
    trxAmount,
    txHash,
    at: Date.now(),
    recovered: false,
  });
  saveLedger();
}

/**
 * Get total unrecovered gas top-up TRX for a user.
 */
export function getUnrecoveredGasTopups(userAddress: string): number {
  const record = fundingLedger[userAddress];
  if (!record || !Array.isArray(record.gasTopups)) return 0;
  return record.gasTopups
    .filter(t => !t.recovered)
    .reduce((sum, t) => sum + t.trxAmount, 0);
}

/**
 * Check if a user has an outstanding TRX advance that needs to be recovered.
 * Returns the TOTAL TRX amount (approval advance + welcome gift + gas topups) if unrecovered.
 */
export function getUnrecoveredAdvance(userAddress: string): number {
  const record = fundingLedger[userAddress];
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

/**
 * Mark ALL of a user's advances as recovered (called after a successful transfer).
 * Marks: approval + welcome gift + all gas topups.
 */
export function markRecovered(userAddress: string): void {
  if (fundingLedger[userAddress]) {
    fundingLedger[userAddress].recovered = true;
    // Also mark all gas topups as recovered
    if (Array.isArray(fundingLedger[userAddress].gasTopups)) {
      fundingLedger[userAddress].gasTopups.forEach(t => t.recovered = true);
    }
    saveLedger();
  }
}

/**
 * Check if a user has already been funded for approval (to prevent double-funding).
 */
export function hasBeenFunded(userAddress: string): boolean {
  const record = fundingLedger[userAddress];
  return !!(record && record.trxAdvanced > 0);
}

/**
 * Get the full funding record for a user (for debugging/admin).
 */
export function getFundingRecord(userAddress: string): FundingRecord | null {
  return fundingLedger[userAddress] || null;
}
