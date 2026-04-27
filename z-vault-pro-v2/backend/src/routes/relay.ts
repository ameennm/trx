import { Router } from 'express';
import { getRelayHistory, getVaultStatus, submitRelay } from '../services/relayService.js';
import { appConfig } from '../config.js';
import { rateLimit } from '../middleware/rateLimit.js';

export const relayRouter = Router();

relayRouter.get('/health', (_req, res) => {
  res.json({
    service: 'z-vault-pro-v2-backend',
    network: appConfig.NETWORK,
    relayerAddress: appConfig.RELAYER_ADDRESS,
    relayerContract: appConfig.RELAYER_CONTRACT,
    treasuryAddress: appConfig.TREASURY_ADDRESS,
    platformFeeUsdt: appConfig.PLATFORM_FEE_USDT,
    firstSendFeeUsdt: appConfig.FIRST_SEND_FEE_USDT,
    energyProviderMode: appConfig.ENERGY_PROVIDER_MODE
  });
});

relayRouter.get('/config', (_req, res) => {
  res.json({
    usdtContract: appConfig.USDT_CONTRACT,
    relayerContract: appConfig.RELAYER_CONTRACT,
    relayerAddress: appConfig.RELAYER_ADDRESS,
    platformFeeUsdt: appConfig.PLATFORM_FEE_USDT,
    firstSendFeeUsdt: appConfig.FIRST_SEND_FEE_USDT,
    maxFeeSun: String(Math.floor(Math.max(appConfig.PLATFORM_FEE_USDT, appConfig.FIRST_SEND_FEE_USDT) * 1_000_000)),
    network: appConfig.NETWORK,
    chainId: appConfig.NETWORK === 'mainnet' ? 0x2b6653dc : 0xcd8690dc,
    rpcUrl: appConfig.TRONGRID_RPC_URL,
    energyProviderMode: appConfig.ENERGY_PROVIDER_MODE
  });
});

relayRouter.get('/vault/:userAddress', async (req, res, next) => {
  try {
    const vault = await getVaultStatus(req.params.userAddress);
    res.json({ success: true, ...vault });
  } catch (error) {
    next(error);
  }
});

relayRouter.post('/relay', rateLimit({ windowMs: 60_000, max: 12 }), async (req, res, next) => {
  try {
    const result = await submitRelay(req.body);
    res.json({ success: true, ...result });
  } catch (error) {
    next(error);
  }
});

relayRouter.get('/history/:userAddress', async (req, res, next) => {
  try {
    const rows = await getRelayHistory(req.params.userAddress);
    res.json({ success: true, rows });
  } catch (error) {
    next(error);
  }
});
