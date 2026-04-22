/**
 * Z-Vault Pro — Institutional Crypto Service (Web Crypto API)
 * PIN-based encryption (AES-GCM 256) and IndexedDB storage.
 */

const DB_NAME = 'z_vault_pro_secure';
const DB_VERSION = 1;
const STORE_NAME = 'secure_store';

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
 * DB Wrappers
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

async function dbGet(key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const request = tx.objectStore(STORE_NAME).get(key);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

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
 * Utility: Convert string/uint8array
 */
const encoder = new TextEncoder();
const decoder = new TextDecoder();

/**
 * Native PBKDF2 Key Derivation
 */
async function deriveKeyFromPin(pin, salt) {
  const pinBuffer = encoder.encode(pin);
  // Import raw key for derivation
  const baseKey = await window.crypto.subtle.importKey(
    'raw',
    pinBuffer,
    'PBKDF2',
    false,
    ['deriveKey']
  );

  // Derive AES-GCM Key (Non-extractable)
  return window.crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt,
      iterations: 100000,
      hash: 'SHA-256',
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false, // extractable: false (Crucial Security)
    ['encrypt', 'decrypt']
  );
}

/**
 * Encrypt BIP-39 mnemonic with a 6-digit PIN.
 */
export async function encryptAndStore(secret, pin, walletType = 'mnemonic') {
  if (!/^\d{6}$/.test(pin)) {
    throw new Error('PIN must be exactly 6 digits');
  }

  const salt = window.crypto.getRandomValues(new Uint8Array(16));
  const iv = window.crypto.getRandomValues(new Uint8Array(12)); // 96-bit IV
  
  const key = await deriveKeyFromPin(pin, salt);
  const dataBuffer = encoder.encode(secret);

  const ciphertext = await window.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    dataBuffer
  );

  await dbPut('encrypted_mnemonic', ciphertext); // Keeping key name for compatibility
  await dbPut('salt', salt);
  await dbPut('iv', iv);
  await dbPut('wallet_type', walletType);
  await dbPut('has_wallet', true);

  return true;
}

/**
 * Decrypt the mnemonic with the PIN.
 */
export async function decryptSecret(pin) {
  if (!/^\d{6}$/.test(pin)) {
    throw new Error('PIN must be exactly 6 digits');
  }

  const ciphertext = await dbGet('encrypted_mnemonic');
  const salt = await dbGet('salt');
  const iv = await dbGet('iv');
  const walletType = (await dbGet('wallet_type')) || 'mnemonic';

  if (!ciphertext || !salt || !iv) {
    throw new Error('No wallet found.');
  }

  const key = await deriveKeyFromPin(pin, salt);

  try {
    const decryptedBuffer = await window.crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      ciphertext
    );
    
    return {
      secret: decoder.decode(decryptedBuffer),
      walletType
    };
  } catch (err) {
    console.error('Decryption failed:', err);
    throw new Error('Invalid PIN.');
  }
}

/**
 * Check if a wallet exists.
 */
export async function hasWallet() {
  const result = await dbGet('has_wallet');
  return !!result;
}

/**
 * Clear wallet data (Wipe).
 */
export async function clearWallet() {
  await dbDelete('encrypted_mnemonic');
  await dbDelete('salt');
  await dbDelete('iv');
  await dbDelete('wallet_type');
  await dbDelete('has_wallet');
}
