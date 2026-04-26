/**
 * Z-Vault Pro VPS Energy Rental Proxy
 *
 * Cloudflare Workers cannot be IP-whitelisted reliably by Netts.io because
 * Workers use shared dynamic egress. This proxy runs on the Hostinger VPS with
 * the whitelisted static IPv4 address and forwards rental requests to Netts.io.
 */

const express = require('express');
const https = require('https');

const app = express();
app.use(express.json());

const VPS_SHARED_SECRET = process.env.VPS_SHARED_SECRET;
const NETTS_API_URL = process.env.NETTS_API_URL || 'https://netts.io/apiv2';
const PORT = process.env.PORT || 3000;

if (!VPS_SHARED_SECRET) {
  console.error('[FATAL] VPS_SHARED_SECRET is not set.');
  process.exit(1);
}

const ipv4Agent = new https.Agent({ family: 4 });

app.use((req, res, next) => {
  const secret = req.headers['x-vault-secret'];
  if (secret !== VPS_SHARED_SECRET) {
    console.warn(`[BLOCKED] Unauthorized request from ${req.ip}`);
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
});

app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'Z-Vault VPS Proxy',
    ts: new Date().toISOString(),
  });
});

app.post('/rent', async (req, res) => {
  const apiKey = req.body.api_key;
  const receiveAddress = req.body.address;
  const amount = Number.parseInt(req.body.amount, 10);

  if (!apiKey || !receiveAddress || !Number.isFinite(amount) || amount <= 0) {
    return res.status(400).json({ error: 'Missing required fields: api_key, address, amount' });
  }

  console.log(`[RENT] Requesting ${amount} energy for ${receiveAddress}`);

  try {
    const response = await fetch(`${NETTS_API_URL}/order1h`, {
      method: 'POST',
      agent: ipv4Agent,
      headers: {
        'Content-Type': 'application/json',
        'X-API-KEY': apiKey,
      },
      body: JSON.stringify({
        receiveAddress,
        amount,
      }),
    });

    const text = await response.text();
    console.log(`[RENT] Netts.io response ${response.status}: ${text}`);
    return res.status(response.status).type('application/json').send(text);
  } catch (err) {
    console.error(`[RENT ERROR] ${err.message}`);
    return res.status(502).json({ error: `Netts.io call failed: ${err.message}` });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Z-Vault VPS Proxy running on port ${PORT}`);
  console.log(`Netts.io target: ${NETTS_API_URL}`);
});
