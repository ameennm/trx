# Z-Vault — Non-Custodial TRON Wallet with Gas Abstraction

> **Gasless USDT Transfers** on TRON Nile Testnet  
> Users with 0 TRX can send USDT — fees are deducted from their USDT balance.

---

## 🏗️ Architecture

```
┌──────────────────┐     ┌──────────────────┐     ┌──────────────────┐
│   Frontend UI    │────▶│   Relayer API    │────▶│  GasStation.sol  │
│  (Browser/Key)   │     │  (Node.js/TRX)   │     │  (Nile Testnet)  │
└──────────────────┘     └──────────────────┘     └──────────────────┘
       Signs                 Pays Gas                Executes
     Meta-Tx                 (TRX)               transferFrom × 2
```

### Fee Slab System (15% Markup)

| Recipient | Base TRX | USDT Equiv | + 15% Markup | Total Fee |
|-----------|----------|------------|--------------|-----------|
| Active    | 13.5     | ~3.92      | ~0.59        | **~4.50** |
| New       | 27.0     | ~7.83      | ~1.17        | **~9.00** |

*TRX price mocked at $0.29*

---

## 🚀 Quick Start

### 1. Clone & Install

```bash
cd server
npm install
```

### 2. Configure

```bash
cp .env.example .env
# Edit .env with your relayer private key
```

Get test TRX from the [Nile Faucet](https://nileex.io/join/getJoinPage).

### 3. Deploy Contract

```bash
cd server
npm run deploy-contract
```

### 4. Start Relayer

```bash
cd server
npm run dev
```

### 5. Open Frontend

Open `frontend/index.html` in your browser.

---

## 📁 Project Structure

```
trx/
├── contracts/
│   └── GasStation.sol         # Forwarder contract
├── server/
│   └── src/
│       ├── index.ts           # Express API server
│       ├── relayer.ts         # Transaction construction & relay
│       ├── feeCalc.ts         # 15% markup slab calculator
│       ├── accountCheck.ts    # Active vs new account detection
│       ├── config.ts          # Environment configuration
│       └── deploy.ts          # Contract deployment script
├── frontend/
│   ├── index.html             # Single-page wallet app
│   ├── css/style.css          # Premium dark theme
│   └── js/
│       ├── app.js             # Main controller
│       ├── wallet.js          # Key management
│       ├── send.js            # Send USDT flow
│       └── ui.js              # UI utilities
├── tasks/
│   ├── todo.md                # Progress tracker
│   └── lessons.md             # Lessons learned
└── .env.example               # Config template
```

---

## 🔧 API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/health` | Health check & relayer status |
| `POST` | `/api/quote` | Get fee breakdown for a transfer |
| `POST` | `/api/relay` | Submit signed meta-transaction |
| `GET` | `/api/nonce/:addr` | Get user's current nonce |
| `GET` | `/api/balance/:addr` | Get USDT balance |
| `GET` | `/api/config` | Server configuration |

---

## ⚡ How It Works

1. **One-time approval**: User approves GasStation contract to spend USDT
2. **Get quote**: Frontend calls `/api/quote` → gets fee breakdown
3. **Sign**: User signs EIP-712 typed data hash in browser
4. **Relay**: Signed data sent to `/api/relay` → relayer pays TRX gas
5. **Execute**: GasStation contract does `transferFrom(user→recipient)` + `transferFrom(user→relayer)`

---

## 📝 License

MIT
