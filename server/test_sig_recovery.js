
const { TronWeb } = require('tronweb');
const fs = require('fs');

async function test() {
    const tronWeb = new TronWeb({ 
        fullHost: 'https://nile.trongrid.io',
        privateKey: 'f28e5958114b3f42e93e71e63c113e77c3f666e1e8fb737399c1cdf0f62ebca2'
    });
    
    // Hash to sign
    const hash = '0x' + '11'.repeat(32);
    console.log('Hash:', hash);
    
    // Sign
    const sig = await tronWeb.trx.sign(hash.slice(2), tronWeb.defaultPrivateKey, false);
    console.log('Sig:', sig);
    
    const r = '0x' + sig.slice(0, 64);
    const s = '0x' + sig.slice(64, 128);
    let v = parseInt(sig.slice(128, 130), 16);
    if (v < 27) v += 27;
    console.log('v, r, s:', v, r, s);

    // Deploy a test contract
    const source = `
    pragma solidity ^0.8.0;
    contract Test {
        function verify(bytes32 digest, uint8 v, bytes32 r, bytes32 s) public view returns (address) {
            return ecrecover(digest, v, r, s);
        }
    }
    `;
    // For simplicity, just use a pre-calculated test or assume it works if we match the logic.
    // Actually, I'll check what tronWeb returns as recovered address.
    const recovered = await tronWeb.trx.ecRecover(hash, sig);
    console.log('Recovered (TronWeb):', recovered);
    console.log('Original Address:', tronWeb.defaultAddress.base58);
}
test();
