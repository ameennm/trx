import type { Env } from '../worker-types.js';

/**
 * Z-Vault Pro — GasFree Provider Proxy Service
 * 
 * OFFICIAL SPEC: Base64(HMAC-SHA256(Secret, Method + Path + Timestamp))
 * Body is NOT included in the signature for any method.
 */

interface GasFreeAccount {
  address: string;
  nonce: string;
  activated: boolean;
}

interface TokenConfig {
  contract: string;
  symbol: string;
  decimals: number;
  transferFee: string;
  activationFee: string;
}

interface SubmitResult {
  txHash: string;
  status: string;
  fee: string;
}

function getProviderUrl(env: Env): string {
  return env.NETWORK_MODE === 'mainnet'
    ? env.GASFREE_PROVIDER_URL_MAINNET
    : env.GASFREE_PROVIDER_URL_TESTNET;
}

/**
 * Generate HMAC-SHA256 signature for API authentication.
 * Message: {METHOD}{PATH}{TIMESTAMP} — body is NEVER included.
 * Output: Base64 encoded.
 */
async function generateAuthHeaders(env: Env, method: string, path: string): Promise<Record<string, string>> {
  const encoder = new TextEncoder();
  const timestamp = Math.floor(Date.now() / 1000).toString();
  
  const message = `${method}${path}${timestamp}`;
  const keyData = encoder.encode(env.GASFREE_API_SECRET);
  const msgData = encoder.encode(message);

  const cryptoKey = await crypto.subtle.importKey(
    'raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );

  const signatureBuffer = await crypto.subtle.sign('HMAC', cryptoKey, msgData);
  const signature = btoa(String.fromCharCode(...new Uint8Array(signatureBuffer)));

  return {
    'Content-Type': 'application/json',
    'Timestamp': timestamp,
    'Authorization': `ApiKey ${env.GASFREE_API_KEY}:${signature}`
  };
}

/**
 * Make an authenticated request to the GasFree API.
 */
async function fetchGasFree(url: string, method: string, path: string, env: Env, body?: any): Promise<Response> {
  const headers = await generateAuthHeaders(env, method, path);
  const payloadStr = body ? JSON.stringify(body) : undefined;

  const response = await fetch(url, {
    method,
    headers,
    body: method === 'POST' ? payloadStr : undefined
  });

  if (response.status === 401) {
    const errText = await response.text();
    throw new Error(`GasFree Auth Failed: 401 ${errText}`);
  }

  return response;
}

/**
 * Fetch GasFree account info for a TRON address.
 */
export async function getAccountInfo(env: Env, address: string): Promise<GasFreeAccount> {
  const baseUrl = getProviderUrl(env);
  const prefix = env.NETWORK_MODE === 'mainnet' ? '/tron' : '/nile';
  const apiPath = `${prefix}/api/v1/address/${address}`;
  const url = `${baseUrl.replace(prefix, '')}${apiPath}`;

  const response = await fetchGasFree(url, 'GET', apiPath, env);
  if (!response.ok) throw new Error(`GasFree account fetch failed: ${response.status}`);

  const data = await response.json() as { data: GasFreeAccount };
  return data.data;
}

/**
 * Fetch all tokens supported by the GasFree service provider.
 */
export async function getSupportedTokens(env: Env): Promise<TokenConfig[]> {
  const baseUrl = getProviderUrl(env);
  const prefix = env.NETWORK_MODE === 'mainnet' ? '/tron' : '/nile';
  const apiPath = `${prefix}/api/v1/config/token/all`;
  const url = `${baseUrl.replace(prefix, '')}${apiPath}`;

  const response = await fetchGasFree(url, 'GET', apiPath, env);
  if (!response.ok) throw new Error(`GasFree tokens fetch failed: ${response.status}`);

  const data = await response.json() as { data: TokenConfig[] };
  return data.data;
}

/**
 * Submit a signed GasFree transfer to the provider.
 */
export async function submitGasFreeTransfer(
  env: Env,
  signature: string,
  message: Record<string, string>,
): Promise<SubmitResult> {
  const baseUrl = getProviderUrl(env);
  const prefix = env.NETWORK_MODE === 'mainnet' ? '/tron' : '/nile';
  const apiPath = `${prefix}/api/v1/gasfree/submit`;
  const url = `${baseUrl.replace(prefix, '')}${apiPath}`;

  // GasFree API expects the signature field to be named 'sig'
  const payload = { sig: signature, ...message };
  const response = await fetchGasFree(url, 'POST', apiPath, env, payload);
  
  const responseData = await response.json() as { code: number; reason?: string; message?: string; data: SubmitResult | null };
  
  // GasFree returns HTTP 200 even for errors, check the code field
  if (responseData.code !== 200 || !responseData.data) {
    const errMsg = responseData.reason || responseData.message || `GasFree returned code ${responseData.code}`;
    throw new Error(`GasFree submit error: ${errMsg}`);
  }

  return responseData.data;
}
