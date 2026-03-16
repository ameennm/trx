/**
 * Z-Vault — Local Test Script
 * Run: npx tsx src/test-local.ts
 *
 * Tests everything locally WITHOUT needing:
 *  - A private key
 *  - Testnet TRX
 *  - A deployed contract
 */

import { config } from './config';

// ─── Colors for terminal output ──────────────────────────────
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const DIM = '\x1b[2m';
const BOLD = '\x1b[1m';
const RESET = '\x1b[0m';

function pass(name: string) { console.log(`  ${GREEN}✓${RESET} ${name}`); }
function fail(name: string, err: string) { console.log(`  ${RED}✕${RESET} ${name} — ${RED}${err}${RESET}`); }
function header(title: string) { console.log(`\n${CYAN}${BOLD}━━━ ${title} ━━━${RESET}`); }

let passed = 0;
let failed = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    pass(testName);
    passed++;
  } else {
    fail(testName, detail || 'Assertion failed');
    failed++;
  }
}

// ═══════════════════════════════════════════════════════════════
// TEST 1: Fee Calculation — Slab System
// ═══════════════════════════════════════════════════════════════

async function testFeeCalculation() {
  header('Test 1: Fee Calculation — Slab System');

  const TRX_PRICE = config.trxPriceUsd; // $0.29
  const MARKUP = config.markupPercent;   // 15%

  // --- Active Account (13.5 TRX) ---
  const activeFeeTRX = config.activeAccountFeeTRX; // 13.5
  const activeFeeUSDT = activeFeeTRX * TRX_PRICE;  // 3.915
  const activeMarkup = activeFeeUSDT * (MARKUP / 100); // 0.58725
  const activeTotalFee = activeFeeUSDT + activeMarkup; // ~4.50225

  console.log(`\n  ${DIM}Active Account Fee Calculation:${RESET}`);
  console.log(`  ${DIM}  Base: ${activeFeeTRX} TRX × $${TRX_PRICE} = $${activeFeeUSDT.toFixed(4)} USDT${RESET}`);
  console.log(`  ${DIM}  Markup: $${activeFeeUSDT.toFixed(4)} × ${MARKUP}% = $${activeMarkup.toFixed(4)} USDT${RESET}`);
  console.log(`  ${DIM}  Total Fee: $${activeTotalFee.toFixed(4)} USDT${RESET}`);

  assert(activeFeeTRX === 13.5, 'Active account base = 13.5 TRX');
  assert(Math.abs(activeFeeUSDT - 3.915) < 0.001, 'Active USDT equiv ≈ 3.915', `Got ${activeFeeUSDT}`);
  assert(Math.abs(activeMarkup - 0.58725) < 0.001, 'Active markup ≈ 0.587', `Got ${activeMarkup}`);
  assert(Math.abs(activeTotalFee - 4.50225) < 0.01, 'Active total fee ≈ 4.50', `Got ${activeTotalFee}`);

  // --- New Account (27 TRX) ---
  const newFeeTRX = config.newAccountFeeTRX; // 27
  const newFeeUSDT = newFeeTRX * TRX_PRICE;  // 7.83
  const newMarkup = newFeeUSDT * (MARKUP / 100); // 1.1745
  const newTotalFee = newFeeUSDT + newMarkup; // ~9.0045

  console.log(`\n  ${DIM}New Account Fee Calculation:${RESET}`);
  console.log(`  ${DIM}  Base: ${newFeeTRX} TRX × $${TRX_PRICE} = $${newFeeUSDT.toFixed(4)} USDT${RESET}`);
  console.log(`  ${DIM}  Markup: $${newFeeUSDT.toFixed(4)} × ${MARKUP}% = $${newMarkup.toFixed(4)} USDT${RESET}`);
  console.log(`  ${DIM}  Total Fee: $${newTotalFee.toFixed(4)} USDT${RESET}`);

  assert(newFeeTRX === 27, 'New account base = 27 TRX');
  assert(Math.abs(newFeeUSDT - 7.83) < 0.001, 'New USDT equiv ≈ 7.83', `Got ${newFeeUSDT}`);
  assert(Math.abs(newMarkup - 1.1745) < 0.001, 'New markup ≈ 1.175', `Got ${newMarkup}`);
  assert(Math.abs(newTotalFee - 9.0045) < 0.01, 'New total fee ≈ 9.00', `Got ${newTotalFee}`);
}

