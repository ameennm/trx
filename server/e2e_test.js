/**
 * END-TO-END TEST: Simulates the exact frontend flow
 * 1. Get quote from server (like the browser does)
 * 2. Sign the hash with user's private key (like TronLink does)
 * 3. Send to relay (like the browser does)
 * 4. Report results
 */
const { TronWeb } = require('tronweb');
const { ethers } = require('ethers');
const fs = require('fs');
const log = [];
const origLog = console.log.bind(console);
console.log = (...args) => { const line = args.map(a => typeof a === 'object' ? JSON.stringify(a,null,2) : String(a)).join(' '); log.push(line); origLog(line); };

const SERVER = 'http://localhost:3000';
const USER_PK = '38e19cab43da9b9c7785ccf71bc38699d9769c01cc02dddbc901ad23f915ab98';
const RECIPIENT = 'TDfpqcgPsUtSWtYtvmg6btL72JCts4fAt5';
const AMOUNT = 10; // 10 USDT

const tw = new TronWeb({
  fullHost: 'https://nile.trongrid.io',
  privateKey: USER_PK,
});
const USER_ADDR = tw.defaultAddress.base58;

async function main() {
  console.log('\n========== E2E TEST ==========');
  console.log('User:', USER_ADDR);
  console.log('Recipient:', RECIPIENT);
  console.log('Amount:', AMOUNT, 'USDT');

  // Step 1: Get quote
  console.log('\n--- Step 1: Get Quote ---');
  const quoteRes = await fetch(`${SERVER}/api/quote`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: USER_ADDR, to: RECIPIENT, amount: AMOUNT }),
  });
  const quoteData = await quoteRes.json();
  if (!quoteData.success) {
    console.error('Quote failed:', quoteData.error);
    return;
  }
  const quote = quoteData.quote;
  console.log('Nonce:', quote.nonce);
  console.log('Deadline:', quote.deadline);
  console.log('Fee:', quote.fee.totalFeeUSDT);
  console.log('typedDataHash from server:', quote.typedDataHash);

  // Step 2: Verify the server's hash against the contract's hash
  console.log('\n--- Step 2: Verify Hash Against Contract ---');
  const abi = require('./src/contractData.json').abi;
  const gsAddr = quote.gasStationContract;
  console.log('GasStation contract:', gsAddr);
  
  const contract = await tw.contract(abi, gsAddr);
  
  // Get contract's digest for same params
  let contractDigest;
  try {
    contractDigest = await contract.getTransferDigest(
      USER_ADDR, 
      RECIPIENT, 
      quote.sendAmountSun, 
      quote.feeAmountSun, 
      quote.deadline
    ).call();
    console.log('Contract digest:     ', contractDigest);
    console.log('Server typedDataHash:', quote.typedDataHash);
    console.log('MATCH:', contractDigest === quote.typedDataHash ? '✅ YES' : '❌ NO');
  } catch(e) {
    console.error('getTransferDigest failed:', e.message);
  }

  // Step 3: Sign the hash EXACTLY like the frontend does
  console.log('\n--- Step 3: Sign Hash (Frontend Simulation) ---');
  const hashToSign = quote.typedDataHash.startsWith('0x') 
    ? quote.typedDataHash.slice(2) 
    : quote.typedDataHash;
  
  console.log('Hash to sign (no 0x):', hashToSign);
  
  // Try BOTH signing modes
  for (const useTronHeader of [true, false]) {
    console.log(`\n  Signing with useTronHeader=${useTronHeader}:`);
    try {
      const signature = await tw.trx.sign(hashToSign, USER_PK, useTronHeader);
      const sig = signature.startsWith('0x') ? signature.slice(2) : signature;
      const r = '0x' + sig.slice(0, 64);
      const s = '0x' + sig.slice(64, 128);
      let v = parseInt(sig.slice(128, 130), 16);
      if (v < 27) v += 27;
      
      console.log(`  v=${v}, r=${r.slice(0,12)}..., s=${s.slice(0,12)}...`);

      // Try to recover using ethers
      // If useTronHeader=true, TronWeb signs keccak256(\x19TRON...\n32 + hash)
      // If useTronHeader=false, TronWeb signs keccak256(\x19Ethereum...\n32 + hash)
      
      const rawDigest = quote.typedDataHash;
      
      // Check: does ecrecover(rawDigest, v, r, s) give us the user?
      try {
        const rec = ethers.recoverAddress(rawDigest, { v, r, s });
        const expected = '0x' + tw.address.toHex(USER_ADDR).slice(2);
        console.log(`  ecrecover(rawDigest):       ${rec}`);
        console.log(`  Expected:                   ${expected}`);
        console.log(`  Raw match:                  ${rec.toLowerCase() === expected.toLowerCase() ? '✅' : '❌'}`);
      } catch(e) {
        console.log(`  ecrecover(rawDigest) failed: ${e.message}`);    
      }

      // Check: does ecrecover(TRON_prefixed_digest, v, r, s) give us the user?
      const tronPrefixed = ethers.keccak256(
        ethers.concat([
          ethers.toUtf8Bytes("\x19TRON Signed Message:\n32"),
          rawDigest
        ])
      );
      try {
        const rec2 = ethers.recoverAddress(tronPrefixed, { v, r, s });
        const expected = '0x' + tw.address.toHex(USER_ADDR).slice(2);
        console.log(`  ecrecover(TRON_prefixed):   ${rec2}`);
        console.log(`  TRON prefix match:          ${rec2.toLowerCase() === expected.toLowerCase() ? '✅' : '❌'}`);
      } catch(e) {
        console.log(`  ecrecover(TRON_prefixed) failed: ${e.message}`);
      }

      // Check: does ecrecover(ETH_prefixed_digest, v, r, s) give us the user?
      const ethPrefixed = ethers.keccak256(
        ethers.concat([
          ethers.toUtf8Bytes("\x19Ethereum Signed Message:\n32"),
          rawDigest
        ])
      );
      try {
        const rec3 = ethers.recoverAddress(ethPrefixed, { v, r, s });
        const expected = '0x' + tw.address.toHex(USER_ADDR).slice(2);
        console.log(`  ecrecover(ETH_prefixed):    ${rec3}`);
        console.log(`  ETH prefix match:           ${rec3.toLowerCase() === expected.toLowerCase() ? '✅' : '❌'}`);
      } catch(e) {
        console.log(`  ecrecover(ETH_prefixed) failed: ${e.message}`);
      }
      
    } catch(e) {
      console.log(`  Sign failed: ${e.message}`);
    }
  }

  // Step 4: Check what TronWeb.trx.sign actually does internally
  console.log('\n--- Step 4: Raw ECDSA Verification ---');
  const wallet = new ethers.Wallet(USER_PK);
  console.log('ethers wallet address:', wallet.address);
  
  // Sign the raw digest directly with ethers (no prefix)
  const rawSig = wallet.signingKey.sign(quote.typedDataHash);
  console.log('ethers raw sign v:', rawSig.v, 'r:', rawSig.r.slice(0,12)+'...');
  const recRaw = ethers.recoverAddress(quote.typedDataHash, rawSig);
  console.log('Recovered from raw sign:', recRaw);
  console.log('Match:', recRaw.toLowerCase() === wallet.address.toLowerCase() ? '✅ YES' : '❌ NO');

  // What if the contract just used ecrecover on the raw digest with a raw signature?
  // This would work! No prefix needed. 
  console.log('\n--- Step 5: Relay with RAW signature ---');
  const relayBody = {
    from: USER_ADDR,
    to: RECIPIENT,
    sendAmount: quote.fee.sendAmount.toString(),
    feeAmount: quote.fee.totalFeeUSDT.toString(),
    deadline: quote.deadline.toString(),
    v: rawSig.v.toString(),
    r: rawSig.r,
    s: rawSig.s,
  };
  console.log('Relay body:', JSON.stringify(relayBody, null, 2));
  
  const relayRes = await fetch(`${SERVER}/api/relay`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(relayBody),
  });
  const relayData = await relayRes.json();
  console.log('Relay result:', JSON.stringify(relayData, null, 2));

  console.log('\n========== E2E TEST COMPLETE ==========\n');
}

main().then(() => { fs.writeFileSync('e2e_results.txt', log.join('\n'), 'utf8'); }).catch(e => { console.error(e); fs.writeFileSync('e2e_results.txt', log.join('\n'), 'utf8'); });
