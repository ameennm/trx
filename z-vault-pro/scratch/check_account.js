/**
 * Get the user's GasFree proxy address and check the account status
 */
const crypto = require('crypto');
const https = require('https');

const API_KEY = '84582841-c10c-4325-bb79-330d684606d0';
const API_SECRET = 'DbN3GEyw2pOo0aUmtl3GDmiGFxJWBUmmjf6Fa-Tyzow';
const BASE_URL = 'https://open-test.gasfree.io';
const USER_ADDRESS = 'TJBpgUDZEhyJ3GmgAM8DUdFoPCxfWZPuaX';

// Fetch account info to see nonce, activated status, and balances
const API_PATH = `/nile/api/v1/address/${USER_ADDRESS}`;
const timestamp = Math.floor(Date.now() / 1000).toString();
const message = `GET${API_PATH}${timestamp}`;
const signature = crypto.createHmac('sha256', API_SECRET).update(message).digest('base64');

const url = new URL(BASE_URL + API_PATH);
const options = {
  hostname: url.hostname,
  path: url.pathname,
  method: 'GET',
  headers: {
    'Timestamp': timestamp,
    'Authorization': `ApiKey ${API_KEY}:${signature}`
  }
};

const req = https.request(options, (res) => {
  let data = '';
  res.on('data', (chunk) => data += chunk);
  res.on('end', () => {
    console.log('Status:', res.statusCode);
    const parsed = JSON.parse(data);
    console.log('Full Response:', JSON.stringify(parsed, null, 2));
    
    if (parsed.data) {
      console.log('\n--- Account Summary ---');
      console.log('EOA Address:', USER_ADDRESS);
      console.log('GasFree Address:', parsed.data.gasFreeAddress || 'N/A');
      console.log('Nonce:', parsed.data.nonce);
      console.log('Activated:', parsed.data.activated);
      console.log('Balance:', parsed.data.balance);
    }
  });
});
req.on('error', (e) => console.log('Error:', e.message));
req.end();
