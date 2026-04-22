# Z-Vault Pro — Complete Documentation

## 📋 Table of Contents

1. [Project Overview](#project-overview)
2. [Architecture](#architecture)
3. [Bug Fix History (All Errors & Solutions)](#bug-fix-history)
4. [Admin Dashboard Access](#admin-dashboard-access)
5. [Mainnet Deployment Guide](#mainnet-deployment-guide)
6. [GasFree Auth Specification](#gasfree-auth-specification)
7. [Configuration Reference](#configuration-reference)

---

## Project Overview

**Z-Vault Pro** is a gasless USDT transfer wallet on the TRON blockchain using the **GasFree Protocol**. Users can send USDT without holding any TRX for gas fees. The platform charges a $1.10 platform fee per transaction.

### How It Works (User Flow)

```
User opens wallet → Imports private key → Sets PIN
         ↓
User clicks "Send" → Enters recipient + amount
         ↓
Frontend fetches nonce from GasFree API (via backend proxy)
         ↓
Frontend assembles TIP-712 structured message
         ↓
Frontend signs the message locally with user's private key (key NEVER leaves browser)
         ↓
Frontend sends signed message to our Cloudflare Worker backend
         ↓
Backend relays to GasFree API with HMAC authentication
         ↓
GasFree protocol broadcasts the transaction on-chain (pays the gas)
         ↓
User sees success + TX hash. Balance is reduced. Zero TRX spent.
```

### Key Concept: GasFree Proxy Address

Every user has **two addresses**:

| Address Type | Purpose |
|-------------|---------|
| **EOA (Regular)** | The user's main TRON address (e.g., `TJBpgUD...`) |
| **GasFree Proxy** | A derived contract address where USDT must be deposited for gasless transfers |

> ⚠️ **IMPORTANT**: Users must transfer USDT to their **GasFree Proxy Address** before they can use gasless transfers. The USDT in their regular EOA address is NOT used by the GasFree protocol.

The GasFree proxy address is displayed in the wallet UI under "⚡ GasFree Address".

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    FRONTEND (Cloudflare Pages)           │
│  React + Vite                                           │
│  https://z-vault-pro-frontend.pages.dev                 │
│                                                         │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌────────┐ │
│  │ SendView │  │ HomeView │  │ Settings │  │ Admin  │ │
│  │ (TIP-712 │  │ (Balance)│  │ (Config) │  │(Stats) │ │
│  │  Signing)│  │          │  │          │  │        │ │
│  └────┬─────┘  └──────────┘  └──────────┘  └────────┘ │
│       │                                                  │
│       │  POST /api/relay {sig, message}                 │
└───────┼──────────────────────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────────────────────────┐
│              BACKEND (Cloudflare Worker)                 │
│  Hono + TypeScript                                      │
│  https://z-vault-pro-api.ameennm71.workers.dev          │
│                                                         │
│  ┌────────────────────────────────────────────────────┐ │
│  │ gasfreeProxy.ts — HMAC Auth + API Relay            │ │
│  │ Signature: Base64(HMAC-SHA256(Secret, M+P+T))      │ │
│  └────────────────────────────────────────────────────┘ │
│                                                         │
│  ┌──────────────┐  ┌──────────────┐                    │
│  │  D1 Database  │  │  Wrangler    │                    │
│  │  (Tx Logs)    │  │  Secrets     │                    │
│  └──────────────┘  └──────────────┘                    │
└────────────────────────┬────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────┐
│              GASFREE PROTOCOL (3rd Party)                │
│                                                         │
│  Testnet: https://open-test.gasfree.io/nile             │
│  Mainnet: https://open.gasfree.io/tron                  │
│                                                         │
│  Handles: Gas payment, on-chain broadcast, TRC-20 relay │
└─────────────────────────────────────────────────────────┘
```

### Tech Stack

| Component | Technology |
|-----------|-----------|
| Frontend | React 18 + Vite |
| Backend | Cloudflare Workers + Hono |
| Database | Cloudflare D1 (SQLite) |
| Blockchain | TRON (TronWeb + GasFree SDK) |
| Hosting | Cloudflare Pages + Workers |
| Auth | HMAC-SHA256 (GasFree API) |

---

## Bug Fix History

During development and deployment, we encountered and resolved **7 critical bugs**. Here is the complete chronological history:

---

### Bug #1: HMAC Signature Encoding (401 Unauthorized)

**Error Message:**
```
401 Authorization hash not match
```

**Root Cause:**
The HMAC-SHA256 signature was encoded as **Hexadecimal** (`digest('hex')`), but the GasFree API requires **Base64** encoding (`digest('base64')`).

**Wrong Code:**
```javascript
// ❌ WRONG — Hex encoding
const signature = crypto.createHmac('sha256', secret).update(message).digest('hex');
```

**Fixed Code:**
```javascript
// ✅ CORRECT — Base64 encoding
const signatureBuffer = await crypto.subtle.sign('HMAC', cryptoKey, msgData);
const signature = btoa(String.fromCharCode(...new Uint8Array(signatureBuffer)));
```

**File Changed:** `backend/src/services/gasfreeProxy.ts`

**Impact:** ALL API calls were failing with 401. This was the primary blocker.

---

### Bug #2: POST Body Included in HMAC Signature (401 on POST Only)

**Error Message:**
```
401 Authorization hash not match, method: POST, path: /nile/api/v1/gasfree/submit
```

**Root Cause:**
GET requests started working after Bug #1 fix, but POST requests still failed. The backend was including the **JSON request body** in the HMAC signature message for POST requests:

**Wrong Code:**
```javascript
// ❌ WRONG — Body included in signature
const message = `${method}${path}${timestamp}${body}`;
```

**Fixed Code:**
```javascript
// ✅ CORRECT — Body is NEVER included
const message = `${method}${path}${timestamp}`;
```

**How We Verified:**
We created a standalone test script (`scratch/test_post_auth.js`) that tested 4 variations:

| Variation | Message Format | Result |
|-----------|---------------|--------|
| Full Path + Body | `POST/nile/.../submit{timestamp}{body}` | ❌ 401 |
| **Full Path, No Body** | **`POST/nile/.../submit{timestamp}`** | **✅ 200** |
| Relative Path + Body | `POST/api/.../submit{timestamp}{body}` | ❌ 401 |
| Relative Path, No Body | `POST/api/.../submit{timestamp}` | ❌ 401 |

**File Changed:** `backend/src/services/gasfreeProxy.ts`

---

### Bug #3: Wrong Signature Field Name (500 Internal Server Error)

**Error Message:**
```
GasFree submit error: Failed (internal server error).
```

**Root Cause:**
The GasFree submit API expects the signature field to be named `sig`, but our backend was sending it as `signature`:

**Wrong Code:**
```javascript
// ❌ WRONG — Field name "signature"
const payload = { signature, ...message };
```

**Fixed Code:**
```javascript
// ✅ CORRECT — Field name "sig"
const payload = { sig: signature, ...message };
```

**File Changed:** `backend/src/services/gasfreeProxy.ts` (line 130)

---

### Bug #4: Wrong Service Provider Address (ProviderAddressNotMatchException)

**Error Message:**
```
GasFree submit error: ProviderAddressNotMatchException
```

**Root Cause:**
The frontend hardcoded `THQGuFzL87ZqhxkgqYEryRAd7gqFqL5rdc` as the service provider address. This is actually the **GasFreeController (verifying contract)**, NOT the service provider.

**How We Found the Correct Address:**
Queried the GasFree provider API:
```
GET https://open-test.gasfree.io/nile/api/v1/config/provider/all
```
Response:
```json
{
  "data": {
    "providers": [{
      "address": "TKtWbdzEq5ss9vTS9kwRhBp5mXmBfBns3E",
      "name": "gasfree-provider"
    }]
  }
}
```

**Wrong Code:**
```javascript
// ❌ WRONG — This is the verifying contract, not the provider
const PROVIDER_ADDRESS_NILE = 'THQGuFzL87ZqhxkgqYEryRAd7gqFqL5rdc';
```

**Fixed Code:**
```javascript
// ✅ CORRECT — Actual service provider from /config/provider/all
const PROVIDER_ADDRESS_NILE = 'TKtWbdzEq5ss9vTS9kwRhBp5mXmBfBns3E';
```

**File Changed:** `frontend/src/views/SendView.jsx` (line 8)

---

### Bug #5: No USDT at GasFree Proxy Address (InsufficientBalanceException)

**Error Message:**
```
GasFree submit error: InsufficientBalanceException
```

**Root Cause:**
The user's 99.43 USDT was at their **regular EOA address** (`TJBpgUDZEhyJ3GmgAM8DUdFoPCxfWZPuaX`), but GasFree transfers require USDT to be at the **GasFree proxy address** (`TDphhaD2bYHV86ce57t7hA4SWqyzWJ5psn`).

**Solution:**
Transferred 20 USDT from EOA to GasFree proxy address using a regular TRC-20 transfer:
```javascript
const contract = await tronWeb.contract().at(USDT_CONTRACT);
await contract.methods.transfer(GASFREE_PROXY, 20_000_000).send();
```

**TX Hash:** `a9f1a3d6805881c590b02539378b2f653e98b89749bf66f997ba2be8d0b854c0`

**File Used:** `scratch/deposit_to_gasfree.js`

> **Note for users:** Users must transfer USDT to their GasFree proxy address first. The UI shows this address under "⚡ GasFree Address".

---

### Bug #6: D1 Database Crash on Undefined Values (500 After Successful Transfer)

**Error Message:**
```
D1_TYPE_ERROR: Type 'undefined' not supported for value 'undefined'
```

**Root Cause:**
The GasFree API response uses field names like `traceId` instead of our expected `txHash`. When `result.txHash` was `undefined`, Cloudflare D1 crashed because it doesn't accept `undefined` as a SQL parameter.

**Wrong Code:**
```javascript
// ❌ WRONG — result.txHash might be undefined
txHash: result.txHash,
providerFee: result.fee || '0',
```

**Fixed Code:**
```javascript
// ✅ CORRECT — Null coalescing with fallbacks
const txHash = result.txHash || result.traceId || result.transactionHash || txId;
const resultFee = result.fee || result.actualFee || '0';
txHash: String(txHash),
providerFee: String(resultFee),
```

**File Changed:** `backend/src/index.ts` (lines 137-165)

---

### Bug #7: Settings Page Crash (Missing Prop Destructuring)

**Error Message:**
```
Blank/white screen when clicking Settings in bottom nav
```

**Root Cause:**
The `SettingsView` component was receiving an `onAdmin` prop from `App.jsx` but **not destructuring it** in its function signature. When React rendered the JSX containing `onClick={onAdmin}`, it referenced an undefined variable, causing a crash.

**Wrong Code:**
```javascript
// ❌ WRONG — onAdmin not destructured, crashes when JSX references it
export function SettingsView({ onBack }) {
```

**Fixed Code:**
```javascript
// ✅ CORRECT — Both props destructured
export function SettingsView({ onBack, onAdmin }) {
```

**File Changed:** `frontend/src/views/SettingsView.jsx` (line 8)

---

## Admin Dashboard Access

### How to Access

1. **Login** to Z-Vault Pro with a wallet address that is in the **admin whitelist**
2. Go to **Settings** (bottom nav bar)
3. You will see a **"📊 Admin Dashboard"** button (only visible to whitelisted addresses)
4. Click it to view revenue, profit, and transaction volume stats

### Current Admin Whitelist

The admin whitelist is defined in `frontend/src/store/constants.js`:

```javascript
export const ADMIN_WHITELIST = [
  'TJBpgUDZEhyJ3GmgAM8DUdFoPCxfWZPuaX', // Testing account
  'TBjkHJyKRN2YhxCeeNM7A8QVgK7hG8ubkv', // Treasury account
];
```

### Adding New Admin Addresses

1. Edit `frontend/src/store/constants.js`
2. Add the TRON address to the `ADMIN_WHITELIST` array
3. Rebuild and redeploy the frontend:
   ```bash
   cd frontend
   npm run build
   npx wrangler pages deploy dist --project-name z-vault-pro-frontend
   ```

### Dashboard Shows

| Metric | Description |
|--------|-------------|
| **Total Revenue** | Sum of all platform fees collected ($1.10 per transfer) |
| **Total Profit** | Revenue minus GasFree provider costs |
| **Transaction Volume** | Total USDT transferred through the platform |
| **Transaction Count** | Number of successful transfers |
| **Available Profit** | Total Profit minus already withdrawn amounts |
| **Treasury Address** | The configured withdrawal destination |

### Withdrawing Profit to Treasury

1. Go to **Admin Dashboard**
2. The **"💰 Withdraw to Treasury"** section shows:
   - **Available**: Profit that can be withdrawn
   - **Withdrawn**: Total amount already withdrawn
   - **Treasury Address**: Where funds go (`TBjkHJyKRN2YhxCeeNM7A8QVgK7hG8ubkv`)
3. Enter an amount or click **MAX** to fill the available balance
4. Click **"Withdraw to Treasury"**
5. The withdrawal is recorded in D1 and appears in the **Withdrawal History**

### Backend API Endpoints (Admin)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/stats` | GET | Revenue, profit, volume, treasury info |
| `/api/admin/withdraw` | POST | Record a profit withdrawal |
| `/api/admin/withdrawals` | GET | List withdrawal history |

---

## Mainnet Deployment Guide

### What Changes for Mainnet

| Setting | Testnet (Current) | Mainnet |
|---------|-------------------|---------|
| `NETWORK_MODE` | `testnet` | `mainnet` |
| GasFree API URL | `https://open-test.gasfree.io/nile` | `https://open.gasfree.io/tron` |
| Path Prefix | `/nile` | `/tron` |
| USDT Contract | `TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf` | `TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t` |
| Chain ID | `0xcd8690dc` (3448148188) | `0x2b6653dc` (728126428) |
| RPC URL | `https://nile.trongrid.io` | `https://api.trongrid.io` |
| Service Provider | `TKtWbdzEq5ss9vTS9kwRhBp5mXmBfBns3E` | **Must be fetched from mainnet API** |

### Step-by-Step Mainnet Deployment

#### Step 1: Get Mainnet GasFree API Credentials

1. Register at [https://gasfree.io](https://gasfree.io) for mainnet access
2. Obtain your mainnet `API_KEY` and `API_SECRET`
3. These may be different from your testnet credentials

#### Step 2: Find the Mainnet Service Provider Address

```bash
# Query the mainnet provider list
curl -H "Timestamp: $(date +%s)" \
     -H "Authorization: ApiKey YOUR_KEY:YOUR_SIG" \
     https://open.gasfree.io/tron/api/v1/config/provider/all
```

Update the address in `frontend/src/views/SendView.jsx`:
```javascript
const PROVIDER_ADDRESS_MAIN = 'T_MAINNET_PROVIDER_ADDRESS_HERE';
```

#### Step 3: Update Backend Environment

```bash
cd backend

# Update the network mode
# Edit wrangler.toml: Change NETWORK_MODE = "mainnet"

# Set mainnet API credentials
wrangler secret put GASFREE_API_KEY
# Enter your mainnet API key

wrangler secret put GASFREE_API_SECRET
# Enter your mainnet API secret

# Deploy
wrangler deploy
```

#### Step 4: Update Frontend Constants

Edit `frontend/src/store/constants.js`:
```javascript
export const NETWORKS = {
  mainnet: {
    label: 'TRON Mainnet',
    chainId: 0x2b6653dc,
    rpcUrl: 'https://api.trongrid.io',
    usdtContract: 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t',
    apiBackend: 'https://z-vault-pro-api.ameennm71.workers.dev',
  },
};
```

#### Step 5: Rebuild and Deploy Frontend

```bash
cd frontend
npm run build
npx wrangler pages deploy dist --project-name z-vault-pro-frontend
```

#### Step 6: Users Must Deposit to GasFree Proxy

On mainnet, each user MUST:
1. Open the wallet and go to **"⚡ GasFree Address"**
2. Copy their GasFree proxy address
3. Send USDT to that proxy address from any exchange or wallet
4. Then use the "Send" feature for gasless transfers

### ⚠️ Mainnet Warnings

1. **REAL MONEY**: Mainnet uses real USDT. Test everything thoroughly on Nile first.
2. **API Credentials**: Mainnet credentials are different from testnet. Never expose them.
3. **Provider Address**: The mainnet service provider address will be different. Always fetch dynamically.
4. **Platform Fee**: The $1.10 platform fee is charged per transfer on mainnet too. Adjust in `wrangler.toml` if needed.
5. **Admin Whitelist**: Update with your actual mainnet wallet addresses.

---

## GasFree Auth Specification

### Authentication Formula

```
Signature = Base64(HMAC-SHA256(API_SECRET, METHOD + PATH + TIMESTAMP))

HTTP Headers:
  Authorization: ApiKey {API_KEY}:{Signature}
  Timestamp: {TIMESTAMP}
  Content-Type: application/json
```

### Rules

| Rule | Detail |
|------|--------|
| **Method** | Uppercase: `GET` or `POST` |
| **Path** | Full path with network prefix: `/nile/api/v1/...` or `/tron/api/v1/...` |
| **Timestamp** | Unix epoch in **seconds** (not milliseconds) |
| **Body** | **NEVER** included in the signature, even for POST requests |
| **Encoding** | Base64 (NOT Hex) |
| **Secret** | Used as raw UTF-8 string (NOT Base64-decoded) |

### Submit Endpoint Fields

```json
POST /nile/api/v1/gasfree/submit
{
  "sig": "0x...",          // ← Must be "sig", NOT "signature"
  "token": "TXYZ...",
  "serviceProvider": "TKtW...",
  "user": "TJBp...",
  "receiver": "TQso...",
  "value": "5000000",
  "maxFee": "1100000",
  "deadline": "1776880000",
  "version": "1",
  "nonce": "0"
}
```

---

## Configuration Reference

### Backend Secrets (via `wrangler secret put`)

| Secret | Description |
|--------|-------------|
| `GASFREE_API_KEY` | Your GasFree API key |
| `GASFREE_API_SECRET` | Your GasFree API secret (used for HMAC) |
| `TREASURY_ADDRESS` | Your treasury TRON address for fee collection |

### Backend Environment Variables (in `wrangler.toml`)

| Variable | Testnet Value | Description |
|----------|--------------|-------------|
| `NETWORK_MODE` | `testnet` | `testnet` or `mainnet` |
| `GASFREE_PROVIDER_URL_TESTNET` | `https://open-test.gasfree.io/nile` | Nile API URL |
| `GASFREE_PROVIDER_URL_MAINNET` | `https://open.gasfree.io/tron` | Mainnet API URL |
| `USDT_CONTRACT_TESTNET` | `TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf` | Nile USDT |
| `USDT_CONTRACT_MAINNET` | `TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t` | Mainnet USDT |
| `PLATFORM_FEE_USDT` | `1.10` | Fee per transfer |

### Frontend Constants (`frontend/src/store/constants.js`)

| Constant | Description |
|----------|-------------|
| `NETWORKS` | RPC URLs, chain IDs, USDT contracts per network |
| `ADMIN_WHITELIST` | TRON addresses allowed to access the admin dashboard |

### Key Addresses (Nile Testnet)

| Address | Role |
|---------|------|
| `TKtWbdzEq5ss9vTS9kwRhBp5mXmBfBns3E` | GasFree Service Provider |
| `THQGuFzL87ZqhxkgqYEryRAd7gqFqL5rdc` | GasFreeController (verifying contract) — NOT the provider |
| `TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf` | USDT Token Contract (Nile) |

---

## Deployment Commands

### Deploy Backend
```bash
cd backend
wrangler deploy
```

### Deploy Frontend
```bash
cd frontend
npm run build
npx wrangler pages deploy dist --project-name z-vault-pro-frontend
```

### Set Secrets
```bash
cd backend
wrangler secret put GASFREE_API_KEY
wrangler secret put GASFREE_API_SECRET
wrangler secret put TREASURY_ADDRESS
```

---

*Last Updated: April 23, 2026*
*Status: ✅ Fully Operational on Nile Testnet — All 7 bugs fixed, treasury withdrawal active*
