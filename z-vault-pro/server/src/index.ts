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
} from './relayer';
import { usdtToSun } from './feeCalc';

const app = new Hono();

app.use('*', cors());

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
  });
});

validateConfig();

export default {
  port: config.port,
  fetch: app.fetch
};
