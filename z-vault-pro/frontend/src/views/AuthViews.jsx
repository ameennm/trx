import React, { useState } from 'react';
import { useWallet } from '../store/useWallet';
import { generateMnemonic, deriveTronWallet, deriveTronWalletFromKey, validateMnemonic } from '../wallet/walletService.js';
import { encryptAndStore, decryptSecret } from '../crypto/cryptoService.js';

/**
 * Onboard View — Create new wallet with PIN
 */
export function OnboardView({ onSwitch }) {
  const { dispatch, toast } = useWallet();
  const [step, setStep] = useState('pin'); // 'pin' | 'backup'
  const [pin, setPin] = useState('');
  const [mnemonic, setMnemonic] = useState('');
  const [loading, setLoading] = useState(false);
  const [revealed, setRevealed] = useState(false);

  async function handleCreate() {
    if (pin.length !== 6 || !/^\d{6}$/.test(pin)) {
      toast('error', 'Enter exactly 6 digits.');
      return;
    }
    setLoading(true);
    try {
      const m = generateMnemonic();
      await encryptAndStore(m, pin);
      setMnemonic(m);
      setStep('backup');
    } catch (e) {
      toast('error', e.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleContinue() {
    setLoading(true);
    try {
      const wallet = await deriveTronWallet(mnemonic);
      dispatch({ type: 'UNLOCK', payload: wallet });
      toast('success', 'Vault created! Welcome to Z-Vault Pro.');
    } catch (e) {
      toast('error', e.message);
    } finally {
      setLoading(false);
    }
  }

  const words = mnemonic.split(' ');

  return (
    <div className="flex-col gap-6 animate-in" style={{ padding: '32px 24px', minHeight: '100dvh', display: 'flex', justifyContent: 'center' }}>
      {/* Logo */}
      <div className="text-center">
        <div style={{ fontSize: 48, marginBottom: 8 }}>🔐</div>
        <h1 style={{ fontSize: 36, fontWeight: 900, letterSpacing: '-0.03em' }}>
          Z-Vault <span style={{ color: 'var(--primary)' }}>Pro</span>
        </h1>
        <p className="text-muted text-sm" style={{ marginTop: 6 }}>
          Gasless USDT · Non-Custodial · Dynamic Fees
        </p>
      </div>

      {step === 'pin' && (
        <div className="glass-card p-5 flex-col gap-5 animate-in">
          <div>
            <h2 style={{ fontSize: 18 }}>Create your PIN</h2>
            <p className="text-muted text-sm" style={{ marginTop: 4 }}>6 digits — encrypts your vault locally</p>
          </div>

          <div className="field">
            <input
              type="password"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              placeholder="••••••"
              value={pin}
              onChange={e => setPin(e.target.value.replace(/\D/g, ''))}
              className="pin-input"
              autoFocus
            />
          </div>

          <button className="btn btn-primary btn-full" onClick={handleCreate} disabled={loading || pin.length !== 6}>
            {loading ? <><div className="spinner" />Creating...</> : 'Initialize Vault ⚡'}
          </button>

          <p className="text-center text-muted text-sm">
            Have a wallet?{' '}
            <button onClick={() => onSwitch('import')} style={{ background: 'none', border: 'none', color: 'var(--primary)', cursor: 'pointer', fontWeight: 700 }}>
              Import seed phrase
            </button>
          </p>
        </div>
      )}

      {step === 'backup' && (
        <div className="glass-card p-5 flex-col gap-5 animate-in">
          <div>
            <h2 style={{ fontSize: 18 }}>Back up your seed phrase</h2>
            <p className="text-muted text-sm" style={{ marginTop: 4 }}>
              Write these 12 words down. If you lose them, <span style={{ color: 'var(--accent-red)' }}>you lose your funds forever.</span>
            </p>
          </div>

          <div className="seed-grid" style={{ filter: revealed ? 'blur(0)' : 'blur(8px)', transition: 'filter 0.3s', userSelect: revealed ? 'text' : 'none' }}>
            {words.map((w, i) => (
              <div key={i} className="seed-word">
                <span className="seed-word-num">{i + 1}.</span>
                <span>{w}</span>
              </div>
            ))}
          </div>

          {!revealed && (
            <button className="btn btn-ghost btn-full" onClick={() => setRevealed(true)}>
              👁 Tap to reveal
            </button>
          )}

          {revealed && (
            <button className="btn btn-gas btn-full" onClick={handleContinue} disabled={loading}>
              {loading ? <><div className="spinner" />Loading...</> : "I've saved it — Enter Vault ✓"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Lock Screen View — Unlock with PIN
 */
export function LockView() {
  const { dispatch, toast } = useWallet();
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleUnlock() {
    if (pin.length !== 6) { toast('error', 'Enter your 6-digit PIN.'); return; }
    setLoading(true);
    try {
      const { secret, walletType } = await decryptSecret(pin);
      const wallet = walletType === 'private_key' 
        ? await deriveTronWalletFromKey(secret)
        : await deriveTronWallet(secret);
        
      dispatch({ type: 'UNLOCK', payload: wallet });
      toast('success', 'Vault unlocked.');
    } catch {
      toast('error', 'Wrong PIN. Try again.');
      setPin('');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex-col gap-6 animate-in" style={{ padding: '32px 24px', minHeight: '100dvh', display: 'flex', justifyContent: 'center' }}>
      <div className="text-center">
        <div style={{ fontSize: 48, marginBottom: 8 }}>🔒</div>
        <h1 style={{ fontSize: 30, fontWeight: 900 }}>Vault Locked</h1>
        <p className="text-muted text-sm" style={{ marginTop: 6 }}>Enter your PIN to decrypt</p>
      </div>

      <div className="glass-card p-5 flex-col gap-5">
        <input
          type="password"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={6}
          placeholder="••••••"
          value={pin}
          onChange={e => setPin(e.target.value.replace(/\D/g, ''))}
          onKeyDown={e => e.key === 'Enter' && handleUnlock()}
          className="pin-input"
          autoFocus
        />
        <button className="btn btn-primary btn-full" onClick={handleUnlock} disabled={loading || pin.length !== 6}>
          {loading ? <><div className="spinner" />Unlocking...</> : 'Unlock Vault (PBKDF2)'}
        </button>
      </div>
    </div>
  );
}

/**
 * Import Wallet View — Restore from 12-word seed
 */
export function ImportView({ onBack }) {
  const { dispatch, toast } = useWallet();
  const [importType, setImportType] = useState('mnemonic'); // 'mnemonic' | 'private_key'
  const [words, setWords] = useState(Array(12).fill(''));
  const [privateKey, setPrivateKey] = useState('');
  const [pin, setPin] = useState('');
  const [pinConfirm, setPinConfirm] = useState('');
  const [step, setStep] = useState('input'); // 'input' | 'pin'
  const [loading, setLoading] = useState(false);

  function updateWord(i, val) {
    const w = [...words];
    w[i] = val.toLowerCase().trim();
    setWords(w);
  }

  async function handleValidate() {
    if (importType === 'mnemonic') {
      const m = words.join(' ').trim();
      if (!validateMnemonic(m)) { toast('error', 'Invalid seed phrase. Check each word.'); return; }
    } else {
      if (privateKey.length !== 64) { toast('error', 'Invalid Private Key. Must be exactly 64 hex characters.'); return; }
      try {
        await deriveTronWalletFromKey(privateKey); // Final check
      } catch (e) {
        toast('error', e.message);
        return;
      }
    }
    setStep('pin');
  }

  async function handleImport() {
    if (pin.length !== 6 || pin !== pinConfirm) { toast('error', 'PINs do not match or invalid.'); return; }
    setLoading(true);
    try {
      const secret = importType === 'mnemonic' ? words.join(' ') : privateKey;
      await encryptAndStore(secret, pin, importType);
      
      const wallet = importType === 'private_key' 
        ? await deriveTronWalletFromKey(secret)
        : await deriveTronWallet(secret);

      dispatch({ type: 'UNLOCK', payload: wallet });
      toast('success', 'Wallet imported successfully!');
    } catch (e) {
      toast('error', e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex-col gap-5 animate-in" style={{ padding: '24px', minHeight: '100dvh', display: 'flex' }}>
      <button onClick={onBack} className="flex items-center gap-2" style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', alignSelf: 'flex-start' }}>
        ← Back
      </button>

      <div>
        <h2>Import Wallet</h2>
        <p className="text-muted text-sm" style={{ marginTop: 4 }}>Restore your existing vault</p>
      </div>

      {step === 'input' && (
        <>
          <div className="flex gap-2 p-1 glass-card" style={{ borderRadius: 'var(--radius-md)', background: 'rgba(255,255,255,0.03)' }}>
            <button 
              className={`btn btn-sm flex-1 ${importType === 'mnemonic' ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setImportType('mnemonic')}
            >
              Seed Phrase
            </button>
            <button 
              className={`btn btn-sm flex-1 ${importType === 'private_key' ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setImportType('private_key')}
            >
              Private Key
            </button>
          </div>

          {importType === 'mnemonic' ? (
            <div className="seed-grid">
              {words.map((w, i) => (
                <div key={i} style={{ position: 'relative' }}>
                  <div className="seed-word-num" style={{ position: 'absolute', top: 8, left: 8, fontSize: 9, color: 'var(--text-muted)' }}>{i + 1}</div>
                  <input
                    value={w}
                    onChange={e => updateWord(i, e.target.value)}
                    className="input input-mono"
                    style={{ paddingTop: 22, fontSize: 13, textAlign: 'center' }}
                    placeholder="word"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                  />
                </div>
              ))}
            </div>
          ) : (
            <div className="field">
              <label className="label">64-Character Private Key</label>
              <textarea 
                className="input input-mono w-full"
                placeholder="e.g. 1a2b3c..." 
                rows={3}
                value={privateKey}
                onChange={e => setPrivateKey(e.target.value.replace(/[^0-9a-fA-F]/g, ''))}
                style={{ resize: 'none', padding: '12px', fontSize: 14 }}
              />
            </div>
          )}

          <button 
            className="btn btn-primary btn-full" 
            onClick={handleValidate} 
            disabled={importType === 'mnemonic' ? words.some(w => !w) : privateKey.length !== 64}
          >
            Verify {importType === 'mnemonic' ? 'Phrase' : 'Key'}
          </button>
        </>
      )}

      {step === 'pin' && (
        <div className="glass-card p-5 flex-col gap-5">
          <p className="text-sm" style={{ color: 'var(--gas-green)' }}>✓ Valid seed phrase</p>
          <div className="field">
            <label className="label">New PIN (6 digits)</label>
            <input type="password" inputMode="numeric" maxLength={6} className="pin-input" value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, ''))} />
          </div>
          <div className="field">
            <label className="label">Confirm PIN</label>
            <input type="password" inputMode="numeric" maxLength={6} className="pin-input" value={pinConfirm} onChange={e => setPinConfirm(e.target.value.replace(/\D/g, ''))} />
          </div>
          <button className="btn btn-gas btn-full" onClick={handleImport} disabled={loading || pin.length !== 6 || pin !== pinConfirm}>
            {loading ? <><div className="spinner" />Importing...</> : 'Import & Unlock'}
          </button>
        </div>
      )}
    </div>
  );
}
