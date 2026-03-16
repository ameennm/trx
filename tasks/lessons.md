# Z-Vault — Lessons Learned

> This document tracks issues encountered during development and their solutions.

## Lesson 1: TRC20 USDT Has No `permit()` Support
- **Issue:** EIP-2612 `permit` is not available on TRC20 USDT, so we cannot do a "one-click gasless approval."
- **Solution:** Users must perform a one-time `approve()` transaction on the GasStation contract. The relayer pays gas for this approval too.
- **Impact:** First-time users have an extra step, but it's transparent and gas-free from their perspective.


## Deployment Error — 2026-03-16T07:20:49.575Z
- **Error:** Invalid bytecode provided
- **Root Cause:** TBD (investigate energy/bandwidth requirements)
- **Resolution:** TBD
