import React, { useEffect, useState, useCallback } from 'react';
import { useWallet } from '../store/useWallet';
import { getBalances } from '../wallet/walletService.js';
import { AddressDisplay, GasFreeBadge } from '../components/UI.jsx';

export function DashboardView({ onNavigate }) {
  const { state, dispatch } = useWallet();
  const [refreshing, setRefreshing] = useState(false);

  const fetchBalances = useCallback(async () => {
    if (!state.address) return;
    setRefreshing(true);
    try {
      const b = await getBalances(state.address, state.network);
      dispatch({ type: 'SET_BALANCES', payload: b });
    } catch {
      // Silently fail — testnet RPC can be flaky
    } finally {
      setRefreshing(false);
    }
  }, [state.address, state.network, dispatch]);

  useEffect(() => { fetchBalances(); }, [state.address, state.network, fetchBalances]);

  return (
    <div className="page z-1 flex-col gap-5">
      {/* Header */}
      <div className="flex justify-between items-center animate-in">
        <div>
          <p className="text-muted text-tiny" style={{ letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 700 }}>
            {state.network === 'mainnet' ? '🟢 Mainnet' : '🟡 Nile Testnet'}
          </p>
          <h2 style={{ marginTop: 2 }}>My Vault</h2>
        </div>
        <GasFreeBadge />
      </div>

      {/* Balance Card */}
      <div className="glass-card p-6 text-center animate-in delay-1" style={{ background: 'linear-gradient(135deg, rgba(108,99,255,0.12) 0%, rgba(0,212,170,0.07) 100%)', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: -40, right: -40, width: 140, height: 140, background: 'var(--primary)', borderRadius: '50%', filter: 'blur(60px)', opacity: 0.2 }} />
        <p className="label" style={{ marginBottom: 12 }}>Total USDT Balance</p>
        <div className="flex items-end justify-center gap-2" style={{ lineHeight: 1 }}>
          <span className="balance-big">{state.balances.usdt}</span>
          <span className="balance-currency">USDT</span>
        </div>
        <div className="flex items-center justify-center gap-2" style={{ marginTop: 12 }}>
          <span className="text-muted text-sm">{state.balances.trx} TRX</span>
          <span className="text-muted text-tiny">·</span>
          <span className="text-muted text-tiny" title="TRX not needed for GasFree transfers" style={{ cursor: 'help' }}>
            ✨ Not needed for transfers
          </span>
        </div>
        <div style={{ marginTop: 14 }}>
          <AddressDisplay address={state.address} />
        </div>
        <button onClick={fetchBalances} disabled={refreshing} className="btn btn-sm btn-ghost" style={{ marginTop: 10 }}>
          {refreshing ? <div className="spinner" style={{ width: 12, height: 12, borderWidth: 2 }} /> : '⟳'} Refresh
        </button>
      </div>

      {/* Quick Actions */}
      <div className="flex gap-3 animate-in delay-2">
        <button className="btn btn-primary flex-col" style={{ flex: 1, height: 80, borderRadius: 'var(--radius-lg)', fontSize: 12, gap: 6 }} onClick={() => onNavigate('send')}>
          <span style={{ fontSize: 22 }}>↗</span> Send
        </button>
        <button className="btn btn-ghost flex-col" style={{ flex: 1, height: 80, borderRadius: 'var(--radius-lg)', fontSize: 12, gap: 6, borderWidth: 1 }} onClick={() => onNavigate('receive')}>
          <span style={{ fontSize: 22 }}>↙</span> Receive
        </button>
        <button className="btn btn-ghost flex-col" style={{ flex: 1, height: 80, borderRadius: 'var(--radius-lg)', fontSize: 12, gap: 6, borderWidth: 1 }} onClick={() => onNavigate('history')}>
          <span style={{ fontSize: 22 }}>🕐</span> History
        </button>
      </div>

      {/* GasFree Info Banner */}
      <div className="glass-card p-4 animate-in delay-3" style={{ background: 'var(--gas-green-dim)', borderColor: 'rgba(0,229,160,0.2)' }}>
        <div className="flex items-center gap-3">
          <span style={{ fontSize: 24 }}>⚡</span>
          <div>
            <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--gas-green)' }}>GasFree Protocol Active</p>
            <p className="text-muted text-tiny" style={{ marginTop: 2 }}>Send USDT with $1.10 flat fee. No TRX needed.</p>
          </div>
        </div>
      </div>

      {/* Recent transactions preview */}
      {state.transactions.length > 0 && (
        <div className="animate-in delay-4">
          <div className="flex justify-between items-center" style={{ marginBottom: 12 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-secondary)' }}>Recent Activity</span>
            <button onClick={() => onNavigate('history')} style={{ background: 'none', border: 'none', color: 'var(--primary)', fontSize: 12, cursor: 'pointer', fontWeight: 600 }}>View all</button>
          </div>
          <div className="flex-col gap-2">
            {state.transactions.slice(0, 3).map((tx, i) => (
              <div key={i} className="tx-item">
                <div className={`tx-icon ${tx.type === 'send' ? 'tx-icon-send' : 'tx-icon-receive'}`}>
                  {tx.type === 'send' ? '↗' : '↙'}
                </div>
                <div style={{ flex: 1 }}>
                  <div className="flex justify-between">
                    <span style={{ fontSize: 13, fontWeight: 600 }}>{tx.type === 'send' ? 'Sent' : 'Received'}</span>
                    <span style={{ fontWeight: 800, color: tx.type === 'send' ? 'var(--text-primary)' : 'var(--gas-green)' }}>
                      {tx.type === 'send' ? '-' : '+'}{tx.amount} USDT
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
