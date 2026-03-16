import dotenv from 'dotenv';
import path from 'path';

// Load .env from server directory first, then fallback to project root
dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

export const config = {
  // Relayer wallet private key (holds TRX for gas)
  relayerPrivateKey: (process.env.RELAYER_PRIVATE_KEY || '').trim(),

  // TRON Nile Testnet
  nileRpcUrl: (process.env.NILE_RPC_URL || 'https://nile.trongrid.io').trim(),
  nileApiKey: (process.env.NILE_API_KEY || '').trim(),

  // Contract addresses
  usdtContract: (process.env.USDT_CONTRACT || 'TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf').trim(),
  gasStationContract: (process.env.GAS_STATION_CONTRACT || '').trim(),

  // Mock oracle price: 1 TRX = $X
  trxPriceUsd: parseFloat(process.env.TRX_PRICE_USD || '0.29'),

  // Server
  port: parseInt(process.env.PORT || '3000', 10),

  // Chain ID for Nile testnet
  chainId: parseInt(process.env.CHAIN_ID || '3448148188', 10),

  // USDT decimals (TRC20 USDT uses 6 decimals)
  usdtDecimals: 6,

  // Fee constants (in TRX)
  activeAccountFeeTRX: 13.5,
  newAccountFeeTRX: 27,

  // Markup percentage
  markupPercent: 15,
};

// Validate critical config
export function validateConfig(): void {
  if (!config.relayerPrivateKey) {
    console.warn('⚠️  RELAYER_PRIVATE_KEY is not set. Relayer cannot sign transactions.');
  }
  if (!config.gasStationContract) {
    console.warn('⚠️  GAS_STATION_CONTRACT is not set. Deploy the contract first.');
  }
}
