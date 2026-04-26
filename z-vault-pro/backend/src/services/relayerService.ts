import type { Env } from '../worker-types.js';
import { TronWeb } from 'tronweb';
import { rentEnergy } from './feeeRental.js';

const RECEIPT_ATTEMPTS = 10;
const RECEIPT_DELAY_MS = 1500;
const RELAY_FUNCTION =
  'executeMetaTransaction(address,address,address,uint256,uint256,uint256,uint8,bytes32,bytes32)';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function decodeHexMessage(hex?: string): string {
  if (!hex) return '';
  try {
    const bytes = new Uint8Array((hex.match(/.{1,2}/g) || []).map((b) => parseInt(b, 16)));
    return new TextDecoder().decode(bytes).replace(/\0/g, '').trim();
  } catch {
    return hex;
  }
}

function toBase58Address(tronWeb: TronWeb, address: string): string {
  return address.startsWith('T') ? address : tronWeb.address.fromHex(address);
}

async function waitForSuccessfulReceipt(tronWeb: TronWeb, txHash: string): Promise<void> {
  for (let attempt = 1; attempt <= RECEIPT_ATTEMPTS; attempt++) {
    const info = await tronWeb.trx.getTransactionInfo(txHash).catch(() => null) as any;
    const unconfirmedInfo = info && Object.keys(info).length > 0
      ? info
      : await tronWeb.trx.getUnconfirmedTransactionInfo(txHash).catch(() => null) as any;
    const receipt = unconfirmedInfo && Object.keys(unconfirmedInfo).length > 0 ? unconfirmedInfo : null;

    if (receipt) {
      const result = receipt.receipt?.result || receipt.result;
      if (!result || result === 'SUCCESS') return;

      const reason = decodeHexMessage(receipt.resMessage);
      throw new Error(
        `Transaction reverted on-chain (${result})${reason ? `: ${reason}` : ''}. ` +
        `Tx hash: ${txHash}`
      );
    }

    await sleep(RECEIPT_DELAY_MS);
  }

  throw new Error(`Transaction broadcasted but not confirmed yet. Tx hash: ${txHash}`);
}

function decodeBroadcastMessage(tronWeb: TronWeb, message?: string): string {
  if (!message) return 'Transaction broadcast was rejected.';
  try {
    return tronWeb.toUtf8(message);
  } catch {
    return message;
  }
}

function getRelayParameters(message: Record<string, any>, fee: string, v: number, r: string, s: string) {
  return [
    { type: 'address', value: message.user },
    { type: 'address', value: message.token },
    { type: 'address', value: message.receiver },
    { type: 'uint256', value: message.value },
    { type: 'uint256', value: fee },
    { type: 'uint256', value: message.deadline },
    { type: 'uint8', value: v },
    { type: 'bytes32', value: r },
    { type: 'bytes32', value: s },
  ];
}

function assertTypedSignature(
  tronWeb: TronWeb,
  signature: string,
  message: Record<string, any>,
  fee: string,
  relayerContractAddress: string,
  isMainnet: boolean,
): void {
  const domain = {
    name: 'Z-Vault Pro',
    version: '1',
    chainId: isMainnet ? 0x2b6653dc : 0xcd8690dc,
    verifyingContract: relayerContractAddress,
  };
  const types = {
    Transfer: [
      { name: 'token', type: 'address' },
      { name: 'receiver', type: 'address' },
      { name: 'value', type: 'uint256' },
      { name: 'fee', type: 'uint256' },
      { name: 'nonce', type: 'uint256' },
      { name: 'deadline', type: 'uint256' },
    ],
  };
  const value = {
    token: message.token,
    receiver: message.receiver,
    value: message.value,
    fee,
    nonce: message.nonce,
    deadline: message.deadline,
  };

  const ok = (tronWeb.trx as any).verifyTypedData(domain, types, value, signature, message.user);
  if (!ok) {
    throw new Error(
      `Invalid TIP-712 signature for ${message.user}. ` +
      `Lock/unlock the wallet or re-import the private key for this address before retrying.`
    );
  }
}

