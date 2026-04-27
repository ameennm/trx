import { z } from 'zod';
import { appConfig } from '../config.js';
import { logEvent } from '../lib/logger.js';
import { computeTronVaultAddress, deriveRelayerAddress, normalizeTronAddress, relayerAbi, tronWeb } from '../lib/tron.js';
import { createRelayRequest, getRelayRequestByIdempotencyKey, insertRelayEvent, updateRelayRequest } from './repository.js';
import { rentEnergy } from './nettsService.js';

const requestSchema = z.object({
  idempotencyKey: z.string().min(8),
  correlationId: z.string().min(8),
  userAddress: z.string().regex(/^T[1-9A-HJ-NP-Za-km-z]{33}$/),
  recipient: z.string().regex(/^T[1-9A-HJ-NP-Za-km-z]{33}$/),
  amountUsdt: z.string(),
  signature: z.string().min(130),
  message: z.object({
    token: z.string(),
    receiver: z.string(),
    value: z.string(),
    fee: z.string(),
    nonce: z.string(),
    deadline: z.string()
  })
});

const relayFunction = 'executeMetaTransaction(address,address,address,uint256,uint256,uint256,uint8,bytes32,bytes32)';
const SWEEP_VALUE = (2n ** 256n) - 1n;

function parseSignature(signature: string) {
  const clean = signature.replace(/^0x/, '');
  const r = `0x${clean.slice(0, 64)}`;
  const s = `0x${clean.slice(64, 128)}`;
  const v = parseInt(clean.slice(128, 130), 16);
  return { r, s, v };
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toSunAmount(amountUsdt: string) {
  if (!/^\d+(\.\d{1,6})?$/.test(amountUsdt)) {
    throw new Error('Amount must be a positive USDT value with up to 6 decimals');
  }

  const [whole, fraction = ''] = amountUsdt.split('.');
  return `${BigInt(whole) * 1_000_000n + BigInt(fraction.padEnd(6, '0'))}`;
}

function usdtToSunNumber(amountUsdt: number) {
  return BigInt(Math.round(amountUsdt * 1_000_000));
}

function trxToSunNumber(amountTrx: number) {
  return BigInt(Math.round(amountTrx * 1_000_000));
}

async function ensureRelayerTrxBuffer() {
  const balanceSun = BigInt(await tronWeb.trx.getBalance(appConfig.RELAYER_ADDRESS));
  const requiredSun = trxToSunNumber(appConfig.RELAYER_TRX_BUFFER);

  if (balanceSun < requiredSun) {
    throw new Error(
      `Relayer TRX buffer too low: ${Number(balanceSun) / 1_000_000} TRX available, ${appConfig.RELAYER_TRX_BUFFER} TRX required`
    );
  }
}

async function waitForReceipt(txHash: string) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const info = await tronWeb.trx.getTransactionInfo(txHash).catch(() => null) as any;
    if (info && Object.keys(info).length > 0) {
      const result = info.receipt?.result || info.result;
      if (!result || result === 'SUCCESS') {
        return info;
      }
      throw new Error(`On-chain execution reverted: ${result}`);
    }
    await sleep(2000);
  }
  throw new Error(`Broadcast accepted but no confirmed receipt yet for ${txHash}`);
}

async function preflightConstantCall(params: {
  relayerContract: string;
  broadcasterAddress: string;
  parameters: Array<{ type: string; value: string | number }>;
}) {
  const simulation = await tronWeb.transactionBuilder.triggerConstantContract(
    params.relayerContract,
    relayFunction,
    {
      feeLimit: 100_000_000,
      callValue: 0
    },
    params.parameters,
    params.broadcasterAddress
  ) as any;

  if (simulation.result?.result === false) {
    throw new Error(simulation.result.message ? tronWeb.toUtf8(simulation.result.message) : 'REVERT opcode executed');
  }
  return simulation;
}

async function getRelayerContract() {
  return tronWeb.contract(relayerAbi as any, appConfig.RELAYER_CONTRACT);
}

async function getWalletImplementationAddress(relayerContract: any): Promise<string> {
  return normalizeTronAddress(await relayerContract.walletImplementation().call());
}

