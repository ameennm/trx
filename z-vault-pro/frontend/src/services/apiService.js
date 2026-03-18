/**
 * Crypxe — Relayer API Service
 * Communicates with the backend relayer for quotes, relays, and balances.
 */

const API_BASE = 'https://crypxe-api.ameennm71.workers.dev/api';

async function fetchJSON(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options.headers },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

/**
 * Health check.
 */
export async function getHealth() {
  return fetchJSON(`${API_BASE}/health`);
}

/**
 * Get server config.
 */
export async function getConfig() {
  return fetchJSON(`${API_BASE}/config`);
}

/**
 * Get USDT balance for an address.
 */
export async function getBalance(address) {
  const data = await fetchJSON(`${API_BASE}/balance/${address}`);
  return data.balance || 0;
}

/**
 * Get nonce for an address.
 */
export async function getNonce(address) {
  const data = await fetchJSON(`${API_BASE}/nonce/${address}`);
  return data.nonce || 0;
}

/**
 * Get a fee quote for a proposed transfer.
 */
export async function getQuote(from, to, amount) {
  const data = await fetchJSON(`${API_BASE}/quote`, {
    method: 'POST',
    body: JSON.stringify({ from, to, amount }),
  });
  if (!data.success) throw new Error(data.error || 'Quote failed');
  return data.quote;
}

/**
 * Relay a signed meta-transaction.
 */
export async function relayTransaction({ from, to, sendAmount, feeAmount, deadline, v, r, s }) {
  const data = await fetchJSON(`${API_BASE}/relay`, {
    method: 'POST',
    body: JSON.stringify({
      from,
      to,
      sendAmount: sendAmount.toString(),
      feeAmount: feeAmount.toString(),
      deadline: deadline.toString(),
      v: v.toString(),
      r,
      s,
    }),
  });
  if (!data.success) throw new Error(data.error || 'Relay failed');
  return data;
}

/**
 * Request TRX funding for a new user's approval gas.
 * The TRX cost will be recovered from their first USDT transfer.
 */
export async function fundForApproval(address) {
  const data = await fetchJSON(`${API_BASE}/fund-for-approval`, {
    method: 'POST',
    body: JSON.stringify({ address }),
  });
  return data;
}
