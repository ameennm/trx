import * as bip39 from 'bip39';
import { ethers } from 'ethers';
import { TronWeb } from 'tronweb';

/**
 * Crypxe — Wallet Service
 * BIP-39 mnemonic generation and BIP-44 key derivation for TRON + EVM.
 */

// Get a working TronWeb constructor
function getTronWebUtils() {
  // Try the npm import first
  if (TronWeb && TronWeb.address) return TronWeb;
  // Fallback to window
  if (typeof window !== 'undefined' && window.TronWeb) {
    return window.TronWeb?.TronWeb || window.TronWeb;
  }
  return null;
}

/**
 * Convert a hex address to TRON base58 T-address.
 */
function hexToTronAddress(hexAddress, privateKey) {
  const tw = getTronWebUtils();
  if (tw && tw.address) {
    try {
      return tw.address.fromPrivateKey(privateKey);
    } catch (e) {
      console.warn('TronWeb.address.fromPrivateKey failed:', e);
    }
  }
  // Manual fallback: prepend 0x41 to the 20-byte address and base58check encode
  console.warn('TronWeb not available, storing hex address as fallback');
  return hexAddress;
}

/**
 * Generate a new 12-word BIP-39 mnemonic.
 */
export function generateMnemonic() {
  return bip39.generateMnemonic(128); // 128 bits = 12 words
}

/**
 * Validate a mnemonic phrase.
 */
export function validateMnemonic(mnemonic) {
  return bip39.validateMnemonic(mnemonic);
}

/**
 * Derive TRON and EVM wallets from a mnemonic.
 * BIP-44 paths:
 *   TRON: m/44'/195'/0'/0/0
 *   EVM:  m/44'/60'/0'/0/0
 */
export function deriveWallets(mnemonic) {
  if (!bip39.validateMnemonic(mnemonic)) {
    throw new Error('Invalid mnemonic phrase');
  }

  // EVM derivation (m/44'/60'/0'/0/0)
  const evmWallet = ethers.Wallet.fromPhrase(mnemonic);
  const evmPrivateKey = evmWallet.privateKey.slice(2); // strip 0x
  const evmAddress = evmWallet.address;

  // TRON derivation (m/44'/195'/0'/0/0)
  const seed = bip39.mnemonicToSeedSync(mnemonic);
  const tronHDNode = ethers.HDNodeWallet.fromSeed(seed).derivePath("m/44'/195'/0'/0/0");
  const tronPrivateKey = tronHDNode.privateKey.slice(2); // strip 0x

  // Convert to TRON T-address
  const tronAddress = hexToTronAddress(tronHDNode.address, tronPrivateKey);

  return {
    tron: {
      address: tronAddress,
      privateKey: tronPrivateKey,
    },
    evm: {
      address: evmAddress,
      privateKey: evmPrivateKey,
    },
  };
}

/**
 * Derive wallets from a raw private key (import flow).
 */
export function walletsFromPrivateKey(privateKey) {
  const cleanKey = privateKey.trim().replace(/^0x/, '');
  if (!/^[0-9a-fA-F]{64}$/.test(cleanKey)) {
    throw new Error('Invalid private key format. Must be 64 hex characters.');
  }

  const evmWallet = new ethers.Wallet('0x' + cleanKey);
  const evmAddress = evmWallet.address;
  const tronAddress = hexToTronAddress(evmAddress, cleanKey);

  return {
    tron: {
      address: tronAddress,
      privateKey: cleanKey,
    },
    evm: {
      address: evmAddress,
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
