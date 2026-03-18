import { useState } from 'react';
import { useWallet } from '../stores/WalletContext';
import { useToast } from '../stores/ToastContext';
import { clearWallet } from '../services/cryptoService';

export default function Settings() {
  const { state, dispatch } = useWallet();
  const toast = useToast();
  const [showSeed, setShowSeed] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  const tronAddr = state.tron.address || '—';
  const evmAddr = state.evm.address || '—';
  const truncate = (addr) => addr && addr.length > 16 ? `${addr.slice(0, 10)}···${addr.slice(-6)}` : addr;

  const copyAddr = (addr) => {
    navigator.clipboard.writeText(addr);
    toast('info', 'Address copied');
  };

  const handleReset = async () => {
    await clearWallet();
    dispatch({ type: 'CLEAR' });
    toast('info', 'Wallet cleared');
  };

  return (
    <div className="app-shell">
      {/* Header */}
      <div className="topbar">
        <button onClick={() => dispatch({ type: 'SET_VIEW', payload: 'dashboard' })} className="icon-btn">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
        </button>
        <span className="topbar-title">Settings</span>
        <div className="w-10" />
      </div>

      <div className="px-5 space-y-6 pb-28">
        {/* ── Wallet Info ── */}
        <div>
          <h3 className="text-[12px] font-bold uppercase tracking-widest text-text-tertiary mb-3 px-1">Wallet</h3>
          <div className="card p-4 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[12px] text-text-tertiary mb-1">TRON Address</div>
                <div className="font-mono text-[13px] font-medium">{truncate(tronAddr)}</div>
              </div>
              <button onClick={() => copyAddr(tronAddr)} className="icon-btn">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
              </button>
            </div>
            <div className="border-t border-white/[0.04]" />
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[12px] text-text-tertiary mb-1">EVM Address</div>
                <div className="font-mono text-[13px] font-medium">{truncate(evmAddr)}</div>
              </div>
              <button onClick={() => copyAddr(evmAddr)} className="icon-btn">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
              </button>
            </div>
          </div>
        </div>

        {/* ── Security ── */}
        <div>
          <h3 className="text-[12px] font-bold uppercase tracking-widest text-text-tertiary mb-3 px-1">Security</h3>
          <div className="card overflow-hidden">
            {/* Recovery Phrase */}
            {state.mnemonic && (
              <button
                onClick={() => setShowSeed(!showSeed)}
                className="w-full flex items-center justify-between p-4 hover:bg-surface-2 transition-colors text-left"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-[rgba(251,99,64,0.1)] flex items-center justify-center">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-caution"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                  </div>
                  <span className="font-semibold text-[14px]">Recovery Phrase</span>
                </div>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={`text-text-tertiary transition-transform ${showSeed ? 'rotate-90' : ''}`}><polyline points="9 18 15 12 9 6"/></svg>
              </button>
            )}
            {showSeed && state.mnemonic && (
              <div className="px-4 pb-4">
                <div className="bg-surface-0 rounded-xl p-3 grid grid-cols-3 gap-2">
                  {state.mnemonic.split(' ').map((w, i) => (
                    <div key={i} className="flex items-center gap-1.5 text-[12px]">
                      <span className="text-text-tertiary font-bold">{i + 1}.</span>
                      <span className="font-mono font-medium">{w}</span>
                    </div>
                  ))}
                </div>
                <div className="warning-box mt-3" style={{ padding: '10px 12px' }}>
                  <span className="icon text-sm">⚠</span>
                  <p className="text-[11px]">Do not share this phrase with anyone.</p>
                </div>
              </div>
            )}

            <div className="border-t border-white/[0.04]" />

            {/* Lock Wallet */}
            <button
              onClick={() => { dispatch({ type: 'LOCK' }); toast('info', 'Wallet locked'); }}
              className="w-full flex items-center gap-3 p-4 hover:bg-surface-2 transition-colors text-left"
            >
              <div className="w-9 h-9 rounded-xl bg-[rgba(51,117,187,0.1)] flex items-center justify-center">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-primary"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
              </div>
              <span className="font-semibold text-[14px]">Lock Wallet</span>
            </button>
          </div>
        </div>

        {/* ── Network Info ── */}
        <div>
          <h3 className="text-[12px] font-bold uppercase tracking-widest text-text-tertiary mb-3 px-1">Network</h3>
          <div className="card p-4 space-y-3">
            <div className="flex justify-between text-[13px]">
              <span className="text-text-secondary">Active Network</span>
              <span className="font-semibold">{state.network === 'tron-nile' ? 'TRON Nile Testnet' : 'Sepolia Testnet'}</span>
            </div>
            <div className="flex justify-between text-[13px]">
              <span className="text-text-secondary">Contract</span>
              <span className="font-mono text-[11px]">THzU...fUDY</span>
            </div>
            <div className="flex justify-between text-[13px]">
              <span className="text-text-secondary">Fee Markup</span>
              <span className="font-semibold">15%</span>
            </div>
          </div>
        </div>

        {/* ── Danger Zone ── */}
        <div>
          <h3 className="text-[12px] font-bold uppercase tracking-widest text-text-tertiary mb-3 px-1">Danger Zone</h3>
          <div className="card overflow-hidden">
            {!confirmReset ? (
              <button
                onClick={() => setConfirmReset(true)}
                className="w-full flex items-center gap-3 p-4 hover:bg-surface-2 transition-colors text-left"
              >
                <div className="w-9 h-9 rounded-xl bg-[rgba(245,54,92,0.1)] flex items-center justify-center">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-negative"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
                </div>
                <div>
                  <span className="font-semibold text-[14px] text-negative">Remove Wallet</span>
                  <div className="text-[12px] text-text-tertiary">Deletes all data from this device</div>
                </div>
              </button>
            ) : (
              <div className="p-4 space-y-3">
                <p className="text-[13px] text-negative font-semibold">Are you sure? This cannot be undone.</p>
                <p className="text-[12px] text-text-tertiary">Make sure you have your recovery phrase backed up before deleting.</p>
                <div className="flex gap-3">
                  <button onClick={() => setConfirmReset(false)} className="flex-1 py-3 bg-surface-2 rounded-xl text-[13px] font-semibold">
                    Cancel
                  </button>
                  <button onClick={handleReset} className="flex-1 py-3 bg-negative/20 text-negative rounded-xl text-[13px] font-semibold">
                    Delete
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── About ── */}
        <div className="text-center pt-4 pb-8">
          <p className="text-[12px] text-text-tertiary font-semibold">Crypxe v2.0.0</p>
          <p className="text-[11px] text-text-tertiary mt-1">Built with ❤️ for gasless transfers</p>
        </div>
      </div>

      {/* Tab Bar */}
      <div className="tab-bar">
        <button className="tab-item" onClick={() => dispatch({ type: 'SET_VIEW', payload: 'dashboard' })}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
          <span>Wallet</span>
        </button>
        <button className="tab-item" onClick={() => dispatch({ type: 'SET_VIEW', payload: 'activity' })}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
          <span>Activity</span>
        </button>
        <button className="tab-item active">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.6 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.6a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9c.26.46.42.98.51 1.51"/></svg>
          <span>Settings</span>
        </button>
      </div>
    </div>
  );
}
