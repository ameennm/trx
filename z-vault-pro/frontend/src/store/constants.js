/**
 * Z-Vault Pro — Global Constants
 */

export const NETWORKS = {
  nile: {
    label: 'Nile Testnet',
    chainId: 0xcd8690dc,
    rpcUrl: 'https://nile.trongrid.io',
    usdtContract: 'TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf',
    relayerContract: 'TZ2KnAvkher2xBdWk5j6SQvH9Amyoz1pz5', // ✅ Deployed on Nile
    apiBackend: 'https://z-vault-pro-api.ameennm71.workers.dev',
  },
  mainnet: {
    label: 'TRON Mainnet',
    chainId: 0x2b6653dc,
    rpcUrl: 'https://api.trongrid.io',
    usdtContract: 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t',
    // ⚠️ TODO: Deploy ZVaultRelayer.sol to Mainnet, then replace this address.
    // Run: NETWORK=mainnet node scratch/deploy_contract.js
    // Until then, mainnet relay calls will fail — this is intentional.
    relayerContract: 'TZ2KnAvkher2xBdWk5j6SQvH9Amyoz1pz5',
    apiBackend: 'https://z-vault-pro-api.ameennm71.workers.dev',
  },
};
export const ADMIN_WHITELIST = [
  'TJBpgUDZEhyJ3GmgAM8DUdFoPCxfWZPuaX', // Testing account
  'TBjkHJyKRN2YhxCeeNM7A8QVgK7hG8ubkv', // Legacy treasury account
  'TYbhLzARFg6HnV3FBFiA68etPwKXtLisVZ', // Active treasury account
  'TMju4dk4gfs2nyiocnaJjTdQTHK1EYH89N', // Your current original account
];
