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

/**
 * Approve the GasStation contract to spend USDT.
 */
export async function approveContract(privateKey, gasStationAddress, usdtAddress) {
  const tw = getTronWebUtils();
  if (!tw) throw new Error('TronWeb not available');

  const tronWeb = new tw({
    fullHost: 'https://nile.trongrid.io', // Default to nile for this version
    privateKey: privateKey.trim().replace(/^0x/, ''),
  });

  const MAX_UINT = '115792089237316195423570985008687907853269984665640564039457584007913129639935';
  const contract = await tronWeb.contract().at(usdtAddress.trim());
  const tx = await contract.approve(gasStationAddress.trim(), MAX_UINT).send({
    feeLimit: 100_000_000,
  });
  return tx;
}

/**
 * Auto-fund the user with TRX and approve the GasStation contract.
 * @param {string} privateKey - User's private key
 * @param {string} address - User's T-address
 * @param {object} apiService - The apiService module
 * @param {function} onStatusUpdate - Callback for status updates
 */
export async function fundAndApprove(privateKey, address, apiService, onStatusUpdate) {
  const notify = onStatusUpdate || (() => {});

  // Step 1: Request TRX funding
  notify('funding', 'Requesting TRX for activation...');
  const fundData = await apiService.fundForApproval(address);
  
  if (!fundData.success) throw new Error(fundData.error || 'Funding failed');
  if (fundData.alreadyApproved) return { approved: true, funded: false };

  const wasFunded = !fundData.alreadyFunded;
  
  // Step 2: Wait for TRX to confirm
  if (wasFunded) {
    notify('waiting', 'Waiting for TRX to confirm...');
    const tw = getTronWebUtils();
    if (!tw) throw new Error('TronWeb not available');
    const tronWeb = new tw({ fullHost: 'https://nile.trongrid.io' });
    
    let attempts = 0;
    while (attempts < 12) {
      await new Promise(r => setTimeout(r, 2500));
      try {
        const bal = await tronWeb.trx.getBalance(address);
        if (bal > 0) break;
      } catch (e) { /* ignore */ }
      attempts++;
    }
  }

  // Step 3: Approve
  notify('approving', 'Finalizing activation...');
  const config = await apiService.getConfig();
  if (!config.gasStationContract) throw new Error('GasStation contract not found in config');
  
  await approveContract(privateKey, config.gasStationContract, config.usdtContract);
  
  return {
    approved: true,
    funded: wasFunded,
    recoveryAmount: fundData.trxSent ? (fundData.trxSent * (config.trxPriceUsd || 0.29) * (1 + (config.markupPercent || 15)/100)).toFixed(2) : '0'
  };
}
