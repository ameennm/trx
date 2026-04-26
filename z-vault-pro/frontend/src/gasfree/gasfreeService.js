/**
 * Z-Vault Pro — Internal Relayer Service
 *
 * Uses the custom ZVaultRelayer contract to:
 *  1. Generate the user's CREATE2 proxy address
 *  2. Assemble the TIP-712 signed transfer message (matching ZVaultRelayer.sol)
 *  3. Sign with TronWeb._signTypedData (100% client-side)
 *  4. Submit to our Cloudflare Worker backend for broadcasting
 */

import { TronWeb } from 'tronweb';
import { NETWORKS } from '../store/constants';

// ZVaultRelayer Contract ABI snippet for the view methods
const RELAYER_ABI = [
  {
    "inputs": [{"name": "owner", "type": "address"}],
    "name": "getWalletAddress",
    "outputs": [{"name": "", "type": "address"}],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [{"name": "", "type": "address"}],
    "name": "nonces",
    "outputs": [{"name": "", "type": "uint256"}],
    "stateMutability": "view",
    "type": "function"
  }
];

let tronWebInstances = {};

/** Initialize or re-initialize TronWeb for the given network */
function getTronWeb(network) {
  if (!tronWebInstances[network]) {
    tronWebInstances[network] = new TronWeb({ 
      fullHost: NETWORKS[network].rpcUrl,
      // Need a dummy key for some read operations
      privateKey: '01'.repeat(32) 
    });
  }
  return tronWebInstances[network];
}

/**
 * Generate the Relayer Proxy address for a user's TRON wallet.
 * This is the address the user should share for receiving gasless transfers.
 */
export async function getRelayerAddress(userAddress, network = 'nile') {
  const tronWeb = getTronWeb(network);
  const relayerContractAddress = NETWORKS[network].relayerContract;
  
  if (relayerContractAddress === 'TXYZ_YOUR_RELAYER_ADDRESS_HERE') {
    // Contract not deployed yet, return dummy
    return 'TXYZ_WAITING_FOR_CONTRACT_DEPLOYMENT';
  }

  try {
    const contract = await tronWeb.contract(RELAYER_ABI, relayerContractAddress);
    // TronWeb's call() method can sometimes return a hex address, make sure to convert it
    const proxyAddressHex = await contract.getWalletAddress(userAddress).call();
    return tronWeb.address.fromHex(proxyAddressHex);
  } catch (err) {
    console.error('Failed to fetch proxy address from contract', err);
    return 'TXYZ_ERROR_FETCHING_PROXY_ADDRESS';
  }
}

/**
 * Fetch the user's current Relayer nonce directly from the smart contract.
 * Nonce prevents replay attacks.
 */
export async function fetchNonce(userAddress, network = 'nile') {
  const tronWeb = getTronWeb(network);
  const relayerContractAddress = NETWORKS[network].relayerContract;

  if (relayerContractAddress === 'TXYZ_YOUR_RELAYER_ADDRESS_HERE') {
    return { address: userAddress, nonce: '0', activated: false };
  }

  try {
    const contract = await tronWeb.contract(RELAYER_ABI, relayerContractAddress);
    const nonce = await contract.nonces(userAddress).call();
    return { address: userAddress, nonce: nonce.toString(), activated: true };
  } catch (err) {
    console.error('Failed to fetch nonce from contract', err);
    return { address: userAddress, nonce: '0', activated: false };
  }
}

/**
 * Full Internal Relayer transfer flow:
 *  1. Fetch nonce
 *  2. Assemble TIP-712 message matching ZVaultRelayer.sol
 *  3. Sign with user's private key (browser-only, never sent to server)
 *  4. POST signature + message to our backend → TronWeb → TRON chain
 *
 * @param {Object} params
 * @param {string} params.userAddress   - Sender's TRON address
 * @param {string} params.privateKey    - Sender's private key (in-memory only)
 * @param {string} params.recipient     - Recipient TRON address
 * @param {string} params.amount        - USDT amount (e.g. "50.00")
 * @param {string} params.fee           - Dynamic platform fee
 * @param {string} params.activationFee - Dynamic activation fee
 * @param {string} params.network       - 'nile' | 'mainnet'
 */
