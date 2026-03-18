import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { config, validateConfig, updateConfig } from './config';
import {
  getQuote,
  buildTypedDataHash,
  relayTransaction,
  getUserNonce,
  getUsdtBalance,
  getRelayerBalance,
  getRelayerTronWeb,
  checkAllowance,
} from './relayer';
import { usdtToSun } from './feeCalc';
import {
  recordFunding,
  recordWelcomeGift,
  recordGasTopup,
  getUnrecoveredAdvance,
  markRecovered,
  hasBeenFunded,
  hasReceivedWelcomeGift,
} from './fundingTracker';

const app = new Hono();

app.use('*', cors());

// ─── CEO Profit Logger ──────────────────────────────────────────
function logProfit(feeUSDT: number) {
  const markup = config.markupPercent;
  const profitUSDT = feeUSDT * (markup / (100 + markup));
  console.log(`\n  ╔════════════════════════════════════════════════╗`);
  console.log(`  ║  [CEO LOG] 💰 Profit: ${profitUSDT.toFixed(4)} USDT              ║`);
  console.log(`  ║            📊 Markup: ${markup}%                        ║`);
  console.log(`  ║            💸 Total Fee Collected: ${feeUSDT.toFixed(4)} USDT     ║`);
  console.log(`  ╚════════════════════════════════════════════════╝\n`);
}

// Constants
const FUNDING_AMOUNT_TRX = 5;
const WELCOME_GIFT_TRX = 10;
const GAS_TOPUP_TRX = 5;

// Update config from Cloudflare env
app.use('*', async (c, next) => {
  updateConfig(c.env);
  await next();
});

// ─── Health Check ────────────────────────────────────────────────
app.get('/api/health', async (c) => {
  try {
    const relayer = await getRelayerBalance();
    return c.json({
      status: 'ok',
      relayer: { address: relayer.address, trxBalance: relayer.trx },
      config: {
        gasStationContract: config.gasStationContract || 'NOT SET',
        usdtContract: config.usdtContract,
        trxPriceUsd: config.trxPriceUsd,
        markupPercent: config.markupPercent,
      },
    });
  } catch (error: any) {
    return c.json({
      status: 'degraded',
      error: error.message,
      config: {
        gasStationContract: config.gasStationContract || 'NOT SET',
        usdtContract: config.usdtContract,
      },
    });
  }
});

// ─── Get Fee Quote ───────────────────────────────────────────────
app.post('/api/quote', async (c) => {
  try {
    const body = await c.req.json();
    let { from, to, amount } = body;
    if (from) from = from.trim();
    if (to) to = to.trim();

    if (!from || !to || !amount) {
      return c.json({ error: 'Missing required fields: from, to, amount' }, 400);
    }

    const sendAmount = parseFloat(amount);
    if (isNaN(sendAmount) || sendAmount <= 0) {
      return c.json({ error: 'Invalid amount' }, 400);
    }

    const quote = await getQuote(from, to, sendAmount);

    let typedDataHash = '';
    let deadline = 0;
    try {
      deadline = Math.floor(Date.now() / 1000) + 3600;
      typedDataHash = await buildTypedDataHash({
        from, to, sendAmount,
        feeAmount: quote.fee.totalFeeUSDT,
        nonce: quote.nonce,
        deadline,
        contractAddress: config.gasStationContract,
        chainId: config.chainId,
      });
    } catch (err) {
      console.warn('Could not build typed data hash:', (err as Error).message);
    }

    return c.json({
      success: true,
      quote: {
        ...quote,
        deadline,
        typedDataHash,
        sendAmountSun: usdtToSun(sendAmount).toString(),
        feeAmountSun: usdtToSun(quote.fee.totalFeeUSDT).toString(),
        gasStationContract: config.gasStationContract,
      },
    });
  } catch (error: any) {
    console.error('Quote error:', error);
    return c.json({ error: error.message }, 500);
  }
});

