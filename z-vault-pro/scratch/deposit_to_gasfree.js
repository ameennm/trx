/**
 * Transfer USDT from EOA to GasFree proxy address on Nile Testnet
 * This is a REGULAR TRC-20 transfer (requires TRX for gas)
 */
const { TronWeb } = require('tronweb');

const PRIVATE_KEY = 'f28e5958114b3f42e93e71e63c113e77c3f666e1e8fb737399c1cdf0f62ebca2';
const GASFREE_PROXY = 'TDphhaD2bYHV86ce57t7hA4SWqyzWJ5psn';
const USDT_CONTRACT = 'TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf';
const AMOUNT = 20; // Send 20 USDT to cover several transfers

async function main() {
  const tronWeb = new TronWeb({
    fullHost: 'https://nile.trongrid.io',
    privateKey: PRIVATE_KEY,
  });

  const userAddress = tronWeb.address.fromPrivateKey(PRIVATE_KEY);
  console.log('User EOA:', userAddress);
  console.log('GasFree Proxy:', GASFREE_PROXY);
  console.log('Sending:', AMOUNT, 'USDT');

  // Check TRX balance first
  const trxBalance = await tronWeb.trx.getBalance(userAddress);
  console.log('TRX Balance:', trxBalance / 1e6, 'TRX');

  if (trxBalance < 10_000_000) {
    console.log('ERROR: Need at least 10 TRX for gas. Current:', trxBalance / 1e6);
    return;
  }

  // TRC-20 transfer
  const contract = await tronWeb.contract().at(USDT_CONTRACT);
  const amountInUnits = AMOUNT * 1_000_000; // 6 decimals

  console.log('\nSending TRC-20 transfer...');
  const tx = await contract.methods.transfer(GASFREE_PROXY, amountInUnits).send({
    feeLimit: 100_000_000, // 100 TRX fee limit
  });

  console.log('✅ Transaction sent!');
  console.log('TX Hash:', tx);
  console.log('\nWait 30 seconds for confirmation, then retry the GasFree transfer.');
}

main().catch(console.error);
