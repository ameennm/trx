import React, { useEffect, useState } from 'react';
import './index.css';
import { WalletProvider } from './store/walletStore.jsx';
import { useWallet } from './store/useWallet';
import { hasWallet } from './crypto/cryptoService.js';
import { Toast } from './components/UI.jsx';

// Views
import { OnboardView, LockView, ImportView } from './views/AuthViews.jsx';
import { DashboardView } from './views/DashboardView.jsx';
import { SendView } from './views/SendView.jsx';
import { ReceiveView } from './views/ReceiveView.jsx';
import { HistoryView } from './views/HistoryView.jsx';
import { SettingsView } from './views/SettingsView.jsx';
import { AdminView } from './views/AdminView.jsx';

// Nav Icons
const NavIcons = {
  home:    () => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>,
  send:    () => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 2L11 13M22 2L15 22 11 13 2 9l20-7z"/></svg>,
  receive: () => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12l7 7 7-7"/></svg>,
  history: () => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>,
  settings:() => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>,
};

function AppInner() {
  const { state, dispatch } = useWallet();
  const [activeView, setActiveView] = useState('home'); // within dashboard
  const [activeViewParams, setActiveViewParams] = useState({});
  const [authMode, setAuthMode] = useState('check'); // 'check'|'onboard'|'import'
  const [initializing, setInitializing] = useState(true);

  // Helper for navigating with params
  const navigateTo = (view, params = {}) => {
    setActiveView(view);
    setActiveViewParams(params);
  };

  // On mount: check if a wallet exists in IndexedDB
  useEffect(() => {
    (async () => {
      const exists = await hasWallet();
      if (exists) {
        dispatch({ type: 'SET_MODE', payload: 'lock' });
      } else {
        dispatch({ type: 'SET_MODE', payload: 'onboard' });
      }
      setInitializing(false);
    })();
  }, []);

  if (initializing) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100dvh' }}>
        <div className="spinner" style={{ width: 40, height: 40, borderWidth: 3, color: 'var(--primary)' }} />
      </div>
    );
  }

  // Auth flows
  if (state.mode === 'onboard' && authMode !== 'import') {
    return (
      <div className="app-shell">
        <div className="bg-orb bg-orb-1" /><div className="bg-orb bg-orb-2" />
        <Toast />
        <OnboardView onSwitch={setAuthMode} />
      </div>
    );
  }

  if (state.mode === 'onboard' && authMode === 'import') {
    return (
      <div className="app-shell">
        <div className="bg-orb bg-orb-1" /><div className="bg-orb bg-orb-2" />
        <Toast />
        <ImportView onBack={() => setAuthMode('onboard')} />
      </div>
    );
  }

  if (state.mode === 'lock') {
    return (
      <div className="app-shell">
        <div className="bg-orb bg-orb-1" /><div className="bg-orb bg-orb-2" />
        <Toast />
        <LockView />
      </div>
    );
  }

  // Main dashboard shell
  const navItems = [
    { id: 'home', label: 'Home' },
    { id: 'send', label: 'Send' },
    { id: 'receive', label: 'Receive' },
    { id: 'history', label: 'History' },
    { id: 'settings', label: 'Settings' },
  ];

  function renderView() {
    switch (activeView) {
      case 'send':     return <SendView onBack={() => navigateTo('home')} params={activeViewParams} />;
      case 'receive':  return <ReceiveView onBack={() => navigateTo('home')} />;
      case 'history':  return <HistoryView onBack={() => navigateTo('home')} />;
      case 'settings': return <SettingsView onBack={() => navigateTo('home')} onAdmin={() => navigateTo('admin')} />;
      case 'admin':    return <AdminView onBack={() => navigateTo('settings')} />;
      default:         return <DashboardView onNavigate={navigateTo} />;
    }
  }


  return (
    <div className="app-shell">
      {/* Ambient orbs */}
      <div className="bg-orb bg-orb-1" />
      <div className="bg-orb bg-orb-2" />

      {/* Toast */}
      <Toast />

      {/* View content */}
      <div style={{ flex: 1, position: 'relative', zIndex: 1 }}>
        {renderView()}
      </div>

      {/* Bottom navigation */}
      <nav className="nav-bar">
        {navItems.map(({ id, label }) => {
          const Icon = NavIcons[id];
          return (
            <button
              key={id}
              className={`nav-item ${activeView === id ? 'active' : ''}`}
              onClick={() => setActiveView(id)}
            >
              <Icon />
              {label}
            </button>
          );
        })}
      </nav>
    </div>
  );
}

export default function App() {
  return (
    <WalletProvider>
      <AppInner />
    </WalletProvider>
  );
}
