import { appConfig } from './config';

export async function getConfig() {
  const response = await fetch(`${appConfig.backendUrl}/config`);
  return response.json();
}

export async function getHistory(userAddress: string) {
  const response = await fetch(`${appConfig.backendUrl}/history/${userAddress}`);
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
  return response.json();
}
