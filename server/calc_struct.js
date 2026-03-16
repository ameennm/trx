
const { ethers } = require('ethers');

const TRANSFER_TYPEHASH = ethers.keccak256(
    ethers.toUtf8Bytes(
      "Transfer(address from,address to,uint256 sendAmount,uint256 feeAmount,uint256 nonce,uint256 deadline)"
    )
);

const from = "0xfc5b43a64e951d1010fd7c38a6a6b8e612345678"; // Dummy 20-byte
const to = "0xedfe3913b2b9f9f474ef27f0e53cea372aff4b6b";
const sendAmount = 10000000;
const feeAmount = 1000000;
const nonce = 0;
const deadline = 1773671430;

const structHash = ethers.keccak256(
    ethers.AbiCoder.defaultAbiCoder().encode(
      ['bytes32', 'address', 'address', 'uint256', 'uint256', 'uint256', 'uint256'],
      [TRANSFER_TYPEHASH, from, to, sendAmount, feeAmount, nonce, deadline]
    )
);

console.log('Server Struct Hash:', structHash);