async function estimateRelayEnergy(
  tronWeb: TronWeb,
  relayerContractAddress: string,
  broadcasterAddress: string,
  parameters: ReturnType<typeof getRelayParameters>,
): Promise<number> {
  const simulateWithConstantCall = async (): Promise<void> => {
    const simulation = await tronWeb.transactionBuilder.triggerConstantContract(
      relayerContractAddress,
      RELAY_FUNCTION,
      {
        feeLimit: 100_000_000,
        callValue: 0,
      },
      parameters,
      broadcasterAddress,
    ) as any;

    if (simulation.result?.result === false) {
      throw new Error(decodeBroadcastMessage(tronWeb, simulation.result.message));
    }
  };

  try {
    const estimate = await tronWeb.transactionBuilder.estimateEnergy(
      relayerContractAddress,
      RELAY_FUNCTION,
      {
        feeLimit: 100_000_000,
        callValue: 0,
      },
      parameters,
      broadcasterAddress,
    ) as any;

    if (estimate.result?.result === false) {
      throw new Error(decodeBroadcastMessage(tronWeb, estimate.result.message));
    }

    const estimated = Number(estimate.energy_required || estimate.energy_used || 0);
    if (!Number.isFinite(estimated) || estimated <= 0) {
      throw new Error(`TRON estimateEnergy returned no usable estimate: ${JSON.stringify(estimate)}`);
    }

    return estimated;
  } catch (error: any) {
    const msg = error?.message || JSON.stringify(error);
    if (msg.toLowerCase().includes('does not support estimate energy')) {
      try {
        await simulateWithConstantCall();
        return 0;
      } catch (simulationError: any) {
        const simulationMsg = simulationError?.message || JSON.stringify(simulationError);
        throw new Error(`Preflight failed before energy rental: ${simulationMsg}`);
      }
    }

    throw new Error(`Preflight failed before energy rental: ${msg}`);
  }
}

