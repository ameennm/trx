import express from 'express';
import cors from 'cors';
import { config, validateConfig } from './config';
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

const app = express();
app.use(cors());
app.use(express.json());

// ─── Health Check ────────────────────────────────────────────────
app.get('/api/health', async (_req, res) => {
  try {
    const relayer = await getRelayerBalance();
    res.json({
      status: 'ok',
      relayer: {
        address: relayer.address,
        trxBalance: relayer.trx,
      },
      config: {
        gasStationContract: config.gasStationContract || 'NOT SET',
        usdtContract: config.usdtContract,
        trxPriceUsd: config.trxPriceUsd,
        markupPercent: config.markupPercent,
      },
    });
  } catch (error: any) {
    res.json({
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
app.post('/api/quote', async (req, res) => {
  try {
    let { from, to, amount } = req.body;
    if (from) from = from.trim();
    if (to) to = to.trim();

    if (!from || !to || !amount) {
      return res.status(400).json({
        error: 'Missing required fields: from, to, amount',
      });
    }

    const sendAmount = parseFloat(amount);
    if (isNaN(sendAmount) || sendAmount <= 0) {
      return res.status(400).json({ error: 'Invalid amount' });
    }

    const quote = await getQuote(from, to, sendAmount);

    // Build the typed data hash for the user to sign
    let typedDataHash = '';
    let deadline = 0;
    try {
      deadline = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now
      typedDataHash = await buildTypedDataHash({
        from,
        to,
        sendAmount,
        feeAmount: quote.fee.totalFeeUSDT,
        nonce: quote.nonce,
        deadline,
        contractAddress: config.gasStationContract,
        chainId: config.chainId,
      });
    } catch (err) {
      // Contract might not be deployed yet
      console.warn('Could not build typed data hash:', (err as Error).message);
    }

    res.json({
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
    res.status(500).json({ error: error.message });
  }
});

// ─── Relay Signed Transaction ────────────────────────────────────
app.post('/api/relay', async (req, res) => {
  try {
    let { from, to, sendAmount, feeAmount, deadline, v, r, s } = req.body;
    if (from) from = from.trim();
    if (to) to = to.trim();

    if (!from || !to || !sendAmount || !feeAmount || !deadline || !v || !r || !s) {
      return res.status(400).json({
        error: 'Missing required fields: from, to, sendAmount, feeAmount, deadline, v, r, s',
      });
    }

    const result = await relayTransaction({
      from,
      to,
      sendAmount: parseFloat(sendAmount),
      feeAmount: parseFloat(feeAmount),
      deadline: parseInt(deadline),
      v: parseInt(v),
      r,
      s,
    });

    if (result.success) {
      // Mark any TRX advance as recovered since the fee included recovery
      const advance = getUnrecoveredAdvance(from);
      if (advance > 0) {
        markRecovered(from);
        console.log(`✅ Recovered ${advance} TRX advance from ${from} via transfer fee`);
      }

      res.json({
        success: true,
        txHash: result.txHash,
        message: result.message,
        explorerUrl: `https://nile.tronscan.org/#/transaction/${result.txHash}`,
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.message,
      });
    }
  } catch (error: any) {
    console.error('Relay error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ─── Welcome Gift ────────────────────────────────────────────────
// Sends 10 TRX to new wallets as a welcome bonus.
// This is recovered from the user's first USDT transfer.
const WELCOME_GIFT_TRX = 10;

app.post('/api/welcome-gift', async (req, res) => {
  try {
    let { address } = req.body;
    if (address) address = address.trim();

    if (!address) {
      return res.status(400).json({ error: 'Missing required field: address' });
    }

    // Check if user already received welcome gift
    if (hasReceivedWelcomeGift(address)) {
      return res.json({
        success: true,
        alreadyGifted: true,
        message: 'Welcome gift was already sent to this address.',
      });
    }

    // Send TRX welcome gift
    const tronWeb = getRelayerTronWeb();
    const sunAmount = WELCOME_GIFT_TRX * 1_000_000;

    console.log(`🎁 Sending ${WELCOME_GIFT_TRX} TRX welcome gift to ${address}...`);
    const tx = await tronWeb.trx.sendTransaction(address, sunAmount);

    if (!tx.result) {
      return res.status(500).json({
        success: false,
        error: 'Welcome gift TRX transfer failed',
      });
    }

    // Record the welcome gift in funding ledger
    recordWelcomeGift(address, WELCOME_GIFT_TRX, tx.txid);

    console.log(`✅ Welcome gift sent: ${WELCOME_GIFT_TRX} TRX to ${address} (tx: ${tx.txid})`);

    // Calculate how much USDT will be recovered
    const recoveryUSDT = WELCOME_GIFT_TRX * config.trxPriceUsd * (1 + config.markupPercent / 100);

    res.json({
      success: true,
      txHash: tx.txid,
      trxSent: WELCOME_GIFT_TRX,
      recoveryUSDT: parseFloat(recoveryUSDT.toFixed(6)),
      message: `🎉 Welcome! ${WELCOME_GIFT_TRX} TRX sent as a gift. ~${recoveryUSDT.toFixed(2)} USDT will be deducted from your first transfer.`,
    });
  } catch (error: any) {
    console.error('Welcome gift error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ─── Gas Top-up for Existing Users ───────────────────────────────
// Sends 5 TRX to existing users who have 0 TRX so they can transact.
// Recovered from their next USDT transfer. Can be called multiple times.
const GAS_TOPUP_TRX = 5;

app.post('/api/gas-topup', async (req, res) => {
  try {
    let { address } = req.body;
    if (address) address = address.trim();

    if (!address) {
      return res.status(400).json({ error: 'Missing required field: address' });
    }

    // Check the user's actual on-chain TRX balance
    const tronWeb = getRelayerTronWeb();
    let currentTrxBalance = 0;
    try {
      const balSun = await tronWeb.trx.getBalance(address);
      currentTrxBalance = balSun / 1_000_000;
    } catch (e) {
      // If we can't check, assume 0
      console.warn('Could not check TRX balance for gas topup:', (e as Error).message);
    }

    // Only top up if TRX balance is below 1 TRX (essentially empty)
    if (currentTrxBalance >= 1) {
      return res.json({
        success: true,
        alreadyHasGas: true,
        currentTrxBalance,
        message: `User already has ${currentTrxBalance.toFixed(2)} TRX. No top-up needed.`,
      });
    }

    // Send 5 TRX gas top-up
    const sunAmount = GAS_TOPUP_TRX * 1_000_000;

    console.log(`⛽ Sending ${GAS_TOPUP_TRX} TRX gas top-up to ${address} (current: ${currentTrxBalance} TRX)...`);
    const tx = await tronWeb.trx.sendTransaction(address, sunAmount);

    if (!tx.result) {
      return res.status(500).json({
        success: false,
        error: 'Gas top-up TRX transfer failed',
      });
    }

    // Record in funding ledger (for recovery)
    recordGasTopup(address, GAS_TOPUP_TRX, tx.txid);

    console.log(`✅ Gas top-up sent: ${GAS_TOPUP_TRX} TRX to ${address} (tx: ${tx.txid})`);

    // Calculate USDT recovery
    const recoveryUSDT = GAS_TOPUP_TRX * config.trxPriceUsd * (1 + config.markupPercent / 100);

    res.json({
      success: true,
      txHash: tx.txid,
      trxSent: GAS_TOPUP_TRX,
      recoveryUSDT: parseFloat(recoveryUSDT.toFixed(6)),
      message: `⛽ ${GAS_TOPUP_TRX} TRX gas top-up sent. ~${recoveryUSDT.toFixed(2)} USDT will be deducted from your next transfer.`,
    });
  } catch (error: any) {
    console.error('Gas top-up error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ─── Fund User for Approval ──────────────────────────────────────
// Sends TRX to a new user so they can approve the GasStation contract.
// The TRX cost is recovered from their first USDT transfer.
const FUNDING_AMOUNT_TRX = 5; // 5 TRX — enough for approve tx gas

app.post('/api/fund-for-approval', async (req, res) => {
  try {
    let { address } = req.body;
    if (address) address = address.trim();

    if (!address) {
      return res.status(400).json({ error: 'Missing required field: address' });
    }

    // Check if already funded
    if (hasBeenFunded(address)) {
      return res.json({
        success: true,
        alreadyFunded: true,
        message: 'User was already funded. Proceed with approval.',
      });
    }

    // Check if user actually needs funding (has 0 allowance)
    const allowanceCheck = await checkAllowance(address, 1);
    if (allowanceCheck.sufficient) {
      return res.json({
        success: true,
        alreadyApproved: true,
        message: 'User already has sufficient allowance. No funding needed.',
      });
    }

    // Send TRX to the user
    const tronWeb = getRelayerTronWeb();
    const sunAmount = FUNDING_AMOUNT_TRX * 1_000_000;

    console.log(`💰 Funding ${address} with ${FUNDING_AMOUNT_TRX} TRX for approval gas...`);
    const tx = await tronWeb.trx.sendTransaction(address, sunAmount);

    if (!tx.result) {
      return res.status(500).json({
        success: false,
        error: 'TRX transfer failed',
      });
    }

    // Record the advance
    recordFunding(address, FUNDING_AMOUNT_TRX, tx.txid);

    console.log(`✅ Funded ${address} with ${FUNDING_AMOUNT_TRX} TRX (tx: ${tx.txid})`);

    res.json({
      success: true,
      txHash: tx.txid,
      trxSent: FUNDING_AMOUNT_TRX,
      message: `Sent ${FUNDING_AMOUNT_TRX} TRX for approval gas. This will be recovered from your first transfer.`,
    });
  } catch (error: any) {
    console.error('Funding error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ─── Get Nonce ───────────────────────────────────────────────────
app.get('/api/nonce/:address', async (req, res) => {
  try {
    const nonce = await getUserNonce(req.params.address);
    res.json({ address: req.params.address, nonce });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ─── Get USDT Balance ────────────────────────────────────────────
app.get('/api/balance/:address', async (req, res) => {
  try {
    const balance = await getUsdtBalance(req.params.address);
    res.json({ address: req.params.address, balance, symbol: 'USDT' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ─── Get Config Info ─────────────────────────────────────────────
app.get('/api/config', (_req, res) => {
  res.json({
    gasStationContract: config.gasStationContract,
    usdtContract: config.usdtContract,
    chainId: config.chainId,
    trxPriceUsd: config.trxPriceUsd,
    markupPercent: config.markupPercent,
    activeAccountFeeTRX: config.activeAccountFeeTRX,
    newAccountFeeTRX: config.newAccountFeeTRX,
    nileRpcUrl: config.nileRpcUrl,
    fundingAmountTRX: FUNDING_AMOUNT_TRX,
    welcomeGiftTRX: WELCOME_GIFT_TRX,
    gasTopupTRX: GAS_TOPUP_TRX,
  });
});

// ─── Start Server ────────────────────────────────────────────────
validateConfig();

app.listen(config.port, () => {
  console.log(`
  ╔══════════════════════════════════════════════════╗
  ║        Z-Vault Relayer API Server                ║
  ║        Running on port ${config.port}                    ║
  ╠══════════════════════════════════════════════════╣
  ║  Endpoints:                                      ║
  ║    GET  /api/health          Health check         ║
  ║    POST /api/quote           Get fee quote        ║
  ║    POST /api/relay           Relay signed tx      ║
  ║    POST /api/welcome-gift    Send welcome 10 TRX  ║
  ║    POST /api/gas-topup       Gas top-up 5 TRX     ║
  ║    GET  /api/nonce/:addr     Get user nonce       ║
  ║    GET  /api/balance/:addr   Get USDT balance     ║
  ║    GET  /api/config          Server config        ║
  ╚══════════════════════════════════════════════════╝
  `);
});

export default app;
