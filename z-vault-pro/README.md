# Z-Vault Pro — Non-Custodial USDT Wallet with Gas Abstraction

> **Gasless USDT Transfers** on TRON Nile Testnet & EVM Sepolia  
> BIP-39 Mnemonic · PIN Lock · Multi-Chain · CEO Profit Logging

---

## 🏗️ Architecture

```
┌───────────────────┐     ┌───────────────────┐     ┌───────────────────┐
│  React Frontend   │────▶│   Relayer API     │────▶│  GasStation.sol   │
│ (Vite + Tailwind) │     │  (Express/TS)     │     │  (Nile Testnet)   │
└───────────────────┘     └───────────────────┘     └───────────────────┘
   BIP-39 Seed              Pays Gas (TRX)           Executes
   PIN Encryption            CEO Logs 💰           transferFrom × 2
```

---

## 🚀 Quick Start

### 1. Install Dependencies

```bash
# Frontend
cd z-vault-pro/frontend && npm install

# Server
cd ../server && npm install
```

### 2. Configure

```bash
cp .env.example server/.env
# Edit server/.env with your relayer private key
```

### 3. Start Relayer

```bash
cd server && npm run dev
```

### 4. Start Frontend

```bash
cd frontend && npm run dev
```

Open **http://localhost:5173** in your browser.

---

## 📁 Project Structure

```
z-vault-pro/
├── frontend/                    # React + Vite + Tailwind CSS
│   └── src/
│       ├── pages/
│       │   ├── Welcome.jsx      # Create/Import wallet
│       │   ├── SeedPhrase.jsx   # 12-word display + verification
│       │   ├── PinSetup.jsx     # 6-digit PIN lock (iOS style)
│       │   ├── Dashboard.jsx    # USDT-only balance view
│       │   └── SendPage.jsx     # Gasless send flow
│       ├── services/
│       │   ├── walletService.js # BIP-39/BIP-44 key derivation
│       │   ├── cryptoService.js # PIN encryption + IndexedDB
│       │   └── apiService.js    # Relayer API client
│       ├── stores/
│       │   ├── WalletContext.jsx # Global state management
│       │   └── ToastContext.jsx  # Toast notifications
│       ├── App.jsx              # View router
│       └── index.css            # Design system
├── server/                      # Express Relayer
│   └── src/
│       ├── index.ts             # API + CEO profit logging
│       ├── relayer.ts           # Transaction relay
│       ├── feeCalc.ts           # Fee slab calculator
│       ├── accountCheck.ts      # Active/new account detection
│       └── config.ts            # Configurable markup (15/20%)
├── contracts/
│   └── GasStation.sol           # Forwarder contract
└── .env.example                 # Config template
```

---

## ⚡ Features

- **BIP-39 Mnemonic**: 12-word recovery phrase with verification screen
- **Multi-Chain**: Derives TRON (T-address) + EVM (0x-address) from same seed
- **PIN Lock**: 6-digit PIN with AES-256 encryption + IndexedDB storage
- **USDT-Only Dashboard**: Clean view showing only USDT balance
- **Gasless Transfers**: Send USDT with 0 TRX — fees paid in USDT
- **CEO Logging**: Every relay prints profit to terminal
- **Configurable Markup**: Set `MARKUP_PERCENT=20` in .env to change from 15% to 20%
