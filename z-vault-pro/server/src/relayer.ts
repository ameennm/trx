import { TronWeb as TronWebClass } from 'tronweb';
import { ethers } from 'ethers';
import { config } from './config';
import { calculateTotalDeduction, usdtToSun, FeeBreakdown } from './feeCalc';

// GasStation ABI (only the functions we need)
const GAS_STATION_ABI = require('./contractData.json').abi;

// TRC20 USDT ABI (subset)
const USDT_ABI = [
  {
    "inputs": [{ "name": "_owner", "type": "address" }, { "name": "_spender", "type": "address" }],
    "name": "allowance",
    "outputs": [{ "name": "remaining", "type": "uint256" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [{ "name": "_owner", "type": "address" }],
    "name": "balanceOf",
    "outputs": [{ "name": "balance", "type": "uint256" }],
    "stateMutability": "view",
    "type": "function"
  }
];

/**
 * Initialize TronWeb with the relayer's private key.
 */
export function getRelayerTronWeb(): any {
  if (!config.relayerPrivateKey) {
    throw new Error('RELAYER_PRIVATE_KEY is not set in environment.');
  }

  try {
    // In Node environments with TronWeb v6, the class might be on .TronWeb or the default export
    let TronWebConstructor: any = TronWebClass;
    
    if (typeof TronWebConstructor !== 'function') {
      const tw = require('tronweb');
      TronWebConstructor = tw.TronWeb || tw.default || tw;
    }
    
    if (typeof TronWebConstructor !== 'function') {
      throw new Error('Could not find TronWeb constructor in the required module.');
    }

    return new TronWebConstructor({
      fullHost: config.rpcUrl,
      privateKey: config.relayerPrivateKey,
    });
  } catch (error: any) {
    console.error('Failed to initialize relayer TronWeb:', error.message);
    throw error;
  }
}

/**
 * Get the current nonce for a user address from the GasStation contract.
 */
export async function getUserNonce(userAddress: string): Promise<number> {
  const tronWeb = getRelayerTronWeb();
  const userHex = tronWeb.address.toHex(userAddress.trim());
  const contract = await tronWeb.contract(GAS_STATION_ABI, config.gasStationContract);
  const nonce = await contract.methods.nonces(userHex).call();
  return Number(nonce);
}

/**
 * Get the user's USDT balance.
 */
export async function getUsdtBalance(userAddress: string): Promise<number> {
  const tronWeb = getRelayerTronWeb();
  const userHex = tronWeb.address.toHex(userAddress.trim());
  const contract = await tronWeb.contract(USDT_ABI, config.usdtContract);
  const balance = await contract.methods.balanceOf(userHex).call();
  return Number(balance) / 10 ** config.usdtDecimals;
}

/**
 * Check if the user has approved the GasStation to spend enough USDT.
 */
export async function checkAllowance(userAddress: string, requiredAmount: number): Promise<{
  sufficient: boolean;
  currentAllowance: number;
  required: number;
}> {
  const tronWeb = getRelayerTronWeb();
  const userHex = tronWeb.address.toHex(userAddress.trim());
  const gsHex = tronWeb.address.toHex(config.gasStationContract);
  
  const contract = await tronWeb.contract(USDT_ABI, config.usdtContract);
  const allowance = await contract.methods.allowance(userHex, gsHex).call();
  const allowanceUsdt = Number(allowance) / 10 ** config.usdtDecimals;

  return {
    sufficient: allowanceUsdt >= requiredAmount,
    currentAllowance: allowanceUsdt,
    required: requiredAmount,
  };
}

/**
 * Get a fee quote for a proposed transfer.
 */
export async function getQuote(
  fromAddress: string,
  toAddress: string,
  sendAmount: number
): Promise<{
  fee: FeeBreakdown;
  nonce: number;
  allowanceSufficient: boolean;
  balanceSufficient: boolean;
  userBalance: number;
}> {
  const from = fromAddress.trim();
  const to = toAddress.trim();
 
  // Calculate fees (pass sender for advance recovery)
  const fee = await calculateTotalDeduction(sendAmount, to, from);
 
  // Check user's balance and allowance
  let nonce = 0;
  let allowanceSufficient = false;
  let balanceSufficient = false;
  let userBalance = 0;
 
  try {
    // Sequential calls for better error debugging
    nonce = await getUserNonce(from);
    userBalance = await getUsdtBalance(from);
    
    const allowanceCheck = await checkAllowance(from, fee.totalDeduction);
    allowanceSufficient = allowanceCheck.sufficient;
    
    balanceSufficient = userBalance >= fee.totalDeduction;
  } catch (err) {
    console.error('Blockchain Query Error:', (err as Error).message);
    // If balance check fails, we still want to return a quote but mark as insufficient
  }

  return {
    fee,
    nonce,
    allowanceSufficient,
    balanceSufficient,
    userBalance,
  };
}

/**
 * Build the EIP-712 typed data hash that the user must sign.
 */
export async function buildTypedDataHash(params: {
  from: string;
  to: string;
  sendAmount: number;
  feeAmount: number;
  nonce: number;
  deadline: number;
  contractAddress: string;
  chainId: number;
}): Promise<string> {
  const tronWeb = getRelayerTronWeb();
  
  const sendAmountSun = usdtToSun(params.sendAmount);
  const feeAmountSun = usdtToSun(params.feeAmount);

  // PRIMARY: Fetch the digest directly from the contract
  // This guarantees bit-perfect alignment with what the contract verifies
  try {
    const contract = await tronWeb.contract(GAS_STATION_ABI, params.contractAddress);
    const digest = await contract.getTransferDigest(
      params.from.trim(),
      params.to.trim(),
      sendAmountSun.toString(),
      feeAmountSun.toString(),
      params.deadline
    ).call();
    
    console.log('--- EIP-712 Debug (Contract-Sourced) ---');
    console.log('from:             ', params.from);
    console.log('to:               ', params.to);
    console.log('sendAmount (sun): ', sendAmountSun.toString());
    console.log('feeAmount (sun):  ', feeAmountSun.toString());
    console.log('nonce:            ', params.nonce);
    console.log('deadline:         ', params.deadline);
    console.log('finalDigest:      ', digest);
    console.log('------------------------------');
    
    return digest;
  } catch (e) {
    console.error('Failed to fetch digest from contract:', (e as any).message);
    console.error('Falling back to local calculation (WARNING: may not match!)');
  }

  // FALLBACK: Local calculation (should rarely be used)
  const TRANSFER_TYPEHASH = ethers.keccak256(
    ethers.toUtf8Bytes(
      "Transfer(address from,address to,uint256 sendAmount,uint256 feeAmount,uint256 nonce,uint256 deadline)"
    )
  );

  let fromHex, toHex;
  try {
    fromHex = '0x' + tronWeb.address.toHex(params.from.trim()).slice(2);
    toHex = '0x' + tronWeb.address.toHex(params.to.trim()).slice(2);
  } catch (e) {
    throw new Error('Invalid address provided to buildTypedDataHash');
  }

  const structHash = ethers.keccak256(
    ethers.AbiCoder.defaultAbiCoder().encode(
      ['bytes32', 'address', 'address', 'uint256', 'uint256', 'uint256', 'uint256'],
      [TRANSFER_TYPEHASH, fromHex, toHex, sendAmountSun, feeAmountSun, params.nonce, params.deadline]
    )
  );

  // Fetch DOMAIN_SEPARATOR from the contract
  let domainSeparator;
  try {
    const contract = await tronWeb.contract(GAS_STATION_ABI, params.contractAddress);
    domainSeparator = await contract.DOMAIN_SEPARATOR().call();
  } catch (e) {
    const DOMAIN_TYPEHASH = ethers.keccak256(
      ethers.toUtf8Bytes(
        "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"
      )
    );
    const contractHex = '0x' + tronWeb.address.toHex(params.contractAddress.trim()).slice(2);
    domainSeparator = ethers.keccak256(
      ethers.AbiCoder.defaultAbiCoder().encode(
        ['bytes32', 'bytes32', 'bytes32', 'uint256', 'address'],
        [
          DOMAIN_TYPEHASH,
          ethers.keccak256(ethers.toUtf8Bytes("Crypxe-GasStation")),
          ethers.keccak256(ethers.toUtf8Bytes("1")),
          params.chainId,
          contractHex,
        ]
      )
    );
  }

  const digest = ethers.keccak256(
    ethers.concat(['0x1901', domainSeparator, structHash])
  );

  console.log('--- EIP-712 Debug (Fallback) ---');
  console.log('finalDigest:      ', digest);
  console.log('------------------------------');

  return digest;
}

/**
 * Relay a signed meta-transaction to the GasStation contract.
 * The relayer pays the TRX gas.
 */
export async function relayTransaction(params: {
  from: string;
  to: string;
  sendAmount: number;
  feeAmount: number;
  deadline: number;
  v: number;
  r: string;
  s: string;
}): Promise<{ txHash: string; success: boolean; message: string }> {
  try {
    const tronWeb = getRelayerTronWeb();
    const contract = await tronWeb.contract(GAS_STATION_ABI, config.gasStationContract);

    const sendAmountSun = usdtToSun(params.sendAmount);
    const feeAmountSun = usdtToSun(params.feeAmount);

    const fromHex = tronWeb.address.toHex(params.from.trim());
    const toHex = tronWeb.address.toHex(params.to.trim());

    // Execute the transfer through the GasStation contract
    // The relayer (our configured account) pays the TRX gas
    const tx = await contract.methods.executeTransfer(
      fromHex,
      toHex,
      sendAmountSun.toString(),
      feeAmountSun.toString(),
      params.deadline,
      params.v,
      params.r,
      params.s
    ).send({
      feeLimit: 150_000_000, // 150 TRX max fee limit
      shouldPollResponse: false,
    });

    return {
      txHash: tx,
      success: true,
      message: 'Transaction submitted successfully',
    };
  } catch (error: any) {
    console.error('Relay error:', error);
    return {
      txHash: '',
      success: false,
      message: error.message || 'Transaction failed',
    };
  }
}

/**
 * Get the relayer's TRX balance.
 */
export async function getRelayerBalance(): Promise<{ trx: number; address: string }> {
  const tronWeb = getRelayerTronWeb();
  const address = tronWeb.defaultAddress.base58;
  const balance = await tronWeb.trx.getBalance(address);
  return {
    trx: balance / 1_000_000, // Convert sun to TRX
    address,
  };
}
