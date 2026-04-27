# Z-Vault Pro V2

Clean-room rebuild of the TRON gasless USDT vault app.

## Layout

- `contracts/` Solidity contracts
- `backend/` Express relayer API for VPS deployment
- `frontend/` React + Vite app for Cloudflare Pages
- `docs/` deployment and operations guides

## Safety goals

- Never mark a relay as success until the transaction is confirmed on-chain
- Never rent Netts energy before signature, nonce, relayer, and vault checks pass
- Never let frontend optimistic state pretend money moved
- Never let duplicate clicks rent energy twice

## Quick start

1. Install dependencies:
   `npm install`
2. Copy backend env file:
   `copy backend\\.env.example backend\\.env`
3. Build everything:
   `npm run build`
4. Run backend locally:
   `npm run dev --workspace backend`
5. Run frontend locally:
   `npm run dev --workspace frontend`