async function getVaultInfo(userAddress: string) {
  const relayerContract = await getRelayerContract();
  const walletImplementation = await getWalletImplementationAddress(relayerContract);
  const calculatedVault = computeTronVaultAddress(appConfig.RELAYER_CONTRACT, walletImplementation, userAddress);
  const contractVault = normalizeTronAddress(await relayerContract.getWalletAddress(userAddress).call());

  if (calculatedVault !== contractVault) {
    throw new Error(`Vault address mismatch: backend ${calculatedVault}, contract ${contractVault}`);
  }

  const tokenContract = await tronWeb.contract().at(appConfig.USDT_CONTRACT);
  const balanceSun = (await tokenContract.balanceOf(contractVault).call()).toString();
  const account = await tronWeb.trx.getAccount(contractVault).catch(() => ({}));
  const deployed = Boolean(account && Object.keys(account).length > 0);
  const nonce = (await relayerContract.nonces(userAddress).call()).toString();

  return {
    walletImplementation,
    vaultAddress: contractVault,
    balanceSun,
    deployed,
    nonce
  };
}

export async function getVaultStatus(userAddress: string) {
  return getVaultInfo(userAddress);
}

export async function submitRelay(rawInput: unknown) {
  const input = requestSchema.parse(rawInput);
  const duplicate = getRelayRequestByIdempotencyKey(input.idempotencyKey);
  if (duplicate) {
    return {
      requestId: duplicate.id,
      status: duplicate.status,
      txHash: duplicate.tx_hash ?? null,
      duplicate: true
    };
  }

  const derivedRelayer = deriveRelayerAddress();
  if (derivedRelayer !== appConfig.RELAYER_ADDRESS) {
    throw new Error(`RELAYER_ADDRESS mismatch: configured ${appConfig.RELAYER_ADDRESS}, derived ${derivedRelayer}`);
  }

  const relayerContract = await getRelayerContract();
  const authorizedRelayer = normalizeTronAddress(await relayerContract.authorizedRelayer().call());
  if (authorizedRelayer !== appConfig.RELAYER_ADDRESS) {
    throw new Error(`authorizedRelayer mismatch: contract ${authorizedRelayer}, backend ${appConfig.RELAYER_ADDRESS}`);
  }

  const allowedToken = normalizeTronAddress(await relayerContract.allowedToken().call());
  if (allowedToken !== appConfig.USDT_CONTRACT) {
    throw new Error(`allowedToken mismatch: contract ${allowedToken}, backend ${appConfig.USDT_CONTRACT}`);
  }

  const contractMaxFee = BigInt((await relayerContract.maxFee().call()).toString());
  if (BigInt(input.message.fee) > contractMaxFee) {
    throw new Error(`Requested fee exceeds contract maxFee`);
  }

  if (input.message.token !== appConfig.USDT_CONTRACT) {
    throw new Error(`Token mismatch: expected ${appConfig.USDT_CONTRACT}`);
  }

  if (input.message.receiver !== input.recipient) {
    throw new Error('Recipient mismatch between request and signed message');
  }

  if (input.message.value !== toSunAmount(input.amountUsdt)) {
    throw new Error('Amount mismatch between request and signed message');
  }

  const vault = await getVaultInfo(input.userAddress);
  const vaultAddress = vault.vaultAddress;

  if (input.recipient === vaultAddress) {
    throw new Error('Recipient cannot be the same as the Gasless Vault address');
  }

  if (input.message.nonce !== vault.nonce) {
    throw new Error(`Stale nonce: expected ${vault.nonce}, received ${input.message.nonce}`);
  }

  const expectedFee = vault.deployed
    ? usdtToSunNumber(appConfig.PLATFORM_FEE_USDT)
    : usdtToSunNumber(appConfig.FIRST_SEND_FEE_USDT);

  if (BigInt(input.message.fee) !== expectedFee) {
    throw new Error(`Incorrect platform fee: expected ${expectedFee.toString()}, received ${input.message.fee}`);
  }

  const requestId = createRelayRequest({
    idempotencyKey: input.idempotencyKey,
    correlationId: input.correlationId,
    userAddress: input.userAddress,
    recipient: input.recipient,
    amountSun: input.message.value,
    feeSun: input.message.fee,
    vaultAddress
  });

  insertRelayEvent(requestId, 'relay_attempt', {
    correlationId: input.correlationId,
    userAddress: input.userAddress,
    recipient: input.recipient,
    vaultAddress
  });

  logEvent('relay_attempt', {
    requestId,
    correlationId: input.correlationId,
    userAddress: input.userAddress,
    recipient: input.recipient,
    vaultAddress
  });

  try {
    const signingAddress = tronWeb.trx.verifyTypedData(
      {
        name: 'Z-Vault Pro',
        version: '2',
        chainId: appConfig.NETWORK === 'mainnet' ? 0x2b6653dc : 0xcd8690dc,
        verifyingContract: appConfig.RELAYER_CONTRACT
      },
      {
        Transfer: [
          { name: 'token', type: 'address' },
          { name: 'receiver', type: 'address' },
          { name: 'value', type: 'uint256' },
          { name: 'fee', type: 'uint256' },
          { name: 'nonce', type: 'uint256' },
          { name: 'deadline', type: 'uint256' }
        ]
      },
      {
        token: input.message.token,
        receiver: input.message.receiver,
        value: input.message.value,
        fee: input.message.fee,
        nonce: input.message.nonce,
        deadline: input.message.deadline
      },
      input.signature,
      input.userAddress
    );

    if (!signingAddress) {
      throw new Error('Invalid typed signature');
    }

    const vaultBalance = BigInt(vault.balanceSun);
    const requestedValue = BigInt(input.message.value);
    const requestedFee = BigInt(input.message.fee);
    if (requestedValue === SWEEP_VALUE) {
      if (vaultBalance <= requestedFee) {
        throw new Error(`Vault ${vaultAddress} has insufficient USDT for sweep plus fee`);
      }
    } else {
      const requiredBalance = requestedValue + requestedFee;
      if (vaultBalance < requiredBalance) {
        throw new Error(`Vault ${vaultAddress} has insufficient USDT for transfer plus fee`);
      }
    }

    const { r, s, v } = parseSignature(input.signature);
    const parameters = [
      { type: 'address', value: input.userAddress },
      { type: 'address', value: input.message.token },
      { type: 'address', value: input.message.receiver },
      { type: 'uint256', value: input.message.value },
      { type: 'uint256', value: input.message.fee },
      { type: 'uint256', value: input.message.deadline },
      { type: 'uint8', value: v },
      { type: 'bytes32', value: r },
      { type: 'bytes32', value: s }
    ];

    let energyTarget = 65000;
    const vaultDeployed = vault.deployed;
    if (!vaultDeployed) {
      energyTarget = 131000;
    }

    try {
      const estimate = await preflightConstantCall({
        relayerContract: appConfig.RELAYER_CONTRACT,
        broadcasterAddress: appConfig.RELAYER_ADDRESS,
        parameters
      });
      const estimated = Number(estimate.energy_used || 0);
      if (estimated > 0) {
        energyTarget = Math.max(energyTarget, Math.ceil(estimated * 1.2));
      }
    } catch (error: any) {
      if (vaultDeployed) {
        throw error;
      }
      insertRelayEvent(requestId, 'relay_preflight_fallback', { message: String(error?.message || error) });
    }

    await ensureRelayerTrxBuffer();

    const rentResult = await rentEnergy({
      recipientAddress: appConfig.RELAYER_ADDRESS,
      amount: energyTarget,
      correlationId: input.correlationId
    });
    updateRelayRequest(requestId, 'energy_rented');
    insertRelayEvent(requestId, 'relay_energy_rented', { rentResult, energyTarget });

    const trigger = await tronWeb.transactionBuilder.triggerSmartContract(
      appConfig.RELAYER_CONTRACT,
      relayFunction,
      {
        feeLimit: 100_000_000,
        callValue: 0
      },
      parameters,
      appConfig.RELAYER_ADDRESS
    ) as any;

    if (!trigger.result?.result || !trigger.transaction) {
      throw new Error(`Failed to build relay transaction`);
    }

    const signed = await tronWeb.trx.sign(trigger.transaction, appConfig.RELAYER_PRIVATE_KEY);
    const broadcast = await tronWeb.trx.sendRawTransaction(signed) as any;
    if (!broadcast.result) {
      updateRelayRequest(requestId, 'broadcast_rejected', {
        errorMessage: broadcast.message ? tronWeb.toUtf8(broadcast.message) : 'broadcast rejected'
      });
      throw new Error(broadcast.message ? tronWeb.toUtf8(broadcast.message) : 'broadcast rejected');
    }

    const txHash = signed.txID as string;
    const receipt = await waitForReceipt(txHash);
    updateRelayRequest(requestId, 'confirmed', { txHash });
    insertRelayEvent(requestId, 'relay_confirmed', { txHash, receipt });

    return {
      requestId,
      txHash,
      status: 'confirmed',
      duplicate: false
    };
  } catch (error: any) {
    const message = String(error?.message || error);
    updateRelayRequest(requestId, 'preflight_failed', { errorMessage: message });
    insertRelayEvent(requestId, 'relay_preflight_failed', { message });
    throw error;
  }
}
