const STORAGE_KEY = 'zvault.encryptedWallet.v1';
const ADDRESS_KEY = 'zvault.walletAddress.v1';
const KDF_ITERATIONS = 180000;

type StoredWallet = {
  version: 1;
  salt: string;
  iv: string;
  ciphertext: string;
};

function bytesToBase64(bytes: Uint8Array) {
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

function base64ToBytes(value: string) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

async function deriveKey(password: string, salt: Uint8Array) {
  const material = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveKey']
  );

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations: KDF_ITERATIONS,
      hash: 'SHA-256'
    },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export function hasStoredWallet() {
  return Boolean(localStorage.getItem(STORAGE_KEY));
}

export function getStoredWalletAddress() {
  return localStorage.getItem(ADDRESS_KEY) || '';
}

export async function saveEncryptedWallet(input: {
  privateKey: string;
  walletAddress: string;
  password: string;
}) {
  if (input.password.length < 8) {
    throw new Error('Use at least 8 characters for the password');
  }

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(input.password, salt);
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(input.privateKey)
  );

  const stored: StoredWallet = {
    version: 1,
    salt: bytesToBase64(salt),
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(new Uint8Array(ciphertext))
  };

  localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
  localStorage.setItem(ADDRESS_KEY, input.walletAddress);
}

export async function unlockEncryptedWallet(password: string) {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    throw new Error('No saved wallet found');
  }

  try {
    const stored = JSON.parse(raw) as StoredWallet;
    const salt = base64ToBytes(stored.salt);
    const iv = base64ToBytes(stored.iv);
    const key = await deriveKey(password, salt);
    const plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      base64ToBytes(stored.ciphertext)
    );
    return new TextDecoder().decode(plain);
  } catch {
    throw new Error('Wrong password or damaged wallet cache');
  }
}

export function removeStoredWallet() {
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(ADDRESS_KEY);
}
