/**
 * Z-Vault Pro — Cloudflare Worker Type Bindings
 * Auto-generated via: wrangler types src/worker-types.d.ts
 */

export interface Env {
  // D1 Database
  DB: D1Database;

  // Cloudflare vars (wrangler.toml [vars])
  NETWORK_MODE: 'testnet' | 'mainnet';
  GASFREE_PROVIDER_URL_TESTNET: string;
  GASFREE_PROVIDER_URL_MAINNET: string;
  USDT_CONTRACT_TESTNET: string;
  USDT_CONTRACT_MAINNET: string;
  PLATFORM_FEE_USDT: string;

  // GasFree Keys
  GASFREE_API_KEY: string;
  GASFREE_API_SECRET: string;
  GASFREE_API_KEY_NILE: string;
  GASFREE_API_SECRET_NILE: string;
  GASFREE_API_KEY_MAINNET: string;
  GASFREE_API_SECRET_MAINNET: string;

  // Relayer & Treasury
  RELAYER_PRIVATE_KEY: string;
  TREASURY_ADDRESS: string;
  SURPLUS_ADDRESS: string;
  
  // Economic & Technical Config
  GASFREE_BASE_FEE: string;
  OPERATOR_MARKUP: string;
  MAINNET_RPC_URL: string;
  USDT_CONTRACT: string;
  PORT: string;
}
