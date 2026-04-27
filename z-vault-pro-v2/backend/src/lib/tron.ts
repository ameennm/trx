import { TronWeb } from 'tronweb';
import { appConfig } from '../config.js';
export { computeTronVaultAddress } from './tronAddress.js';

export const tronWeb = new TronWeb({
  fullHost: appConfig.TRONGRID_RPC_URL,
  privateKey: appConfig.RELAYER_PRIVATE_KEY,
  headers: appConfig.TRONGRID_API_KEY ? {
    'TRON-PRO-API-KEY': appConfig.TRONGRID_API_KEY
  } : undefined
});

export const relayerAbi = [
  {
    inputs: [],
    name: 'authorizedRelayer',
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [],
    name: 'walletImplementation',
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [],
    name: 'allowedToken',
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [],
    name: 'maxFee',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [{ name: 'owner', type: 'address' }],
    name: 'getWalletAddress',
    outputs: [{ name: 'predicted', type: 'address' }],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [{ name: '', type: 'address' }],
    name: 'nonces',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function'
  }
] as const;

export function normalizeTronAddress(value: any): string {
  if (typeof value !== 'string') {
    if (value && typeof value.toString === 'function') {
      value = value.toString();
    } else {
      return '';
    }
  }
  if (value.startsWith('T')) {
    return value;
  }
  const clean = value.replace(/^0x/, '');
  return TronWeb.address.fromHex(clean.startsWith('41') ? clean : `41${clean}`);
}

export function deriveRelayerAddress(): string {
  const address = TronWeb.address.fromPrivateKey(appConfig.RELAYER_PRIVATE_KEY.replace(/^0x/, ''));
  if (!address) {
    throw new Error('Unable to derive relayer address from RELAYER_PRIVATE_KEY');
  }
  return address;
}
