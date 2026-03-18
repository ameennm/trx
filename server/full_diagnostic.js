/**
 * FULL END-TO-END DIAGNOSTIC
 * Simulates the exact flow: server hash → sign → contract verify
 */
const { TronWeb } = require('tronweb');
const { ethers } = require('ethers');
const contractData = require('./src/contractData.json');

const RELAYER_KEY = 'f28e5958114b3f42e93e71e63c113e77c3f666e1e8fb737399c1cdf0f62ebca2';
const GAS_STATION = 'TBfnTTxXxCPevWtuZP9RbKpAn2zBy6woKs';
const FROM = 'TUFy8Dx2SFSMC9s6PHgC3ZRja4c8myYD94';
const TO = 'TJBpgUDZEhyJ3GmgAM8DUdFoPCxfWZPuaX';
const CHAIN_ID = 3448148188;

const tw = new TronWeb({
  fullHost: 'https://nile.trongrid.io',
  privateKey: RELAYER_KEY,
});

async function main() {
  console.log('\n=== FULL END-TO-END DIAGNOSTIC ===\n');

  // Step 1: Check addresses
  const fromHex = tw.address.toHex(FROM);   // 41...
  const toHex = tw.address.toHex(TO);       // 41...
  const gsHex = tw.address.toHex(GAS_STATION); // 41...

  console.log('FROM (base58):', FROM);
  console.log('FROM (hex):   ', fromHex);
  console.log('TO (base58):  ', TO);
  console.log('TO (hex):     ', toHex);
  console.log('GS (base58):  ', GAS_STATION);
  console.log('GS (hex):     ', gsHex);

  // Step 2: What the SERVER produces as EVM addresses
  const fromEvm = '0x' + fromHex.slice(2);  // strip leading '41', add '0x'
  const toEvm = '0x' + toHex.slice(2);
  const gsEvm = '0x' + gsHex.slice(2);

  console.log('\nEVM-format addresses (what server uses for hashing):');
  console.log('FROM EVM:', fromEvm, '(', fromEvm.length, 'chars)');
  console.log('TO EVM:  ', toEvm, '(', toEvm.length, 'chars)');
  console.log('GS EVM:  ', gsEvm, '(', gsEvm.length, 'chars)');

  // CRITICAL CHECK: The server does `'0x' + toHex.slice(2)` which means:
  // toHex = "41..." (42 chars including 41 prefix)
  // slice(2) removes "41", leaving 40 hex chars
  // '0x' + 40 chars = 42 chars total — this is a VALID 20-byte address
  // BUT WAIT: toHex from tronWeb is like "41abcdef..." 
  // where first 2 chars are "41". slice(2) cuts "41". Good.
  
  // Step 3: What Solidity does with address(uint160(from))
  // In Solidity, TRON passes addresses as 21 bytes with 0x41 prefix.
  // uint160(from) takes the LOWER 20 bytes, effectively dropping 0x41.
  // abi.encode(address) then left-pads to 32 bytes.
  // ethers.AbiCoder.encode('address', ...) also left-pads to 32 bytes.
  // So if fromEvm is the correct 20-byte address, they SHOULD match.

  // Step 4: Build the exact struct hash the server builds
  const TRANSFER_TYPEHASH = ethers.keccak256(
    ethers.toUtf8Bytes(
      "Transfer(address from,address to,uint256 sendAmount,uint256 feeAmount,uint256 nonce,uint256 deadline)"
    )
  );

  const DOMAIN_TYPEHASH = ethers.keccak256(
    ethers.toUtf8Bytes(
      "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"
    )
  );

  const sendAmount = 10;      // 10 USDT
  const feeAmount = 4.50225;  // example fee
  const sendAmountSun = sendAmount * 1_000_000;
  const feeAmountSun = Math.round(feeAmount * 1_000_000);
  const nonce = 0;
  const deadline = Math.floor(Date.now() / 1000) + 3600;

  console.log('\n--- Transaction Parameters ---');
  console.log('sendAmountSun:', sendAmountSun);
  console.log('feeAmountSun: ', feeAmountSun);
  console.log('nonce:        ', nonce);
  console.log('deadline:     ', deadline);

  // Server's struct hash
  const serverStructHash = ethers.keccak256(
    ethers.AbiCoder.defaultAbiCoder().encode(
      ['bytes32', 'address', 'address', 'uint256', 'uint256', 'uint256', 'uint256'],
      [TRANSFER_TYPEHASH, fromEvm, toEvm, sendAmountSun, feeAmountSun, nonce, deadline]
    )
  );
  console.log('\nServer structHash:', serverStructHash);

  // Server's domain separator (calculated)
  const serverDomainSep = ethers.keccak256(
    ethers.AbiCoder.defaultAbiCoder().encode(
      ['bytes32', 'bytes32', 'bytes32', 'uint256', 'address'],
      [
        DOMAIN_TYPEHASH,
        ethers.keccak256(ethers.toUtf8Bytes("ZVault-GasStation")),
        ethers.keccak256(ethers.toUtf8Bytes("1")),
        CHAIN_ID,
        gsEvm,
      ]
    )
  );
  console.log('Server domainSep:', serverDomainSep);

  // Server's final digest
  const serverDigest = ethers.keccak256(
    ethers.concat(['0x1901', serverDomainSep, serverStructHash])
  );
  console.log('Server digest:   ', serverDigest);

  // Step 5: Try to get the contract's digest
  console.log('\n--- Contract Side ---');
  try {
    const contract = await tw.contract(contractData.abi, GAS_STATION);
    
    // Get domain separator from contract
    const contractDS = await contract.DOMAIN_SEPARATOR().call();
    console.log('Contract DOMAIN_SEPARATOR:', contractDS);
    console.log('Server   DOMAIN_SEPARATOR:', serverDomainSep);
    console.log('DS MATCH:', contractDS === serverDomainSep ? '✅ YES' : '❌ NO');
    
    // Get nonce
    const contractNonce = await contract.nonces(FROM).call();
    console.log('\nContract nonce for FROM:', contractNonce.toString());
    
    // Get the contract's digest
    const contractDigest = await contract.getTransferDigest(
      FROM, TO, sendAmountSun, feeAmountSun, deadline
    ).call();
    console.log('\nContract digest:', contractDigest);
    console.log('Server   digest:', serverDigest);
    console.log('DIGEST MATCH:', contractDigest === serverDigest ? '✅ YES' : '❌ NO');

  } catch (e) {
    console.error('Contract call failed:', e.message);
    console.log('\nFalling back to manual comparison...');
  }

  // Step 6: Sign the digest (simulating what the frontend does)
  console.log('\n--- Signing Test ---');
  // The frontend does: tronWeb.trx.sign(hash, privateKey, true)
  // where "true" means ADD the TRON prefix
  // The hash passed is the serverDigest (without 0x prefix)
  
  const hashToSign = serverDigest.startsWith('0x') ? serverDigest.slice(2) : serverDigest;
  console.log('Hash to sign (hex, no 0x):', hashToSign);
  
  // Sign WITHOUT prefix (false) - raw EIP712 signature
  try {
    const sigNoPrefix = await tw.trx.sign(hashToSign, undefined, false);
    console.log('\nSign(false) - no prefix:  ', sigNoPrefix.slice(0, 20) + '...');
    
    const sig1 = sigNoPrefix.startsWith('0x') ? sigNoPrefix.slice(2) : sigNoPrefix;
    const r1 = '0x' + sig1.slice(0, 64);
    const s1 = '0x' + sig1.slice(64, 128);
    let v1 = parseInt(sig1.slice(128, 130), 16);
    if (v1 < 27) v1 += 27;
    
    // Recover with ethers to see WHO we get
    const recovered1 = ethers.recoverAddress(serverDigest, { r: r1, s: s1, v: v1 });
    console.log('Recovered (no prefix):    ', recovered1);
    console.log('Expected FROM EVM:        ', fromEvm);
    console.log('Match (no prefix):        ', recovered1.toLowerCase() === fromEvm.toLowerCase() ? '✅ YES' : '❌ NO');
  } catch(e) {
    console.log('Sign(false) failed:', e.message);
  }
  
  // Sign WITH prefix (true) - TRON prefixed signature 
  try {
    const sigWithPrefix = await tw.trx.sign(hashToSign, undefined, true);
    console.log('\nSign(true) - with TRON prefix:', sigWithPrefix.slice(0, 20) + '...');
    
    const sig2 = sigWithPrefix.startsWith('0x') ? sigWithPrefix.slice(2) : sigWithPrefix;
    const r2 = '0x' + sig2.slice(0, 64);
    const s2 = '0x' + sig2.slice(64, 128);
    let v2 = parseInt(sig2.slice(128, 130), 16);
    if (v2 < 27) v2 += 27;

    // What the TRON-prefixed digest would be
    const tronPrefixedDigest = ethers.keccak256(
      ethers.concat([
        ethers.toUtf8Bytes("\x19TRON Signed Message:\n32"),
        serverDigest
      ])
    );
    console.log('TRON prefixed digest:     ', tronPrefixedDigest);
    
    const recovered2 = ethers.recoverAddress(tronPrefixedDigest, { r: r2, s: s2, v: v2 });
    console.log('Recovered (TRON prefix):  ', recovered2);
    console.log('Expected FROM EVM:        ', fromEvm);
    console.log('Match (TRON prefix):      ', recovered2.toLowerCase() === fromEvm.toLowerCase() ? '✅ YES' : '❌ NO');
  } catch(e) {
    console.log('Sign(true) failed:', e.message);
  }

  console.log('\n=== DIAGNOSTIC COMPLETE ===\n');
}

main().catch(console.error);
