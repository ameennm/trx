/**
 * Deploy the GasStation contract to TRON Nile Testnet.
 *
 * Usage:
 *   npx tsx src/deploy.ts
 *
 * Requirements:
 *   - RELAYER_PRIVATE_KEY must be set in .env
 *   - Relayer account must have TRX on Nile testnet
 */

import { TronWeb as TronWebClass } from 'tronweb';
import { config } from './config';
import fs from 'fs';
import path from 'path';

async function deploy() {
  console.log('🚀 Deploying GasStation contract to Nile Testnet...\n');

  if (!config.relayerPrivateKey || config.relayerPrivateKey === 'your_relayer_private_key_here') {
    console.error('❌ RELAYER_PRIVATE_KEY is not set or still has default placeholder in .env');
    console.log('   Please open .env and provide a valid TRON private key.');
    process.exit(1);
  }

  // Handle TronWeb v6 constructor differences in Node.js
  let TronWebConstructor: any = TronWebClass;
  if (typeof TronWebConstructor !== 'function') {
    const tw = require('tronweb');
    TronWebConstructor = tw.TronWeb || tw.default || tw;
  }

  const tronWeb = new TronWebConstructor({
    fullHost: config.nileRpcUrl,
    privateKey: config.relayerPrivateKey,
  });

  const deployerAddress = tronWeb.defaultAddress.base58;
  console.log(`📋 Deployer address: ${deployerAddress}`);

  // Check TRX balance
  const balance = await tronWeb.trx.getBalance(deployerAddress);
  const trxBalance = balance / 1_000_000;
  console.log(`💰 TRX balance: ${trxBalance} TRX`);

  if (trxBalance < 100) {
    console.error('❌ Insufficient TRX balance. Need at least 100 TRX for deployment.');
    console.log('   Get test TRX from: https://nileex.io/join/getJoinPage');
    process.exit(1);
  }

  // Read the compiled contract (we'll use TronWeb's built-in compiler)
  // For a simple contract, we can deploy directly with the Solidity source
  const contractSource = fs.readFileSync(
    path.resolve(__dirname, '../../contracts/GasStation.sol'),
    'utf8'
  );

  console.log('\n📝 Compiling contract...');

  try {
    // Deploy using TronWeb
    const usdtAddress = tronWeb.address.toHex(config.usdtContract);
    const relayerAddress = tronWeb.address.toHex(deployerAddress as string);

    // Use the contract compilation and deployment via TronWeb
    const { abi, bytecode } = require('./contractData.json');
    
    const compiled = await tronWeb.contract().new({
      abi: abi,
      bytecode: bytecode,
      feeLimit: 1_000_000_000,
      callValue: 0,
      parameters: [
        config.usdtContract,
        deployerAddress,
        config.chainId,
      ],
    });

    console.log('\n✅ Contract deployed successfully!');
    console.log(`📍 Contract address: ${compiled.address}`);
    console.log(`\n🔧 Update your .env file:`);
    console.log(`   GAS_STATION_CONTRACT=${compiled.address}`);

    // Auto-update .env if it exists
    const envPath = path.resolve(__dirname, '../../.env');
    const serverEnvPath = path.resolve(__dirname, '../.env');
    
    [envPath, serverEnvPath].forEach(path => {
      if (fs.existsSync(path)) {
        let envContent = fs.readFileSync(path, 'utf8');
        if (envContent.includes('GAS_STATION_CONTRACT=')) {
          envContent = envContent.replace(
            /GAS_STATION_CONTRACT=.*/,
            `GAS_STATION_CONTRACT=${compiled.address}`
          );
        } else {
          envContent += `\nGAS_STATION_CONTRACT=${compiled.address}\n`;
        }
        fs.writeFileSync(path, envContent);
        console.log(`   ✅ ${path.split(path.includes('\\') ? '\\' : '/').pop()} file updated automatically!`);
      }
    });

  } catch (error: any) {
    console.error('\n❌ Deployment failed:', error.message);
    if (error.stack) console.error(error.stack);
    console.log('\n📋 Troubleshooting:');
    console.log('   1. Ensure you have enough TRX for deployment (2000 TRX is plenty)');
    console.log('   2. Check that the Nile RPC URL is correct');
    console.log('   3. Check contractData.json exists and is valid');

    // ... (append to lessons.md)
  }
}


deploy().catch(console.error);
