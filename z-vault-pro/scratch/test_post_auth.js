/**
 * Standalone POST auth tester for GasFree submit endpoint.
 * Tests whether the POST signature includes the body or not.
 */
const crypto = require('crypto');
const https = require('https');

const API_KEY = '84582841-c10c-4325-bb79-330d684606d0';
const API_SECRET = 'DbN3GEyw2pOo0aUmtl3GDmiGFxJWBUmmjf6Fa-Tyzow';
const BASE_URL = 'https://open-test.gasfree.io';

// A dummy submit payload (will fail validation, but auth should pass)
const submitBody = JSON.stringify({
  signature: '0x' + 'a'.repeat(130),
  token: 'TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf',
  serviceProvider: 'TJBpgUDZEhyJ3GmgAM8DUdFoPCxfWZPuaX',
  user: 'TJBpgUDZEhyJ3GmgAM8DUdFoPCxfWZPuaX',
  receiver: 'TQsosYn1JGd3kbyqwHW9eae55X5PhdrETQ',
  value: '5000000',
  maxFee: '1100000',
  deadline: String(Math.floor(Date.now() / 1000) + 900),
  version: '1',
  nonce: '0'
});

const API_PATH = '/nile/api/v1/gasfree/submit';
const METHOD = 'POST';

function sign(message) {
  return crypto
    .createHmac('sha256', API_SECRET)
    .update(message)
    .digest('base64');
}

async function testVariation(label, message) {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const msg = message(timestamp);
  const signature = sign(msg);

  console.log(`\n--- ${label} ---`);
  console.log('Message:', JSON.stringify(msg).substring(0, 120));
  console.log('Signature:', signature);

  return new Promise((resolve) => {
    const url = new URL(BASE_URL + API_PATH);
    const options = {
      hostname: url.hostname,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Timestamp': timestamp,
        'Authorization': `ApiKey ${API_KEY}:${signature}`,
        'Content-Length': Buffer.byteLength(submitBody)
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 401) {
          console.log(`❌ 401 - Auth Failed: ${data.substring(0, 100)}`);
        } else {
          console.log(`✅ ${res.statusCode} - Auth PASSED! Response: ${data.substring(0, 200)}`);
        }
        resolve(res.statusCode);
      });
    });

    req.on('error', (e) => {
      console.log('Network error:', e.message);
      resolve(0);
    });

    req.write(submitBody);
    req.end();
  });
}

async function main() {
  console.log('=== GasFree POST Auth Tester ===');
  console.log('Endpoint:', BASE_URL + API_PATH);
  console.log('Body length:', submitBody.length, 'bytes');

  // Variation 1: POST + Full Path + Timestamp + Body
  await testVariation('V1: Full Path + Body', (ts) => `${METHOD}${API_PATH}${ts}${submitBody}`);

  // Variation 2: POST + Full Path + Timestamp (no body)
  await testVariation('V2: Full Path, No Body', (ts) => `${METHOD}${API_PATH}${ts}`);

  // Variation 3: POST + Relative Path + Timestamp + Body
  const relPath = API_PATH.replace('/nile', '');
  await testVariation('V3: Relative Path + Body', (ts) => `${METHOD}${relPath}${ts}${submitBody}`);

  // Variation 4: POST + Relative Path + Timestamp (no body)
  await testVariation('V4: Relative Path, No Body', (ts) => `${METHOD}${relPath}${ts}`);

  console.log('\n=== Done ===');
}

main();
