import { useState, useEffect, useCallback } from 'react';
import { useWallet } from '../stores/WalletContext';
import { useToast } from '../stores/ToastContext';
import * as api from '../services/apiService';

export default function Dashboard() {
  const { state, dispatch } = useWallet();
  const toast = useToast();
  const [refreshing, setRefreshing] = useState(false);
  const [serverOnline, setServerOnline] = useState(null);

  const address = state.network === 'tron-nile' ? state.tron.address : state.evm.address;

  const truncate = (addr) => {
    if (!addr) return '...';
    return `${addr.slice(0, 6)}···${addr.slice(-4)}`;
  };

  const refreshBalances = useCallback(async () => {
    setRefreshing(true);
    try {
      const health = await api.getHealth();
      setServerOnline(true);
      if (address) {
        const balance = await api.getBalance(address);
        dispatch({ type: 'SET_BALANCES', payload: { usdtBalance: balance } });
      }
      // Fetch TRX balance using server's configured RPC
      if (state.tron.address && window.TronWeb) {
        try {
          const serverCfg = await api.getConfig();
          const rpcUrl = serverCfg.rpcUrl || 'https://nile.trongrid.io';
          const TW = window.TronWeb?.TronWeb || window.TronWeb;
          const tw = new TW({ fullHost: rpcUrl });
          const sun = await tw.trx.getBalance(state.tron.address);
          dispatch({ type: 'SET_BALANCES', payload: { trxBalance: sun / 1_000_000 } });
        } catch {}
      }
    } catch {
      setServerOnline(false);
    }
    setRefreshing(false);
  }, [address, state.network, state.tron.address, dispatch]);

  useEffect(() => { refreshBalances(); }, [refreshBalances]);

  const copyAddress = () => {
    if (address) { navigator.clipboard.writeText(address); toast('info', 'Address copied'); }
  };

  return (
    <div className="app-shell">
      {/* ── Top Bar ── */}
      <div className="topbar">
        <button onClick={() => dispatch({ type: 'LOCK' })} className="icon-btn" title="Lock">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
        </button>
        
        <div className="flex flex-col items-center cursor-pointer" onClick={copyAddress}>
          <span className="text-[13px] font-bold">Main Wallet</span>
          <span className="text-[11px] font-mono text-text-tertiary">{truncate(address)}</span>
        </div>

        <button onClick={refreshBalances} className="icon-btn" title="Refresh">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={refreshing ? 'animate-spin' : ''}><path d="M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/></svg>
        </button>
      </div>

      {/* ── Balance ── */}
      <div className="balance-hero">
        <div className="balance-label">Total Balance</div>
        <div className="balance-value">
          <span className="dollar">$</span>{state.usdtBalance.toFixed(2)}
        </div>
        <div className="balance-change">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="18 15 12 9 6 15"/></svg>
          +0.00%
        </div>
      </div>

      {/* ── Actions ── */}
      <div className="action-row">
        <button onClick={() => dispatch({ type: 'SET_VIEW', payload: 'send' })} className="action-item">
          <div className="action-icon send">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5"><line x1="7" y1="17" x2="17" y2="7"/><polyline points="7 7 17 7 17 17"/></svg>
          </div>
          <span className="action-label">Send</span>
        </button>
        <button onClick={copyAddress} className="action-item">
          <div className="action-icon receive">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5"><line x1="17" y1="7" x2="7" y2="17"/><polyline points="17 17 7 17 7 7"/></svg>
          </div>
          <span className="action-label">Receive</span>
        </button>
        <button className="action-item" onClick={() => toast('info', 'Coming soon')}>
          <div className="action-icon buy">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          </div>
          <span className="action-label">Buy</span>
        </button>
      </div>

      {/* ── Network Toggle ── */}
      <div className="network-toggle">
        <button onClick={() => dispatch({ type: 'SET_NETWORK', payload: 'tron-nile' })} className={state.network === 'tron-nile' ? 'active' : 'inactive'}>
          TRON Nile
        </button>
        <button onClick={() => dispatch({ type: 'SET_NETWORK', payload: 'evm-sepolia' })} className={state.network === 'evm-sepolia' ? 'active' : 'inactive'}>
          Sepolia
        </button>
      </div>

      {/* ── Assets ── */}
      <div className="section-header">
        <span className="section-title">Assets</span>
        <span className="text-[12px] font-semibold text-text-tertiary">{serverOnline ? '● Online' : serverOnline === false ? '● Offline' : ''}</span>
      </div>

      <div className="token-list">
        {/* USDT */}
        <div className="token-row">
          <div className="token-avatar usdt">₮</div>
          <div className="token-info">
            <div className="token-name">Tether USD</div>
            <div className="token-symbol">USDT · TRC-20</div>
          </div>
          <div className="token-balance">
            <div className="token-amount">{state.usdtBalance.toFixed(2)}</div>
            <div className="token-usd">${state.usdtBalance.toFixed(2)}</div>
          </div>
        </div>

        {/* TRX */}
        <div className="token-row" style={{opacity: 0.5}}>
          <div className="token-avatar trx">◆</div>
          <div className="token-info">
            <div className="token-name">TRON</div>
            <div className="token-symbol">TRX · Native</div>
          </div>
          <div className="token-balance">
            <div className="token-amount">{state.trxBalance.toFixed(4)}</div>
            <div className="token-usd">${(state.trxBalance * 0.29).toFixed(2)}</div>
          </div>
        </div>
      </div>

      {/* ── Tab Bar ── */}
      <div className="tab-bar">
        <button className="tab-item active">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
          <span>Wallet</span>
        </button>
        <button className="tab-item" onClick={() => dispatch({ type: 'SET_VIEW', payload: 'activity' })}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
          <span>Activity</span>
        </button>
        <button className="tab-item" onClick={() => dispatch({ type: 'SET_VIEW', payload: 'settings' })}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.6 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.6a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9c.26.46.42.98.51 1.51"/></svg>
          <span>Settings</span>
        </button>
      </div>
    </div>
  );
}
