
const { TronWeb } = require('tronweb');
const { ethers } = require('ethers');

const tronWeb = new TronWeb({ fullHost: 'https://nile.trongrid.io' });

const addr = 'TUFy8Dx2SFSMC9s6PHgC3ZRja4c8myYD94';
const hex21 = tronWeb.address.toHex(addr); // 41...
const hex20 = '0x' + hex21.slice(2);

console.log('21-byte hex:', hex21);
console.log('20-byte hex:', hex20);

const encoded20 = ethers.AbiCoder.defaultAbiCoder().encode(['address'], [hex20]);
console.log('Encoded 20-byte (ethers):', encoded20);

// In Solidity on TRON:
// address a = address(uint160(from));
// abi.encode(a) -> ?

// Let's see what happens if we encode a 21-byte address in ethers
try {
    const encoded21 = ethers.AbiCoder.defaultAbiCoder().encode(['address'], ['0x' + hex21]);
    console.log('Encoded 21-byte (ethers):', encoded21);
} catch (e) {
    console.log('Encoding 21-byte (ethers) failed:', e.message);
}
