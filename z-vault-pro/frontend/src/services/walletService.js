import * as bip39 from 'bip39';
import { ethers } from 'ethers';

/**
 * Crypxe — Wallet Service
 * BIP-39 mnemonic generation and BIP-44 key derivation for TRON + EVM.
 */

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

  // Convert EVM-style address to TRON T-address
  let tronAddress = '';
  if (typeof window !== 'undefined' && window.TronWeb) {
    const TronWebConstructor = window.TronWeb?.TronWeb || window.TronWeb;
    tronAddress = TronWebConstructor.address.fromPrivateKey(tronPrivateKey);
  } else {
    // Fallback: just store the hex address; TronWeb will be loaded later
    tronAddress = tronHDNode.address;
  }

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

  let tronAddress = '';
  if (typeof window !== 'undefined' && window.TronWeb) {
    const TronWebConstructor = window.TronWeb?.TronWeb || window.TronWeb;
    tronAddress = TronWebConstructor.address.fromPrivateKey(cleanKey);
  }

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
