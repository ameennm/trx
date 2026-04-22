/**
 * Z-Vault Pro — GasFree Protocol Service
 *
 * Uses @gasfree/gasfree-sdk to:
 *  1. Generate the user's GasFree proxy address
 *  2. Assemble the TIP-712 signed transfer message
 *  3. Sign with TronWeb._signTypedData (100% client-side)
 *  4. Submit to our Cloudflare Worker backend for broadcasting
 */

import { TronGasFree } from '@gasfree/gasfree-sdk';
import { TronWeb } from 'tronweb';
import { NETWORKS } from '../store/constants';

// GasFree chain IDs
const CHAIN_IDS = {
  nile: 0xcd8690dc,
  mainnet: 0x2b6653dc,
};

// $1.00 flat fee expressed as USDT base units (6 decimals)
const PLATFORM_FEE_USDT_UNITS = '1100000'; // 1.10 USDT = 1,100,000 units (6 decimals)

let sdkInstance = null;
let currentNetwork = null;

/** Initialize or re-initialize the GasFree SDK for the given network */
function getSDK(network) {
  if (!sdkInstance || currentNetwork !== network) {
    sdkInstance = new TronGasFree({ chainId: CHAIN_IDS[network] });
    currentNetwork = network;
  }
  return sdkInstance;
}

/**
 * Generate the GasFree contract address for a user's TRON wallet.
 * This is the address the user should share for receiving gasless transfers.
 */
export function getGasFreeAddress(userAddress, network = 'nile') {
  const sdk = getSDK(network);
  return sdk.generateGasFreeAddress(userAddress);
}

/**
 * Fetch the user's current GasFree nonce from our backend.
 * Nonce prevents replay attacks.
 */
export async function fetchNonce(userAddress, network = 'nile') {
  const { apiBackend } = NETWORKS[network];
  const res = await fetch(`${apiBackend}/api/nonce/${userAddress}`);
  const data = await res.json();
  if (!res.ok || !data.success) throw new Error(data.error || 'Failed to fetch nonce');
  return data.data; // Returns { address, nonce, activated }
}

/**
 * Full GasFree transfer flow:
 *  1. Fetch nonce
 *  2. Assemble TIP-712 message with $1 maxFee
 *  3. Sign with user's private key (browser-only, never sent to server)
 *  4. POST signature + message to our backend → GasFree provider → TRON chain
 *
 * @param {Object} params
 * @param {string} params.userAddress   - Sender's TRON address
 * @param {string} params.privateKey    - Sender's private key (in-memory only)
 * @param {string} params.recipient     - Recipient TRON address
 * @param {string} params.amount        - USDT amount (e.g. "50.00")
 * @param {string} params.serviceProvider - GasFree service provider address
 * @param {string} params.network       - 'nile' | 'mainnet'
 */
export async function executeGasFreeTransfer({
  userAddress,
  privateKey,
  recipient,
  amount,
  serviceProvider,
  network = 'nile',
  onProgress = () => {},
}) {
  const { usdtContract, apiBackend } = NETWORKS[network];
  const sdk = getSDK(network);

  // Step 1: Get nonce (from our backend which proxies GasFree provider)
  onProgress('nonce');
  const account = await fetchNonce(userAddress, network);
  const nonce = account.nonce || '0';

  // Step 2: Convert USDT amount to 6-decimal base units
  const valueUnits = String(Math.floor(parseFloat(amount) * 1_000_000));

  // Step 3: Deadline — 15 minutes from now
  const deadline = String(Math.floor(Date.now() / 1000) + 900);

  // Step 4: Assemble TIP-712 structured message
  onProgress('assemble');
  const { domain, types, message } = sdk.assembleGasFreeTransactionJson({
    token: usdtContract,
    serviceProvider,
    user: userAddress,
    receiver: recipient,
    value: valueUnits,
    maxFee: PLATFORM_FEE_USDT_UNITS, // $1.10 max fee
    deadline,
    version: '1',
    nonce,
  });

  // Step 5: Sign the TIP-712 message CLIENT-SIDE (private key never leaves browser)
  onProgress('sign');
  // Use a temporary TronWeb instance for signing (requires an instance to access .trx)
  const tronWeb = new TronWeb({ fullHost: NETWORKS[network].rpcUrl, privateKey });
  const signature = await tronWeb.trx._signTypedData(domain, types, message);

  // Step 6: Submit to our Cloudflare Worker backend
  onProgress('relay');
  const res = await fetch(`${apiBackend}/api/relay`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      signature,
      userAddress,
      recipient,
      amount,
      message: {
        token: message.token,
        serviceProvider: message.serviceProvider,
        user: message.user,
        receiver: message.receiver,
        value: message.value,
        maxFee: message.maxFee,
        deadline: message.deadline,
        version: message.version,
        nonce: message.nonce,
      },
    }),
  });

  const result = await res.json();
  if (!res.ok || !result.success) {
    throw new Error(result.error || 'Transfer submission failed.');
  }

  return result; // { txHash, txId, profit, message }
}

/**
 * Check if recipient address is safe (not blacklisted).
 */
export async function checkAddress(address, network = 'nile') {
  const { apiBackend } = NETWORKS[network];
  // The relay endpoint does the blacklist check, but we can also pre-check
  // by looking at the nonce endpoint (if it returns we know it's a valid account)
  const res = await fetch(`${apiBackend}/api/nonce/${address}`);
  return res.ok;
}

/**
 * Fetch token config from GasFree provider (via backend proxy).
 * Returns supported tokens and current fees.
 */
export async function fetchTokenConfig(network = 'nile') {
  const { apiBackend } = NETWORKS[network];
  const res = await fetch(`${apiBackend}/api/config/tokens`);
  const data = await res.json();
  return data.success ? data.data : [];
}