export async function submitInternalRelay(
  env: Env,
  signature: string,
  message: Record<string, any>
): Promise<{ txHash: string; providerFee: number }> {
  const isMainnet = env.NETWORK_MODE === 'mainnet';
  const rpcUrl = isMainnet ? env.MAINNET_RPC_URL : 'https://nile.trongrid.io';
  
  const privateKey = env.RELAYER_PRIVATE_KEY;
  if (!privateKey) throw new Error('RELAYER_PRIVATE_KEY is missing');

  const relayerContractAddress = isMainnet 
    ? env.RELAYER_CONTRACT_MAINNET 
    : env.RELAYER_CONTRACT_TESTNET;

  if (!relayerContractAddress || relayerContractAddress.includes('TXYZ_')) {
    throw new Error('Relayer contract address is not configured correctly.');
  }

  // TronWeb instance for estimation and broadcast
  const apiKey = env.TRONGRID_API_KEY || '';
  const tronWeb = new TronWeb({
    fullHost: rpcUrl,
    privateKey,
    headers: apiKey ? { 'TRON-PRO-API-KEY': apiKey } : {},
  });
  const broadcasterAddress = (tronWeb as any).defaultAddress?.base58 as string | undefined;

  if (!broadcasterAddress) {
    throw new Error('Could not derive relayer address from RELAYER_PRIVATE_KEY.');
  }
  if (env.RELAYER_ADDRESS && env.RELAYER_ADDRESS !== broadcasterAddress) {
    throw new Error(
      `RELAYER_ADDRESS (${env.RELAYER_ADDRESS}) does not match RELAYER_PRIVATE_KEY address ` +
      `(${broadcasterAddress}). Refusing to rent energy or broadcast.`
    );
  }

  const fee = message.maxFee || message.fee || "1000000";
  const transferValue = BigInt(message.value || 0);
  const transferFee = BigInt(fee || 0);
  const requiredVaultBalance = transferValue + transferFee;

  // 1. Resolve proxy wallet and check vault balance before renting energy.
  let energyNeeded = 65000;
  let proxyAddress: string;
  const contract = await tronWeb.contract().at(relayerContractAddress);
  const authorizedRelayer = toBase58Address(tronWeb, await contract.authorizedRelayer().call());
  if (authorizedRelayer !== broadcasterAddress) {
    throw new Error(
      `Contract authorizedRelayer (${authorizedRelayer}) does not match broadcaster ` +
      `(${broadcasterAddress}). Refusing to rent energy or broadcast.`
    );
  }

  const proxyHex = await contract.getWalletAddress(message.user).call();
  proxyAddress = toBase58Address(tronWeb, proxyHex);

  const tokenContract = await tronWeb.contract().at(message.token);
  const proxyBalanceRaw = await tokenContract.balanceOf(proxyAddress).call();
  const proxyBalance = BigInt(proxyBalanceRaw.toString());

  if (proxyBalance < requiredVaultBalance) {
    const have = Number(proxyBalance) / 1_000_000;
    const need = Number(requiredVaultBalance) / 1_000_000;
    throw new Error(
      `Gasless vault has insufficient USDT. Vault ${proxyAddress} has ${have.toFixed(6)} USDT, ` +
      `but this transfer needs ${need.toFixed(6)} USDT including the platform fee. ` +
      `Top up the vault before sending.`
    );
  }

  // 2. Prepare signature parameters and estimate fallback energy.
  let cleanSig = signature.startsWith('0x') ? signature.slice(2) : signature;
  const r = '0x' + cleanSig.slice(0, 64);
  const s = '0x' + cleanSig.slice(64, 128);
  const v = parseInt(cleanSig.slice(128, 130), 16);
  const relayParameters = getRelayParameters(message, fee, v, r, s);

  assertTypedSignature(tronWeb, signature, message, fee, relayerContractAddress, isMainnet);

  // 3. Estimate energy. If the proxy account is not deployed yet, deployment costs more.
  try {
    const account = await tronWeb.trx.getAccount(proxyAddress);
    
    if (!account || Object.keys(account).length === 0) {
      console.log(`[Relayer] Proxy for ${message.user} not deployed. Using 131k energy.`);
      energyNeeded = 131000;
    }
  } catch (e) {
    console.warn('[Relayer] Proxy account check failed, defaulting to 131k for safety:', e);
    energyNeeded = 131000;
  }

  // 4. No-cost preflight before any paid Netts rental.
  // This catches bad signatures, wrong nonce, wrong contract state, and transfer reverts
  // before spending Netts balance or relayer TRX.
  const estimatedEnergy = await estimateRelayEnergy(
    tronWeb,
    relayerContractAddress,
    broadcasterAddress,
    relayParameters,
  );
  if (estimatedEnergy > 0) {
    energyNeeded = Math.max(energyNeeded, Math.ceil(estimatedEnergy * 1.2), 65000);
  }

  // 5. MANDATORY Energy Rental
  // This will throw an error if Netts.io/VPS Proxy fails, stopping the broadcast.
  console.log(`[Relayer] Renting ${energyNeeded} energy...`);
  await rentEnergy(env, energyNeeded, broadcasterAddress);
  
  // 6. Broadcast only after preflight and mandatory energy rental succeeded.
  try {
    const trigger = await tronWeb.transactionBuilder.triggerSmartContract(
      relayerContractAddress,
      RELAY_FUNCTION,
      {
      feeLimit: 100_000_000,
      callValue: 0
      },
      relayParameters,
      broadcasterAddress,
    ) as any;

    if (!trigger.result?.result || !trigger.transaction) {
      throw new Error(`Failed to build relayer transaction: ${JSON.stringify(trigger)}`);
    }

    const signedTransaction = await tronWeb.trx.sign(trigger.transaction, privateKey);
    const broadcast = await tronWeb.trx.sendRawTransaction(signedTransaction) as any;

    if (!broadcast.result) {
      throw new Error(
        `Transaction broadcast rejected: ${decodeBroadcastMessage(tronWeb, broadcast.message)}`
      );
    }

    const transaction = signedTransaction.txID;

    await waitForSuccessfulReceipt(tronWeb, String(transaction));

    return {
      txHash: transaction,
      providerFee: 1.0 // We take 1 USDT fee
    };
  } catch (error: any) {
    console.error('[Relayer] Broadcast failed:', error);
    const errMsg = error?.message || JSON.stringify(error);
    
    if (errMsg.includes('REVERT')) {
      throw new Error(`Contract reverted: ${errMsg}. Make sure the PROXY WALLET has enough USDT to cover both the transfer and the 1 USDT fee.`);
    }
    throw new Error(`Broadcast failed: ${errMsg}`);
  }
}
