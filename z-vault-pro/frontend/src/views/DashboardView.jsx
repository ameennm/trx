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
      // Silently fail
    } finally {
      setRefreshing(false);
    }
  }, [state.address, state.network, dispatch]);

  useEffect(() => { fetchBalances(); }, [state.address, state.network, fetchBalances]);

  const hasVaultBalance = parseFloat(state.balances.proxyUsdt) > 0;

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

      {/* Main Wallet Balance Card */}
      <div className="glass-card p-5 animate-in delay-1" style={{ background: 'rgba(255,255,255,0.03)' }}>
        <div className="flex justify-between items-start">
          <div>
            <p className="label text-tiny">Main Wallet</p>
            <div className="flex items-end gap-1" style={{ marginTop: 4 }}>
              <span style={{ fontSize: 24, fontWeight: 800 }}>{state.balances.usdt}</span>
              <span className="text-muted text-tiny" style={{ marginBottom: 4 }}>USDT</span>
            </div>
          </div>
          <div className="text-right">
             <p className="text-muted text-tiny">{state.balances.trx} TRX</p>
          </div>
        </div>
        <div style={{ marginTop: 12 }}>
          <AddressDisplay address={state.address} />
        </div>
      </div>

      {/* Proxy/Vault Balance Card */}
      <div className="glass-card p-6 text-center animate-in delay-2" style={{ 
        background: hasVaultBalance 
          ? 'linear-gradient(135deg, rgba(0,229,160,0.1) 0%, rgba(108,99,255,0.05) 100%)' 
          : 'rgba(255,255,255,0.02)',
        border: hasVaultBalance ? '1px solid rgba(0,229,160,0.3)' : '1px solid rgba(255,255,255,0.1)'
      }}>
        <p className="label" style={{ marginBottom: 8, color: hasVaultBalance ? 'var(--gas-green)' : 'var(--text-secondary)' }}>
          {hasVaultBalance ? '✅ Gasless Vault Ready' : '📦 Gasless Vault Balance'}
        </p>
        <div className="flex items-end justify-center gap-2" style={{ lineHeight: 1 }}>
          <span className="balance-big" style={{ fontSize: 42 }}>{state.balances.proxyUsdt}</span>
          <span className="balance-currency">USDT</span>
        </div>
        
        {!hasVaultBalance && (
          <div style={{ marginTop: 16 }}>
            <p className="text-muted text-tiny" style={{ marginBottom: 12 }}>
              Your gasless vault is empty. Deposit USDT to start sending without TRX.
            </p>
            <button className="btn btn-primary btn-sm w-full" onClick={() => onNavigate('send', { mode: 'deposit' })}>
              ⚡ Top Up Vault
            </button>
          </div>
        )}

        <div style={{ marginTop: 10 }}>
           <button onClick={fetchBalances} disabled={refreshing} className="btn btn-xs btn-ghost text-muted">
            {refreshing ? '...' : '⟳ Refresh Box'}
          </button>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="flex gap-3 animate-in delay-3">
        <button className="btn btn-primary flex-col" style={{ flex: 1, height: 80, borderRadius: 'var(--radius-lg)', fontSize: 12, gap: 6 }} 
          onClick={() => onNavigate('send')} disabled={!hasVaultBalance}>
          <span style={{ fontSize: 22 }}>↗</span> {hasVaultBalance ? 'Send Gasless' : 'Vault Empty'}
        </button>
        <button className="btn btn-ghost flex-col" style={{ flex: 1, height: 80, borderRadius: 'var(--radius-lg)', fontSize: 12, gap: 6, borderWidth: 1 }} onClick={() => onNavigate('receive')}>
          <span style={{ fontSize: 22 }}>↙</span> Receive
        </button>
        <button className="btn btn-ghost flex-col" style={{ flex: 1, height: 80, borderRadius: 'var(--radius-lg)', fontSize: 12, gap: 6, borderWidth: 1 }} onClick={() => onNavigate('history')}>
          <span style={{ fontSize: 22 }}>🕐</span> History
        </button>
      </div>

      <div className="glass-card p-4 animate-in delay-4" style={{ background: 'var(--gas-green-dim)', borderColor: 'rgba(0,229,160,0.2)' }}>
        <div className="flex items-center gap-3">
          <span style={{ fontSize: 24 }}>🛡️</span>
          <div>
            <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--gas-green)' }}>Safe & Private</p>
            <p className="text-muted text-tiny" style={{ marginTop: 2 }}>Only you can authorize transfers from your vault.</p>
          </div>
        </div>
      </div>
    </div>
  );
}

