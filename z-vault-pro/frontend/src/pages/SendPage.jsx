import { useState } from 'react';
import { useWallet } from '../stores/WalletContext';
import { useToast } from '../stores/ToastContext';
import { signHash } from '../services/walletService';
import * as api from '../services/apiService';

export default function SendPage() {
  const { state, dispatch } = useWallet();
  const toast = useToast();

  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('');
  const [quote, setQuote] = useState(null);
  const [txResult, setTxResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState('input');

  const address = state.tron.address;
  const privateKey = state.tron.privateKey;

  const goBack = () => {
    if (step === 'result') { dispatch({ type: 'SET_VIEW', payload: 'dashboard' }); }
    else if (step === 'quote') { setStep('input'); setQuote(null); }
    else { dispatch({ type: 'SET_VIEW', payload: 'dashboard' }); }
  };

  const handleGetQuote = async () => {
    if (!recipient || recipient.length < 30) { toast('error', 'Invalid address'); return; }
    const val = parseFloat(amount);
    if (!val || val <= 0) { toast('error', 'Enter a valid amount'); return; }
    setLoading(true);
    try {
      const q = await api.getQuote(address, recipient, val);
      setQuote(q); setStep('quote');
    } catch (err) { toast('error', err.message); }
    setLoading(false);
  };

  const handleSend = async () => {
    if (!quote) return;
    setLoading(true);
    try {
      const { v, r, s } = signHash(privateKey, quote.typedDataHash);
      const res = await api.relayTransaction({
        from: address, to: recipient,
        sendAmount: quote.fee.sendAmount,
        feeAmount: quote.fee.totalFeeUSDT,
        deadline: quote.deadline,
        v, r, s,
      });
      setTxResult(res); setStep('result');
      toast('success', 'Transaction sent!');
    } catch (err) {
      setTxResult({ success: false, error: err.message }); setStep('result');
      toast('error', err.message);
    }
    setLoading(false);
  };

  return (
    <div className="app-shell px-6 py-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-8">
        <button onClick={goBack} className="icon-btn">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
        </button>
        <span className="topbar-title flex-1">Send USDT</span>
        <span className="text-[12px] font-semibold text-text-tertiary">TRON Nile</span>
      </div>

      {/* ── Input Step ── */}
      {step === 'input' && (
        <div className="flex flex-col flex-1 gap-6">
          <div>
            <label className="input-label">Recipient Address</label>
            <input
              type="text" value={recipient} onChange={(e) => setRecipient(e.target.value)}
              placeholder="T... or 0x..."
              className="input-field font-mono text-[14px]"
            />
          </div>

          <div>
            <label className="input-label">Amount</label>
            <div className="relative">
              <input
                type="number" value={amount} onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00" min="0" step="0.01"
                className="input-field text-[20px] font-bold pr-20"
              />
              <button
                onClick={() => setAmount(String(Math.max(0, state.usdtBalance - 10).toFixed(2)))}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-primary text-xs font-bold uppercase tracking-wide hover:opacity-70 transition-opacity"
              >
                Max
              </button>
            </div>
            <div className="flex justify-between mt-2">
              <span className="text-[12px] text-text-tertiary">Available</span>
              <span className="text-[12px] text-text-secondary font-semibold">{state.usdtBalance.toFixed(2)} USDT</span>
            </div>
          </div>

          <div className="mt-auto pt-4">
            <button onClick={handleGetQuote} disabled={loading || !recipient || !amount} className="btn-primary">
              {loading ? <span className="spinner-inline" /> : 'Continue'}
            </button>
          </div>
        </div>
      )}

      {/* ── Quote Step ── */}
      {step === 'quote' && quote && (
        <div className="flex flex-col flex-1">
          {/* Amount display */}
          <div className="text-center py-8">
            <div className="text-[42px] font-extrabold tracking-tight">{parseFloat(amount).toFixed(2)}</div>
            <div className="text-text-secondary font-bold text-sm mt-1">USDT</div>
          </div>

          {/* Fee breakdown */}
          <div className="fee-card mb-8">
            <div className="fee-row">
              <span className="label">Asset</span>
              <span className="value">Tether (USDT)</span>
            </div>
            <div className="fee-row">
              <span className="label">Network</span>
              <span className="value">TRON Nile</span>
            </div>
            <div className="fee-row">
              <span className="label">Network Fee</span>
              <span className="value">{quote.fee.networkFeeUSDT?.toFixed(4) || '—'} USDT</span>
            </div>
            <div className="fee-row">
              <span className="label">Service Fee</span>
              <span className="value">{quote.fee.markupUSDT?.toFixed(4) || '—'} USDT</span>
            </div>
            <div className="fee-row total">
              <span className="label">Max Total</span>
              <span className="value">{quote.fee.totalDeduction?.toFixed(2) || (parseFloat(amount) + quote.fee.totalFeeUSDT).toFixed(2)} USDT</span>
            </div>
          </div>

          <div className="mt-auto">
            <button onClick={handleSend} disabled={loading} className="btn-primary">
              {loading ? <span className="spinner-inline" /> : 'Confirm & Send'}
            </button>
          </div>
        </div>
      )}

      {/* ── Result Step ── */}
      {step === 'result' && txResult && (
        <div className="flex flex-col items-center justify-center flex-1 text-center pt-12">
          <div className={`result-icon ${txResult.success ? 'success' : 'failure'}`}>
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              {txResult.success
                ? <polyline points="20 6 9 17 4 12"/>
                : <><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></>
              }
            </svg>
          </div>

          <h3 className="text-xl font-bold mb-2">{txResult.success ? 'Sent Successfully' : 'Transaction Failed'}</h3>
          
          {txResult.success ? (
            <>
              <p className="text-text-secondary text-sm mb-1">{amount} USDT sent</p>
              <a
                href={txResult.explorerUrl || `https://nile.tronscan.org/#/transaction/${txResult.txHash}`}
                target="_blank" rel="noopener noreferrer"
                className="text-primary text-sm font-semibold hover:underline mt-4"
              >
                View on TronScan →
              </a>
            </>
          ) : (
            <p className="text-text-secondary text-sm">{txResult.error}</p>
          )}

          <div className="mt-auto w-full pt-8">
            <button onClick={goBack} className="btn-primary">Done</button>
          </div>
        </div>
      )}
    </div>
  );
}