export async function executeGasFreeTransfer({
  userAddress,
  privateKey,
  recipient,
  amount,
  fee = '1.00',
  activationFee = '0',
  network = 'nile',
  onProgress = () => {},
}) {
  const { usdtContract, apiBackend, chainId, relayerContract } = NETWORKS[network];

  // Pre-flight: Catch undeployed mainnet relayer early with a clear error
  if (relayerContract.includes('NOT_DEPLOYED') || relayerContract.includes('TXYZ_')) {
    throw new Error(
      `The Z-Vault Relayer contract has not been deployed on ${network === 'mainnet' ? 'Mainnet' : 'this network'} yet. ` +
      `Please switch to Nile Testnet in Settings, or wait for the Mainnet launch.`
    );
  }

  // Step 1: Get nonce (from our backend which proxies to the contract)
  onProgress('nonce');
  const account = await fetchNonce(userAddress, network);
  const nonce = account.nonce || '0';

  // Step 2: Convert USDT amount to 6-decimal base units
  const valueUnits = String(Math.floor(parseFloat(amount) * 1_000_000));
  const totalFeeFloat = parseFloat(fee) + parseFloat(activationFee);
  const feeUnits = String(Math.floor(totalFeeFloat * 1_000_000));

  // Step 3: Deadline — 15 minutes from now
  const deadline = String(Math.floor(Date.now() / 1000) + 900);

  // Step 4: Assemble TIP-712 structured message
  onProgress('assemble');
  
  const domain = {
    name: "Z-Vault Pro",
    version: "1",
    chainId: chainId,
    verifyingContract: relayerContract
  };

  const types = {
    Transfer: [
      { name: 'token', type: 'address' },
      { name: 'receiver', type: 'address' },
      { name: 'value', type: 'uint256' },
      { name: 'fee', type: 'uint256' },
      { name: 'nonce', type: 'uint256' },
      { name: 'deadline', type: 'uint256' }
    ]
  };

  const message = {
    token: usdtContract,
    receiver: recipient,
    value: valueUnits,
    fee: feeUnits,
    nonce: nonce,
    deadline: deadline
  };

  // Step 5: Sign the TIP-712 message CLIENT-SIDE (private key never leaves browser)
  onProgress('sign');
  // Use a temporary TronWeb instance for signing
  const pk = privateKey.startsWith('0x') ? privateKey.slice(2) : privateKey;
  const tronWeb = new TronWeb({ fullHost: NETWORKS[network].rpcUrl, privateKey: pk });
  const signingAddress = TronWeb.address.fromPrivateKey(pk);
  if (signingAddress !== userAddress) {
    throw new Error(
      `Wallet mismatch: this session is showing ${userAddress}, but the private key signs as ` +
      `${signingAddress}. Lock/unlock or re-import the correct wallet before sending.`
    );
  }
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
        receiver: message.receiver,
        value: message.value,
        maxFee: message.fee, // Backend expects 'maxFee', passing it here for compatibility
        deadline: message.deadline,
        nonce: message.nonce,
        // Include user for backend compatibility
        user: userAddress
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
  // The relay endpoint does the blacklist check
  return true;
}

/**
 * Fetch dynamic fee configuration from the backend health endpoint.
 */
export async function fetchTokenConfig(network = 'nile') {
  const { apiBackend } = NETWORKS[network];
  try {
    const res = await fetch(`${apiBackend}/api/health`);
    const data = await res.json();
    return data.fees ? data.fees : null;
  } catch (e) {
    console.error("Failed to fetch config", e);
    return null;
  }
}