// ─── Relay Signed Transaction ────────────────────────────────────
app.post('/api/relay', async (c) => {
  try {
    const body = await c.req.json();
    let { from, to, sendAmount, feeAmount, deadline, v, r, s } = body;
    if (from) from = from.trim();
    if (to) to = to.trim();

    if (!from || !to || !sendAmount || !feeAmount || !deadline || !v || !r || !s) {
      return c.json({
        error: 'Missing required fields: from, to, sendAmount, feeAmount, deadline, v, r, s',
      }, 400);
    }

    const feeFloat = parseFloat(feeAmount);

    const result = await relayTransaction({
      from, to,
      sendAmount: parseFloat(sendAmount),
      feeAmount: feeFloat,
      deadline: parseInt(deadline),
      v: parseInt(v), r, s,
    });

    if (result.success) {
      logProfit(feeFloat);

      // Mark any TRX advance as recovered
      const advance = getUnrecoveredAdvance(from);
      if (advance > 0) {
        markRecovered(from);
        console.log(`✅ Recovered ${advance} TRX advance from ${from} via transfer fee`);
      }

      return c.json({
        success: true,
        txHash: result.txHash,
        message: result.message,
        explorerUrl: config.mode === 'mainnet' 
          ? `https://tronscan.org/#/transaction/${result.txHash}`
          : `https://nile.tronscan.org/#/transaction/${result.txHash}`,
      });
    } else {
      return c.json({ success: false, error: result.message }, 400);
    }
  } catch (error: any) {
    console.error('Relay error:', error);
    return c.json({ error: error.message }, 500);
  }
});

// ─── Welcome Gift ────────────────────────────────────────────────
// Sends 10 TRX to new wallets as a welcome bonus.
// Recovered from the user's first USDT transfer.
app.post('/api/welcome-gift', async (c) => {
  try {
    const body = await c.req.json();
    let { address } = body;
    if (address) address = address.trim();

    if (!address) {
      return c.json({ error: 'Missing required field: address' }, 400);
    }

    if (hasReceivedWelcomeGift(address)) {
      return c.json({
        success: true,
        alreadyGifted: true,
        message: 'Welcome gift was already sent to this address.',
      });
    }

    const tronWeb = getRelayerTronWeb();
    const sunAmount = WELCOME_GIFT_TRX * 1_000_000;

    console.log(`🎁 Sending ${WELCOME_GIFT_TRX} TRX welcome gift to ${address}...`);
    const tx = await tronWeb.trx.sendTransaction(address, sunAmount);

    if (!tx.result) {
      return c.json({ success: false, error: 'Welcome gift TRX transfer failed' }, 500);
    }

    recordWelcomeGift(address, WELCOME_GIFT_TRX, tx.txid);
    console.log(`✅ Welcome gift sent: ${WELCOME_GIFT_TRX} TRX to ${address} (tx: ${tx.txid})`);

    const recoveryUSDT = WELCOME_GIFT_TRX * config.trxPriceUsd * (1 + config.markupPercent / 100);

    return c.json({
      success: true,
      txHash: tx.txid,
      trxSent: WELCOME_GIFT_TRX,
      recoveryUSDT: parseFloat(recoveryUSDT.toFixed(6)),
      message: `🎉 Welcome! ${WELCOME_GIFT_TRX} TRX sent as a gift. ~${recoveryUSDT.toFixed(2)} USDT will be deducted from your first transfer.`,
    });
  } catch (error: any) {
    console.error('Welcome gift error:', error);
    return c.json({ error: error.message }, 500);
  }
});

