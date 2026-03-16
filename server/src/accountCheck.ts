import { TronWeb } from 'tronweb';
import { config } from './config';

/**
 * Check if a TRON address is "active" (already exists on-chain).
 * - Active accounts cost ~13.5 TRX to send to (just energy for TRC20 transfer)
 * - New/inactive accounts cost ~27 TRX (account activation + energy)
 */
export async function isActiveAccount(address: string): Promise<boolean> {
  try {
    const tronWeb = new TronWeb({
      fullHost: config.nileRpcUrl,
    });

    // getAccount returns account info if it exists, throws or returns empty if not
    const account = await tronWeb.trx.getAccount(address);

    // If account has an address field, it's active
    return !!(account && (account as any).address);
  } catch (error) {
    // If the API errors, the account likely doesn't exist
    return false;
  }
}

/**
 * Get the base network fee in TRX based on recipient account status.
 */
export async function getNetworkFeeTRX(recipientAddress: string): Promise<{
  isActive: boolean;
  feeTRX: number;
}> {
  const isActive = await isActiveAccount(recipientAddress);

  return {
    isActive,
    feeTRX: isActive ? config.activeAccountFeeTRX : config.newAccountFeeTRX,
  };
}
