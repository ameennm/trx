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

      // Update local usdt balance via context dispatch (optional but better UX)
      try {
        const newBal = await api.getBalance(address);
        dispatch({ type: 'SET_USDT_BALANCE', payload: newBal });
      } catch (e) { /* ignore balance fetch error */ }

      setTxResult(res); setStep('result');
      toast('success', 'Transaction sent!');
    } catch (err) {
      setTxResult({ success: false, error: err.message }); setStep('result');
      toast('error', err.message);
    }
    setLoading(false);
  };

  const [setupStatus, setSetupStatus] = useState('');
  const handleActivate = async () => {
    setLoading(true);
    try {
      const result = await fundAndApprove(privateKey, address, api, (step, message) => {
        setSetupStatus(message);
      });
      if (result.approved) {
        toast('success', 'Wallet activated!');
        setSetupStatus('');
        // Refresh quote to clear the banner
        handleGetQuote();
      }
    } catch (err) {
      toast('error', 'Activation failed: ' + err.message);
      setSetupStatus('');
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
              placeholder="T... (Recipient)"
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
                onClick={() => setAmount(String(Math.max(0, state.usdtBalance - (quote?.fee?.totalFeeUSDT || 10)).toFixed(2)))}
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

          {/* Activation Notice */}
          {!quote.allowanceSufficient && (
            <div className={`p-4 rounded-2xl bg-warning/10 border border-warning/20 mb-6 flex flex-col gap-3 transition-all duration-300 ${loading ? 'opacity-50' : ''}`}>
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-warning/20 flex items-center justify-center text-warning">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                </div>
                <div className="flex-1">
                  <div className="text-[13px] font-bold text-warning">One-Time Activation Required</div>
                  <div className="text-[11px] text-warning/80 leading-tight">We'll automatically set up your wallet for gasless transfers.</div>
                </div>
              </div>
              <button 
                onClick={handleActivate} 
                className="w-full bg-warning text-bg-primary text-[12px] font-bold py-2 rounded-xl hover:opacity-90 transition-opacity"
              >
                {loading ? (setupStatus || 'Activating...') : 'Confirm & Activate'}
              </button>
            </div>
          )}

          {/* Fee breakdown */}
          <div className="fee-card mb-8">
            <div className="fee-row">
              <span className="label">Asset</span>
              <span className="value">Tether (USDT)</span>
            </div>
            <div className="fee-row">
              <span className="label">Network Fee</span>
              <span className="value font-mono">{(quote.fee.networkFeeUSDT + quote.fee.markupUSDT).toFixed(4)} USDT</span>
            </div>
            {quote.fee.recoveryFeeUSDT > 0 && (
              <div className="fee-row text-warning">
                <span className="label">Activation Recovery</span>
                <span className="value font-mono font-bold">+{quote.fee.recoveryFeeUSDT.toFixed(4)} USDT</span>
              </div>
            )}
            <div className="fee-row total pt-3 border-t border-white/5 mt-2">
              <span className="label">Total Fees</span>
              <span className="value font-bold text-primary font-mono">{quote.fee.totalFeeUSDT.toFixed(4)} USDT</span>
            </div>
            <div className="fee-row total">
              <span className="label">Deduction</span>
              <span className="value text-lg font-extrabold font-mono">{quote.fee.totalDeduction.toFixed(2)} USDT</span>
            </div>
          </div>

          <div className="mt-auto">
            <button 
              onClick={handleSend} 
              disabled={loading || !quote.allowanceSufficient || !quote.balanceSufficient} 
              className={`btn-primary ${(!quote.allowanceSufficient || !quote.balanceSufficient) ? 'opacity-30 cursor-not-allowed' : ''}`}
            >
              {!quote.balanceSufficient ? 'Insufficient Balance' : 'Confirm & Send'}
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
