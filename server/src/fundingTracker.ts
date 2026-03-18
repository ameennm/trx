/**
 * Funding Tracker for Local Express Server.
 * 
 * Tracks TRX sent to users for approval gas.
 * The relayer sends 5 TRX so the user can approve the GasStation contract.
 * This is recovered from their first USDT transfer fee.
 * 
 * Persistent via local JSON file.
 */
import * as fs from 'fs';
import * as path from 'path';

interface FundingRecord {
  trxAdvanced: number;
  fundedAt: number;
  txHash: string;
  recovered: boolean;
}

const LEDGER_FILE = path.join(process.cwd(), 'funding_ledger.json');

let fundingLedger: Record<string, FundingRecord> = {};

// Load existing ledger
if (fs.existsSync(LEDGER_FILE)) {
  try {
    fundingLedger = JSON.parse(fs.readFileSync(LEDGER_FILE, 'utf8'));
  } catch (e) {
    console.error('Failed to load funding ledger:', e);
  }
}

function saveLedger() {
  fs.writeFileSync(LEDGER_FILE, JSON.stringify(fundingLedger, null, 2));
}

export function recordFunding(userAddress: string, trxAmount: number, txHash: string): void {
  fundingLedger[userAddress] = {
    trxAdvanced: trxAmount,
    fundedAt: Date.now(),
    txHash,
    recovered: false,
  };
  saveLedger();
}

export function getUnrecoveredAdvance(userAddress: string): number {
  const record = fundingLedger[userAddress];
  if (!record || record.recovered) return 0;
  return record.trxAdvanced;
}

export function markRecovered(userAddress: string): void {
  const record = fundingLedger[userAddress];
  if (record) {
    record.recovered = true;
    saveLedger();
  }
}

export function hasBeenFunded(userAddress: string): boolean {
  const record = fundingLedger[userAddress];
  return !!(record && record.trxAdvanced > 0);
}
