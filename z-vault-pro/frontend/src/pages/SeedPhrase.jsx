import { useState, useMemo } from 'react';
import { useWallet } from '../stores/WalletContext';
import { useToast } from '../stores/ToastContext';

export default function SeedPhrase() {
  const { state, dispatch } = useWallet();
  const toast = useToast();
  const [step, setStep] = useState('display');
  const [selectedWords, setSelectedWords] = useState([]);

  const words = state.mnemonic ? state.mnemonic.split(' ') : [];
  const shuffled = useMemo(() => [...words].sort(() => Math.random() - 0.5), [state.mnemonic]);

  const handleVerify = () => {
    if (selectedWords.length === words.length && selectedWords.every((w, i) => w.word === words[i])) {
      dispatch({ type: 'SET_VIEW', payload: 'pin-setup' });
    } else {
      toast('error', 'Words are in the wrong order');
      setSelectedWords([]);
    }
  };

  if (step === 'display') {
    return (
      <div className="app-shell px-6 py-6">
        <div className="text-center mb-8">
          <h2 className="text-2xl font-extrabold tracking-tight mb-2">Recovery Phrase</h2>
          <p className="text-text-secondary text-sm">Write down these 12 words in order and keep them safe.</p>
        </div>

        <div className="seed-grid mb-8">
          {words.map((word, i) => (
            <div key={i} className="seed-word">
              <span className="seed-num">{i + 1}</span>
              <span className="seed-text">{word}</span>
            </div>
          ))}
        </div>

        <div className="warning-box mb-8">
          <span className="icon">⚠</span>
          <p>Never share this phrase. Anyone who has it can access your wallet and steal your funds.</p>
        </div>

        <button onClick={() => setStep('verify')} className="btn-primary mt-auto">
          I've Saved It
        </button>
      </div>
    );
  }

  return (
    <div className="app-shell px-6 py-6">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => { setStep('display'); setSelectedWords([]); }} className="icon-btn">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
        </button>
        <h2 className="text-xl font-bold">Verify Phrase</h2>
      </div>
      
      <p className="text-text-secondary text-sm mb-6">Tap the words in the correct order.</p>

      {/* Selected area */}
      <div className="min-h-[120px] rounded-[18px] border-2 border-dashed border-surface-3 p-4 flex flex-wrap gap-2 content-start mb-6">
        {selectedWords.length === 0 && (
          <span className="text-text-tertiary text-sm m-auto">Tap words below…</span>
        )}
        {selectedWords.map((w, i) => (
          <button key={i} onClick={() => setSelectedWords(p => p.filter((_, idx) => idx !== i))} className="word-bank-item selected">
            {w.word} ×
          </button>
        ))}
      </div>

      {/* Word bank */}
      <div className="flex flex-wrap gap-2 justify-center mb-8">
        {shuffled.map((word, i) => {
          const used = selectedWords.find(w => w.index === i);
          return (
            <button
              key={i}
              onClick={() => !used && setSelectedWords(p => [...p, { word, index: i }])}
              className={`word-bank-item ${used ? 'used' : 'available'}`}
            >
              {word}
            </button>
          );
        })}
      </div>

      <button onClick={handleVerify} disabled={selectedWords.length !== words.length} className="btn-primary mt-auto">
        Verify
      </button>
    </div>
  );
}
