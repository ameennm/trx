
const { ethers } = require('ethers');

const domainSeparator = ethers.keccak256(ethers.toUtf8Bytes('ds'));
const structHash = ethers.keccak256(ethers.toUtf8Bytes('sh'));

const digestString = ethers.keccak256(
    ethers.solidityPacked(
      ['string', 'bytes32', 'bytes32'],
      ['\x19\x01', domainSeparator, structHash]
    )
);

const digestBytes = ethers.keccak256(
    ethers.solidityPacked(
      ['bytes', 'bytes32', 'bytes32'],
      ['0x1901', domainSeparator, structHash]
    )
);

const digestConcat = ethers.keccak256(
    ethers.concat([
      '0x1901',
      domainSeparator,
      structHash
    ])
);

console.log('Digest String:', digestString);
console.log('Digest Bytes:', digestBytes);
console.log('Digest Concat:', digestConcat);

// What about hex string directly?
const digestHex = ethers.keccak256(
    ethers.solidityPacked(
      ['string', 'bytes32', 'bytes32'],
      ['\x19\x01', domainSeparator, structHash]
    )
);
