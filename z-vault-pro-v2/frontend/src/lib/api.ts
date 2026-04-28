import { appConfig } from './config';

export async function getConfig() {
  const response = await fetch(`${appConfig.backendUrl}/config`);
  return response.json();
}

export async function getHistory(userAddress: string) {
  const response = await fetch(`${appConfig.backendUrl}/history/${userAddress}`);
  return response.json();
}

export async function getDeposits(userAddress: string) {
  const response = await fetch(`${appConfig.backendUrl}/deposits/${userAddress}`);
  return response.json();
}

export async function getVault(userAddress: string) {
  const response = await fetch(`${appConfig.backendUrl}/vault/${userAddress}`);
  return response.json();
}

export async function submitRelay(payload: Record<string, unknown>) {
  const response = await fetch(`${appConfig.backendUrl}/relay`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });
  const data = await response.json().catch(() => ({ success: false, error: `HTTP ${response.status}` }));
  if (!response.ok) {
    return {
      success: false,
      status: data.status || 'failed',
      error: data.error || `HTTP ${response.status}`,
      details: data
    };
  }
  return data;
}
