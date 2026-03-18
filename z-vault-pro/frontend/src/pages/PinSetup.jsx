import { useState } from 'react';
import { useWallet } from '../stores/WalletContext';
import { useToast } from '../stores/ToastContext';
import { encryptAndStore } from '../services/cryptoService';

export default function PinSetup({ mode = 'setup' }) {
  const { state, dispatch } = useWallet();
  const toast = useToast();
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [step, setStep] = useState(mode === 'setup' ? 'enter' : 'unlock');
  const [loading, setLoading] = useState(false);

  const currentPin = step === 'confirm' ? confirmPin : pin;

  const handleDigit = async (digit) => {
    const newPin = currentPin + digit;
    if (newPin.length > 6) return;

    if (step === 'confirm') setConfirmPin(newPin);
    else setPin(newPin);

    if (newPin.length === 6) {
      if (step === 'enter') {
        setTimeout(() => { setStep('confirm'); setConfirmPin(''); }, 200);
      } else if (step === 'confirm') {
        if (newPin !== pin) {
          toast('error', 'Passcodes don\'t match');
          setPin(''); setConfirmPin(''); setStep('enter');
          return;
        }
        setLoading(true);
        try {
          await encryptAndStore({ tron: state.tron, mnemonic: state.mnemonic }, newPin);
          dispatch({ type: 'UNLOCK' });
        } catch (err) { toast('error', err.message); }
        setLoading(false);
      } else if (step === 'unlock') {
        setLoading(true);
        try {
          const { decryptWallet } = await import('../services/cryptoService');
          const walletData = await decryptWallet(newPin);
          dispatch({ type: 'SET_WALLET', payload: walletData });
          dispatch({ type: 'UNLOCK' });
        } catch (err) { toast('error', 'Invalid passcode'); setPin(''); }
        setLoading(false);
      }
    }
  };

  const handleDelete = () => {
    if (step === 'confirm') setConfirmPin(p => p.slice(0, -1));
    else setPin(p => p.slice(0, -1));
  };

  const titles = { enter: 'Create Passcode', confirm: 'Confirm Passcode', unlock: 'Enter Passcode' };
  const subtitles = { enter: 'Set a 6-digit passcode for your wallet', confirm: 'Enter the same passcode again', unlock: 'Unlock your wallet' };

  return (
    <div className="app-shell">
      <div className="pin-screen">
        {/* Lock icon */}
        <div className="w-14 h-14 rounded-full bg-surface-1 flex items-center justify-center mb-6">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-primary">
            <rect x="3" y="11" width="18" height="11" rx="2"/>
            <path d="M7 11V7a5 5 0 0110 0v4"/>
          </svg>
        </div>

        <h2 className="pin-title">{titles[step]}</h2>
        <p className="pin-subtitle">{subtitles[step]}</p>

        {/* Dots */}
        <div className="pin-dots">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className={`pin-dot ${i < currentPin.length ? 'filled' : ''}`} />
          ))}
        </div>

        {/* Numpad */}
        {loading ? (
          <div className="spinner-inline" style={{width: 32, height: 32}} />
        ) : (
          <div className="pin-grid">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, '', 0, 'del'].map((key, i) => {
              if (key === '') return <div key={i} />;
              return (
                <button
                  key={i}
                  onClick={key === 'del' ? handleDelete : () => handleDigit(String(key))}
                  className="pin-key"
                >
                  {key === 'del' ? (
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 4H8l-7 8 7 8h13a2 2 0 002-2V6a2 2 0 00-2-2z"/><line x1="18" y1="9" x2="12" y2="15"/><line x1="12" y1="9" x2="18" y2="15"/></svg>
                  ) : key}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
