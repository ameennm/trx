import React, { useEffect, useState } from 'react';
import { useWallet } from '../store/useWallet';
import { NETWORKS } from '../store/constants';
import { BackButton } from '../components/UI.jsx';

export function AdminView({ onBack }) {
  const { state } = useWallet();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchStats() {
      try {
        const res = await fetch(`${NETWORKS[state.network].apiBackend}/api/stats`);
        const data = await res.json();
        if (data.success) {
          setStats(data.data);
        }
      } catch (err) {
        console.error('Failed to fetch admin stats:', err);
      } finally {
        setLoading(false);
      }
    }
    fetchStats();
  }, [state.network]);

  return (
    <div className="page z-1 flex-col gap-6">
      <div className="flex items-center gap-3">
        <BackButton onClick={onBack} />
        <h2>Admin Dashboard</h2>
      </div>

      {loading ? (
        <div className="flex items-center justify-center p-12">
          <div className="spinner" />
        </div>
      ) : (
        <>
          {/* Summary Cards */}
          <div className="flex gap-3">
            <div className="glass-card p-4 flex-1 flex-col gap-1" style={{ borderLeft: '4px solid var(--primary)' }}>
              <span className="text-muted text-tiny uppercase font-bold">Total Revenue</span>
              <span style={{ fontSize: 20, fontWeight: 800 }}>${stats?.lifetime?.total_revenue || '0.00'}</span>
            </div>
            <div className="glass-card p-4 flex-1 flex-col gap-1" style={{ borderLeft: '4px solid var(--gas-green)' }}>
              <span className="text-muted text-tiny uppercase font-bold">Total Profit</span>
              <span style={{ fontSize: 20, fontWeight: 800, color: 'var(--gas-green)' }}>${stats?.lifetime?.total_profit || '0.00'}</span>
            </div>
          </div>

          {/* Volume Card */}
          <div className="glass-card p-5 flex-col gap-2">
            <span className="text-muted text-tiny uppercase font-bold">Transaction Volume</span>
            <div className="flex items-end gap-2">
              <span style={{ fontSize: 32, fontWeight: 900 }}>{stats?.lifetime?.total_volume || '0'}</span>
              <span className="text-muted mb-1">USDT</span>
            </div>
            <p className="text-muted text-sm">Processed across {stats?.lifetime?.total_transactions || 0} transactions</p>
          </div>

          {/* Payout Instructions */}
          <div className="glass-card p-5 flex-col gap-4" style={{ background: 'var(--primary-dim)', borderColor: 'var(--primary-glow)' }}>
            <h3 style={{ fontSize: 16 }}>💰 Revenue Payouts</h3>
            <p className="text-sm text-secondary">
              Profits are accumulated in the users' GasFree contract addresses on the <strong>{state.network}</strong>.
            </p>
            <div className="p-3 bg-black-20 rounded-md border border-white-05">
              <p className="text-tiny text-muted uppercase font-bold mb-2">Claiming Process</p>
              <ol className="text-xs text-secondary flex-col gap-2 flex" style={{ paddingLeft: 16 }}>
                <li>Fees are deducted automatically from transfers.</li>
                <li>The "Markup" portion ($0.10) sits as surplus USDT.</li>
                <li>Use the GasFree Operator Tool to sweep these funds to your Treasury.</li>
              </ol>
            </div>
            <button 
              className="btn btn-primary btn-full" 
              onClick={() => window.open('https://gasfree.io/withdraw', '_blank')}
            >
              Open Protocol Withdrawal Tool ↗
            </button>
          </div>

          <div style={{ height: 20 }} />
        </>
      )}
    </div>
  );
}
