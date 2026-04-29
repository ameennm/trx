import { useEffect, useMemo, useRef, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { nanoid } from 'nanoid';
import { getConfig, getDeposits, getHistory, getVault, submitRelay } from '../lib/api';
import {
  getStoredWalletAddress,
  hasStoredWallet,
  removeStoredWallet,
  saveEncryptedWallet,
  unlockEncryptedWallet
} from '../lib/secureStorage';
import { deriveWalletFromPrivateKey, generateNewWallet, signRelayTransfer } from '../lib/wallet';
import { StatusPill } from '../components/StatusPill';

type RelayState = 'idle' | 'validating' | 'signing' | 'preflight' | 'broadcasting' | 'broadcasted' | 'confirmed' | 'failed';
type View = 'home' | 'send' | 'receive' | 'history' | 'settings';
type HistoryFilter = 'all' | 'sent' | 'received';
type QuickContact = {
  address: string;
  label: string;
  subtitle: string;
};
const LANDING_SESSION_KEY = 'z-vault-pro-entered';
const VAULT_ADDRESS_CACHE_PREFIX = 'z-vault-pro-vault-address:';

const TX_URLS: Record<string, string> = {
  nile: 'https://nile.tronscan.org/#/transaction/',
  mainnet: 'https://tronscan.org/#/transaction/'
};

function toUsdt(balanceSun?: string | number) {
  return Number(balanceSun || 0) / 1_000_000;
}

function formatUsdt(balanceSun?: string | number) {
  const value = toUsdt(balanceSun);
  return value.toLocaleString(undefined, { maximumFractionDigits: 6 });
}

function formatUsd(value?: string | number) {
  const amount = toUsdt(value);
  return `$${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function shortAddress(value = '') {
  if (value.length <= 14) {
    return value;
  }
  return `${value.slice(0, 7)}...${value.slice(-6)}`;
}

function maskPrivateKey(value = '') {
  if (!value) {
    return 'Locked';
  }
  return `${value.slice(0, 6)}${'*'.repeat(42)}${value.slice(-6)}`;
}

function avatarInitials(value = '') {
  if (!value) return 'Z';
  return `${value.slice(0, 1)}${value.slice(-1)}`.toUpperCase();
}

function describeRelayError(error: any) {
  const message = String(error?.message || error?.error || error || 'Relay failed');
  const details = error?.details;
  const phase = details?.status ? `Phase: ${details.status}` : '';
  const txHash = details?.txHash ? `Tx: ${details.txHash}` : '';
  return [message, phase, txHash].filter(Boolean).join(' | ');
}

function statusLabel(status: string) {
  if (status === 'received') return 'Received';
  if (status === 'confirmed') return 'Sent';
  if (status === 'broadcasted') return 'Broadcasted';
  if (status === 'reverted') return 'Failed';
  if (status === 'preflight_failed') return 'Preflight failed';
  if (status === 'energy_rented') return 'Energy rented';
  return status.replaceAll('_', ' ');
}

function rowTone(status: string) {
  if (status === 'received') return 'received';
  if (status === 'confirmed') return 'success';
  if (status === 'broadcasted' || status === 'energy_rented') return 'pending';
  if (status.includes('failed') || status === 'reverted' || status === 'broadcast_rejected') return 'failed';
  return 'pending';
}

function formatDate(ts?: number) {
  if (!ts) return '';
  return new Date(ts).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function vaultAddressCacheKey(address: string) {
  return `${VAULT_ADDRESS_CACHE_PREFIX}${address}`;
}

function readCachedVaultAddress(address: string) {
  if (!address) return '';
  return localStorage.getItem(vaultAddressCacheKey(address)) || '';
}

function cacheVaultAddress(address: string, vaultAddress?: string) {
  if (!address || !vaultAddress) return;
  localStorage.setItem(vaultAddressCacheKey(address), vaultAddress);
}

export function App() {
  const [privateKey, setPrivateKey] = useState('');
  const [walletAddress, setWalletAddress] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordMode, setPasswordMode] = useState<'create' | 'unlock'>(() => (hasStoredWallet() ? 'unlock' : 'create'));
  const [showPrivateKey, setShowPrivateKey] = useState(false);
  const [recipient, setRecipient] = useState('');
  const [amountUsdt, setAmountUsdt] = useState('2');
  const [nonce, setNonce] = useState('0');
  const [vault, setVault] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [deposits, setDeposits] = useState<any[]>([]);
  const [historyFilter, setHistoryFilter] = useState<HistoryFilter>('all');
  const [status, setStatus] = useState<RelayState>('idle');
  const [message, setMessage] = useState('');
  const [config, setConfig] = useState<any>(null);
  const [view, setView] = useState<View>('home');
  const [enteredWallet, setEnteredWallet] = useState(() => hasStoredWallet() || sessionStorage.getItem(LANDING_SESSION_KEY) === '1');
  const [cachedVaultAddress, setCachedVaultAddress] = useState('');
  const activeWalletRef = useRef('');

  const vaultAddress = vault?.vaultAddress || cachedVaultAddress;
  const feeUsdt = String(vault?.deployed ? (config?.platformFeeUsdt ?? 1.2) : (config?.firstSendFeeUsdt ?? 3));
  const storedAddress = useMemo(() => getStoredWalletAddress(), [passwordMode, walletAddress]);
  const txBaseUrl = config?.network ? TX_URLS[config.network] || TX_URLS.mainnet : TX_URLS.nile;
  const isUnlocked = Boolean(privateKey && walletAddress);
  const balanceSun = Number(vault?.balanceSun || 0);
  const feeSun = Math.floor(Number(feeUsdt) * 1_000_000);
  const spendableSun = Math.max(balanceSun - feeSun, 0);
  const networkLabel = config?.network === 'mainnet' ? 'Mainnet' : 'Nile';
  const combinedHistory = [...deposits, ...history].sort((a, b) => Number(b.created_at || 0) - Number(a.created_at || 0));
  const recentHistory = combinedHistory.slice(0, 4);
  const filteredHistory = historyFilter === 'received' ? deposits : historyFilter === 'sent' ? history : combinedHistory;
  const quickContacts = useMemo<QuickContact[]>(() => {
    const seen = new Set<string>();
    return history
      .filter((row) => row.recipient && row.status === 'confirmed')
      .filter((row) => {
        if (seen.has(row.recipient)) return false;
        seen.add(row.recipient);
        return true;
      })
      .slice(0, 5)
      .map((row, index) => ({
        address: row.recipient,
        label: `Wallet ${index + 1}`,
        subtitle: shortAddress(row.recipient)
      }));
  }, [history]);

  useEffect(() => {
    getConfig().then(setConfig).catch(() => null);
  }, []);

  useEffect(() => {
    if (!walletAddress) {
      activeWalletRef.current = '';
      return;
    }

    activeWalletRef.current = walletAddress;
    setVault(null);
    setCachedVaultAddress(readCachedVaultAddress(walletAddress));
    refreshWalletState(walletAddress);
    const timer = setInterval(() => refreshWalletState(walletAddress), 10000);
    return () => clearInterval(timer);
  }, [walletAddress]);

  async function loadVaultAddress(address = walletAddress) {
    if (!address) {
      return '';
    }

    const cached = readCachedVaultAddress(address);
    if (cached && activeWalletRef.current === address) {
      setCachedVaultAddress(cached);
    }

    try {
      const data = await getVault(address);
      if (activeWalletRef.current !== address) {
        return data?.vaultAddress || cached;
      }

      setVault(data);
      if (data?.vaultAddress) {
        cacheVaultAddress(address, data.vaultAddress);
        setCachedVaultAddress(data.vaultAddress);
      }
      if (data?.nonce !== undefined) {
        setNonce(String(data.nonce));
      }
      return data?.vaultAddress || cached;
    } catch {
      return cached;
    }
  }

  async function refreshWalletState(address = walletAddress) {
    if (!address) {
      return;
    }

    await Promise.all([
      getHistory(address)
        .then((data) => {
          if (activeWalletRef.current === address) setHistory(data.rows || []);
        })
        .catch(() => {
          if (activeWalletRef.current === address) setHistory([]);
        }),
      getDeposits(address)
        .then((data) => {
          if (activeWalletRef.current === address) setDeposits(data.rows || []);
        })
        .catch(() => {
          if (activeWalletRef.current === address) setDeposits([]);
        }),
      loadVaultAddress(address)
    ]);
  }

  function openReceive() {
    setView('receive');
    void loadVaultAddress(walletAddress);
  }

  function openQuickSend(address: string) {
    setRecipient(address);
    setView('send');
  }

  async function createWallet() {
    try {
      if (password !== confirmPassword) {
        throw new Error('Passwords do not match');
      }

      const wallet = generateNewWallet();
      await saveEncryptedWallet({
        privateKey: wallet.privateKey,
        walletAddress: wallet.address,
        password
      });

      setPrivateKey(wallet.privateKey);
      activeWalletRef.current = wallet.address;
      setVault(null);
      setCachedVaultAddress(readCachedVaultAddress(wallet.address));
      setWalletAddress(wallet.address);
      setPassword('');
      setConfirmPassword('');
      setStatus('idle');
      setShowPrivateKey(false);
      setMessage('Wallet created and encrypted in this browser.');
      await refreshWalletState(wallet.address);
    } catch (error: any) {
      setStatus('failed');
      setMessage(String(error?.message || error));
    }
  }

  async function unlockWallet() {
    try {
      const unlockedKey = await unlockEncryptedWallet(password);
      const wallet = deriveWalletFromPrivateKey(unlockedKey);
      setPrivateKey(unlockedKey);
      activeWalletRef.current = wallet.address;
      setVault(null);
      setCachedVaultAddress(readCachedVaultAddress(wallet.address));
      setWalletAddress(wallet.address);
      setPassword('');
      setStatus('idle');
      setShowPrivateKey(false);
      setMessage('');
      await refreshWalletState(wallet.address);
    } catch (error: any) {
      setStatus('failed');
      setMessage(String(error?.message || error));
    }
  }

  function lockWallet() {
    setPrivateKey('');
    setWalletAddress('');
    activeWalletRef.current = '';
    setVault(null);
    setHistory([]);
    setDeposits([]);
    setCachedVaultAddress('');
    setShowPrivateKey(false);
    setStatus('idle');
    setMessage('Wallet locked.');
  }

  function clearWallet() {
    removeStoredWallet();
    lockWallet();
    setPasswordMode('create');
    setMessage('Encrypted wallet cache removed from this browser.');
  }

  async function copyText(value: string, label: string) {
    await navigator.clipboard.writeText(value);
    setMessage(`${label} copied.`);
  }

  async function sendGasless() {
    try {
      if (!config) {
        throw new Error('Backend config is still loading');
      }
      if (!privateKey) {
        throw new Error('Unlock the wallet first');
      }

      setStatus('validating');
      if (recipient === vaultAddress) {
        throw new Error('Recipient is your own Gasless Vault. Use another TRON address.');
      }

      const wallet = deriveWalletFromPrivateKey(privateKey);
      if (wallet.address !== walletAddress) {
        throw new Error('Displayed wallet and encrypted private key do not match');
      }

      const spendSun = Math.floor(Number(amountUsdt) * 1_000_000);
      const feeSun = Math.floor(Number(feeUsdt) * 1_000_000);
      const balanceSun = Number(vault?.balanceSun || 0);
      if (!Number.isFinite(spendSun) || spendSun <= 0) {
        throw new Error('Enter a valid amount');
      }
      if (balanceSun < spendSun + feeSun) {
        throw new Error(`Vault needs ${formatUsdt(spendSun + feeSun)} USDT including fee`);
      }

      setStatus('signing');
      const { message: typedMessage, signature } = await signRelayTransfer({
        privateKey,
        userAddress: walletAddress,
        recipient,
        amountUsdt,
        feeUsdt,
        nonce,
        usdtContract: config.usdtContract,
        relayerContract: config.relayerContract,
        chainId: config.chainId,
        rpcUrl: config.rpcUrl
      });

      setStatus('preflight');
      const payload = {
        idempotencyKey: nanoid(),
        correlationId: nanoid(),
        userAddress: walletAddress,
        recipient,
        amountUsdt,
        signature,
        message: typedMessage
      };

      setStatus('broadcasting');
      const result = await submitRelay(payload);
      if (!result.success) {
        throw new Error(describeRelayError(result));
      }

      if (result.status === 'confirmed') {
        setStatus('confirmed');
        setMessage(`Confirmed tx: ${result.txHash}`);
      } else if (result.status === 'broadcasted') {
        setStatus('broadcasted');
        setMessage(`Broadcasted tx: ${result.txHash}. Refresh history for confirmation.`);
      } else {
        setStatus('failed');
        setMessage(`Relay returned ${result.status || 'unknown status'}`);
      }
      await refreshWalletState(walletAddress);
    } catch (error: any) {
      setStatus('failed');
      setMessage(describeRelayError(error));
      await refreshWalletState(walletAddress);
    }
  }

  const navItems: Array<{ id: View; label: string; icon: string }> = [
    { id: 'home', label: 'Home', icon: 'home' },
    { id: 'send', label: 'Send', icon: 'send' },
    { id: 'receive', label: 'Receive', icon: 'receive' },
    { id: 'history', label: 'History', icon: 'history' },
    { id: 'settings', label: 'Settings', icon: 'settings' }
  ];

  function enterWallet() {
    sessionStorage.setItem(LANDING_SESSION_KEY, '1');
    setEnteredWallet(true);
  }

  if (!enteredWallet) {
    return <LandingPage onEnter={enterWallet} />;
  }

  return (
    <main className="app-shell">
      {!isUnlocked ? (
        <section className="panel auth-panel">
          <div className="login-brand-panel">
            <div className="login-mark">Z</div>
            <h1>Z-Vault Pro</h1>
            <p>{networkLabel} gasless USDT wallet</p>
          </div>
          {passwordMode === 'unlock' && storedAddress ? <p className="saved-controller">Saved wallet: {shortAddress(storedAddress)}</p> : null}
          <div className="field">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              className="input"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete={passwordMode === 'unlock' ? 'current-password' : 'new-password'}
            />
          </div>
          {passwordMode === 'create' ? (
            <div className="field">
              <label htmlFor="confirm-password">Confirm password</label>
              <input
                id="confirm-password"
                type="password"
                className="input"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                autoComplete="new-password"
              />
            </div>
          ) : null}
          <button className="button" onClick={passwordMode === 'unlock' ? unlockWallet : createWallet}>
            {passwordMode === 'unlock' ? 'Unlock' : 'Create Wallet'}
          </button>
          {hasStoredWallet() ? (
            <button className="text-button" onClick={() => setPasswordMode(passwordMode === 'unlock' ? 'create' : 'unlock')}>
              {passwordMode === 'unlock' ? 'Create a different wallet' : 'Unlock saved wallet'}
            </button>
          ) : null}
        </section>
      ) : null}

      {isUnlocked ? (
        <header className="wallet-header">
          <div>
            <h1>Wallet</h1>
            <p>{networkLabel}</p>
          </div>
          <div className="header-actions">
            <button className="round-button" title="Wallet information">i</button>
            <button className="round-button" title="Settings" onClick={() => setView('settings')}>...</button>
          </div>
        </header>
      ) : null}

      {isUnlocked && view === 'home' ? (
        <div className="screen">
          <section className="wallet-card">
            <div className="wallet-card-top">
              <span className="card-title"><span className="mini-logo">Z</span> Wallet Asset</span>
              <button className="general-wallet-button">Gasless Vault</button>
            </div>
            <h2>{formatUsd(vault?.balanceSun)}</h2>
            <strong>{formatUsdt(vault?.balanceSun)} USDT</strong>
            <p>{vaultAddress ? shortAddress(vaultAddress) : 'Loading vault address'}</p>
            <button className="copy-mini" disabled={!vaultAddress} onClick={() => copyText(vaultAddress, 'Vault address')}>Copy</button>
            <span className="watermark">Z</span>
          </section>

          <section className="wallet-actions">
            <button onClick={() => setView('send')}><span>UP</span>Send</button>
            <button onClick={openReceive}><span>IN</span>Receive</button>
          </section>

          <section className="quick-share-card">
            <div className="section-title">
              <div>
                <h2>Quick Share</h2>
                <p className="muted">Recent recipients</p>
              </div>
              <button className="text-inline" onClick={() => setView('send')}>New</button>
            </div>
            <div className="quick-share-row">
              {quickContacts.map((contact, index) => (
                <button key={contact.address} className="quick-contact" onClick={() => openQuickSend(contact.address)}>
                  <span className={`quick-avatar tone-${index % 5}`}>{avatarInitials(contact.address)}</span>
                  <strong>{contact.label}</strong>
                  <small>{contact.subtitle}</small>
                </button>
              ))}
              {!quickContacts.length ? (
                <button className="quick-contact empty" onClick={() => setView('send')}>
                  <span className="quick-avatar tone-empty">+</span>
                  <strong>Add</strong>
                  <small>First send</small>
                </button>
              ) : null}
            </div>
          </section>

          <section className="assets-section">
            <div className="tab-title">
              <h2>Assets</h2>
              <span />
            </div>
            <button className="asset-row" onClick={() => setView('history')}>
              <span className="usdt-badge">T</span>
              <span className="asset-name">
                <strong>USDT</strong>
                <small>$0.99993</small>
              </span>
              <span className="asset-amount">
                <strong>{formatUsdt(vault?.balanceSun)}</strong>
                <small>{formatUsd(vault?.balanceSun)}</small>
              </span>
            </button>
          </section>

          <section className="panel receive-panel">
            <div className="section-title">
              <h2>Receive USDT</h2>
              <StatusPill label={vault?.deployed ? 'deployed' : 'not deployed'} />
            </div>
            <div className="address-card">
              <span>Your gasless address</span>
              <strong>{vaultAddress || 'Loading vault address'}</strong>
              <button className="button" onClick={openReceive}>Open Receive</button>
            </div>
          </section>

          <section className="panel">
            <div className="section-title">
              <h2>Recent Activity</h2>
              <button className="text-inline" onClick={() => setView('history')}>View all</button>
            </div>
            <div className="history-list compact">
              {recentHistory.map((row) => (
                <TransactionRow key={row.id} row={row} txBaseUrl={txBaseUrl} />
              ))}
              {!recentHistory.length ? <p className="muted">No relay history yet.</p> : null}
            </div>
          </section>
        </div>
      ) : null}

      {isUnlocked && view === 'send' ? (
        <section className="panel send-panel">
          <div className="section-title">
            <div>
              <h2>Send USDT</h2>
              <p className="muted">Available {formatUsdt(vault?.balanceSun)} USDT</p>
            </div>
            <StatusPill label={status} />
          </div>
          <div className="quick-send-strip">
            <span>Quick Share</span>
            <div>
              {quickContacts.map((contact, index) => (
                <button key={contact.address} onClick={() => setRecipient(contact.address)} title={contact.address}>
                  <span className={`quick-avatar tone-${index % 5}`}>{avatarInitials(contact.address)}</span>
                </button>
              ))}
              {!quickContacts.length ? <small>No recent recipients yet</small> : null}
            </div>
          </div>
          <div className="grid two">
            <div className="field wide">
              <label htmlFor="recipient">Recipient</label>
              <input id="recipient" className="input" value={recipient} onChange={(event) => setRecipient(event.target.value)} placeholder="T..." />
            </div>
            <div className="field">
              <label htmlFor="amount">Amount</label>
              <input id="amount" inputMode="decimal" className="input" value={amountUsdt} onChange={(event) => setAmountUsdt(event.target.value)} />
            </div>
            <div className="readonly-box">
              <span>{vault?.deployed ? 'Platform fee' : 'Activation fee'}</span>
              <strong>{feeUsdt} USDT</strong>
            </div>
            <div className="readonly-box">
              <span>Nonce</span>
              <strong>{nonce}</strong>
            </div>
          </div>
          <div className="send-summary">
            <span>Total deducted</span>
            <strong>{Number(amountUsdt || 0) + Number(feeUsdt || 0)} USDT</strong>
          </div>
          <button className="button primary" disabled={!recipient || status === 'signing' || status === 'broadcasting'} onClick={sendGasless}>Send Gasless</button>
          {message ? <p className="muted">{message}</p> : null}
        </section>
      ) : null}

      {isUnlocked && view === 'receive' ? (
        <section className="receive-screen">
          <div className="receive-header">
            <button className="back-button icon-back" onClick={() => setView('home')} aria-label="Back">
              <BackIcon />
            </button>
            <h2>Receive</h2>
          </div>
          <p className="receive-network">Only TRON network assets are supported</p>
          <div className="qr-wrap">
            {vaultAddress ? (
              <QRCodeSVG
                value={vaultAddress}
                size={248}
                level="M"
                marginSize={1}
                bgColor="#ffffff"
                fgColor="#000000"
              />
            ) : (
              <div className="qr-placeholder">Loading</div>
            )}
          </div>
          <div className="receive-type">
            <span>GasFree</span>
            <strong>General</strong>
          </div>
          <div className="receive-address-card">
            <strong>{vaultAddress || 'Loading vault address'}</strong>
            <button disabled={!vaultAddress} onClick={() => copyText(vaultAddress, 'Vault address')}>Copy</button>
          </div>
          <p className="receive-note">
            You can transfer only TRON-based tokens, including TRC20 USDT, to this gasless vault address.
            Other network assets may get lost during transfer.
          </p>
        </section>
      ) : null}

      {isUnlocked && view === 'history' ? (
        <section className="asset-detail">
          <div className="asset-detail-header">
            <button className="back-button icon-back" onClick={() => setView('home')} aria-label="Back">
              <BackIcon />
            </button>
            <h2>USDT <span>TRC20</span></h2>
            <button className="round-button">i</button>
          </div>
          <div className="price-row">
            <span>Current Price</span>
            <strong>$0.99993</strong>
          </div>
          <div className="asset-balance-card">
            <span className="usdt-badge large">T</span>
            <h3>{formatUsdt(vault?.balanceSun)}</h3>
            <p>{formatUsd(vault?.balanceSun)}</p>
            <div>
              <span>Available<strong>{formatUsdt(spendableSun)}</strong></span>
              <span>Fee Reserve<strong>{formatUsdt(feeSun)}</strong></span>
            </div>
          </div>
          <div className="history-tabs">
            {(['all', 'sent', 'received'] as HistoryFilter[]).map((item) => (
              <button key={item} className={historyFilter === item ? 'active' : ''} onClick={() => setHistoryFilter(item)}>
                {item}
              </button>
            ))}
          </div>
          <div className="history-list asset-history">
            {filteredHistory.map((row) => (
              <TransactionRow key={row.id} row={row} txBaseUrl={txBaseUrl} />
            ))}
            {!filteredHistory.length ? (
              <div className="empty-state">
                <div className="empty-icon">doc</div>
                <p>No data</p>
              </div>
            ) : null}
          </div>
          <div className="asset-bottom-actions">
            <button onClick={() => setView('send')}>Send</button>
            <button onClick={openReceive}>Receive</button>
          </div>
        </section>
      ) : null}

      {isUnlocked && view === 'settings' ? (
        <section className="panel">
          <div className="section-title">
            <h2>Settings</h2>
            <StatusPill label={networkLabel} />
          </div>
          <div className="settings-grid">
            <div className="setting-row">
              <span>Wallet lock</span>
              <button className="mini-button" onClick={lockWallet}>Lock Now</button>
            </div>
            <div className="setting-row">
              <span>Private key</span>
              <button className="mini-button" onClick={() => setShowPrivateKey((value) => !value)}>{showPrivateKey ? 'Hide' : 'Reveal'}</button>
            </div>
            <div>
              <p className="label">Controller address</p>
              <p className="code">{walletAddress}</p>
            </div>
            <div>
              <p className="label">Private key backup</p>
              <p className="code">{showPrivateKey ? privateKey : maskPrivateKey(privateKey)}</p>
            </div>
            <div>
              <p className="label">Relayer contract</p>
              <p className="code">{config?.relayerContract || 'loading'}</p>
            </div>
            <div>
              <p className="label">Token contract</p>
              <p className="code">{config?.usdtContract || 'loading'}</p>
            </div>
            <div>
              <p className="label">Backend relayer</p>
              <p className="code">{config?.relayerAddress || 'loading'}</p>
            </div>
          </div>
          <button className="danger-button" onClick={clearWallet}>Remove Wallet From Browser</button>
        </section>
      ) : null}

      {message && view !== 'send' ? <p className="toast">{message}</p> : null}

      {isUnlocked ? (
        <nav className="bottom-nav" aria-label="Main navigation">
          {navItems.map((item) => (
            <button
              key={item.id}
              className={view === item.id ? 'active' : ''}
              onClick={() => (item.id === 'receive' ? openReceive() : setView(item.id))}
            >
              <NavIcon name={item.icon} />
              {item.label}
            </button>
          ))}
        </nav>
      ) : null}
    </main>
  );
}

function LandingPage({ onEnter }: { onEnter: () => void }) {
  return (
    <main className="landing-shell">
      <nav className="landing-nav">
        <div className="landing-brand">
          <span>Z</span>
          <strong>Z-Vault Pro</strong>
        </div>
        <button onClick={onEnter}>Launch Wallet</button>
      </nav>

      <section className="landing-hero">
        <div className="landing-copy">
          <p className="landing-eyebrow">Gasless USDT on TRON</p>
          <h1>Send USDT without holding TRX.</h1>
          <p>
            Z-Vault Pro gives every user a gasless smart vault. Receive TRC20 USDT,
            sign locally, and let the relayer handle TRON energy in the background.
          </p>
          <div className="landing-actions">
            <button onClick={onEnter}>Get Started</button>
            <a href="#how-it-works">How it works</a>
          </div>
        </div>

        <div className="landing-phone" aria-label="Wallet preview">
          <div className="preview-header">
            <span>Wallet</span>
            <small>Mainnet</small>
          </div>
          <div className="preview-card">
            <span>Wallet Asset</span>
            <h2>$0.00</h2>
            <p>0 USDT</p>
            <small>TQ...vault</small>
          </div>
          <div className="preview-actions">
            <span>Send</span>
            <span>Receive</span>
          </div>
          <div className="preview-asset">
            <span className="usdt-badge">T</span>
            <div>
              <strong>USDT</strong>
              <small>TRC20</small>
            </div>
            <strong>0</strong>
          </div>
        </div>
      </section>

      <section className="landing-grid" id="how-it-works">
        <article>
          <span>01</span>
          <h2>Create Wallet</h2>
          <p>Create an encrypted controller wallet in your browser. Your private key never goes to the backend.</p>
        </article>
        <article>
          <span>02</span>
          <h2>Receive USDT</h2>
          <p>Share your gasless vault address and receive TRC20 USDT directly into the vault.</p>
        </article>
        <article>
          <span>03</span>
          <h2>Send Gasless</h2>
          <p>Sign the transfer locally. The backend rents energy and broadcasts the transaction on TRON.</p>
        </article>
      </section>

      <section className="landing-band">
        <div>
          <h2>Built for a wallet-first experience</h2>
          <p>Clear balances, clean token history, password-protected storage, and detailed relay failure messages.</p>
        </div>
        <button onClick={onEnter}>Open Wallet</button>
      </section>
    </main>
  );
}

function NavIcon({ name }: { name: string }) {
  if (name === 'home') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 10.8 12 4l8 6.8V20a1 1 0 0 1-1 1h-5v-6h-4v6H5a1 1 0 0 1-1-1z" />
      </svg>
    );
  }
  if (name === 'send') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 12 20 4l-5.2 16-3.2-6.8z" />
        <path d="M11.6 13.2 20 4" />
      </svg>
    );
  }
  if (name === 'receive') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 4v12" />
        <path d="m7 11 5 5 5-5" />
        <path d="M5 20h14" />
      </svg>
    );
  }
  if (name === 'history') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 7v5l3 2" />
        <path d="M5.2 6.8A8 8 0 1 1 4 12" />
        <path d="M4 5v4h4" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4z" />
      <path d="M19.4 13.5c.1-.5.1-1 .1-1.5s0-1-.1-1.5l2-1.6-2-3.5-2.6 1a8 8 0 0 0-2.5-1.5L13.9 2h-3.8l-.4 2.9a8 8 0 0 0-2.5 1.5l-2.6-1-2 3.5 2 1.6c-.1.5-.1 1-.1 1.5s0 1 .1 1.5l-2 1.6 2 3.5 2.6-1a8 8 0 0 0 2.5 1.5l.4 2.9h3.8l.4-2.9a8 8 0 0 0 2.5-1.5l2.6 1 2-3.5-2-1.6z" />
    </svg>
  );
}

function BackIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M15 5 8 12l7 7" />
    </svg>
  );
}

function TransactionRow({ row, txBaseUrl }: { row: any; txBaseUrl: string }) {
  const href = row.tx_hash ? `${txBaseUrl}${row.tx_hash}` : undefined;
  const isReceived = row.type === 'received';
  const tone = isReceived ? 'received' : rowTone(row.status);
  const directionText = isReceived ? `From ${shortAddress(row.sender)}` : `To ${shortAddress(row.recipient)}`;
  return (
    <a className={`history-item ${tone}`} href={href} target="_blank" rel="noreferrer">
      <span className={`activity-icon ${isReceived ? 'credit' : 'debit'}`}>{isReceived ? '+' : tone === 'success' ? '-' : tone === 'failed' ? '!' : '..'}</span>
      <div>
        <strong>{isReceived ? 'Received' : statusLabel(row.status)}</strong>
        <p className="muted">{directionText} - {formatDate(row.created_at)}</p>
        {row.error_message ? <p className="muted error-text">{row.error_message}</p> : null}
      </div>
      <div className={`history-amount ${isReceived ? 'credit' : 'debit'}`}>
        <strong>{isReceived ? '+' : '-'}{formatUsdt(row.amount_sun)} USDT</strong>
        <small>{isReceived ? 'Deposit' : `Fee ${formatUsdt(row.fee_sun)} USDT`}</small>
      </div>
    </a>
  );
}
