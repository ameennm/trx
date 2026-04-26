/**
 * Z-Vault Pro — Cloudflare Worker Type Bindings
 * Auto-generated via: wrangler types src/worker-types.d.ts
 */

export interface Env {
  // D1 Database
  DB: D1Database;

  // Cloudflare vars (wrangler.toml [vars])
  NETWORK_MODE: 'testnet' | 'mainnet';
  
  // Contracts
  USDT_CONTRACT_TESTNET: string;
  USDT_CONTRACT_MAINNET: string;
  RELAYER_CONTRACT_TESTNET: string;
  RELAYER_CONTRACT_MAINNET: string;

  // Pricing Slabs ($1 under $5K, $2 at/above $5K, $2 activation)
  FEE_THRESHOLD_USDT: string;
  FEE_TIER_1_USDT: string;
  FEE_TIER_2_USDT: string;
  ACTIVATION_FEE_USDT: string;
  GASFREE_BASE_FEE: string;

  // Netts.io Energy Aggregator API
  NETTS_API_URL: string;
  NETTS_API_KEY?: string; // Secret — set via Cloudflare Dashboard

  // Feee.io API (Fallback)
  FEEE_API_URL: string;
  FEEE_API_KEY?: string; // Secret

  // Relayer & Treasury — set via Cloudflare Dashboard Secrets
  RELAYER_PRIVATE_KEY: string;
  TREASURY_ADDRESS: string;
  SURPLUS_ADDRESS: string;
  
  // Economic & Technical Config
  OPERATOR_MARKUP: string;
  MAINNET_RPC_URL: string;
  USDT_CONTRACT: string;
  PLATFORM_FEE_USDT: string;
  RELAYER_ADDRESS: string;
  // VPS Proxy for energy rental (Netts.io)
  VPS_PROXY_URL: string;       // e.g. https://api.zvault.yourdomain.com/rent
  VPS_SHARED_SECRET: string;   // Shared secret to authenticate Worker → VPS requests

  // GasFree.io Legacy — kept for gasfreeProxy.ts reference (not used in active routes)
  GASFREE_API_KEY?: string;
  GASFREE_API_SECRET?: string;
  GASFREE_PROVIDER_URL_MAINNET?: string;
  GASFREE_PROVIDER_URL_TESTNET?: string;

  // TronGrid API Key for mainnet RPC access
  TRONGRID_API_KEY?: string;

  // Misc
  PORT: string;
}