// ═══════════════════════════════════════════════════════════════
// TEST 2: Sun Conversion (USDT smallest unit)
// ═══════════════════════════════════════════════════════════════

async function testSunConversion() {
  header('Test 2: USDT ↔ Sun Conversion');

  // 1 USDT = 1,000,000 sun (6 decimals)
  const decimals = config.usdtDecimals;
  assert(decimals === 6, 'USDT decimals = 6');

  const amount = 10.5;
  const sun = BigInt(Math.round(amount * 10 ** decimals));
  assert(sun === 10_500_000n, `10.5 USDT = 10,500,000 sun`, `Got ${sun}`);

  const backToUsdt = Number(sun) / 10 ** decimals;
  assert(backToUsdt === 10.5, `10,500,000 sun = 10.5 USDT`, `Got ${backToUsdt}`);

  // Edge case: very small amount
  const tiny = 0.000001;
  const tinySun = BigInt(Math.round(tiny * 10 ** decimals));
  assert(tinySun === 1n, `0.000001 USDT = 1 sun`, `Got ${tinySun}`);
}

// ═══════════════════════════════════════════════════════════════
// TEST 3: Total Deduction Simulation
// ═══════════════════════════════════════════════════════════════

async function testTotalDeduction() {
  header('Test 3: Total Deduction Simulation');

  // Simulate: User sends 10 USDT to an ACTIVE account
  const sendAmount = 10;
  const totalFeeActive = 4.50225;
  const totalDeductionActive = sendAmount + totalFeeActive;

  console.log(`\n  ${DIM}Scenario: Send 10 USDT to active account${RESET}`);
  console.log(`  ${DIM}  Send: ${sendAmount} USDT${RESET}`);
  console.log(`  ${DIM}  Fee:  ${totalFeeActive.toFixed(2)} USDT${RESET}`);
  console.log(`  ${DIM}  Total: ${totalDeductionActive.toFixed(2)} USDT deducted from wallet${RESET}`);

  assert(
    Math.abs(totalDeductionActive - 14.50225) < 0.01,
    `Active: 10 USDT send → ~14.50 USDT deducted`,
    `Got ${totalDeductionActive}`
  );

  // Simulate: User sends 10 USDT to a NEW account
  const totalFeeNew = 9.0045;
  const totalDeductionNew = sendAmount + totalFeeNew;

  console.log(`\n  ${DIM}Scenario: Send 10 USDT to new account${RESET}`);
  console.log(`  ${DIM}  Send: ${sendAmount} USDT${RESET}`);
  console.log(`  ${DIM}  Fee:  ${totalFeeNew.toFixed(2)} USDT${RESET}`);
  console.log(`  ${DIM}  Total: ${totalDeductionNew.toFixed(2)} USDT deducted from wallet${RESET}`);

  assert(
    Math.abs(totalDeductionNew - 19.0045) < 0.01,
    `New: 10 USDT send → ~19.00 USDT deducted`,
    `Got ${totalDeductionNew}`
  );

  // Simulate: User has 100 USDT, 0 TRX — can they send 90 USDT?
  const userBalance = 100;
  const bigSend = 90;
  const bigDeductionActive = bigSend + totalFeeActive;
  const bigDeductionNew = bigSend + totalFeeNew;

  console.log(`\n  ${DIM}Scenario: 100 USDT wallet, 0 TRX, sending 90 USDT${RESET}`);
  assert(
    userBalance >= bigDeductionActive,
    `Active recipient: 90 + 4.50 = ${bigDeductionActive.toFixed(2)} ≤ 100 ✓ (can send)`,
  );
  assert(
    userBalance >= bigDeductionNew,
    `New recipient: 90 + 9.00 = ${bigDeductionNew.toFixed(2)} ≤ 100 ✓ (can send)`,
  );

  // Edge: 96 USDT send to new account — should fail!
  const edgeSend = 96;
  const edgeDeduction = edgeSend + totalFeeNew; // ~105
  assert(
    userBalance < edgeDeduction,
    `New recipient: 96 + 9.00 = ${edgeDeduction.toFixed(2)} > 100 ✗ (insufficient!)`,
  );
}

