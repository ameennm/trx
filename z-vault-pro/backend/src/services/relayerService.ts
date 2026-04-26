import type { Env } from '../worker-types.js';
import { TronWeb } from 'tronweb';
import { rentEnergy } from './feeeRental.js';

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

  // 1. Estimate energy (Check if proxy exists)
  let energyNeeded = 65000;
  try {
    const contract = await tronWeb.contract().at(relayerContractAddress);
    const proxyHex = await contract.getWalletAddress(message.user).call();
    const proxyAddress = tronWeb.address.fromHex(proxyHex);
    const account = await tronWeb.trx.getAccount(proxyAddress);
    
    if (!account || Object.keys(account).length === 0) {
      console.log(`[Relayer] Proxy for ${message.user} not deployed. Using 131k energy.`);
      energyNeeded = 131000;
    }
  } catch (e) {
    console.warn('[Relayer] Proxy check failed, defaulting to 131k for safety:', e);
    energyNeeded = 131000;
  }

  // 2. MANDATORY Energy Rental
  // This will throw an error if Netts.io/VPS Proxy fails, stopping the broadcast.
  console.log(`[Relayer] Renting ${energyNeeded} energy...`);
  await rentEnergy(env, energyNeeded);
  
  // 3. Broadcast
  let cleanSig = signature.startsWith('0x') ? signature.slice(2) : signature;
  const r = '0x' + cleanSig.slice(0, 64);
  const s = '0x' + cleanSig.slice(64, 128);
  const v = parseInt(cleanSig.slice(128, 130), 16);

  try {
    const contract = await tronWeb.contract().at(relayerContractAddress);
    
    // The fee in the message might be called maxFee or fee based on frontend
    const fee = message.maxFee || message.fee || "1000000";

    const transaction = await contract.executeMetaTransaction(
      message.user,
      message.token,
      message.receiver,
      message.value,
      fee,
      message.deadline,
      v, r, s
    ).send({
      feeLimit: 100_000_000,
      callValue: 0
    });

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

