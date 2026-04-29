import { z } from 'zod';
import { appConfig } from '../config.js';
import { logEvent } from '../lib/logger.js';
import { computeTronVaultAddress, deriveRelayerAddress, normalizeTronAddress, relayerAbi, tronWeb } from '../lib/tron.js';
import {
  createRelayRequest,
  getRelayRequestByIdempotencyKey,
  insertRelayEvent,
  listBroadcastedHistory,
  listHistory,
  updateRelayRequest
} from './repository.js';
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

function decodeRevertReason(hex?: string) {
  if (!hex || !hex.startsWith('08c379a0')) {
    return null;
  }

  try {
    const reasonHex = hex.slice(8 + 64 + 64);
    const reasonLength = Number.parseInt(reasonHex.slice(0, 64), 16);
    const reasonData = reasonHex.slice(64, 64 + reasonLength * 2);
    return tronWeb.toUtf8(`0x${reasonData}`);
  } catch {
    return null;
  }
}

function summarizeReceipt(info: any) {
  const contractResult = Array.isArray(info?.contractResult) ? info.contractResult[0] : undefined;
  const revertReason = decodeRevertReason(contractResult);
  const result = info?.receipt?.result || info?.result || 'UNKNOWN';

  return {
    result,
    revertReason,
    energyUsageTotal: info?.receipt?.energy_usage_total ?? info?.receipt?.energy_usage,
    energyPenaltyTotal: info?.receipt?.energy_penalty_total,
    netFee: info?.receipt?.net_fee,
    fee: info?.fee,
    contractResult
  };
}

async function withTimeout<T>(operation: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
      })
    ]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
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

async function waitForReceipt(txHash: string, attempts = 20) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const info = await tronWeb.trx.getTransactionInfo(txHash).catch(() => null) as any;
    if (info && Object.keys(info).length > 0) {
      const result = info.receipt?.result || info.result;
      if (!result || result === 'SUCCESS') {
        return info;
      }
      const summary = summarizeReceipt(info);
      const reason = summary.revertReason ? `: ${summary.revertReason}` : '';
      const error = new Error(`On-chain execution reverted: ${result}${reason}`);
      (error as any).receiptSummary = summary;
      throw error;
    }
    await sleep(2000);
  }
  return null;
}