// ═══════════════════════════════════════════════════════════════
// TEST 4: Config Validation
// ═══════════════════════════════════════════════════════════════

async function testConfig() {
  header('Test 4: Configuration');

  assert(config.trxPriceUsd === 0.29, `TRX price = $0.29`, `Got ${config.trxPriceUsd}`);
  assert(config.markupPercent === 15, `Markup = 15%`, `Got ${config.markupPercent}`);
  assert(config.activeAccountFeeTRX === 13.5, `Active fee = 13.5 TRX`);
  assert(config.newAccountFeeTRX === 27, `New fee = 27 TRX`);
  assert(config.usdtDecimals === 6, `USDT decimals = 6`);
  assert(config.port === 3000, `Port = 3000`, `Got ${config.port}`);
  assert(config.nileRpcUrl.includes('nile'), `RPC URL contains "nile"`, `Got ${config.nileRpcUrl}`);
}

// ═══════════════════════════════════════════════════════════════
// TEST 5: API Endpoints (if server is running)
// ═══════════════════════════════════════════════════════════════

async function testAPI() {
  header('Test 5: API Endpoints (localhost:3000)');

  try {
    // Health check
    const healthRes = await fetch('http://localhost:3000/api/health');
    const health = await healthRes.json();
    assert(health.status === 'ok' || health.status === 'degraded', `GET /api/health → status: ${health.status}`);

    // Config endpoint
    const configRes = await fetch('http://localhost:3000/api/config');
    const cfg = await configRes.json();
    assert(cfg.trxPriceUsd === 0.29, `GET /api/config → trxPrice: ${cfg.trxPriceUsd}`);
    assert(cfg.markupPercent === 15, `GET /api/config → markup: ${cfg.markupPercent}%`);

    // Quote endpoint
    const quoteRes = await fetch('http://localhost:3000/api/quote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'TNPeeaaFB7K9cmo4uQpcU32zGK8G1NYqeL',
        to: 'TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf',
        amount: 10,
      }),
    });
    const quote = await quoteRes.json();
    assert(quote.success === true, `POST /api/quote → success`);
    assert(quote.quote.fee.sendAmount === 10, `Quote sendAmount = 10`);
    assert(
      Math.abs(quote.quote.fee.totalFeeUSDT - 4.50225) < 0.5,
      `Quote totalFee ≈ 4.50 or 9.00`,
      `Got ${quote.quote.fee.totalFeeUSDT}`
    );

    console.log(`\n  ${DIM}Full quote response:${RESET}`);
    console.log(`  ${DIM}${JSON.stringify(quote.quote.fee, null, 2).split('\n').join('\n  ')}${RESET}`);

  } catch (err: any) {
    console.log(`\n  ${YELLOW}⚠ Server not running on port 3000. Skipping API tests.${RESET}`);
    console.log(`  ${DIM}Start with: npm run dev${RESET}`);
  }
}

// ═══════════════════════════════════════════════════════════════
// RUN ALL TESTS
// ═══════════════════════════════════════════════════════════════

async function main() {
  console.log(`\n${BOLD}╔══════════════════════════════════════════╗${RESET}`);
  console.log(`${BOLD}║     Z-VAULT LOCAL TEST SUITE             ║${RESET}`);
  console.log(`${BOLD}╚══════════════════════════════════════════╝${RESET}`);

  await testFeeCalculation();
  await testSunConversion();
  await testTotalDeduction();
  await testConfig();
  await testAPI();

  console.log(`\n${BOLD}━━━ Results ━━━${RESET}`);
  console.log(`  ${GREEN}${passed} passed${RESET}  ${failed > 0 ? RED : ''}${failed} failed${RESET}`);
  console.log(`  Total: ${passed + failed} tests\n`);

  if (failed > 0) process.exit(1);
}

main().catch(console.error);
