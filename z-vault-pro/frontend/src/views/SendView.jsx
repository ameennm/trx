import React, { useState } from 'react';
import { useWallet } from '../store/useWallet';
import { executeGasFreeTransfer, fetchTokenConfig, fetchNonce } from '../gasfree/gasfreeService.js';
import { BackButton } from '../components/UI.jsx';
import { TronWeb } from 'tronweb';

const TRON_ADDRESS_RE = /^T[1-9A-HJ-NP-Za-km-z]{33}$/;

export function SendView({ onBack, params = {} }) {
  const { state, dispatch, toast } = useWallet();
  const isDepositMode = params.mode === 'deposit';
  
  const [recipient, setRecipient] = useState(isDepositMode ? state.balances.proxyAddress : '');
  const [amount, setAmount] = useState('');
  const [step, setStep] = useState('form'); // 'form' | 'confirm' | 'sending' | 'done'
  const [txResult, setTxResult] = useState(null);
  const [isActivated, setIsActivated] = useState(true);
  const [activationFee, setActivationFee] = useState(0);
  const [activeStep, setActiveStep] = useState(0); 
  const [sendingError, setSendingError] = useState(null);

  const [feesConfig, setFeesConfig] = useState({ threshold: 500, tier1: 1.00, tier2: 2.00, activation: 2.00 });

  // Fetch activation status and fees
  React.useEffect(() => {
    async function init() {
      try {
        const [configData, account] = await Promise.all([
          fetchTokenConfig(state.network),
          fetchNonce(state.address, state.network)
        ]);
        
        setIsActivated(account.activated);
        
        if (configData) {
          setFeesConfig({
            threshold: parseFloat(configData.threshold ?? 500),
            tier1: parseFloat(configData.tier1 ?? 1.00),
            tier2: parseFloat(configData.tier2 ?? 2.00),
            activation: parseFloat(configData.activation ?? 2.00)
          });
          setActivationFee(parseFloat(configData.activation ?? 2.00));
        }
      } catch (err) {
        console.warn('Failed to fetch GasFree config:', err);
      }
    }
    if (!isDepositMode) init();
  }, [state.address, state.network, isDepositMode]);

  const parsedAmount = parseFloat(amount) || 0;
  const platformFee = isDepositMode ? 0 : (parsedAmount >= feesConfig.threshold ? feesConfig.tier2 : feesConfig.tier1);
  const currentActivationFee = (!isActivated && !isDepositMode) ? activationFee : 0;
  const totalDeducted = amount ? (parsedAmount + platformFee + currentActivationFee).toFixed(2) : '—';
  const recipientValid = TRON_ADDRESS_RE.test(recipient.trim());
  const amountValid = parseFloat(amount) > 0;
  const canSubmit = recipientValid && amountValid;

  async function handleSend() {
    setStep('sending');
    setSendingError(null);

    if (isDepositMode) {
      // GASLESS DEPOSIT (Relayer pays for Energy)
      try {
        setActiveStep(0); // Renting Energy
        
        // 1. Rent Energy from Backend
        const API_BASE = state.network === 'nile' 
          ? 'https://z-vault-pro-api.ameennm71.workers.dev' 
          : 'https://z-vault-pro-api.ameennm71.workers.dev';
          
        const rentRes = await fetch(`${API_BASE}/api/rent-deposit`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userAddress: state.address })
        });
        
        const rentData = await rentRes.json();
        if (!rentData.success) throw new Error(rentData.message || 'Failed to rent energy for deposit.');

        // Wait 3 seconds for TRON to register the energy
        await new Promise(r => setTimeout(r, 3000));

        setActiveStep(1); // Assembling
        const rpcUrl = state.network === 'mainnet' ? 'https://api.trongrid.io' : 'https://nile.trongrid.io';
        const usdtContract = state.network === 'mainnet' ? 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t' : 'TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf';
        const tw = new TronWeb({ 
          fullHost: rpcUrl, 
          privateKey: state.privateKey,
          headers: { 'TRON-PRO-API-KEY': '464bdc25-956d-40b5-8065-743ddd8c63f8' }
        });
        
        setActiveStep(2); // Sending
        const contract = await tw.contract().at(usdtContract);
        const tx = await contract.transfer(recipient.trim(), Math.floor(parsedAmount * 1_000_000)).send();
        
        setActiveStep(3); // Done
        setTxResult({ txHash: tx, feeRecorded: 0 });
        setStep('done');
      } catch (err) {
        setSendingError(err.message || 'Gasless Deposit failed.');
      }
      return;
    }

    // GASLESS TRANSFER (Relayer pays)
    try {
      setActiveStep(0);
      const result = await executeGasFreeTransfer({
        userAddress: state.address,
        privateKey: state.privateKey,
        recipient: recipient.trim(),
        amount,
        fee: platformFee.toString(),
        activationFee: currentActivationFee.toString(),
        network: state.network,
        onProgress: (p) => {
          if (p === 'nonce') setActiveStep(0);
          if (p === 'assemble') setActiveStep(1);
          if (p === 'sign') setActiveStep(2);
          if (p === 'relay') setActiveStep(3);
        }
      });

      setTxResult({ ...result, feeRecorded: platformFee });
      setStep('done');
    } catch (err) {
      setSendingError(err.message);
    }
  }

  if (step === 'done' && txResult) {
    return (
      <div className="page z-1 flex-col gap-6 text-center" style={{ justifyContent: 'center', minHeight: '80dvh' }}>
        <div style={{ fontSize: 72, animation: 'fade-up 0.4s ease' }}>✅</div>
        <div>
          <h2 style={{ color: 'var(--gas-green)' }}>{isDepositMode ? 'Deposit Sent!' : 'Transfer Sent!'}</h2>
          <p className="text-muted text-sm" style={{ marginTop: 8 }}>{isDepositMode ? 'USDT moving to Vault' : 'Z-Vault Relayer — No TRX used'}</p>
        </div>
        <div className="glass-card p-5 flex-col gap-4 text-left">
          <div className="flex justify-between">
            <span className="text-muted text-sm">Amount</span>
            <span style={{ fontWeight: 800 }}>{amount} USDT</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted text-sm">Tx Hash</span>
            <span className="mono text-tiny truncate" style={{ maxWidth: 160, color: 'var(--primary)' }}>
              {txResult.txHash ? `${txResult.txHash.slice(0, 12)}...` : 'Pending'}
            </span>
          </div>
        </div>
        <button className="btn btn-primary w-full" onClick={onBack}>Return to Dashboard</button>
      </div>
    );
  }

  if (step === 'sending') {
    return (
      <div className="page z-1 flex-col text-center" style={{ justifyContent: 'center', minHeight: '80dvh', gap: 24 }}>
        <div className="spinner" style={{ width: 56, height: 56, borderWidth: 4, color: 'var(--gas-green)', margin: '0 auto' }} />
        <div>
          <h2>{isDepositMode ? 'Sending Deposit' : 'Signing & Submitting'}</h2>
          <p className="text-muted text-sm" style={{ marginTop: 6 }}>
            {isDepositMode ? 'Executing on-chain transfer to your personal vault.' : 'TIP-712 signature → Internal Relayer → TRON Chain'}
          </p>
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
        <h2>{isDepositMode ? 'Confirm Deposit' : 'Confirm Transfer'}</h2>

        <div className="glass-card p-5 flex-col gap-0">
          <div className="fee-row">
            <span className="text-muted text-sm">Recipient</span>
            <span className="mono text-sm">{isDepositMode ? 'Your Gasless Vault' : `${recipient.slice(0, 10)}...${recipient.slice(-6)}`}</span>
          </div>
          <div className="fee-row">
            <span className="text-muted text-sm">Amount</span>
            <span style={{ fontWeight: 700 }}>{amount} USDT</span>
          </div>
          {!isDepositMode && (
            <>
              <div className="fee-row">
                <span className="text-muted text-sm">Relayer Platform Fee</span>
                <span style={{ fontWeight: 700 }}>{platformFee.toFixed(2)} USDT</span>
              </div>
              {!isActivated && (
                <div className="fee-row">
                  <span className="text-muted text-sm">Activation Fee</span>
                  <span style={{ fontWeight: 700 }}>{activationFee.toFixed(2)} USDT</span>
                </div>
              )}
            </>
          )}
          <div className="fee-row fee-row-total">
            <span>Total Deducted</span>
            <span style={{ color: isDepositMode ? 'var(--text-primary)' : 'var(--accent-red)' }}>{totalDeducted} USDT</span>
          </div>
        </div>

        <div className="glass-card p-4" style={{ background: isDepositMode ? 'rgba(255,255,255,0.02)' : 'var(--gas-green-dim)', borderColor: isDepositMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,229,160,0.2)' }}>
          <p style={{ fontSize: 12, color: isDepositMode ? 'var(--text-secondary)' : 'var(--gas-green)' }}>
            {isDepositMode 
              ? 'ℹ️ Standard Transfer — This move requires TRX for network energy. Once inside the vault, all future transfers are gasless.' 
              : '⚡ Gasless Transfer — You pay 0 TRX. Relayer handles everything.'}
          </p>
        </div>

        <button className={`btn ${isDepositMode ? 'btn-primary' : 'btn-gas'} btn-full`} onClick={handleSend}>
          {isDepositMode ? 'Confirm & Deposit' : '⚡ Sign & Submit Gasless'}
        </button>
      </div>
    );
  }

  return (
    <div className="page z-1 flex-col gap-5">
      <div className="flex items-center gap-3">
        <BackButton onClick={onBack} />
        <div>
          <h2>{isDepositMode ? 'Top Up Vault' : 'Send USDT'}</h2>
          {!isDepositMode && <div style={{ marginTop: 4 }}><span className="gas-badge"><span className="gas-dot" />Gasless Relayer Active</span></div>}
        </div>
      </div>

      <div className="glass-card p-5 flex-col gap-5">
        <div className="field">
          <label className="label">{isDepositMode ? 'Your Vault Address' : 'Recipient Address'}</label>
          <input
            className="input input-mono"
            style={{ fontSize: 13 }}
            disabled={isDepositMode}
            value={recipient}
            onChange={e => setRecipient(e.target.value)}
          />
        </div>

        <div className="field">
          <label className="label">Amount (USDT)</label>
          <div className="input-group">
            <input
              type="number"
              className="input"
              placeholder="0.00"
              value={amount}
              onChange={e => setAmount(e.target.value)}
            />
            <div className="input-group-action">
              <button className="btn btn-xs btn-ghost" onClick={() => setAmount(state.balances.usdt)}>MAX</button>
            </div>
          </div>
        </div>
      </div>

      <button className="btn btn-primary btn-full" disabled={!canSubmit} onClick={() => setStep('confirm')}>
        Review {isDepositMode ? 'Deposit' : 'Transfer'} →
      </button>
    </div>
  );
}

