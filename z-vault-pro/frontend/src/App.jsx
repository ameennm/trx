import { useEffect } from 'react';
import { WalletProvider, useWallet } from './stores/WalletContext';
import { ToastProvider } from './stores/ToastContext';
import { hasStoredWallet } from './services/cryptoService';
import Welcome from './pages/Welcome';
import SeedPhrase from './pages/SeedPhrase';
import PinSetup from './pages/PinSetup';
import Dashboard from './pages/Dashboard';
import SendPage from './pages/SendPage';
import Activity from './pages/Activity';
import Settings from './pages/Settings';

function AppRouter() {
  const { state, dispatch } = useWallet();

  useEffect(() => {
    // Check if wallet exists in IndexedDB on startup
    (async () => {
      const hasWallet = await hasStoredWallet();
      if (hasWallet) {
        dispatch({ type: 'SET_VIEW', payload: 'pin-lock' });
      } else {
        dispatch({ type: 'SET_VIEW', payload: 'onboarding' });
      }
    })();
  }, [dispatch]);

  // Loading screen
  if (state.currentView === 'loading') {
    return (
      <div className="loading-screen">
        <div className="loading-ring" />
        <div className="loading-brand">CRYPXE</div>
      </div>
    );
  }

  // Route by current view
  switch (state.currentView) {
    case 'onboarding':
      return <Welcome />;
    case 'seed-phrase':
      return <SeedPhrase />;
    case 'pin-setup':
      return <PinSetup mode="setup" />;
    case 'pin-lock':
      return <PinSetup mode="unlock" />;
    case 'dashboard':
      return <Dashboard />;
    case 'send':
      return <SendPage />;
    case 'activity':
      return <Activity />;
    case 'settings':
      return <Settings />;
    default:
      return <Welcome />;
  }
}

export default function App() {
  return (
    <WalletProvider>
      <ToastProvider>
        <AppRouter />
      </ToastProvider>
    </WalletProvider>
  );
}
