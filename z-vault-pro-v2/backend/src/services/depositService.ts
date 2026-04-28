import { appConfig } from '../config.js';
import { getVaultStatus } from './relayService.js';

type TronGridTransfer = {
  transaction_id?: string;
  block_timestamp?: number;
  from?: string;
  to?: string;
  type?: string;
  value?: string;
  token_info?: {
    address?: string;
    symbol?: string;
    decimals?: number;
  };
};

function tokenMatches(row: TronGridTransfer) {
  const tokenAddress = row.token_info?.address || '';
  return tokenAddress === appConfig.USDT_CONTRACT;
}

export async function getReceivedDeposits(userAddress: string) {
  const vault = await getVaultStatus(userAddress);
  const url = new URL(`${appConfig.TRONGRID_RPC_URL.replace(/\/$/, '')}/v1/accounts/${vault.vaultAddress}/transactions/trc20`);
  url.searchParams.set('only_to', 'true');
  url.searchParams.set('contract_address', appConfig.USDT_CONTRACT);
  url.searchParams.set('limit', '50');
  url.searchParams.set('order_by', 'block_timestamp,desc');

  const response = await fetch(url, {
    headers: appConfig.TRONGRID_API_KEY ? {
      'TRON-PRO-API-KEY': appConfig.TRONGRID_API_KEY
    } : undefined
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Deposit scan failed: HTTP ${response.status}${body ? ` ${body.slice(0, 180)}` : ''}`);
  }

  const data = await response.json() as { data?: TronGridTransfer[] };
  const rows = (data.data || [])
    .filter(tokenMatches)
    .filter((row) => row.to === vault.vaultAddress)
    .map((row) => ({
      id: row.transaction_id || `${row.block_timestamp}-${row.from}`,
      type: 'received' as const,
      status: 'confirmed' as const,
      sender: row.from || '',
      recipient: row.to || vault.vaultAddress,
      amount_sun: row.value || '0',
      fee_sun: '0',
      tx_hash: row.transaction_id || null,
      created_at: row.block_timestamp || 0,
      updated_at: row.block_timestamp || 0
    }));

  return {
    vaultAddress: vault.vaultAddress,
    rows
  };
}
