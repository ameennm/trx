import React, { useState } from 'react';
import { useWallet } from '../store/useWallet';
import { NETWORKS, ADMIN_WHITELIST } from '../store/constants';
import { decryptSecret } from '../crypto/cryptoService.js';
import { clearWallet } from '../crypto/cryptoService.js';
import { BackButton } from '../components/UI.jsx';

export function SettingsView({ onBack }) {
  const { state, dispatch, toast } = useWallet();
  const [showMnemonic, setShowMnemonic] = useState(false);
  const [pin, setPin] = useState('');
  const [mnemonicWords, setMnemonicWords] = useState([]);
  const [pinStep, setPinStep] = useState(null); // 'export' | 'destroy'

  async function handleExport() {
    try {
      const { secret, walletType } = await decryptSecret(pin);
      if (walletType === 'mnemonic') {
        setMnemonicWords(secret.split(' '));
      } else {
        setMnemonicWords([secret]); // Show PK as single word for now or handle differently
      }
      setShowMnemonic(true);
      setPinStep(null);
      setPin('');
    } catch {
      toast('error', 'Wrong PIN.');
    }
  }

  async function handleDestroy() {
    try {
      await decryptSecret(pin); // verify PIN first
      await clearWallet();
      dispatch({ type: 'LOCK' });
      dispatch({ type: 'SET_MODE', payload: 'onboard' });
      toast('info', 'Vault destroyed. All local data wiped.');
    } catch {
      toast('error', 'Wrong PIN. Vault not destroyed.');
    }
  }

  return (
    <div className="page z-1 flex-col gap-5">
      <div className="flex items-center gap-3">
        <BackButton onClick={onBack} />
        <h2>Settings</h2>
      </div>

      {/* Network */}
      <div className="glass-card p-5 flex-col gap-4">
        <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Network</h3>
        <div className="flex gap-3">
          {['nile', 'mainnet'].map(n => (
            <button
              key={n}
              className={`btn flex-1 ${state.network === n ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => dispatch({ type: 'SET_NETWORK', payload: n })}
              style={{ fontSize: 13 }}
            >
              {n === 'nile' ? '🟡 Nile Testnet' : '🟢 Mainnet'}
            </button>
          ))}
        </div>
        <p className="text-muted text-tiny">
          Current: <strong style={{ color: 'var(--text-primary)' }}>{NETWORKS[state.network].label}</strong>{' '}
          · Backend: <code style={{ color: 'var(--primary)', fontSize: 10 }}>{NETWORKS[state.network].apiBackend}</code>
        </p>
      </div>

      {/* Auto-lock */}
      <div className="glass-card p-5 flex-col gap-4">
        <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Auto-Lock</h3>
        <div className="flex gap-3">
          {[1, 5, 15, 30].map(m => (
            <button
              key={m}
              className={`btn flex-1 btn-sm ${state.autoLockMinutes === m ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => dispatch({ type: 'SET_AUTO_LOCK', payload: m })}
              style={{ fontSize: 12 }}
            >
              {m}m
            </button>
          ))}
        </div>
        <p className="text-muted text-tiny">Vault auto-locks after {state.autoLockMinutes} minute(s) of inactivity</p>
      </div>

      {/* Wallet address */}
      <div className="glass-card p-5 flex-col gap-3">
        <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Wallet</h3>
        <p className="mono text-sm" style={{ wordBreak: 'break-all', color: 'var(--text-secondary)' }}>{state.address}</p>
      </div>

      {/* Seed phrase export */}
      <div className="glass-card p-5 flex-col gap-4">
        <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>🔑 Backup & Security</h3>

        {!showMnemonic && pinStep !== 'export' && (
          <button className="btn btn-ghost btn-full" onClick={() => setPinStep('export')}>
            Reveal Sensitive Data
          </button>
        )}

        {pinStep === 'export' && (
          <div className="flex-col gap-3">
            <p className="text-muted text-sm">Enter your PIN to reveal:</p>
            <input type="password" inputMode="numeric" maxLength={6} className="pin-input" value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, ''))} />
            <div className="flex gap-3">
              <button className="btn btn-ghost flex-1" onClick={() => { setPinStep(null); setPin(''); }}>Cancel</button>
              <button className="btn btn-primary flex-1" onClick={handleExport} disabled={pin.length !== 6}>Reveal</button>
            </div>
          </div>
        )}

        {showMnemonic && (
          <div className="flex-col gap-3">
            <div className="seed-grid">
              {mnemonicWords.map((w, i) => (
                <div key={i} className="seed-word" style={mnemonicWords.length === 1 ? { gridColumn: 'span 2', wordBreak: 'break-all', fontSize: 11 } : {}}>
                  {mnemonicWords.length > 1 && <span className="seed-word-num">{i + 1}.</span>}
                  {w}
                </div>
              ))}
            </div>
            <button className="btn btn-ghost btn-full btn-sm" onClick={() => setShowMnemonic(false)}>
              Hide Backup Data
            </button>
          </div>
        )}
      </div>

      {/* Danger zone */}
      <div className="glass-card p-5 flex-col gap-4" style={{ borderColor: 'rgba(255,77,109,0.2)' }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--accent-red)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>⚠️ Danger Zone</h3>

        {pinStep !== 'destroy' && ADMIN_WHITELIST.includes(state.address) && (
          <div className="glass-card p-4 flex-col gap-4">
            <h3 className="text-sm font-bold opacity-50 uppercase">Developer & Stats</h3>
            <button className="btn btn-ghost btn-full" onClick={onAdmin} style={{ justifyContent: 'space-between' }}>
              <span>📊 Admin Dashboard</span>
              <span>→</span>
            </button>
          </div>
        )}

        {pinStep !== 'destroy' && (
          <button className="btn btn-danger btn-full" onClick={() => setPinStep('destroy')}>
            Destroy Vault &amp; Wipe Data
          </button>
        )}

        {pinStep === 'destroy' && (
          <div className="flex-col gap-3">
            <p className="text-sm" style={{ color: 'var(--accent-red)' }}>This wipes all local vault data. <strong>Ensure you have your seed phrase backed up.</strong></p>
            <input type="password" inputMode="numeric" maxLength={6} className="pin-input" value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, ''))} placeholder="••••••" />
            <div className="flex gap-3">
              <button className="btn btn-ghost flex-1" onClick={() => { setPinStep(null); setPin(''); }}>Cancel</button>
              <button className="btn btn-danger flex-1" onClick={handleDestroy} disabled={pin.length !== 6}>Destroy</button>
            </div>
          </div>
        )}
      </div>

      <div style={{ height: 20 }} />
    </div>
  );
}
