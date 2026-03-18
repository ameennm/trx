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
} from './relayer';
import { usdtToSun } from './feeCalc';

const app = express();
app.use(cors());
app.use(express.json());

// ─── CEO Profit Logger ──────────────────────────────────────────
function logProfit(feeUSDT: number) {
  const markup = config.markupPercent;
  const profitUSDT = feeUSDT * (markup / (100 + markup)); // Extract profit from total fee
  console.log(`\n  ╔════════════════════════════════════════════════╗`);
  console.log(`  ║  [CEO LOG] 💰 Profit: ${profitUSDT.toFixed(4)} USDT              ║`);
  console.log(`  ║            📊 Markup: ${markup}%                        ║`);
  console.log(`  ║            💸 Total Fee Collected: ${feeUSDT.toFixed(4)} USDT     ║`);
  console.log(`  ╚════════════════════════════════════════════════╝\n`);
}

// ─── Health Check ────────────────────────────────────────────────
app.get('/api/health', async (_req, res) => {
  try {
    const relayer = await getRelayerBalance();
    res.json({
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
      return res.status(400).json({ error: 'Missing required fields: from, to, amount' });
    }

    const sendAmount = parseFloat(amount);
    if (isNaN(sendAmount) || sendAmount <= 0) {
      return res.status(400).json({ error: 'Invalid amount' });
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

    const feeFloat = parseFloat(feeAmount);

    const result = await relayTransaction({
      from, to,
      sendAmount: parseFloat(sendAmount),
      feeAmount: feeFloat,
      deadline: parseInt(deadline),
      v: parseInt(v), r, s,
    });

    if (result.success) {
      // 🎯 CEO PROFIT LOG
      logProfit(feeFloat);

      res.json({
        success: true,
        txHash: result.txHash,
        message: result.message,
        explorerUrl: config.mode === 'mainnet' 
          ? `https://tronscan.org/#/transaction/${result.txHash}`
          : `https://nile.tronscan.org/#/transaction/${result.txHash}`,
      });
    } else {
      res.status(400).json({ success: false, error: result.message });
    }
  } catch (error: any) {
    console.error('Relay error:', error);
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

app.get('/api/config', (_req, res) => {
  res.json({
    mode: config.mode,
    gasStationContract: config.gasStationContract,
    usdtContract: config.usdtContract,
    chainId: config.chainId,
    trxPriceUsd: config.trxPriceUsd,
    markupPercent: config.markupPercent,
    activeAccountFeeTRX: config.activeAccountFeeTRX,
    newAccountFeeTRX: config.newAccountFeeTRX,
    rpcUrl: config.rpcUrl,
  });
});

// ─── Start Server ────────────────────────────────────────────────
validateConfig();

if (typeof process !== 'undefined' && process.env.NODE_ENV !== 'cloudflare') {
  app.listen(config.port, () => {
    const banner = config.mode === 'mainnet'
      ? '║         ⚠️  CRYPXE — MAINNET LIVE RELAYER ⚠️         ║'
      : '║          CRYPXE — NILE TESTNET RELAYER                ║';

    console.log(`
    ╔══════════════════════════════════════════════════════╗
    ${banner}
    ║        Running on port ${config.port}                        ║
    ╠══════════════════════════════════════════════════════╣
    ║  Markup: ${config.markupPercent}% (set MARKUP_PERCENT to 20?)    ║
    ╠══════════════════════════════════════════════════════╣
    ║  USDT: ${config.usdtContract.slice(0, 8)}...${config.usdtContract.slice(-8)}           ║
    ╚══════════════════════════════════════════════════════╝
  `);
  });
}

export default app;
