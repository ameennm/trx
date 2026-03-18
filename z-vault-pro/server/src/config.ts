import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const mode = (process.env.NETWORK_MODE || 'testnet').toLowerCase();
const isMainnet = mode === 'mainnet';

export const config = {
  mode,
  // Relayer wallet private key (holds TRX for gas)
  relayerPrivateKey: (process.env.RELAYER_PRIVATE_KEY || '').trim(),

  // RPC URLs
  rpcUrl: isMainnet 
    ? 'https://api.trongrid.io' 
    : (process.env.NILE_RPC_URL || 'https://nile.trongrid.io').trim(),

  // Contract addresses
  usdtContract: isMainnet
    ? 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t' // Real USDT on Mainnet
    : (process.env.USDT_CONTRACT || 'TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf').trim(),

  gasStationContract: (process.env.GAS_STATION_CONTRACT || '').trim(),

  // Pricing
  trxPriceUsd: parseFloat(process.env.TRX_PRICE_USD || '0.29'),

  // Server
  port: parseInt(process.env.PORT || '3000', 10),

  // Chain ID
  chainId: isMainnet ? 1 : parseInt(process.env.CHAIN_ID || '3448148188', 10),

  usdtDecimals: 6,
  activeAccountFeeTRX: 13.5,
  newAccountFeeTRX: 27,
  markupPercent: parseFloat(process.env.MARKUP_PERCENT || '15'),
};

export function validateConfig(): void {
  if (!config.relayerPrivateKey) {
    console.warn('⚠️  RELAYER_PRIVATE_KEY is not set. Relayer cannot sign transactions.');
  }
  if (!config.gasStationContract) {
    console.warn('⚠️  GAS_STATION_CONTRACT is not set. Deploy the contract first.');
  }
}

export function updateConfig(env: any): void {
  if (env.NETWORK_MODE) {
    config.mode = env.NETWORK_MODE.toLowerCase();
    const isMainnet = config.mode === 'mainnet';
    config.rpcUrl = isMainnet ? 'https://api.trongrid.io' : (env.NILE_RPC_URL || 'https://nile.trongrid.io').trim();
    config.usdtContract = isMainnet ? 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t' : (env.USDT_CONTRACT || 'TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf').trim();
    config.chainId = isMainnet ? 1 : parseInt(env.CHAIN_ID || '3448148188', 10);
  }
  if (env.RELAYER_PRIVATE_KEY) config.relayerPrivateKey = env.RELAYER_PRIVATE_KEY.trim();
  if (env.GAS_STATION_CONTRACT) config.gasStationContract = env.GAS_STATION_CONTRACT.trim();
  if (env.TRX_PRICE_USD) config.trxPriceUsd = parseFloat(env.TRX_PRICE_USD);
  if (env.MARKUP_PERCENT) config.markupPercent = parseFloat(env.MARKUP_PERCENT);
}
