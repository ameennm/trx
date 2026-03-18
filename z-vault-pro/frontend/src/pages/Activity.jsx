import { useState, useEffect } from 'react';
import { useWallet } from '../stores/WalletContext';

export default function Activity() {
  const { state, dispatch } = useWallet();
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);

  const address = state.network === 'tron-nile' ? state.tron.address : state.evm.address;

  useEffect(() => {
    // Fetch recent TRC-20 transfers from Nile TronGrid API
    const fetchTx = async () => {
      setLoading(true);
      if (!address || !address.startsWith('T')) {
        setLoading(false);
        return;
      }
      try {
        const res = await fetch(
          `https://nile.trongrid.io/v1/accounts/${address}/transactions/trc20?limit=20&contract_address=TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf`
        );
        const data = await res.json();
        if (data.data) {
          setTransactions(data.data.map(tx => ({
            id: tx.transaction_id,
            from: tx.from,
            to: tx.to,
            amount: (parseInt(tx.value) / 1e6).toFixed(2),
            symbol: tx.token_info?.symbol || 'USDT',
            timestamp: tx.block_timestamp,
            type: tx.from?.toLowerCase() === address.toLowerCase() ? 'sent' : 'received',
          })));
        }
      } catch (err) {
        console.warn('Failed to fetch transactions:', err);
      }
      setLoading(false);
    };
    fetchTx();
  }, [address]);

  const truncate = (addr) => addr ? `${addr.slice(0, 6)}···${addr.slice(-4)}` : '—';

  const timeAgo = (ts) => {
    const diff = Date.now() - ts;
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return `${days}d ago`;
  };

  return (
    <div className="app-shell">
      {/* Header */}
      <div className="topbar">
        <button onClick={() => dispatch({ type: 'SET_VIEW', payload: 'dashboard' })} className="icon-btn">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
        </button>
        <span className="topbar-title">Activity</span>
        <div className="w-10" />
      </div>

      <div className="px-5 flex-1">
        {loading ? (
          <div className="flex items-center justify-center pt-20">
            <div className="spinner-inline" style={{ width: 28, height: 28 }} />
          </div>
        ) : transactions.length === 0 ? (
          <div className="flex flex-col items-center justify-center pt-20 text-center">
            <div className="w-16 h-16 rounded-full bg-surface-1 flex items-center justify-center mb-4">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-text-tertiary">
                <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
              </svg>
            </div>
            <h3 className="font-bold text-[15px] mb-1">No Transactions Yet</h3>
            <p className="text-text-tertiary text-[13px]">Your USDT transfer history will appear here.</p>
          </div>
        ) : (
          <div className="space-y-1 pt-2">
            {transactions.map((tx) => (
              <a
                key={tx.id}
                href={`https://nile.tronscan.org/#/transaction/${tx.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="token-row flex items-center gap-4 no-underline text-inherit"
              >
                {/* Icon */}
                <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
                  tx.type === 'sent' ? 'bg-[rgba(245,54,92,0.1)]' : 'bg-[rgba(45,206,137,0.1)]'
                }`}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className={tx.type === 'sent' ? 'text-negative' : 'text-positive'}>
                    {tx.type === 'sent'
                      ? <><line x1="7" y1="17" x2="17" y2="7"/><polyline points="7 7 17 7 17 17"/></>
                      : <><line x1="17" y1="7" x2="7" y2="17"/><polyline points="17 17 7 17 7 7"/></>
                    }
                  </svg>
                </div>
                
                {/* Details */}
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-[14px]">{tx.type === 'sent' ? 'Sent' : 'Received'}</div>
                  <div className="text-[12px] text-text-tertiary">
                    {tx.type === 'sent' ? `To ${truncate(tx.to)}` : `From ${truncate(tx.from)}`}
                  </div>
                </div>
                
                {/* Amount + Time */}
                <div className="text-right flex-shrink-0">
                  <div className={`font-bold text-[14px] ${tx.type === 'sent' ? 'text-negative' : 'text-positive'}`}>
                    {tx.type === 'sent' ? '-' : '+'}{tx.amount} USDT
                  </div>
                  <div className="text-[11px] text-text-tertiary">{timeAgo(tx.timestamp)}</div>
                </div>
              </a>
            ))}
          </div>
        )}
      </div>

      {/* Tab Bar */}
      <div className="tab-bar">
        <button className="tab-item" onClick={() => dispatch({ type: 'SET_VIEW', payload: 'dashboard' })}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
          <span>Wallet</span>
        </button>
        <button className="tab-item active">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
          <span>Activity</span>
        </button>
        <button className="tab-item" onClick={() => dispatch({ type: 'SET_VIEW', payload: 'settings' })}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.6 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.6a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9c.26.46.42.98.51 1.51"/></svg>
          <span>Settings</span>
        </button>
      </div>
    </div>
  );
}
