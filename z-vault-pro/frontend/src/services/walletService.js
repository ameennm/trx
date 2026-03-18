import * as bip39 from 'bip39';
import { ethers } from 'ethers';
import { TronWeb } from 'tronweb';

/**
 * Crypxe — Wallet Service
 * BIP-39 mnemonic generation and BIP-44 key derivation for TRON.
 */

// Get a working TronWeb constructor
function getTronWebUtils() {
  if (TronWeb && TronWeb.address) return TronWeb;
  if (typeof window !== 'undefined' && window.TronWeb) {
    return window.TronWeb?.TronWeb || window.TronWeb;
  }
  return null;
}

/**
 * Convert a private key to a TRON base58 T-address.
 */
function tronAddressFromKey(privateKey) {
  const tw = getTronWebUtils();
  if (tw && tw.address) {
    try {
      return tw.address.fromPrivateKey(privateKey);
    } catch (e) {
      console.warn('TronWeb.address.fromPrivateKey failed:', e);
    }
  }
  console.warn('TronWeb not available, cannot derive T-address');
  return '';
}

/**
 * Generate a new 12-word BIP-39 mnemonic.
 */
export function generateMnemonic() {
  return bip39.generateMnemonic(128);
}

/**
 * Validate a mnemonic phrase.
 */
export function validateMnemonic(mnemonic) {
  return bip39.validateMnemonic(mnemonic);
}

/**
 * Derive a TRON wallet from a mnemonic.
 * BIP-44 path: m/44'/195'/0'/0/0
 */
export function deriveWallets(mnemonic) {
  if (!bip39.validateMnemonic(mnemonic)) {
    throw new Error('Invalid mnemonic phrase');
  }

  const seed = bip39.mnemonicToSeedSync(mnemonic);
  const tronHDNode = ethers.HDNodeWallet.fromSeed(seed).derivePath("m/44'/195'/0'/0/0");
  const tronPrivateKey = tronHDNode.privateKey.slice(2); // strip 0x
  const tronAddress = tronAddressFromKey(tronPrivateKey);

  return {
    tron: {
      address: tronAddress,
      privateKey: tronPrivateKey,
    },
  };
}

/**
 * Derive wallet from a raw private key (import flow).
 */
export function walletsFromPrivateKey(privateKey) {
  const cleanKey = privateKey.trim().replace(/^0x/, '');
  if (!/^[0-9a-fA-F]{64}$/.test(cleanKey)) {
    throw new Error('Invalid private key format. Must be 64 hex characters.');
  }

  const tronAddress = tronAddressFromKey(cleanKey);

  return {
    tron: {
      address: tronAddress,
      privateKey: cleanKey,
    },
  };
}

/**
 * Sign a hash with raw ECDSA (no prefix) — matches Solidity ecrecover.
 */
export function signHash(privateKey, hash) {
  const wallet = new ethers.Wallet('0x' + privateKey);
  const hashBytes = hash.startsWith('0x') ? hash : '0x' + hash;
  const sig = wallet.signingKey.sign(hashBytes);
  let v = sig.v;
  if (v < 27) v += 27;
  return { v, r: sig.r, s: sig.s };
}
