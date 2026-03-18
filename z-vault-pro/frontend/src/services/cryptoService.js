import CryptoJS from 'crypto-js';

/**
 * Crypxe — Crypto Service
 * PIN-based encryption and IndexedDB storage for private keys.
 */

const DB_NAME = 'crypxe';
const DB_VERSION = 1;
const STORE_NAME = 'wallet';
const SALT_KEY = 'crypxe-pin-salt';

/**
 * Open (or create) the IndexedDB database.
 */
function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Store a value in IndexedDB.
 */
async function dbPut(key, value) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Get a value from IndexedDB.
 */
async function dbGet(key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const request = tx.objectStore(STORE_NAME).get(key);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Delete a value from IndexedDB.
 */
async function dbDelete(key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Derive an AES-256 key from a 6-digit PIN using PBKDF2.
 */
function deriveKey(pin, salt) {
  return CryptoJS.PBKDF2(pin, salt, {
    keySize: 256 / 32,
    iterations: 100000,
    hasher: CryptoJS.algo.SHA256,
  }).toString();
}

/**
 * Encrypt wallet data with a 6-digit PIN.
 * Stores encrypted blob + salt in IndexedDB.
 */
export async function encryptAndStore(walletData, pin) {
  if (!/^\d{6}$/.test(pin)) {
    throw new Error('PIN must be exactly 6 digits');
  }

  const salt = CryptoJS.lib.WordArray.random(128 / 8).toString();
  const key = deriveKey(pin, salt);

  const encrypted = CryptoJS.AES.encrypt(
    JSON.stringify(walletData),
    key
  ).toString();

  await dbPut('encrypted_wallet', encrypted);
  await dbPut('salt', salt);
  await dbPut('has_wallet', true);

  return true;
}

/**
 * Decrypt wallet data with the PIN.
 */
export async function decryptWallet(pin) {
  if (!/^\d{6}$/.test(pin)) {
    throw new Error('PIN must be exactly 6 digits');
  }

  const encrypted = await dbGet('encrypted_wallet');
  const salt = await dbGet('salt');

  if (!encrypted || !salt) {
    throw new Error('No wallet found. Please create or import one.');
  }

  const key = deriveKey(pin, salt);

  try {
    const decrypted = CryptoJS.AES.decrypt(encrypted, key);
    const jsonStr = decrypted.toString(CryptoJS.enc.Utf8);
    if (!jsonStr) throw new Error('Wrong PIN');
    return JSON.parse(jsonStr);
  } catch {
    throw new Error('Wrong PIN. Please try again.');
  }
}

/**
 * Check if a wallet exists in storage.
 */
export async function hasStoredWallet() {
  const result = await dbGet('has_wallet');
  return !!result;
}

/**
 * Clear all wallet data.
 */
export async function clearWallet() {
  await dbDelete('encrypted_wallet');
  await dbDelete('salt');
  await dbDelete('has_wallet');
}
