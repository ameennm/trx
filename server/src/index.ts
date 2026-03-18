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
  getUnrecoveredAdvance,
  markRecovered,
  hasBeenFunded,
} from './fundingTracker';

const app = express();
app.use(cors());
app.use(express.json());

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

const FUNDING_AMOUNT_TRX = 5;

// ─── Health Check ────────────────────────────────────────────────
app.get('/api/health', async (req, res) => {
  try {
    const relayer = await getRelayerBalance();
    res.json({
      status: 'ok',
      relayerAddress: relayer.address,
      relayerTrxBalance: relayer.trx,
      config: {
        gasStationContract: config.gasStationContract,
        usdtContract: config.usdtContract,
        trxPriceUsd: config.trxPriceUsd,
        markupPercent: config.markupPercent,
      },
    });
  } catch (error: any) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

// ─── Get Fee Quote ───────────────────────────────────────────────
app.post('/api/quote', async (req, res) => {
  try {
    const { from, to, amount } = req.body;
    if (!from || !to || !amount) {
      return res.status(400).json({ error: 'Missing from, to, or amount' });
    }

    const quote = await getQuote(from, to, parseFloat(amount));

    let typedDataHash = '';
    let deadline = 0;
    try {
      deadline = Math.floor(Date.now() / 1000) + 3600;
      typedDataHash = await buildTypedDataHash({
        from, to, sendAmount: parseFloat(amount),
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
        sendAmountSun: usdtToSun(parseFloat(amount)).toString(),
        feeAmountSun: usdtToSun(quote.fee.totalFeeUSDT).toString(),
        gasStationContract: config.gasStationContract,
      },
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ─── Relay Signed Transaction ────────────────────────────────────
app.post('/api/relay', async (req, res) => {
  try {
    const { from, to, sendAmount, feeAmount, deadline, v, r, s } = req.body;
    const result = await relayTransaction({
      from, to,
      sendAmount: parseFloat(sendAmount),
      feeAmount: parseFloat(feeAmount),
      deadline: parseInt(deadline),
      v: parseInt(v), r, s,
    });

    if (result.success) {
      logProfit(parseFloat(feeAmount));

      // Mark any TRX advance as recovered
      const advance = getUnrecoveredAdvance(from);
      if (advance > 0) {
        markRecovered(from);
        console.log(`✅ Recovered ${advance} TRX advance from ${from} via transfer fee`);
      }

      res.json({
        success: true,
        txHash: result.txHash,
        message: result.message,
        explorerUrl: `https://nile.tronscan.org/#/transaction/${result.txHash}`
      });
    } else {
      res.status(400).json({ success: false, error: result.message });
    }
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ─── Fund User for Approval ──────────────────────────────────────
app.post('/api/fund-for-approval', async (req, res) => {
  try {
    const { address } = req.body;
    if (!address) return res.status(400).json({ error: 'Address required' });

    // Skip if already approved or funded
    const allowanceCheck = await checkAllowance(address, 1);
    if (allowanceCheck.sufficient) {
      return res.json({ success: true, alreadyApproved: true, message: 'Already approved' });
    }
    if (hasBeenFunded(address)) {
      return res.json({ success: true, alreadyFunded: true, message: 'Already funded' });
    }

    // Skip if user already has enough TRX on-chain
    const tronWeb = getRelayerTronWeb();
    let currentBalance = 0;
    try {
      const bal = await tronWeb.trx.getBalance(address);
      currentBalance = bal / 1_000_000;
    } catch {}

    if (currentBalance >= 3) {
      recordFunding(address, 0, 'already-has-trx');
      return res.json({ success: true, alreadyFunded: true, message: `User has ${currentBalance.toFixed(1)} TRX` });
    }

    const sunAmount = FUNDING_AMOUNT_TRX * 1_000_000;
    const tx = await tronWeb.trx.sendTransaction(address, sunAmount);

    if (!tx.result) throw new Error('TRX transfer failed');

    recordFunding(address, FUNDING_AMOUNT_TRX, tx.txid);
    res.json({
      success: true,
      txHash: tx.txid,
      trxSent: FUNDING_AMOUNT_TRX,
      message: `Sent ${FUNDING_AMOUNT_TRX} TRX for approval.`
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ─── Get Config ──────────────────────────────────────────────────
app.get('/api/config', (req, res) => {
  res.json({
    mode: config.mode,
    gasStationContract: config.gasStationContract,
    usdtContract: config.usdtContract,
    chainId: config.chainId,
    trxPriceUsd: config.trxPriceUsd,
    markupPercent: config.markupPercent,
    activeAccountFeeTRX: 13.5,
    newAccountFeeTRX: 27,
    fundingAmountTRX: FUNDING_AMOUNT_TRX,
  });
});

app.get('/api/nonce/:address', async (req, res) => {
  try {
    const nonce = await getUserNonce(req.params.address);
    res.json({ address: req.params.address, nonce });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/balance/:address', async (req, res) => {
  try {
    const bal = await getUsdtBalance(req.params.address);
    res.json({ address: req.params.address, balance: bal });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

validateConfig();

app.listen(config.port, () => {
  console.log(` Relayer Backend running on http://localhost:${config.port} `);
});
