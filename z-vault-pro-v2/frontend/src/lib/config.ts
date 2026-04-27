export const appConfig = {
  backendUrl: import.meta.env.VITE_BACKEND_URL || 'http://localhost:8787/api',
  topUpBandwidthWarning: 'Fund the gasless Vault address with USDT first. Sends happen from the Vault, and the backend relayer pays the TRON network cost.'
};
