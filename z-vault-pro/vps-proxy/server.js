/**
 * Z-Vault Pro — VPS Energy Rental Proxy
 *
 * WHY THIS EXISTS:
 *   Netts.io whitelists specific IP addresses for their API.
 *   Cloudflare Workers run on a shared global network with dynamic IPs
 *   that cannot be whitelisted. This VPS has a static IP that CAN be
 *   whitelisted with Netts.io.
 *
 * FLOW:
 *   Cloudflare Worker → (HTTPS + X-Vault-Secret) → This server → Netts.io API
 *
 * SETUP:
 *   1. ssh root@187.127.156.137
 *   2. mkdir -p /opt/zvault-proxy && cd /opt/zvault-proxy
 *   3. Copy this file as server.js
 *   4. npm install express
 *   5. Create .env with VPS_SHARED_SECRET and NETTS_API_URL
 *   6. Set up SSL: certbot --nginx -d api.yourdomain.com
 *   7. pm2 start server.js --name zvault-proxy
 *
 * WHITELIST YOUR VPS IP WITH NETTS.IO:
 *   Go to your Netts.io dashboard → API Settings → Add IP: 187.127.156.137
 */

const express = require('express');
const app     = express();

// Load environment variables
// Create a .env file on the VPS with these values (never commit secrets)
const VPS_SHARED_SECRET = process.env.VPS_SHARED_SECRET;
const NETTS_API_URL     = process.env.NETTS_API_URL || 'https://netts.io/apiv2';
const PORT              = process.env.PORT || 3000;

if (!VPS_SHARED_SECRET) {
  console.error('[FATAL] VPS_SHARED_SECRET is not set. The server will reject all requests.');
  process.exit(1);
}

app.use(express.json());

// ─── Security Middleware ──────────────────────────────────────────────────────

/**
 * Validate every incoming request has the correct shared secret header.
 * This prevents anyone who discovers this endpoint from using it.
 */
app.use((req, res, next) => {
  const secret = req.headers['x-vault-secret'];
  if (!secret || secret !== VPS_SHARED_SECRET) {
    console.warn(`[BLOCKED] Unauthorized request from ${req.ip} | Secret: ${secret ? 'wrong' : 'missing'}`);
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
});

// ─── Health Check ─────────────────────────────────────────────────────────────

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'Z-Vault VPS Proxy', ts: new Date().toISOString() });
});

// ─── Energy Rental Endpoint ───────────────────────────────────────────────────

/**
 * POST /rent
 * Body: { api_key, address, amount }
 *
 * Forwards the energy rental request to Netts.io from this whitelisted VPS IP.
 * Returns Netts.io response directly to the calling Worker.
 */
app.post('/rent', async (req, res) => {
  const { api_key, address, amount } = req.body;

  if (!api_key || !address || !amount) {
    return res.status(400).json({ error: 'Missing required fields: api_key, address, amount' });
  }

  console.log(`[RENT] Renting ${amount} energy for ${address}`);

  try {
    const response = await fetch(`${NETTS_API_URL}/energy/rent`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${api_key}`,
      },
      body: JSON.stringify({
        receive_address: address,
        energy_amount:   amount,
        period:          1,    // 1-hour rental
      }),
    });

    const data = await response.json();
    console.log(`[RENT] Netts.io response: ${JSON.stringify(data)}`);

    // Pass the Netts.io response straight through to the Worker
    return res.status(response.status).json(data);
  } catch (err) {
    console.error(`[RENT ERROR] ${err.message}`);
    return res.status(502).json({ error: `Netts.io call failed: ${err.message}` });
  }
});

// ─── Start ────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`✅ Z-Vault VPS Proxy running on port ${PORT}`);
  console.log(`   Secret auth: enabled`);
  console.log(`   Netts.io target: ${NETTS_API_URL}`);
});
