import { appConfig } from './config';

async function fetchJson(path: string, retries = 2) {
  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const response = await fetch(`${appConfig.backendUrl}${path}`);
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error || `HTTP ${response.status}`);
      }
      return data;
    } catch (error) {
      lastError = error;
      if (attempt < retries) {
        await new Promise((resolve) => setTimeout(resolve, 350 * (attempt + 1)));
      }
    }
  }

  throw lastError;
}

export async function getConfig() {
  return fetchJson('/config');
}

export async function getHistory(userAddress: string) {
  return fetchJson(`/history/${userAddress}`);
}

export async function getDeposits(userAddress: string) {
  return fetchJson(`/deposits/${userAddress}`);
}

export async function getVault(userAddress: string) {
  return fetchJson(`/vault/${userAddress}`);
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
