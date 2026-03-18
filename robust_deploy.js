/**
 * Robust deploy script that:
 * 1. Deploys the contract
 * 2. Waits for confirmation
 * 3. Verifies the contract exists on chain
 * 4. Updates .env files with the CORRECT Base58 address
 */
const path = require('path');
const fs = require('fs');
const { TronWeb } = require(path.resolve(__dirname, 'server/node_modules/tronweb'));

const PRIVATE_KEY = 'f28e5958114b3f42e93e71e63c113e77c3f666e1e8fb737399c1cdf0f62ebca2';
const USDT_CONTRACT = 'TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf';
const CHAIN_ID = 3448148188;

async function deploy() {
  console.log('\n🚀 ROBUST DEPLOY — GasStation Contract\n');

  const tw = new TronWeb({
    fullHost: 'https://nile.trongrid.io',
    privateKey: PRIVATE_KEY,
  });

  const deployer = tw.defaultAddress.base58;
  console.log('Deployer:', deployer);

  const balance = await tw.trx.getBalance(deployer);
  console.log('TRX Balance:', balance / 1_000_000, 'TRX');

  if (balance < 100_000_000) {
    console.error('❌ Need at least 100 TRX');
    process.exit(1);
  }

  const { abi, bytecode } = require('./server/src/contractData.json');
  console.log('ABI entries:', abi.length);
  console.log('Bytecode length:', bytecode.length);

  console.log('\n📝 Deploying...');
  
  try {
    // Create the deployment transaction
    const tx = await tw.transactionBuilder.createSmartContract({
      abi: abi,
      bytecode: bytecode,
      feeLimit: 1_000_000_000,
      callValue: 0,
      parameters: [USDT_CONTRACT, deployer, CHAIN_ID],
    }, deployer);

    // Sign it
    const signedTx = await tw.trx.sign(tx);
    
    // Broadcast
    const result = await tw.trx.sendRawTransaction(signedTx);
    console.log('Broadcast result:', JSON.stringify(result, null, 2));

    if (!result.result) {
      console.error('❌ Broadcast failed');
      process.exit(1);
    }

    const txHash = result.txid;
    console.log('TX Hash:', txHash);

    // Wait for confirmation
    console.log('\n⏳ Waiting 10 seconds for confirmation...');
    await new Promise(r => setTimeout(r, 10000));

    // Get the transaction info to find the contract address
    const txInfo = await tw.trx.getTransactionInfo(txHash);
    console.log('TX Info:', JSON.stringify(txInfo, null, 2));

    if (!txInfo || !txInfo.contract_address) {
      console.error('❌ No contract address in tx info. Waiting more...');
      await new Promise(r => setTimeout(r, 10000));
      const txInfo2 = await tw.trx.getTransactionInfo(txHash);
      console.log('TX Info (retry):', JSON.stringify(txInfo2, null, 2));
      
      if (!txInfo2 || !txInfo2.contract_address) {
        console.error('❌ Deployment failed - no contract address found');
        process.exit(1);
      }
    }

    const contractHex = txInfo.contract_address || (await tw.trx.getTransactionInfo(txHash)).contract_address;
    const contractBase58 = TronWeb.address.fromHex(contractHex);

    console.log('\n✅ Contract deployed!');
    console.log('Address (hex):   ', contractHex);
    console.log('Address (base58):', contractBase58);

    // Verify contract exists
    console.log('\n🔍 Verifying contract exists on chain...');
    const contractInfo = await tw.trx.getContract(contractBase58);
    
    if (!contractInfo || !contractInfo.bytecode) {
      console.error('❌ Contract NOT found on chain!');
      process.exit(1);
    }
    console.log('✅ Contract verified on chain!');
    console.log('Contract name:', contractInfo.name || '(unnamed)');

    // Test calling a function
    console.log('\n🔍 Testing contract functions...');
    const contract = await tw.contract(abi, contractBase58);
    
    const ds = await contract.DOMAIN_SEPARATOR().call();
    console.log('DOMAIN_SEPARATOR:', ds);
    
    const relayerAddr = await contract.relayer().call();
    console.log('Relayer:', TronWeb.address.fromHex(relayerAddr));
    
    const chainIdOnChain = await contract.chainId().call();
    console.log('ChainId:', chainIdOnChain.toString());

    // Update .env files
    const envPaths = [
      path.resolve(__dirname, '.env'),
      path.resolve(__dirname, 'server/.env'),
    ];

    for (const envPath of envPaths) {
      if (fs.existsSync(envPath)) {
        let content = fs.readFileSync(envPath, 'utf8');
        content = content.replace(
          /GAS_STATION_CONTRACT=.*/,
          `GAS_STATION_CONTRACT=${contractBase58}`
        );
        fs.writeFileSync(envPath, content);
        console.log(`✅ Updated: ${envPath}`);
      }
    }

    console.log(`\n🎉 DONE! New contract: ${contractBase58}`);
    console.log('Restart your server to pick up the new address.');

  } catch (e) {
    console.error('Deploy error:', e);
    process.exit(1);
  }
}

deploy();
