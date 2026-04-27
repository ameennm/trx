# Deployment

## Nile Testnet First

Use Nile before mainnet. Nile should use `ENERGY_PROVIDER_MODE=mock`, so the backend exercises the same relay path but does not spend Netts balance.

### 1. Get Nile TRX

1. Create a relayer wallet for testing.
2. Fund it with Nile TRX from the official Nile faucet.
3. Keep this relayer private key only in `backend/.env`.

### 2. Deploy Contracts On Nile

Deploy these contracts with TronIDE or your preferred TRON deploy tool:

1. `contracts/MockTRC20.sol`
   Constructor values:
   `name_ = Test USDT`
   `symbol_ = USDT`
   `decimals_ = 6`

2. `contracts/ZVaultRelayer.sol`
   Constructor values:
   `treasury_ = your Nile treasury address`
   `authorizedRelayer_ = the Nile address derived from RELAYER_PRIVATE_KEY`
   `allowedToken_ = your MockTRC20 contract address`
   `maxFee_ = 3000000`

The production fee policy is:

- First undeployed-vault send / activation: `3.00 USDT`
- Normal deployed-vault send: `1.20 USDT`

The `maxFee_` constructor value must be `3000000` because USDT uses 6 decimals. This lets the first-send fee work while still preventing any frontend/backend bug from charging more than `3 USDT`.

After deployment, copy:

- Mock token contract address into `USDT_CONTRACT`
- Relayer contract address into `RELAYER_CONTRACT`
- Relayer address into `RELAYER_ADDRESS`
- Treasury address into `TREASURY_ADDRESS`

### 3. Configure Backend For Nile

Create `backend/.env` from `backend/.env.example` and use:

```env
NETWORK=nile
ENERGY_PROVIDER_MODE=mock
TRONGRID_RPC_URL=https://nile.trongrid.io
TRONGRID_API_KEY=
NETTS_API_URL=https://netts.io/apiv2
NETTS_API_KEY=
USDT_CONTRACT=YOUR_MOCK_TOKEN_CONTRACT
RELAYER_CONTRACT=YOUR_NILE_RELAYER_CONTRACT
RELAYER_PRIVATE_KEY=YOUR_NILE_RELAYER_PRIVATE_KEY
RELAYER_ADDRESS=YOUR_NILE_RELAYER_ADDRESS
TREASURY_ADDRESS=YOUR_NILE_TREASURY_ADDRESS
PLATFORM_FEE_USDT=1.20
FIRST_SEND_FEE_USDT=3.00
```

### 4. Prove The Vault Address

Start the backend and import a test user wallet in the frontend. The frontend calls `/api/vault/:userAddress`, and the backend compares:

- backend-calculated vault address
- contract `getWalletAddress(owner)`

If these differ, the backend returns an error and the app must not continue.

### 5. Fund The Predicted Vault

In TronIDE, call `mint(vaultAddress, 10000000)` on `MockTRC20` to mint `10` test USDT directly to the predicted vault address.

Then call `/api/vault/:userAddress` again. It should show:

- `balanceSun = 10000000`
- `deployed = false` if the vault has not been deployed yet

### 6. Send From The Vault

Use the frontend to send `2` test USDT to another Nile address.

Expected result:

- backend uses mock energy rental
- relayer deploys the vault if needed
- vault sends `2` test USDT to recipient
- vault sends platform fee to treasury
- backend marks success only after confirmed receipt

### Sweep Support

The relayer contract supports a sweep sentinel for cleanup flows:

```text
value = type(uint256).max
```

When this value is signed, the contract reads the vault's current token balance, subtracts the signed fee, and sends the remainder to the receiver. This is intended for dust cleanup and "send all" UX.

The backend still rejects insufficient balances before mock/Netts energy rental.

### Emergency Withdrawal

Each deployed vault also has `emergencyWithdraw(token, receiver, amount)`.

This can only be called by the vault owner/controller address. It is a self-custody escape hatch for cases where the relayer is unavailable. It is not gasless, so the owner must have TRX/Bandwidth to use it directly.

Use `amount = type(uint256).max` to withdraw the full token balance.

### 7. Only Then Prepare Mainnet

Do not switch to `ENERGY_PROVIDER_MODE=netts` until the Nile flow succeeds.

## Backend

1. Provision a Hostinger VPS with static IPv4.
2. Point an HTTPS domain or subdomain to the VPS, for example `api.yourdomain.com`.
3. Install Node.js 22+, PM2, Nginx, and Certbot.
4. Copy `backend/.env.example` to `backend/.env`.
5. Fill secrets and contract addresses.
6. Run:
   `npm install`
   `npm run build --workspace backend`
7. Run the backend with PM2, not a terminal session.
8. Put Nginx in front of the backend and terminate HTTPS with Certbot.
9. Confirm `/api/health` and `/api/config` work over HTTPS.

Mainnet backend values:

```env
NETWORK=mainnet
ENERGY_PROVIDER_MODE=netts
TRONGRID_RPC_URL=https://api.trongrid.io
TRONGRID_API_KEY=YOUR_TRONGRID_KEY
NETTS_API_URL=https://netts.io/apiv2
NETTS_API_KEY=YOUR_NETTS_KEY
USDT_CONTRACT=TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t
RELAYER_CONTRACT=YOUR_MAINNET_RELAYER_CONTRACT
RELAYER_PRIVATE_KEY=YOUR_MAINNET_RELAYER_PRIVATE_KEY
RELAYER_ADDRESS=YOUR_MAINNET_RELAYER_ADDRESS
TREASURY_ADDRESS=YOUR_MAINNET_TREASURY_ADDRESS
PLATFORM_FEE_USDT=1.20
FIRST_SEND_FEE_USDT=3.00
RELAYER_TRX_BUFFER=500
```

## Frontend

1. Set Cloudflare Pages environment variable:
   `VITE_BACKEND_URL=https://api.yourdomain.com/api`
2. Run:
   `npm run build --workspace frontend`
3. Deploy `frontend/dist` to Cloudflare Pages.
4. Keep `frontend/public/_redirects`.
