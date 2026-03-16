
const { ethers } = require('ethers');

const DOMAIN_TYPEHASH = ethers.keccak256(
    ethers.toUtf8Bytes(
      "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"
    )
);

const nameHash = ethers.keccak256(ethers.toUtf8Bytes("ZVault-GasStation"));
const versionHash = ethers.keccak256(ethers.toUtf8Bytes("1"));
const chainId = 3448148188;
const contractAddress = "0xedfe3913b2b9f9f474ef27f0e53cea372aff4b6b"; 

const domainSeparator = ethers.keccak256(
    ethers.AbiCoder.defaultAbiCoder().encode(
      ['bytes32', 'bytes32', 'bytes32', 'uint256', 'address'],
      [DOMAIN_TYPEHASH, nameHash, versionHash, chainId, contractAddress]
    )
);

console.log('Server Domain Separator:', domainSeparator);
