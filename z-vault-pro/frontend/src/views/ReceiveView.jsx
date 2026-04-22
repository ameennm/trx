import React, { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { useWallet } from '../store/useWallet';
import { getGasFreeAddress } from '../gasfree/gasfreeService.js';
import { BackButton, AddressDisplay } from '../components/UI.jsx';

export function ReceiveView({ onBack }) {
  const { state, toast } = useWallet();
  const [showGasFree, setShowGasFree] = useState(false);

  const gasFreeAddr = state.address ? getGasFreeAddress(state.address, state.network) : '';
  const displayAddr = showGasFree ? gasFreeAddr : state.address;

  function copyAddress() {
    navigator.clipboard.writeText(displayAddr);
    toast('success', 'Address copied!');
  }

  return (
    <div className="page z-1 flex-col gap-6">
      <div className="flex items-center gap-3">
        <BackButton onClick={onBack} />
        <h2>Receive USDT</h2>
      </div>

      {/* Address type toggle */}
      <div className="glass-card flex" style={{ padding: 4 }}>
        <button
          className="btn flex-1"
          style={{ background: !showGasFree ? 'var(--primary)' : 'transparent', color: !showGasFree ? '#fff' : 'var(--text-muted)', borderRadius: 'var(--radius-sm)', fontSize: 13, height: 38, padding: '0 12px' }}
          onClick={() => setShowGasFree(false)}
        >
          Standard
        </button>
        <button
          className="btn flex-1 gas-badge"
          style={{ background: showGasFree ? 'var(--gas-green-dim)' : 'transparent', color: showGasFree ? 'var(--gas-green)' : 'var(--text-muted)', borderRadius: 'var(--radius-sm)', fontSize: 13, height: 38, padding: '0 12px', border: 'none', letterSpacing: '0.04em' }}
          onClick={() => setShowGasFree(true)}
        >
          ⚡ GasFree Address
        </button>
      </div>

      {/* QR Code */}
      <div className="text-center animate-in">
        <div className="qr-container" style={{ display: 'inline-block', boxShadow: showGasFree ? '0 0 30px var(--gas-green-glow)' : 'var(--shadow-md)' }}>
          <QRCodeSVG
            value={displayAddr}
            size={220}
            level="H"
            includeMargin={false}
            fgColor={showGasFree ? '#006644' : '#000000'}
          />
        </div>
      </div>

      {/* Address display */}
      <div className="glass-card p-5 flex-col gap-3 text-center animate-in delay-1">
        <p className="label">{showGasFree ? 'GasFree Address' : 'Your TRON Address'}</p>
        <p className="mono text-sm" style={{ wordBreak: 'break-all', color: showGasFree ? 'var(--gas-green)' : 'var(--text-primary)', letterSpacing: '0.03em', lineHeight: 1.7 }}>
          {displayAddr}
        </p>
        <button className="btn btn-ghost btn-full" onClick={copyAddress}>
          📋 Copy Address
        </button>
      </div>

      {/* Info card */}
      <div className="glass-card p-4 animate-in delay-2" style={{ background: showGasFree ? 'var(--gas-green-dim)' : 'var(--primary-dim)', borderColor: showGasFree ? 'rgba(0,229,160,0.2)' : 'var(--primary-glow)' }}>
        {showGasFree ? (
          <p className="text-sm" style={{ color: 'var(--gas-green)' }}>
            ⚡ <strong>GasFree Address:</strong> When senders use the GasFree protocol, funds come through this contract-derived address automatically.
          </p>
        ) : (
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            Share this address to receive USDT. Senders using GasFree need <strong>0 TRX</strong> to pay fees.
          </p>
        )}
      </div>
    </div>
  );
}