async function reconcileBroadcastedRequest(row: { id: string; tx_hash: string | null }) {
  if (!row.tx_hash) {
    return;
  }

  const info = await tronWeb.trx.getTransactionInfo(row.tx_hash).catch(() => null) as any;
  if (!info || Object.keys(info).length === 0) {
    return;
  }

  const result = info.receipt?.result || info.result;
  if (!result || result === 'SUCCESS') {
    updateRelayRequest(row.id, 'confirmed', { txHash: row.tx_hash });
    insertRelayEvent(row.id, 'relay_confirmed_late', { txHash: row.tx_hash, receipt: info });
    return;
  }

  const summary = summarizeReceipt(info);
  const reason = summary.revertReason ? `: ${summary.revertReason}` : '';
  updateRelayRequest(row.id, 'reverted', {
    txHash: row.tx_hash,
    errorMessage: `On-chain execution reverted: ${result}${reason}`
  });
  insertRelayEvent(row.id, 'relay_reverted_late', {
    failureStatus: 'reverted',
    txHash: row.tx_hash,
    revertReason: summary.revertReason,
    receiptSummary: summary,
    receipt: info
  });
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

function isKnownExecutionFailure(message: string) {
  const normalized = message.toLowerCase();
  return [
    'token transfer returned false',
    'token transfer reverted',
    'recipient amount mismatch',
    'fee amount mismatch',
    'withdraw amount mismatch',
    'insufficient',
    'fee too high',
    'token not allowed',
    'invalid signature',
    'expired'
  ].some((needle) => normalized.includes(needle));
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

export async function getRelayHistory(userAddress: string) {
  const pending = listBroadcastedHistory(userAddress);
  await Promise.all(pending.map((row) => reconcileBroadcastedRequest(row)));
  return listHistory(userAddress).map((row) => {
    let details: Record<string, unknown> | null = null;
    if (row.diagnostics_json) {
      try {
        details = JSON.parse(row.diagnostics_json);
      } catch {
        details = null;
      }
    }

    const { diagnostics_json: _diagnosticsJson, ...safeRow } = row;
    return {
      ...safeRow,
      details
    };
  });
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

  let failureStatus: 'preflight_failed' | 'broadcast_rejected' | 'reverted' = 'preflight_failed';
  const diagnostics: Record<string, unknown> = {
    vaultAddress,
    actualBalance: vault.balanceSun,
    amountSun: input.message.value,
    feeSun: input.message.fee
  };

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
      diagnostics.requiredBalance = requestedFee.toString();
      if (vaultBalance <= requestedFee) {
        throw new Error(`Vault ${vaultAddress} has insufficient USDT for sweep plus fee`);
      }
    } else {
      const requiredBalance = requestedValue + requestedFee;
      diagnostics.requiredBalance = requiredBalance.toString();
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

    let energyTarget = appConfig.ENERGY_STANDARD_TRANSFER;
    const vaultDeployed = vault.deployed;
    if (!vaultDeployed) {
      energyTarget = appConfig.ENERGY_FIRST_TRANSFER;
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
      const message = String(error?.message || error);
      if (isKnownExecutionFailure(message)) {
        throw error;
      }
      if (vaultDeployed) {
        throw error;
      }
      insertRelayEvent(requestId, 'relay_preflight_fallback', { message });
    }
    diagnostics.energyTarget = energyTarget;

    await ensureRelayerTrxBuffer();

    const rentResult = await rentEnergy({
      recipientAddress: appConfig.RELAYER_ADDRESS,
      amount: energyTarget,
      correlationId: input.correlationId
    });
    logEvent('relay_energy_rented', { requestId, correlationId: input.correlationId, energyTarget, rentResult });
    updateRelayRequest(requestId, 'energy_rented');
    insertRelayEvent(requestId, 'relay_energy_rented', { rentResult, energyTarget });
    failureStatus = 'broadcast_rejected';

    // Netts usually delivers instantly, but first-time/activation orders can take a few seconds
    // to become visible to the next TronGrid resource check.
    await sleep(6000);

    const trigger = await withTimeout<any>(
      tronWeb.transactionBuilder.triggerSmartContract(
        appConfig.RELAYER_CONTRACT,
        relayFunction,
        {
          feeLimit: 100_000_000,
          callValue: 0
        },
        parameters,
        appConfig.RELAYER_ADDRESS
      ) as Promise<any>,
      25_000,
      'Relay transaction build'
    );

    if (!trigger.result?.result || !trigger.transaction) {
      throw new Error(`Failed to build relay transaction`);
    }

    const signed = await withTimeout(
      tronWeb.trx.sign(trigger.transaction, appConfig.RELAYER_PRIVATE_KEY),
      10_000,
      'Relay transaction signing'
    );
    const broadcast = await withTimeout(
      tronWeb.trx.sendRawTransaction(signed),
      25_000,
      'Relay transaction broadcast'
    ) as any;
    if (!broadcast.result) {
      updateRelayRequest(requestId, 'broadcast_rejected', {
        errorMessage: broadcast.message ? tronWeb.toUtf8(broadcast.message) : 'broadcast rejected'
      });
      throw new Error(broadcast.message ? tronWeb.toUtf8(broadcast.message) : 'broadcast rejected');
    }

    const txHash = signed.txID as string;
    diagnostics.txHash = txHash;
    failureStatus = 'reverted';
    updateRelayRequest(requestId, 'broadcasted', { txHash });
    insertRelayEvent(requestId, 'relay_broadcasted', { txHash, broadcast });
    logEvent('relay_broadcasted', { requestId, correlationId: input.correlationId, txHash });

    const receipt = await waitForReceipt(txHash);
    if (!receipt) {
      insertRelayEvent(requestId, 'relay_confirmation_pending', { txHash });
      return {
        requestId,
        txHash,
        status: 'broadcasted',
        duplicate: false
      };
    }

    updateRelayRequest(requestId, 'confirmed', { txHash });
    insertRelayEvent(requestId, 'relay_confirmed', { txHash, receipt });
    logEvent('relay_confirmed', { requestId, correlationId: input.correlationId, txHash });

    return {
      requestId,
      txHash,
      status: 'confirmed',
      duplicate: false
    };
  } catch (error: any) {
    const message = String(error?.message || error);
    const receiptSummary = error?.receiptSummary;
    const failureDetails = {
      failureStatus,
      message,
      revertReason: receiptSummary?.revertReason ?? null,
      receiptSummary,
      ...diagnostics
    };
    updateRelayRequest(requestId, failureStatus, {
      txHash: typeof diagnostics.txHash === 'string' ? diagnostics.txHash : undefined,
      errorMessage: message
    });
    insertRelayEvent(requestId, 'relay_failed', failureDetails);
    logEvent('relay_failed', { requestId, correlationId: input.correlationId, ...failureDetails });
    error.details = failureDetails;
    throw error;
  }
}
