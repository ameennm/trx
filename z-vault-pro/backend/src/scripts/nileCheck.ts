import { TronWeb } from 'tronweb';
import * as dotenv from 'dotenv';
import path from 'path';

/**
 * Z-Vault Pro — Nile Testnet Readiness Check
 * Autonomously verifies the institutional relayer status before production start.
 */

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const config = {
  privateKey: process.env.RELAYER_PRIVATE_KEY || '01'.repeat(32),
  rpcUrl: process.env.NILE_RPC_URL || 'https://nile.trongrid.io',
  treasury: process.env.TREASURY_ADDRESS || 'TJBpgUDZEhyJ3GmgAM8DUdFoPCxfWZPuaX',
};

async function checkNileReadiness() {
  const tronWeb = new TronWeb({
    fullHost: config.rpcUrl,
    privateKey: config.privateKey,
  });

  console.log(`\n  ╔════════════════════════════════════════════════╗`);
  console.log(`  ║ [NILE HEALTH CHECK] 🧪 Readiness Verification  ║`);
  
  try {
    // 1. Node Connectivity
    const block = await tronWeb.trx.getCurrentBlock();
    console.log(`  ║ 🔹 RPC Status: Connected (Block: ${block.block_header.raw_data.number}) ║`);

    // 2. Relayer Balance (Crucial for active account stipends)
    const relayerAddress = tronWeb.address.fromPrivateKey(config.privateKey);
    const balance = await tronWeb.trx.getBalance(relayerAddress);
    const trx = balance / 1_000_000;

    console.log(`  ║ 🛡️  Relayer Address: ${relayerAddress}  ║`);
    console.log(`  ║ 💰 Relayer Balance: ${trx.toFixed(2)} TRX              ║`);

    // Verification Logic for Error 24 (Stipend Injection)
    if (trx < 50) {
      console.log(`  ║ ⚠️  WARNING: Relayer balance < 50 TRX (Insufficient)║`);
    } else {
      console.log(`  ║ ✅ Relayer is adequately funded for activation.  ║`);
    }

    // 3. Treasury Verification
    console.log(`  ║ 📈 Treasury Address: ${config.treasury}    ║`);
    console.log(`  ╚════════════════════════════════════════════════╝\n`);

  } catch (err: any) {
    console.error(`  ║ ❌ ERROR: Node connectivity or private key failed. ║`);
    console.error(`  ║ MS: ${err.message} ║`);
    console.log(`  ╚════════════════════════════════════════════════╝\n`);
  }
}

checkNileReadiness();
