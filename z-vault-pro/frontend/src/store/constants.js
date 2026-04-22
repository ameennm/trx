/**
 * Z-Vault Pro — Global Constants
 */

export const NETWORKS = {
  nile: {
    label: 'Nile Testnet',
    chainId: 0xcd8690dc,
    rpcUrl: 'https://nile.trongrid.io',
    usdtContract: 'TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf',
    apiBackend: 'https://z-vault-pro-api.ameennm71.workers.dev',
  },
  mainnet: {
    label: 'TRON Mainnet',
    chainId: 0x2b6653dc,
    rpcUrl: 'https://api.trongrid.io',
    usdtContract: 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t',
    apiBackend: 'https://z-vault-pro-api.ameennm71.workers.dev',
  },
};
export const ADMIN_WHITELIST = [
  'TJBpgUDZEhyJ3GmgAM8DUdFoPCxfWZPuaX', // Your testing account
  'TBjkHJyKRN2YhxCeeNM7A8QVgK7hG8ubkv', // Your treasury account
];
