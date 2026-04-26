import { TronWeb } from 'tronweb';
import { generateMnemonic as bip39Generate, validateMnemonic as bip39Validate } from 'bip39';

// Standard derivation path for TRON
const TRON_PATH = "m/44'/195'/0'/0/0";

/** Generate a new 12-word mnemonic phrase */
export function generateMnemonic() {
  return bip39Generate();
}

/** Validate a mnemonic phrase */
export function validateMnemonic(mnemonic) {
  return bip39Validate(mnemonic.trim().replace(/\s+/g, ' '));
}

/** Derive TRON address + private key from mnemonic */
export async function deriveTronWallet(mnemonic) {
  const trimmed = mnemonic.trim().replace(/\s+/g, ' ');
  if (!validateMnemonic(trimmed)) throw new Error('Invalid mnemonic phrase.');

  try {
    const account = TronWeb.fromMnemonic(trimmed, TRON_PATH);
    let pk = account.privateKey;
    if (pk.startsWith('0x')) pk = pk.slice(2);
    
    return {
      address: account.address,
      privateKey: pk
    };
  } catch (error) {
    throw new Error('Failed to derive wallet from mnemonic.');
  }
}

/** Derive TRON address from a direct Private Key */
export async function deriveTronWalletFromKey(privateKey) {
  let key = privateKey.trim();
  if (key.startsWith('0x')) key = key.slice(2);
  
  if (key.length !== 64 || !/^[0-9a-fA-F]{64}$/.test(key)) {
    throw new Error('Invalid Private Key. Must be 64-character hex string.');
  }

  try {
    const address = TronWeb.address.fromPrivateKey(key);
    return {
      address,
      privateKey: key
    };
  } catch (error) {
    throw new Error('Failed to derive wallet from private key.');
  }
}

/** Fetch TRX/USDT balances including Proxy Wallet */
export async function getBalances(address, network = 'mainnet') {
  const rpcUrl = network === 'nile' ? 'https://nile.trongrid.io' : 'https://api.trongrid.io';
  const usdtContract = network === 'nile' ? 'TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf' : 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t';
  const relayerContract = network === 'nile' 
    ? 'TYXm4dk4gfs2nyiocnaJjTdQTHK1EYH89N' // Example nile relayer
    : 'TZ2KnAvkher2xBdWk5j6SQvH9Amyoz1pz5'; // Your mainnet relayer

  // Use a dummy private key to instantiate TronWeb for read-only operations
  const tw = new TronWeb({ 
    fullHost: rpcUrl, 
    privateKey: '01'.repeat(32),
    headers: { 'TRON-PRO-API-KEY': '464bdc25-956d-40b5-8065-743ddd8c63f8' }
  });

  let trx = 0;
  let usdt = 0;
  let proxyUsdt = 0;
  let proxyAddress = '';

  try {
    // 1. Fetch main wallet balances
    const trxSun = await tw.trx.getBalance(address);
    trx = tw.fromSun(trxSun);

    const contract = await tw.contract().at(usdtContract);
    const usdtRaw = await contract.balanceOf(address).call();
    usdt = parseInt(usdtRaw.toString()) / 1_000_000;

    // 2. Fetch Proxy Wallet balance
    const rContract = await tw.contract().at(relayerContract);
    const proxyHex = await rContract.getWalletAddress(address).call();
    proxyAddress = tw.address.fromHex(proxyHex);
    
    const proxyUsdtRaw = await contract.balanceOf(proxyAddress).call();
    proxyUsdt = parseInt(proxyUsdtRaw.toString()) / 1_000_000;
  } catch (err) {
    console.error('Balance fetch failed:', err);
  }

  return {
    trx: parseFloat(trx).toFixed(2),
    usdt: parseFloat(usdt).toFixed(2),
    proxyUsdt: parseFloat(proxyUsdt).toFixed(2),
    proxyAddress: proxyAddress
  };
}


/** Fetch on-chain TRC20 transfer history via TronGrid API */
export async function getOnChainHistory(address, network = 'nile') {
  const host = network === 'nile' ? 'https://nile.trongrid.io' : 'https://api.trongrid.io';
  const usdtContract = network === 'nile' ? 'TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf' : 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t';

  try {
    const url = `${host}/v1/accounts/${address}/transactions/trc20?contract_address=${usdtContract}&limit=20`;
    const res = await fetch(url);
    const data = await res.json();

    if (!data.success || !data.data) return [];

    return data.data.map(tx => {
      const isSend = tx.from === address;
      const amt = (parseInt(tx.value) / 1_000_000).toFixed(2);
      
      return {
        id: tx.transaction_id,
        tx_hash: tx.transaction_id,
        type: isSend ? 'send' : 'receive',
        amount: amt,
        recipient: tx.to,
        status: 'completed',
        created_at: tx.block_timestamp,
        source: 'chain',
        user_address: address, // Added for UI mapping
        from: tx.from,
        to: tx.to
      };
    });
  } catch (err) {
    console.error('History fetch failed:', err);
    return [];
  }
}
