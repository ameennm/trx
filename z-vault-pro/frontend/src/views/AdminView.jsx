import React, { useEffect, useState } from 'react';
import { useWallet } from '../store/useWallet';
import { NETWORKS } from '../store/constants';
import { BackButton } from '../components/UI.jsx';

export function AdminView({ onBack }) {
  const { state, toast } = useWallet();
  const [stats, setStats] = useState(null);
  const [withdrawals, setWithdrawals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [withdrawing, setWithdrawing] = useState(false);

  const backend = NETWORKS[state.network].apiBackend;

  async function fetchData() {
    try {
      const [statsRes, wdRes] = await Promise.all([
        fetch(`${backend}/api/stats`),
        fetch(`${backend}/api/admin/withdrawals`),
      ]);
      const statsData = await statsRes.json();
      const wdData = await wdRes.json();
      if (statsData.success) setStats(statsData.data);
      if (wdData.success) setWithdrawals(wdData.data || []);
    } catch (err) {
      console.error('Failed to fetch admin data:', err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchData(); }, [state.network]);

  const totalProfit = parseFloat(stats?.lifetime?.total_profit || '0');
  const totalWithdrawn = parseFloat(stats?.totalWithdrawn || '0');
  const availableProfit = totalProfit - totalWithdrawn;

  async function handleWithdraw() {
    const amt = parseFloat(withdrawAmount);
    if (!amt || amt <= 0 || amt > availableProfit) {
      toast('error', `Invalid amount. Available: $${availableProfit.toFixed(2)}`);
      return;
    }
    setWithdrawing(true);
    try {
      const res = await fetch(`${backend}/api/admin/withdraw`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: withdrawAmount, adminAddress: state.address }),
      });
      const data = await res.json();
      if (data.success) {
        toast('success', `Withdrawal of $${withdrawAmount} recorded to treasury.`);
        setWithdrawAmount('');
        await fetchData(); // Refresh stats
      } else {
        toast('error', data.error || 'Withdrawal failed.');
      }
    } catch (err) {
      toast('error', 'Network error during withdrawal.');
    } finally {
      setWithdrawing(false);
    }
  }

  return (
    <div className="page z-1 flex-col gap-6" style={{ paddingBottom: 100 }}>
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
              <span style={{ fontSize: 20, fontWeight: 800 }}>${parseFloat(stats?.lifetime?.total_revenue || '0').toFixed(2)}</span>
            </div>
            <div className="glass-card p-4 flex-1 flex-col gap-1" style={{ borderLeft: '4px solid var(--gas-green)' }}>
              <span className="text-muted text-tiny uppercase font-bold">Total Profit</span>
              <span style={{ fontSize: 20, fontWeight: 800, color: 'var(--gas-green)' }}>${totalProfit.toFixed(2)}</span>
            </div>
          </div>

          {/* Volume Card */}
          <div className="glass-card p-5 flex-col gap-2">
            <span className="text-muted text-tiny uppercase font-bold">Transaction Volume</span>
            <div className="flex items-end gap-2">
              <span style={{ fontSize: 32, fontWeight: 900 }}>{parseFloat(stats?.lifetime?.total_volume || '0').toFixed(2)}</span>
              <span className="text-muted mb-1">USDT</span>
            </div>
            <p className="text-muted text-sm">Processed across {stats?.lifetime?.total_transactions || 0} transactions</p>
          </div>

          {/* Treasury Withdrawal */}
          <div className="glass-card p-5 flex-col gap-4" style={{ background: 'var(--primary-dim)', borderColor: 'var(--primary-glow)' }}>
            <h3 style={{ fontSize: 16 }}>💰 Withdraw to Treasury</h3>

            <div className="flex gap-3">
              <div className="flex-1 flex-col gap-1">
                <span className="text-muted text-tiny uppercase font-bold">Available</span>
                <span style={{ fontSize: 22, fontWeight: 800, color: 'var(--gas-green)' }}>${availableProfit.toFixed(2)}</span>
              </div>
              <div className="flex-1 flex-col gap-1">
                <span className="text-muted text-tiny uppercase font-bold">Withdrawn</span>
                <span style={{ fontSize: 22, fontWeight: 800 }}>${totalWithdrawn.toFixed(2)}</span>
              </div>
            </div>

            <div className="p-3 bg-black-20 rounded-md border border-white-05">
              <p className="text-tiny text-muted uppercase font-bold mb-2">Treasury Address</p>
              <p className="mono text-xs" style={{ wordBreak: 'break-all', color: 'var(--primary)' }}>
                {stats?.treasury || 'Not configured'}
              </p>
            </div>

            <div className="flex gap-3 items-end">
              <div className="flex-1 flex-col gap-1">
                <label className="text-tiny text-muted uppercase font-bold">Amount (USDT)</label>
                <input
                  type="number"
                  className="pin-input"
                  placeholder="0.00"
                  value={withdrawAmount}
                  onChange={e => setWithdrawAmount(e.target.value)}
                  style={{ fontSize: 16, textAlign: 'left', padding: '10px 14px', letterSpacing: 0 }}
                />
              </div>
              <button
                className="btn btn-primary"
                onClick={() => setWithdrawAmount(availableProfit.toFixed(2))}
                style={{ fontSize: 12, whiteSpace: 'nowrap', height: 44 }}
              >
                MAX
              </button>
            </div>

            <button
              className="btn btn-primary btn-full"
              onClick={handleWithdraw}
              disabled={withdrawing || !withdrawAmount || parseFloat(withdrawAmount) <= 0}
            >
              {withdrawing ? 'Processing...' : `Withdraw $${withdrawAmount || '0'} to Treasury`}
            </button>
          </div>

          {/* Withdrawal History */}
          {withdrawals.length > 0 && (
            <div className="glass-card p-5 flex-col gap-3">
              <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                Withdrawal History
              </h3>
              {withdrawals.map(w => (
                <div key={w.id} className="flex items-center justify-between p-3 bg-black-20 rounded-md">
                  <div className="flex-col gap-1">
                    <span className="text-sm font-bold">${parseFloat(w.amount).toFixed(2)} USDT</span>
                    <span className="text-tiny text-muted">{new Date(w.created_at).toLocaleString()}</span>
                  </div>
                  <span className="text-tiny uppercase font-bold" style={{ color: w.status === 'completed' ? 'var(--gas-green)' : 'var(--primary)' }}>
                    {w.status}
                  </span>
                </div>
              ))}
            </div>
          )}

          <div style={{ height: 20 }} />
        </>
      )}
    </div>
  );
}
