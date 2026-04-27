import { appConfig } from '../config.js';
import { logEvent } from '../lib/logger.js';

export async function rentEnergy(params: {
  recipientAddress: string;
  amount: number;
  correlationId: string;
}) {
  const amount = Math.max(params.amount, 65000);

  if (appConfig.ENERGY_PROVIDER_MODE === 'mock') {
    const result = {
      mode: 'mock',
      success: true,
      recipientAddress: params.recipientAddress,
      amount,
      correlationId: params.correlationId
    };
    logEvent('energy_rent_mocked', result);
    return result;
  }

  const response = await fetch(`${appConfig.NETTS_API_URL.replace(/\/$/, '')}/order1h`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-KEY': appConfig.NETTS_API_KEY,
      'X-Correlation-Id': params.correlationId
    },
    body: JSON.stringify({
      receiveAddress: params.recipientAddress,
      resourceValue: amount,
      amount
    })
  });

  const text = await response.text();
  let data: any = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }

  if (!response.ok) {
    throw new Error(data.msg || data.error || `Netts API failed with ${response.status}`);
  }

  if (typeof data.code !== 'undefined' && ![0, 200].includes(Number(data.code))) {
    throw new Error(data.msg || data.error || `Netts rejected request with code ${data.code}`);
  }

  return data;
}
