import React, { useEffect, useState } from 'react';
import { useWallet } from '../store/useWallet';
import { NETWORKS } from '../store/constants';
import { getOnChainHistory } from '../wallet/walletService.js';
import { TransactionItem, BackButton } from '../components/UI.jsx';

export function HistoryView({ onBack }) {
  const { state } = useWallet();
  const [txs, setTxs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all'); // 'all' | 'gasfree' | 'chain'

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        // Merge store (GasFree relay txs) with on-chain history
        const chainTxs = await getOnChainHistory(state.address, state.network);

        // Also try to fetch from backend D1
        const backendRes = await fetch(`${NETWORKS[state.network].apiBackend}/api/history/${state.address}`);
        const backendData = backendRes.ok ? await backendRes.json() : { data: [] };
        const backendTxs = (backendData.data || []).map(tx => ({
          ...tx,
          type: 'send',
          source: 'gasfree',
        }));

        // Deduplicate: prefer GasFree records over chain records by tx_hash
        const gfHashes = new Set(backendTxs.map(t => t.tx_hash || ''));
        const filteredChain = chainTxs.filter(t => !gfHashes.has(t.id));

        const merged = [...backendTxs, ...filteredChain].sort((a, b) => (b.created_at || b.timestamp || 0) - (a.created_at || a.timestamp || 0));
        setTxs(merged);
      } catch {
        setTxs(state.transactions || []);
      } finally {
        setLoading(false);
      }
    }
    if (state.address) load();
  }, [state.address, state.network]);

  const filtered = filter === 'all' ? txs
    : filter === 'gasfree' ? txs.filter(t => t.source === 'gasfree')
    : txs.filter(t => t.source === 'chain');

  const FilterBtn = ({ id, label }) => (
    <button
      className={`btn btn-sm ${filter === id ? 'btn-primary' : 'btn-ghost'}`}
      style={{ flex: 1, fontSize: 12 }}
      onClick={() => setFilter(id)}
    >
      {label}
    </button>
  );

  return (
    <div className="page z-1 flex-col gap-5">
      <div className="flex items-center gap-3">
        <BackButton onClick={onBack} />
        <h2>Transaction History</h2>
      </div>

      {/* Filter tabs */}
      <div className="glass-card flex gap-2 p-2">
        <FilterBtn id="all" label="All" />
        <FilterBtn id="gasfree" label="⚡ GasFree" />
        <FilterBtn id="chain" label="On-chain" />
      </div>

      {loading ? (
        <div className="text-center" style={{ padding: 40 }}>
          <div className="spinner" style={{ width: 32, height: 32, borderWidth: 3, color: 'var(--primary)', margin: '0 auto' }} />
          <p className="text-muted text-sm" style={{ marginTop: 12 }}>Loading history...</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center glass-card p-6 flex-col gap-3" style={{ display: 'flex', alignItems: 'center' }}>
          <span style={{ fontSize: 40 }}>📭</span>
          <p style={{ fontWeight: 700 }}>No transactions yet</p>
          <p className="text-muted text-sm">Your GasFree transfers will appear here</p>
        </div>
      ) : (
        <div className="flex-col gap-2 animate-in">
          {filtered.map((tx, i) => (
            <TransactionItem key={tx.id || tx.tx_hash || i} tx={{ ...tx, user_address: state.address }} />
          ))}
        </div>
      )}
    </div>
  );
}
