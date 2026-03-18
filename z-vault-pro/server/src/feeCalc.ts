import { config } from './config';
import { getNetworkFeeTRX } from './accountCheck';

/**
 * Fee breakdown returned by the slab calculator.
 */
export interface FeeBreakdown {
  /** Amount the recipient will receive (USDT) */
  sendAmount: number;
  /** Whether the recipient address is already active */
  recipientIsActive: boolean;
  /** Base network fee in TRX */
  networkFeeTRX: number;
  /** Base network fee converted to USDT */
  networkFeeUSDT: number;
  /** 15% markup on the network fee (USDT) */
  markupUSDT: number;
  /** Total fee charged to user (network + markup, in USDT) */
  totalFeeUSDT: number;
  /** Total deduction from user's balance (sendAmount + totalFee, in USDT) */
  totalDeduction: number;
  /** TRX/USD price used for calculation */
  trxPriceUsed: number;
}

/**
 * Calculate the total USDT deduction for a gasless transfer.
 *
 * Slab System:
 * ┌─────────────────────┬───────────┬──────────────────┬────────────────┐
 * │ Recipient Type      │ Base TRX  │ USDT (@ $0.29)   │ + 15% Markup   │
 * ├─────────────────────┼───────────┼──────────────────┼────────────────┤
 * │ Active account      │ 13.5 TRX  │ ~3.915 USDT      │ ~4.50 USDT     │
 * │ New account         │ 27.0 TRX  │ ~7.830 USDT      │ ~9.00 USDT     │
 * └─────────────────────┴───────────┴──────────────────┴────────────────┘
 *
 * @param sendAmount       The amount the user wants the recipient to receive
 * @param recipientAddress The recipient's TRON address
 */
export async function calculateTotalDeduction(
  sendAmount: number,
  recipientAddress: string
): Promise<FeeBreakdown> {
  // Step 1: Determine if recipient is active or new
  const { isActive, feeTRX } = await getNetworkFeeTRX(recipientAddress);

  // Step 2: Convert TRX fee to USDT using mock oracle
  const networkFeeUSDT = feeTRX * config.trxPriceUsd;

  // Step 3: Apply 15% markup
  const markupUSDT = networkFeeUSDT * (config.markupPercent / 100);

  // Step 4: Total fee
  const totalFeeUSDT = networkFeeUSDT + markupUSDT;

  // Step 5: Total deduction from user's balance
  const totalDeduction = sendAmount + totalFeeUSDT;

  return {
    sendAmount,
    recipientIsActive: isActive,
    networkFeeTRX: feeTRX,
    networkFeeUSDT: roundTo6(networkFeeUSDT),
    markupUSDT: roundTo6(markupUSDT),
    totalFeeUSDT: roundTo6(totalFeeUSDT),
    totalDeduction: roundTo6(totalDeduction),
    trxPriceUsed: config.trxPriceUsd,
  };
}

/**
 * Convert a USDT amount (human-readable, e.g. 4.50) to sun units (smallest unit).
 * TRC20 USDT uses 6 decimals → 1 USDT = 1,000,000 sun.
 */
export function usdtToSun(amount: number): bigint {
  return BigInt(Math.round(amount * 10 ** config.usdtDecimals));
}

/**
 * Convert sun units back to human-readable USDT.
 */
export function sunToUsdt(sun: bigint): number {
  return Number(sun) / 10 ** config.usdtDecimals;
}

/**
 * Round to 6 decimal places (USDT precision).
 */
function roundTo6(n: number): number {
  return Math.round(n * 1e6) / 1e6;
}
