import { config } from './config';
import { getNetworkFeeTRX } from './accountCheck';
import { getUnrecoveredAdvance } from './fundingTracker';

/**
 * Fee breakdown returned by the slab calculator.
 */
export interface FeeBreakdown {
  sendAmount: number;
  recipientIsActive: boolean;
  networkFeeTRX: number;
  networkFeeUSDT: number;
  markupUSDT: number;
  recoveryFeeTRX: number;
  recoveryFeeUSDT: number;
  totalFeeUSDT: number;
  totalDeduction: number;
  trxPriceUsed: number;
}

export async function calculateTotalDeduction(
  sendAmount: number,
  recipientAddress: string,
  senderAddress?: string
): Promise<FeeBreakdown> {
  const { isActive, feeTRX } = await getNetworkFeeTRX(recipientAddress);
  const networkFeeUSDT = feeTRX * config.trxPriceUsd;
  const markupUSDT = networkFeeUSDT * (config.markupPercent / 100);

  let recoveryFeeTRX = 0;
  let recoveryFeeUSDT = 0;
  if (senderAddress) {
    recoveryFeeTRX = getUnrecoveredAdvance(senderAddress);
    if (recoveryFeeTRX > 0) {
      recoveryFeeUSDT = recoveryFeeTRX * config.trxPriceUsd * (1 + config.markupPercent / 100);
    }
  }

  const totalFeeUSDT = networkFeeUSDT + markupUSDT + recoveryFeeUSDT;
  const totalDeduction = sendAmount + totalFeeUSDT;

  return {
    sendAmount,
    recipientIsActive: isActive,
    networkFeeTRX: feeTRX,
    networkFeeUSDT: roundTo6(networkFeeUSDT),
    markupUSDT: roundTo6(markupUSDT),
    recoveryFeeTRX: roundTo6(recoveryFeeTRX),
    recoveryFeeUSDT: roundTo6(recoveryFeeUSDT),
    totalFeeUSDT: roundTo6(totalFeeUSDT),
    totalDeduction: roundTo6(totalDeduction),
    trxPriceUsed: config.trxPriceUsd,
  };
}

export function usdtToSun(amount: number): bigint {
  return BigInt(Math.round(amount * 10 ** config.usdtDecimals));
}

export function sunToUsdt(sun: bigint): number {
  return Number(sun) / 10 ** config.usdtDecimals;
}

function roundTo6(n: number): number {
  return Math.round(n * 1e6) / 1e6;
}