// ─── Gas Top-up for Existing Users ───────────────────────────────
// Sends 5 TRX to existing users who have 0 TRX so they can transact.
// Recovered from their next USDT transfer. Can be called multiple times.
app.post('/api/gas-topup', async (c) => {
  try {
    const body = await c.req.json();
    let { address } = body;
    if (address) address = address.trim();

    if (!address) {
      return c.json({ error: 'Missing required field: address' }, 400);
    }

    // Check the user's actual on-chain TRX balance
    const tronWeb = getRelayerTronWeb();
    let currentTrxBalance = 0;
    try {
      const balSun = await tronWeb.trx.getBalance(address);
      currentTrxBalance = balSun / 1_000_000;
    } catch (e) {
      console.warn('Could not check TRX balance for gas topup:', (e as Error).message);
    }

    // Only top up if TRX balance is below 1 TRX
    if (currentTrxBalance >= 1) {
      return c.json({
        success: true,
        alreadyHasGas: true,
        currentTrxBalance,
        message: `User already has ${currentTrxBalance.toFixed(2)} TRX. No top-up needed.`,
      });
    }

    const sunAmount = GAS_TOPUP_TRX * 1_000_000;

    console.log(`⛽ Sending ${GAS_TOPUP_TRX} TRX gas top-up to ${address} (current: ${currentTrxBalance} TRX)...`);
    const tx = await tronWeb.trx.sendTransaction(address, sunAmount);

    if (!tx.result) {
      return c.json({ success: false, error: 'Gas top-up TRX transfer failed' }, 500);
    }

    recordGasTopup(address, GAS_TOPUP_TRX, tx.txid);
    console.log(`✅ Gas top-up sent: ${GAS_TOPUP_TRX} TRX to ${address} (tx: ${tx.txid})`);

    const recoveryUSDT = GAS_TOPUP_TRX * config.trxPriceUsd * (1 + config.markupPercent / 100);

    return c.json({
      success: true,
      txHash: tx.txid,
      trxSent: GAS_TOPUP_TRX,
      recoveryUSDT: parseFloat(recoveryUSDT.toFixed(6)),
      message: `⛽ ${GAS_TOPUP_TRX} TRX gas top-up sent. ~${recoveryUSDT.toFixed(2)} USDT will be deducted from your next transfer.`,
    });
  } catch (error: any) {
    console.error('Gas top-up error:', error);
    return c.json({ error: error.message }, 500);
  }
});

// ─── Fund User for Approval ──────────────────────────────────────
app.post('/api/fund-for-approval', async (c) => {
  try {
    const body = await c.req.json();
    let { address } = body;
    if (address) address = address.trim();

    if (!address) {
      return c.json({ error: 'Missing required field: address' }, 400);
    }

    if (hasBeenFunded(address)) {
      return c.json({
        success: true,
        alreadyFunded: true,
        message: 'User was already funded. Proceed with approval.',
      });
    }

    const allowanceCheck = await checkAllowance(address, 1);
    if (allowanceCheck.sufficient) {
      return c.json({
        success: true,
        alreadyApproved: true,
        message: 'User already has sufficient allowance. No funding needed.',
      });
    }

    const tronWeb = getRelayerTronWeb();
    const sunAmount = FUNDING_AMOUNT_TRX * 1_000_000;

    console.log(`💰 Funding ${address} with ${FUNDING_AMOUNT_TRX} TRX for approval gas...`);
    const tx = await tronWeb.trx.sendTransaction(address, sunAmount);

    if (!tx.result) {
      return c.json({ success: false, error: 'TRX transfer failed' }, 500);
    }

    recordFunding(address, FUNDING_AMOUNT_TRX, tx.txid);
    console.log(`✅ Funded ${address} with ${FUNDING_AMOUNT_TRX} TRX (tx: ${tx.txid})`);

    return c.json({
      success: true,
      txHash: tx.txid,
      trxSent: FUNDING_AMOUNT_TRX,
      message: `Sent ${FUNDING_AMOUNT_TRX} TRX for approval gas. This will be recovered from your first transfer.`,
    });
  } catch (error: any) {
    console.error('Funding error:', error);
    return c.json({ error: error.message }, 500);
  }
});

// ─── Get Nonce ───────────────────────────────────────────────────
app.get('/api/nonce/:address', async (c) => {
  try {
    const address = c.req.param('address');
    const nonce = await getUserNonce(address);
    return c.json({ address, nonce });
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

// ─── Get USDT Balance ────────────────────────────────────────────
app.get('/api/balance/:address', async (c) => {
  try {
    const address = c.req.param('address');
    const balance = await getUsdtBalance(address);
    return c.json({ address, balance, symbol: 'USDT' });
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

// ─── Get Config ──────────────────────────────────────────────────
app.get('/api/config', (c) => {
  return c.json({
    mode: config.mode,
    gasStationContract: config.gasStationContract,
    usdtContract: config.usdtContract,
    chainId: config.chainId,
    trxPriceUsd: config.trxPriceUsd,
    markupPercent: config.markupPercent,
    activeAccountFeeTRX: config.activeAccountFeeTRX,
    newAccountFeeTRX: config.newAccountFeeTRX,
    rpcUrl: config.rpcUrl,
    fundingAmountTRX: FUNDING_AMOUNT_TRX,
    welcomeGiftTRX: WELCOME_GIFT_TRX,
    gasTopupTRX: GAS_TOPUP_TRX,
  });
});

validateConfig();

export default {
  port: config.port,
  fetch: app.fetch
};
