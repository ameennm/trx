/**
 * Funding Tracker — Tracks TRX advances made to new users.
 * 
 * When a new user connects with 0 TRX and needs to approve the GasStation,
 * the relayer sends them TRX for gas. This module tracks that advance so
 * it can be recovered as USDT on the user's first transfer.
 */

import fs from 'fs';
import path from 'path';

interface FundingRecord {
  /** The TRX amount advanced to the user */
  trxAdvanced: number;
  /** Timestamp when the advance was made */
  fundedAt: number;
  /** The funding transaction hash */
  txHash: string;
  /** Whether this advance has been recovered */
  recovered: boolean;
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
 * Record that we advanced TRX to a user.
 */
export function recordFunding(userAddress: string, trxAmount: number, txHash: string): void {
  fundingLedger[userAddress] = {
    trxAdvanced: trxAmount,
    fundedAt: Date.now(),
    txHash,
    recovered: false,
  };
  saveLedger();
}

/**
 * Check if a user has an outstanding TRX advance that needs to be recovered.
 * Returns the TRX amount if there's an unrecovered advance, 0 otherwise.
 */
export function getUnrecoveredAdvance(userAddress: string): number {
  const record = fundingLedger[userAddress];
  if (record && !record.recovered) {
    return record.trxAdvanced;
  }
  return 0;
}

/**
 * Mark a user's advance as recovered (called after the first successful transfer).
 */
export function markRecovered(userAddress: string): void {
  if (fundingLedger[userAddress]) {
    fundingLedger[userAddress].recovered = true;
    saveLedger();
  }
}

/**
 * Check if a user has already been funded (to prevent double-funding).
 */
export function hasBeenFunded(userAddress: string): boolean {
  return !!fundingLedger[userAddress];
}

/**
 * Get the full funding record for a user (for debugging/admin).
 */
export function getFundingRecord(userAddress: string): FundingRecord | null {
  return fundingLedger[userAddress] || null;
}
