import { useWallet } from '../store/useWallet';

/** Global toast notification renderer */
export function Toast() {
  const { state } = useWallet();
  if (!state.toast) return null;

  const icons = { success: '✅', error: '❌', info: 'ℹ️' };

  return (
    <div className="toast-container">
      <div className={`toast toast-${state.toast.type}`}>
        <span>{icons[state.toast.type]}</span>
        <span>{state.toast.msg}</span>
      </div>
    </div>
  );
}

/** Full-screen loading overlay */
export function LoadingSpinner({ label = 'Processing...' }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(8,8,16,0.85)',
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', gap: 16, zIndex: 9998,
      backdropFilter: 'blur(4px)',
    }}>
      <div className="spinner" style={{ width: 36, height: 36, borderWidth: 3, color: 'var(--primary)' }} />
      <p style={{ color: 'var(--text-secondary)', fontSize: 14, fontWeight: 600 }}>{label}</p>
    </div>
  );
}

/** Address pill — truncated with copy */
export function AddressDisplay({ address, full = false }) {
  const copy = () => {
    navigator.clipboard.writeText(address);
  };

  const display = full ? address : `${address.slice(0, 8)}...${address.slice(-6)}`;

  return (
    <button
      onClick={copy}
      style={{
        background: 'var(--bg-elevated)', border: '1px solid var(--border)',
        borderRadius: 'var(--radius-sm)', padding: '6px 10px',
        display: 'inline-flex', alignItems: 'center', gap: 6,
        fontFamily: 'var(--font-mono)', fontSize: 12,
        color: 'var(--text-secondary)', cursor: 'pointer',
        transition: 'var(--transition)',
      }}
      onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--border-focus)'}
      onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
      title="Copy address"
    >
      {display}
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
      </svg>
    </button>
  );
}

/** GasFree indicator badge */
export function GasFreeBadge() {
  return (
    <div className="gas-badge">
      <span className="gas-dot" />
      GasFree
    </div>
  );
}

/** Transaction list item */
export function TransactionItem({ tx }) {
  const isSend   = tx.type === 'send' || tx.from !== tx.user_address;
  const isPending = tx.status === 'pending';
  const isFailed  = tx.status === 'failed';

  const icon    = isFailed ? '❌' : isPending ? '⏳' : isSend ? '↗' : '↙';
  const iconCls = isFailed ? 'tx-icon-failed' : isPending ? 'tx-icon-pending' : isSend ? 'tx-icon-send' : 'tx-icon-receive';
  const sign    = isSend ? '-' : '+';
  const color   = isSend ? 'var(--text-primary)' : 'var(--gas-green)';

  const addr = isSend
    ? (tx.recipient || tx.to || '')
    : (tx.user_address || tx.from || '');

  const ts = tx.created_at || tx.timestamp;
  const time = ts ? new Date(ts).toLocaleDateString('en', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';

  return (
    <div className="tx-item">
      <div className={`tx-icon ${iconCls}`}>{icon}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="flex justify-between items-center">
          <span style={{ fontSize: 14, fontWeight: 600 }}>{isSend ? 'Sent' : 'Received'}</span>
          <span style={{ fontSize: 15, fontWeight: 800, color }}>{sign}{tx.amount} USDT</span>
        </div>
        <div className="flex justify-between items-center mt-1">
          <span className="text-muted text-sm mono truncate" style={{ maxWidth: 140 }}>
            {addr ? `${addr.slice(0, 8)}...${addr.slice(-4)}` : ''}
          </span>
          <div className="flex gap-2 items-center">
            {tx.source !== 'chain' && <span className="badge badge-success" style={{ fontSize: 9 }}>GasFree</span>}
            {isPending && <span className="badge badge-pending">Pending</span>}
            {isFailed  && <span className="badge badge-failed">Failed</span>}
            <span className="text-muted text-tiny">{time}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Back button row */
export function BackButton({ onClick, label = 'Back' }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-2"
      style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 14, fontWeight: 600 }}
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M19 12H5M12 19l-7-7 7-7"/>
      </svg>
      {label}
    </button>
  );
}
