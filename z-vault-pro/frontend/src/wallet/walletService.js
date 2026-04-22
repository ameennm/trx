/**
 * Z-Vault Pro — Enhanced Wallet Service
 * HD wallet generation, derivation, balance fetching, and history.
 */

import * as bip39 from 'bip39';
import { TronWeb } from 'tronweb';
import { Buffer } from 'buffer';
import { NETWORKS } from '../store/constants';

// Make Buffer available globally (needed by bip39/tronweb in browser)
window.Buffer = Buffer;

const TRON_PATH = "m/44'/195'/0'/0/0";

/** Create a new 12-word BIP-39 mnemonic */
export function generateMnemonic() {
  return bip39.generateMnemonic();
}

/** Validate a 12-word mnemonic */
export function validateMnemonic(mnemonic) {
  return bip39.validateMnemonic(mnemonic.trim());
}

/** Derive TRON address + private key from mnemonic */
export async function deriveTronWallet(mnemonic) {
  const trimmed = mnemonic.trim();
  if (!validateMnemonic(trimmed)) throw new Error('Invalid mnemonic phrase.');

  const tw = new TronWeb({ fullHost: 'https://api.trongrid.io', privateKey: '01'.repeat(32) });
  const account = tw.fromMnemonic(trimmed, TRON_PATH);

  return {
    address: account.address,
    privateKey: account.privateKey,
  };
}

/** Derive TRON address from a direct Private Key */
export async function deriveTronWalletFromKey(privateKey) {
  const key = privateKey.trim();
  if (key.startsWith('0x')) privateKey = key.slice(2);
  
  if (key.length !== 64 && !/^[0-9a-fA-F]{64}$/.test(key)) {
    throw new Error('Invalid Private Key. Must be 64-character hex string.');
  }

  const tw = new TronWeb({ fullHost: 'https://api.trongrid.io', privateKey: key });
  const address = tw.address.fromPrivateKey(key);

  return {
    address,
    privateKey: key
  };
}

/** Get TronWeb instance for the active network */
function getTronWeb(network, privateKey = '01'.repeat(32)) {
  const cfg = NETWORKS[network];
  return new TronWeb({ fullHost: cfg.rpcUrl, privateKey });
}

/** Fetch TRX and USDT balances for an address */
export async function getBalances(address, network = 'mainnet') {
  const { usdtContract } = NETWORKS[network];
  const tronWeb = getTronWeb(network);

  try {
    // TRX balance
    const trxSun = await tronWeb.trx.getBalance(address);
    const trx = (trxSun / 1_000_000).toFixed(4);

    // USDT balance via TRC-20 contract
    const contract = await tronWeb.contract().at(usdtContract);
    const usdtRaw = await contract.balanceOf(address).call();
    const usdt = (Number(usdtRaw) / 1_000_000).toFixed(2);

    return { trx, usdt };
  } catch (err) {
    console.warn('[WalletService] getBalances error:', err.message);
    return { trx: '0.0000', usdt: '0.00' };
  }
}

/** Fetch on-chain transaction history via TronGrid API */
export async function getOnChainHistory(address, network = 'mainnet') {
  const base = network === 'mainnet'
    ? 'https://api.trongrid.io'
    : 'https://nile.trongrid.io';

  try {
    const res = await fetch(
      `${base}/v1/accounts/${address}/transactions/trc20?limit=20&contract_address=${NETWORKS[network].usdtContract}`,
    );
    if (!res.ok) return [];
    const { data } = await res.json();
    return (data || []).map((tx) => ({
      id: tx.transaction_id,
      from: tx.from,
      to: tx.to,
      amount: (Number(tx.value) / 1_000_000).toFixed(2),
      timestamp: tx.block_timestamp,
      type: tx.from === address ? 'send' : 'receive',
      source: 'chain',
    }));
  } catch {
    return [];
  }
}
