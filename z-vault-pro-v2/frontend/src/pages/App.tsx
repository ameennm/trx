import { useEffect, useMemo, useState } from 'react';
import { nanoid } from 'nanoid';
import { getConfig, getHistory, getVault, submitRelay } from '../lib/api';
import {
  getStoredWalletAddress,
  hasStoredWallet,
  removeStoredWallet,
  saveEncryptedWallet,
  unlockEncryptedWallet
} from '../lib/secureStorage';
import { deriveWalletFromPrivateKey, generateNewWallet, signRelayTransfer } from '../lib/wallet';
import { StatusPill } from '../components/StatusPill';

type RelayState = 'idle' | 'validating' | 'signing' | 'preflight' | 'broadcasting' | 'confirmed' | 'failed';
type View = 'home' | 'send' | 'history' | 'settings';

const TX_URLS: Record<string, string> = {
  nile: 'https://nile.tronscan.org/#/transaction/',
  mainnet: 'https://tronscan.org/#/transaction/'
};

function formatUsdt(balanceSun?: string | number) {
  const value = Number(balanceSun || 0) / 1_000_000;
  return value.toLocaleString(undefined, { maximumFractionDigits: 6 });
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
  const [status, setStatus] = useState<RelayState>('idle');
  const [message, setMessage] = useState('');
  const [config, setConfig] = useState<any>(null);
  const [view, setView] = useState<View>('home');

  const vaultAddress = vault?.vaultAddress || '';
  const feeUsdt = String(vault?.deployed ? (config?.platformFeeUsdt ?? 1.2) : (config?.firstSendFeeUsdt ?? 3));
  const storedAddress = useMemo(() => getStoredWalletAddress(), [passwordMode, walletAddress]);
  const txBaseUrl = config?.network ? TX_URLS[config.network] || TX_URLS.mainnet : TX_URLS.nile;
  const isUnlocked = Boolean(privateKey && walletAddress);

  useEffect(() => {
    getConfig().then(setConfig).catch(() => null);
  }, []);

  useEffect(() => {
    if (!walletAddress) {
      return;
    }

    refreshWalletState(walletAddress);
    const timer = setInterval(() => refreshWalletState(walletAddress), 10000);
    return () => clearInterval(timer);
  }, [walletAddress]);

  async function refreshWalletState(address = walletAddress) {
    if (!address) {
      return;
    }

    await Promise.all([
      getHistory(address).then((data) => setHistory(data.rows || [])).catch(() => setHistory([])),
      getVault(address).then((data) => {
        setVault(data);
        if (data?.nonce !== undefined) {
          setNonce(String(data.nonce));
        }
      }).catch(() => setVault(null))
    ]);
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
      setWalletAddress(wallet.address);
      setPassword('');
      setStatus('idle');
      setShowPrivateKey(false);
      setMessage('Wallet unlocked.');
      await refreshWalletState(wallet.address);
    } catch (error: any) {
      setStatus('failed');
      setMessage(String(error?.message || error));
    }
  }

  function lockWallet() {
    setPrivateKey('');
    setWalletAddress('');
    setVault(null);
    setHistory([]);
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
        throw new Error(result.error || 'Relay failed');
      }

      setStatus('confirmed');
      setMessage(`Confirmed tx: ${result.txHash}`);
      await refreshWalletState(walletAddress);
    } catch (error: any) {
      setStatus('failed');
      setMessage(String(error?.message || error));
      await refreshWalletState(walletAddress);
    }
  }

  const navItems: Array<{ id: View; label: string; icon: string }> = [
    { id: 'home', label: 'Home', icon: 'H' },
    { id: 'send', label: 'Send', icon: 'S' },
    { id: 'history', label: 'History', icon: 'R' },
    { id: 'settings', label: 'Settings', icon: 'SET' }
  ];

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <div className="brand">Z-Vault Pro</div>
          <div className="network">{config?.network || 'loading'} | {config?.energyProviderMode || 'mock'} energy</div>
        </div>
        <StatusPill label={isUnlocked ? 'unlocked' : 'locked'} />
      </header>

      <section className="hero">
        <div>
          <p className="eyebrow">Gasless Vault</p>
          <h1>{formatUsdt(vault?.balanceSun)} USDT</h1>
          <p className="muted">Vault balance</p>
        </div>
        <div className="hero-actions">
          <button className="icon-button" disabled={!vaultAddress} onClick={() => copyText(vaultAddress, 'Vault address')} title="Copy vault address">CP</button>
          <button className="icon-button" disabled={!walletAddress} onClick={() => refreshWalletState()} title="Refresh vault">RF</button>
        </div>
      </section>

      {!isUnlocked ? (
        <section className="panel auth-panel">
          <div>
            <h2>{passwordMode === 'unlock' ? 'Unlock Wallet' : 'Create Wallet'}</h2>
            <p className="muted">
              {passwordMode === 'unlock' && storedAddress
                ? `Saved controller: ${shortAddress(storedAddress)}`
                : 'Create a local controller and protect it with a password.'}
            </p>
          </div>
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
            {passwordMode === 'unlock' ? 'Unlock' : 'Create New Gasless Wallet'}
          </button>
          {hasStoredWallet() ? (
            <button className="text-button" onClick={() => setPasswordMode(passwordMode === 'unlock' ? 'create' : 'unlock')}>
              {passwordMode === 'unlock' ? 'Create a different wallet' : 'Unlock saved wallet'}
            </button>
          ) : null}
        </section>
      ) : null}

      {isUnlocked && view === 'home' ? (
        <div className="screen">
          <section className="grid two">
            <div className="panel">
              <div className="panel-head">
                <h2>Receive</h2>
                <StatusPill label={vault?.deployed ? 'deployed' : 'not deployed'} />
              </div>
              <p className="label">Your Gasless USDT address</p>
              <p className="code large">{vaultAddress || 'Loading vault address'}</p>
              <button className="button" disabled={!vaultAddress} onClick={() => copyText(vaultAddress, 'Vault address')}>Copy Vault Address</button>
            </div>

            <div className="panel">
              <div className="panel-head">
                <h2>Controller</h2>
                <button className="mini-button" onClick={lockWallet}>Lock</button>
              </div>
              <p className="label">Controller address</p>
              <p className="code">{walletAddress}</p>
              <p className="label">Private key backup</p>
              <p className="code">{showPrivateKey ? privateKey : maskPrivateKey(privateKey)}</p>
              <div className="button-row">
                <button className="mini-button" onClick={() => setShowPrivateKey((value) => !value)}>
                  {showPrivateKey ? 'Hide' : 'Reveal'}
                </button>
                <button className="mini-button" onClick={() => copyText(privateKey, 'Private key')}>Copy</button>
              </div>
            </div>
          </section>
        </div>
      ) : null}

      {isUnlocked && view === 'send' ? (
        <section className="panel">
          <div className="panel-head">
            <h2>Send USDT</h2>
            <StatusPill label={status} />
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
          <button className="button primary" disabled={!recipient || status === 'signing' || status === 'broadcasting'} onClick={sendGasless}>Send Gasless</button>
          {message ? <p className="muted">{message}</p> : null}
        </section>
      ) : null}

      {isUnlocked && view === 'history' ? (
        <section className="panel">
          <h2>History</h2>
          <div className="history-list">
            {history.map((row) => (
              <a
                key={row.id}
                className="history-item"
                href={row.tx_hash ? `${txBaseUrl}${row.tx_hash}` : undefined}
                target="_blank"
                rel="noreferrer"
              >
                <div>
                  <strong>{row.status}</strong>
                  <p className="muted">To {shortAddress(row.recipient)}</p>
                </div>
                <div className="code">{row.tx_hash ? shortAddress(row.tx_hash) : 'No hash'}</div>
              </a>
            ))}
            {!history.length ? <p className="muted">No relay history yet.</p> : null}
          </div>
        </section>
      ) : null}

      {isUnlocked && view === 'settings' ? (
        <section className="panel">
          <h2>Settings</h2>
          <div className="settings-grid">
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
            <button key={item.id} className={view === item.id ? 'active' : ''} onClick={() => setView(item.id)}>
              <span>{item.icon}</span>
              {item.label}
            </button>
          ))}
        </nav>
      ) : null}
    </main>
  );
}
