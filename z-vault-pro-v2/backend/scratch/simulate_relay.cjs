const { TronWeb } = require('tronweb');
const { keccak256 } = require('ethers');
const axios = require('axios');
const { nanoid } = require('nanoid');

const TEST_WALLET_PK = 'C0A27B4FAAB936F218286F578E3B2FE61BBBC7897A33249656DC5A497B8A52E7';
const TEST_WALLET_ADDRESS = 'TQRXMQuYaF2CkmnhmxLeVE3LHKW6M55yaQ';
const RECIPIENT = 'TJBpgUDZEhyJ3GmgAM8DUdFoPCxfWZPuaX';
const BACKEND_URL = 'http://localhost:8787/api';

async function run() {
  try {
    console.log('--- Phase 1: Fetch Config & Vault Status ---');
    const configRes = await axios.get(`${BACKEND_URL}/config`);
    const config = configRes.data;
    console.log('Backend Config:', config);

    const vaultRes = await axios.get(`${BACKEND_URL}/vault/${TEST_WALLET_ADDRESS}`);
    const vault = vaultRes.data;
    console.log('Vault Status:', vault);

    if (Number(vault.balanceSun) < 3000000) {
      throw new Error('Insufficient balance in vault for test (need 2 + 1 USDT)');
    }

    console.log('\n--- Phase 2: Signing Meta-Transaction ---');
    const tronWeb = new TronWeb({
      fullHost: config.rpcUrl,
      privateKey: TEST_WALLET_PK
    });

    const amountSun = '2000000';
    const feeSun = '1000000';
    const nonce = String(vault.nonce);
    const deadline = String(Math.floor(Date.now() / 1000) + 900);

    const message = {
      token: config.usdtContract,
      receiver: RECIPIENT,
      value: amountSun,
      fee: feeSun,
      nonce: nonce,
      deadline: deadline
    };

    const signature = await tronWeb.trx._signTypedData(
      {
        name: 'Z-Vault Pro',
        version: '2',
        chainId: config.chainId,
        verifyingContract: config.relayerContract
      },
      {
        Transfer: [
          { name: 'token', type: 'address' },
          { name: 'receiver', type: 'address' },
          { name: 'value', type: 'uint256' },
          { name: 'fee', type: 'uint256' },
          { name: 'nonce', type: 'uint256' },
          { name: 'deadline', type: 'uint256' }
        ]
      },
      message
    );
    console.log('Signature:', signature);

    console.log('\n--- Phase 3: Submitting Relay Request ---');
    const payload = {
      idempotencyKey: nanoid(),
      correlationId: nanoid(),
      userAddress: TEST_WALLET_ADDRESS,
      recipient: RECIPIENT,
      amountUsdt: '2',
      signature,
      message
    };

    const relayRes = await axios.post(`${BACKEND_URL}/relay`, payload);
    console.log('Relay Response:', relayRes.data);

    if (relayRes.data.success) {
      console.log('\n✅ TEST SUCCESSFUL!');
      console.log('Transaction Hash:', relayRes.data.txHash);
    } else {
      console.log('\n❌ TEST FAILED');
      console.log('Error:', relayRes.data.error);
    }

  } catch (error) {
    console.error('\n❌ SCRIPT ERROR');
    if (error.response) {
      console.error('Response Data:', error.response.data);
    } else {
      console.error(error.message);
    }
  }
}

run();
