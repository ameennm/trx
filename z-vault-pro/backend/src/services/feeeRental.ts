import type { Env } from '../worker-types.js';

/**
 * Netts.io Energy Rental Service
 * Uses the VPS Proxy to rent energy for gasless transfers.
 */

export async function rentEnergy(env: Env, energyAmount: number, recipientAddress?: string): Promise<string> {
  const isMainnet = env.NETWORK_MODE === 'mainnet';
  
  if (!isMainnet) {
    console.log(`[TESTNET] Simulating renting ${energyAmount} energy...`);
    return `sim_order_${Date.now()}`;
  }

  const apiKey = env.NETTS_API_KEY;
  if (!apiKey) throw new Error('NETTS_API_KEY is missing');

  // If no recipient is provided, it defaults to the treasury/relayer address
  const treasury = env.TREASURY_ADDRESS;
  if (!treasury) throw new Error('TREASURY_ADDRESS is missing');
  
  const targetAddress = recipientAddress || treasury;

  try {
    const vpsProxyUrl = env.VPS_PROXY_URL;
    const vpsSecret = env.VPS_SHARED_SECRET;

    if (!vpsProxyUrl || !vpsSecret) {
      throw new Error('VPS Proxy configuration missing (URL or Secret)');
    }

    console.log(`[Netts] Requesting ${energyAmount} energy for ${targetAddress} via VPS Proxy...`);

    const response = await fetch(vpsProxyUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Vault-Secret': vpsSecret,
      },
      body: JSON.stringify({
        api_key: apiKey,
        address: targetAddress,
        amount: Math.max(65000, energyAmount), // Minimum 65k for USDT transfer
      }),
    });

    const result = await response.json() as any;

    if (!response.ok || (result.code && result.code !== 200 && result.code !== 0)) {
      throw new Error(result.msg || result.error || `Netts/Proxy Error ${response.status}`);
    }

    console.log('[Netts] Energy rental success:', result.data?.order_id || 'Success');
    return result.data?.order_id || `netts_${Date.now()}`;
  } catch (error: any) {
    console.error('[Netts] Energy rental failed:', error);
    throw new Error(`Energy rental failed: ${error.message}`);
  }
}

