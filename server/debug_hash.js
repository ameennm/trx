
const { TronWeb } = require('tronweb');
const { ethers } = require('ethers');

// Mock data from user's attempt
const params = {
  from: 'TUFy8Dx2SFSMC9s6PHgC3ZRja4c8myYD94',
  to: 'TJBpgUDZEhyJ3GmgAM8DUdFoPCxfWZPuaX', // Recipient used in log
  sendAmount: 100,
  feeAmount: 4.50, // totalFeeUSDT from UI
  nonce: 0,
  deadline: 1773648684 + 3600, // Roughly matching
  contractAddress: 'TEAc1PSNRXVpmnmC15Q3FsE1J2gHcDTN1m',
  chainId: 3448148188
};

const tronWeb = new TronWeb({ fullHost: 'https://nile.trongrid.io' });
tronWeb.setAddress(params.from);

// Function from relayer.ts
function buildServerHash(p) {
  const DOMAIN_TYPEHASH = ethers.keccak256(ethers.toUtf8Bytes("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"));
  const TRANSFER_TYPEHASH = ethers.keccak256(ethers.toUtf8Bytes("Transfer(address from,address to,uint256 sendAmount,uint256 feeAmount,uint256 nonce,uint256 deadline)"));

  const fromHex = '0x' + tronWeb.address.toHex(p.from).slice(2);
  const toHex = '0x' + tronWeb.address.toHex(p.to).slice(2);
  const contractHex = '0x' + tronWeb.address.toHex(p.contractAddress).slice(2);

  const sendAmountSun = BigInt(p.sendAmount * 1e6);
  const feeAmountSun = BigInt(p.feeAmount * 1e6);

  const structHash = ethers.keccak256(
    ethers.AbiCoder.defaultAbiCoder().encode(
      ['bytes32', 'address', 'address', 'uint256', 'uint256', 'uint256', 'uint256'],
      [TRANSFER_TYPEHASH, fromHex, toHex, sendAmountSun, feeAmountSun, p.nonce, p.deadline]
    )
  );

  const domainSeparator = ethers.keccak256(
    ethers.AbiCoder.defaultAbiCoder().encode(
      ['bytes32', 'bytes32', 'bytes32', 'uint256', 'address'],
      [
        DOMAIN_TYPEHASH,
        ethers.keccak256(ethers.toUtf8Bytes("ZVault-GasStation")),
        ethers.keccak256(ethers.toUtf8Bytes("1")),
        p.chainId,
        contractHex,
      ]
    )
  );

  return ethers.keccak256(ethers.solidityPacked(['string', 'bytes32', 'bytes32'], ['\x19\x01', domainSeparator, structHash]));
}

async function debug() {
  const serverHash = buildServerHash(params);
  console.log('Server Hash:', serverHash);

  const contract = await tronWeb.contract().at(params.contractAddress);
  
  const ds = await contract.getDomainSeparator().call();
  console.log('Contract Domain Separator:', ds);

  const sendAmountSun = BigInt(params.sendAmount * 1e6);
  const feeAmountSun = BigInt(params.feeAmount * 1e6);

  const structHashContract = await contract.getTransferHash(
    params.from,
    params.to,
    sendAmountSun.toString(),
    feeAmountSun.toString(),
    params.nonce,
    params.deadline
  ).call();
  console.log('Contract Struct Hash:', structHashContract);

  // Rebuild full hash in JS to compare
  const fullHashContract = ethers.keccak256(
    ethers.solidityPacked(
      ['string', 'bytes32', 'bytes32'],
      ['\x19\x01', ds, structHashContract]
    )
  );
  console.log('Full Hash (from contract parts):', fullHashContract);

  if (serverHash === fullHashContract) {
    console.log('\n✅ HASH MATCHES! The issue is likely the signature itself.');
  } else {
    console.log('\n❌ HASH MISMATCH! The server and contract are calculating different digests.');
  }
}

debug();
