import { useState } from 'react';
import { useWallet } from '../stores/WalletContext';
import { useToast } from '../stores/ToastContext';
import { generateMnemonic, deriveWallets, walletsFromPrivateKey } from '../services/walletService';

export default function Welcome() {
  const { dispatch } = useWallet();
  const toast = useToast();
  const [mode, setMode] = useState(null);
  const [importValue, setImportValue] = useState('');

  const handleCreate = () => {
    try {
      const mnemonic = generateMnemonic();
      const wallets = deriveWallets(mnemonic);
      dispatch({ type: 'SET_WALLET', payload: { mnemonic, ...wallets } });
      dispatch({ type: 'SET_VIEW', payload: 'seed-phrase' });
    } catch (err) { toast('error', err.message); }
  };

  const handleImport = () => {
    try {
      const val = importValue.trim();
      const isSeed = val.split(/\s+/).length >= 12;
      const wallets = isSeed ? deriveWallets(val.toLowerCase()) : walletsFromPrivateKey(val);
      dispatch({ type: 'SET_WALLET', payload: { mnemonic: isSeed ? val : null, ...wallets } });
      dispatch({ type: 'SET_VIEW', payload: 'pin-setup' });
      toast('success', 'Wallet imported');
    } catch (err) { toast('error', err.message); }
  };

  if (!mode) {
    return (
      <div className="app-shell justify-between py-16 px-6">
        {/* Hero */}
        <div />
        <div className="flex flex-col items-center text-center">
          {/* Logo */}
          <div className="w-[88px] h-[88px] rounded-[26px] bg-primary flex items-center justify-center mb-8 shadow-lg" style={{boxShadow: '0 16px 48px rgba(51, 117, 187, 0.3)'}}>
            <svg width="44" height="44" viewBox="0 0 28 28" fill="white">
              <path d="M14 2L2 8v12l12 6 12-6V8L14 2z" opacity="0.95"/>
              <path d="M14 8l6 3v6l-6 3-6-3v-6l6-3z" fill="#1A2332" opacity="0.85"/>
            </svg>
          </div>
          <h1 className="text-[32px] font-extrabold tracking-tight mb-3">Crypxe</h1>
          <p className="text-text-secondary text-[15px] leading-relaxed max-w-[260px]">
            Your secure gateway to gasless USDT transfers
          </p>
        </div>

        {/* CTAs */}
        <div className="space-y-3 w-full">
          <button onClick={handleCreate} className="btn-primary">
            Create New Wallet
          </button>
          <button onClick={() => setMode('import')} className="btn-ghost">
            I Already Have a Wallet
          </button>
        </div>
      </div>
    );
  }

  // Import screen
  return (
    <div className="app-shell px-6 py-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-8">
        <button onClick={() => { setMode(null); setImportValue(''); }} className="icon-btn">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
        </button>
        <h2 className="text-xl font-bold">Import Wallet</h2>
      </div>

      <div className="flex flex-col flex-1">
        <label className="input-label">Recovery Phrase or Private Key</label>
        <textarea
          value={importValue}
          onChange={(e) => setImportValue(e.target.value)}
          placeholder="Enter your 12-word phrase or 64-char hex key"
          rows={5}
          className="input-field font-mono text-sm mb-4 resize-none"
          style={{lineHeight: '1.8'}}
        />
        
        <div className="warning-box mb-8">
          <span className="icon">⚠</span>
          <p>Typically 12 words separated by spaces, or a 64-character hexadecimal private key.</p>
        </div>

        <div className="mt-auto">
          <button onClick={handleImport} disabled={!importValue.trim()} className="btn-primary">
            Import
          </button>
        </div>
      </div>
    </div>
  );
}
