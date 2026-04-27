# What To Do Next

1. Deploy `MockTRC20.sol` and the latest `ZVaultRelayer.sol` on Nile with `maxFee_ = 3000000`.
2. Fill `backend/.env` with Nile addresses and keep `ENERGY_PROVIDER_MODE=mock`.
3. Start the backend and frontend locally.
4. Import a test user wallet and confirm `/api/vault/:userAddress` returns the predicted vault.
5. Mint mock USDT directly to the predicted vault address.
6. Send mock USDT from the undeployed vault through the relayer.
7. Confirm recipient amount, treasury fee, vault remaining balance, and history status.
8. Test the sweep sentinel with a small dust balance.
9. Test direct `emergencyWithdraw` from a deployed vault using the owner/controller wallet.
10. After Nile succeeds, configure a Hostinger VPS with HTTPS, PM2, Nginx, and static-IP Netts access.
11. Deploy the latest `ZVaultRelayer.sol` on mainnet with `allowedToken_ = TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t` and `maxFee_ = 3000000`.
12. Switch only mainnet to `ENERGY_PROVIDER_MODE=netts`.
13. Deploy Cloudflare Pages with `VITE_BACKEND_URL=https://YOUR_API_DOMAIN/api`.
14. Run one canary transaction before public launch: vault receives `5 USDT`, sends `1 USDT`, activation fee is `3 USDT`, vault remains `1 USDT`.
