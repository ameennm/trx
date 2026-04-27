import { nanoid } from 'nanoid';
import { db } from '../db/database.js';

export type RelayStatus = 'received' | 'preflight_failed' | 'energy_rented' | 'broadcast_rejected' | 'reverted' | 'confirmed';

export interface RelayRequestRow {
  id: string;
  idempotency_key: string;
  correlation_id: string;
  user_address: string;
  recipient: string;
  amount_sun: string;
  fee_sun: string;
  vault_address: string;
  status: RelayStatus;
  tx_hash: string | null;
  error_message: string | null;
  created_at: number;
  updated_at: number;
}

export interface RelayHistoryRow {
  id: string;
  recipient: string;
  amount_sun: string;
  fee_sun: string;
  status: RelayStatus;
  tx_hash: string | null;
  created_at: number;
  updated_at: number;
}

export function createRelayRequest(input: {
  idempotencyKey: string;
  correlationId: string;
  userAddress: string;
  recipient: string;
  amountSun: string;
  feeSun: string;
  vaultAddress: string;
}) {
  const id = nanoid();
  const now = Date.now();
  db.prepare(`
    INSERT INTO relay_requests (
      id, idempotency_key, correlation_id, user_address, recipient,
      amount_sun, fee_sun, vault_address, status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'received', ?, ?)
  `).run(
    id,
    input.idempotencyKey,
    input.correlationId,
    input.userAddress,
    input.recipient,
    input.amountSun,
    input.feeSun,
    input.vaultAddress,
    now,
    now
  );
  return id;
}

export function getRelayRequestByIdempotencyKey(idempotencyKey: string) {
  return db
    .prepare<[string], RelayRequestRow>(`SELECT * FROM relay_requests WHERE idempotency_key = ?`)
    .get(idempotencyKey);
}

export function updateRelayRequest(id: string, status: RelayStatus, fields: { txHash?: string; errorMessage?: string } = {}) {
  db.prepare(`
    UPDATE relay_requests
    SET status = ?, tx_hash = COALESCE(?, tx_hash), error_message = COALESCE(?, error_message), updated_at = ?
    WHERE id = ?
  `).run(status, fields.txHash ?? null, fields.errorMessage ?? null, Date.now(), id);
}

export function insertRelayEvent(requestId: string, eventName: string, details: Record<string, unknown>) {
  const safeJson = (obj: any) => {
    const cache = new Set();
    return JSON.stringify(obj, (key, value) => {
      if (typeof value === 'object' && value !== null) {
        if (cache.has(value)) return '[Circular]';
        cache.add(value);
      }
      return value;
    });
  };

  db.prepare(`
    INSERT INTO relay_events (request_id, event_name, details_json, created_at)
    VALUES (?, ?, ?, ?)
  `).run(requestId, eventName, safeJson(details), Date.now());
}

export function listHistory(userAddress: string) {
  return db.prepare<[string], RelayHistoryRow>(`
    SELECT id, recipient, amount_sun, fee_sun, status, tx_hash, created_at, updated_at
    FROM relay_requests
    WHERE user_address = ?
    ORDER BY created_at DESC
    LIMIT 50
  `).all(userAddress);
}
