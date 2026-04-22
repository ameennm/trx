import React, { useState } from 'react';
import { useWallet } from '../store/useWallet';
import { executeGasFreeTransfer, fetchTokenConfig, fetchNonce } from '../gasfree/gasfreeService.js';
import { BackButton } from '../components/UI.jsx';

// Default GasFree service provider for Nile testnet
// This address is the registered GasFree service provider on Nile
const PROVIDER_ADDRESS_NILE = 'TKtWbdzEq5ss9vTS9kwRhBp5mXmBfBns3E';
const PROVIDER_ADDRESS_MAIN = 'TKtWbdzEq5ss9vTS9kwRhBp5mXmBfBns3E'; // Update with mainnet provider when available

const TRON_ADDRESS_RE = /^T[1-9A-HJ-NP-Za-km-z]{33}$/;

export function SendView({ onBack }) {
  const { state, dispatch, toast } = useWallet();
  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('');
  const [step, setStep] = useState('form'); // 'form' | 'confirm' | 'sending' | 'done'
  const [txResult, setTxResult] = useState(null);
  const [isActivated, setIsActivated] = useState(true);
  const [activationFee, setActivationFee] = useState(0);
  const [activeStep, setActiveStep] = useState(0); // 0-3 for progress
  const [sendingError, setSendingError] = useState(null);

  // Fetch activation status and fees
  React.useEffect(() => {
    async function init() {
      try {
        const [configData, account] = await Promise.all([
          fetchTokenConfig(state.network),
          fetchNonce(state.address, state.network)
        ]);
        
        setIsActivated(account.activated);
        
        // Robust find for array or object containing array
        const tokens = Array.isArray(configData) ? configData : (configData?.tokens || []);
        if (!Array.isArray(tokens)) {
          console.error('GasFree tokens config is not an array:', tokens);
          return;
        }

        const usdt = tokens.find(t => t.symbol === 'USDT' || t.symbol === 'USDT-TRC20' || t.symbol === 'Tether');
        
        if (usdt) {
          // Handle both 'activationFee' and 'activateFee'
          const rawFee = usdt.activationFee || usdt.activateFee || '0';
          setActivationFee(parseFloat(rawFee) / 1_000_000);
        }
      } catch (err) {
        console.warn('Failed to fetch GasFree config:', err);
      }
    }
    init();
  }, [state.address, state.network]);

  const platformFee = 1.10;
  const currentActivationFee = !isActivated ? activationFee : 0;
  const totalDeducted = amount ? (parseFloat(amount) + platformFee + currentActivationFee).toFixed(2) : '—';
  const recipientValid = TRON_ADDRESS_RE.test(recipient.trim());
  const amountValid = parseFloat(amount) > 0;
  const canSubmit = recipientValid && amountValid;

  async function handleSend() {
    setStep('sending');
    setActiveStep(0); // Nonce
    setSendingError(null);
    try {
      const provider = state.network === 'mainnet' ? PROVIDER_ADDRESS_MAIN : PROVIDER_ADDRESS_NILE;
      
      // Real execution
      const result = await executeGasFreeTransfer({
        userAddress: state.address,
        privateKey: state.privateKey,
        recipient: recipient.trim(),
        amount,
        serviceProvider: provider,
        network: state.network,
        onProgress: (p) => {
          if (p === 'nonce') setActiveStep(0);
          if (p === 'assemble') setActiveStep(1);
          if (p === 'sign') setActiveStep(2);
          if (p === 'relay') setActiveStep(3);
        }
      });

      setTxResult(result);
      dispatch({
        type: 'PREPEND_TRANSACTION',
        payload: {
          id: result.txId,
          type: 'send',
          amount,
          recipient: recipient.trim(),
          tx_hash: result.txHash,
          status: 'success',
          created_at: Date.now(),
          source: 'gasfree',
        },
      });

      setStep('done');
    } catch (err) {
      console.error('Transfer Error:', err);
      setSendingError(err.message);
      toast('error', err.message);
      // Keep on sending screen so they can see which step failed
    }
  }

  if (step === 'done' && txResult) {
    return (
      <div className="page z-1 flex-col gap-6 text-center" style={{ justifyContent: 'center', minHeight: '80dvh' }}>
        <div style={{ fontSize: 72, animation: 'fade-up 0.4s ease' }}>✅</div>
        <div>
          <h2 style={{ color: 'var(--gas-green)' }}>Transfer Sent!</h2>
          <p className="text-muted text-sm" style={{ marginTop: 8 }}>GasFree — No TRX used</p>
        </div>
        <div className="glass-card p-5 flex-col gap-4 text-left">
          <div className="flex justify-between">
            <span className="text-muted text-sm">Amount</span>
            <span style={{ fontWeight: 800 }}>{amount} USDT</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted text-sm">Fee paid</span>
            <span style={{ fontWeight: 700 }}>$1.10 USDT</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted text-sm">Tx Hash</span>
            <span className="mono text-tiny truncate" style={{ maxWidth: 160, color: 'var(--primary)' }}>
              {txResult.txHash ? `${txResult.txHash.slice(0, 12)}...` : 'Pending'}
            </span>
          </div>
        </div>
        <div className="flex gap-3">
          <button className="btn btn-ghost flex-1" onClick={() => { setStep('form'); setAmount(''); setRecipient(''); setTxResult(null); }}>
            Send Again
          </button>
          <button className="btn btn-primary flex-1" onClick={onBack}>
            Dashboard
          </button>
        </div>
      </div>
    );
  }

  if (step === 'sending') {
    return (
      <div className="page z-1 flex-col text-center" style={{ justifyContent: 'center', minHeight: '80dvh', gap: 24 }}>
        <div className="spinner" style={{ width: 56, height: 56, borderWidth: 4, color: 'var(--gas-green)', margin: '0 auto' }} />
        <div>
          <h2>Signing & Submitting</h2>
          <p className="text-muted text-sm" style={{ marginTop: 6 }}>TIP-712 signature → GasFree Provider → TRON Chain</p>
        </div>
        <div className="glass-card p-4 flex-col gap-3">
          {[
            'Fetching network nonce...', 
            'Assembling TIP-712 message...', 
            'Signing locally (secure layer)...', 
            'Relaying to GasFree network...'
          ].map((s, i) => (
            <div key={i} className="flex items-center gap-3" style={{ 
              opacity: activeStep >= i ? 1 : 0.3, 
              transition: 'all 0.3s',
              color: (sendingError && activeStep === i) ? 'var(--accent-red)' : 'inherit'
            }}>
              <div style={{ 
                width: 10, 
                height: 10, 
                borderRadius: '50%', 
                background: (sendingError && activeStep === i) ? 'var(--accent-red)' : (activeStep > i ? 'var(--gas-green)' : (activeStep === i ? 'var(--primary)' : 'rgba(255,255,255,0.1)')),
                boxShadow: activeStep === i ? `0 0 10px ${sendingError ? 'var(--accent-red)' : 'var(--primary)'}` : 'none'
              }} />
              <span className="text-sm" style={{ fontWeight: activeStep === i ? 600 : 400 }}>{s}</span>
              {activeStep > i && !sendingError && <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--gas-green)' }}>DONE</span>}
              {sendingError && activeStep === i && <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--accent-red)' }}>FAILED</span>}
            </div>
          ))}
        </div>

        {sendingError && (
          <div className="glass-card p-4 animate-in" style={{ borderColor: 'var(--accent-red)', background: 'rgba(239,68,68,0.05)' }}>
            <p className="text-sm" style={{ color: 'var(--accent-red)', fontWeight: 600 }}>Error encountered:</p>
            <p className="text-tiny" style={{ marginTop: 4, opacity: 0.8 }}>{sendingError}</p>
            <button className="btn btn-sm btn-ghost w-full" style={{ marginTop: 12, color: 'var(--accent-red)' }} onClick={() => setStep('form')}>
              Return to Form
            </button>
          </div>
        )}
      </div>
    );
  }

  if (step === 'confirm') {
    return (
      <div className="page z-1 flex-col gap-5">
        <BackButton onClick={() => setStep('form')} label="Edit" />
        <h2>Confirm Transfer</h2>

        <div className="glass-card p-5 flex-col gap-0">
          <div className="fee-row">
            <span className="text-muted text-sm">Sending to</span>
            <span className="mono text-sm">{recipient.slice(0, 10)}...{recipient.slice(-6)}</span>
          </div>
          <div className="fee-row">
            <span className="text-muted text-sm">Amount</span>
            <span style={{ fontWeight: 700 }}>{amount} USDT</span>
          </div>
          <div className="fee-row">
            <span className="text-muted text-sm">GasFree Platform Fee</span>
            <span style={{ fontWeight: 700 }}>1.10 USDT</span>
          </div>
          {!isActivated && (
            <div className="fee-row" style={{ animation: 'fade-in 0.3s ease' }}>
              <span className="text-muted text-sm">One-time Activation Fee</span>
              <span style={{ fontWeight: 700 }}>{activationFee.toFixed(2)} USDT</span>
            </div>
          )}
          <div className="fee-row fee-row-total">
            <span>Total Deducted</span>
            <span style={{ color: 'var(--accent-red)' }}>{totalDeducted} USDT</span>
          </div>
        </div>

        <div className="glass-card p-4" style={{ background: 'var(--gas-green-dim)', borderColor: 'rgba(0,229,160,0.2)' }}>
          <p style={{ fontSize: 12, color: 'var(--gas-green)' }}>
            ⚡ <strong>Gasless Transfer</strong> — You pay <strong>0 TRX</strong>.
            Your signature authorizes the GasFree Protocol to handle the network fee.
          </p>
        </div>

        <button className="btn btn-gas btn-full" onClick={handleSend}>
          ⚡ Sign & Submit GasFree Transfer
        </button>
      </div>
    );
  }

  // Form step
  return (
    <div className="page z-1 flex-col gap-5">
      <div className="flex items-center gap-3">
        <BackButton onClick={onBack} />
        <div>
          <h2>Send USDT</h2>
          <div style={{ marginTop: 4 }}><span className="gas-badge"><span className="gas-dot" />GasFree · $1.10 Fee</span></div>
        </div>
      </div>

      <div className="glass-card p-5 flex-col gap-5">
        {/* Recipient */}
        <div className="field">
          <label className="label">Recipient Address</label>
          <div className="input-group">
            <input
              className={`input input-mono ${recipient && !recipientValid ? 'field-error' : ''}`}
              style={{ borderColor: recipient && !recipientValid ? 'var(--accent-red)' : '', fontSize: 13 }}
              placeholder="TRX address (T...)"
              value={recipient}
              onChange={e => setRecipient(e.target.value)}
            />
            {recipient && recipientValid && (
              <div className="input-group-action" style={{ color: 'var(--gas-green)' }}>✓</div>
            )}
          </div>
          {recipient && !recipientValid && (
            <p style={{ fontSize: 11, color: 'var(--accent-red)' }}>Invalid TRON address</p>
          )}
        </div>

        {/* Amount */}
        <div className="field">
          <label className="label">Amount (USDT)</label>
          <div className="input-group">
            <input
              type="number"
              className="input"
              placeholder="0.00"
              min="1"
              step="0.01"
              value={amount}
              onChange={e => setAmount(e.target.value)}
            />
            <div className="input-group-action">
              <button className="btn btn-sm btn-ghost" style={{ padding: '4px 8px', fontSize: 11 }} onClick={() => setAmount(state.balances.usdt)}>
                MAX
              </button>
            </div>
          </div>
        </div>

        {/* Fee Preview */}
        {amount && parseFloat(amount) > 0 && (
          <div className="glass-card p-4 flex-col gap-0 animate-in" style={{ background: 'transparent' }}>
            <div className="fee-row">
              <span className="text-muted text-sm">Transfer amount</span>
              <span style={{ fontWeight: 600 }}>{parseFloat(amount).toFixed(2)} USDT</span>
            </div>
            <div className="fee-row">
              <span className="text-muted text-sm">Platform fee</span>
              <span style={{ fontWeight: 600 }}>1.10 USDT</span>
            </div>
            {!isActivated && (
              <div className="fee-row animate-in">
                <span className="text-muted text-sm">Activation fee (one-time)</span>
                <span style={{ fontWeight: 600 }}>{activationFee.toFixed(2)} USDT</span>
              </div>
            )}
            <div className="fee-row fee-row-total">
              <span>You pay</span>
              <span style={{ color: 'var(--primary)' }}>{totalDeducted} USDT</span>
            </div>
          </div>
        )}
      </div>

      <button className="btn btn-primary btn-full" disabled={!canSubmit} onClick={() => setStep('confirm')}>
        Review Transfer →
      </button>

      <p className="text-center text-muted text-tiny">
        Zero TRX required · Signed locally · Non-custodial
      </p>
    </div>
  );
}
