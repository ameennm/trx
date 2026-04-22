/**
 * Fetch the correct GasFree service provider address from the API
 */
const crypto = require('crypto');
const https = require('https');

const API_KEY = '84582841-c10c-4325-bb79-330d684606d0';
const API_SECRET = 'DbN3GEyw2pOo0aUmtl3GDmiGFxJWBUmmjf6Fa-Tyzow';
const BASE_URL = 'https://open-test.gasfree.io';
const API_PATH = '/nile/api/v1/config/provider/all';

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
    console.log('Response:', data);
  });
});
req.on('error', (e) => console.log('Error:', e.message));
req.end();
