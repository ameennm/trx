import { createContext, useContext, useReducer, useCallback } from 'react';

const WalletContext = createContext(null);

const initialState = {
  // Wallet state
  isCreated: false,
  isUnlocked: false,
  mnemonic: null,
  tron: { address: '', privateKey: '' },
  evm: { address: '', privateKey: '' },
  
  // Balance state
  usdtBalance: 0,
  trxBalance: 0,
  
  // Network
  network: 'tron-nile', // 'tron-nile' | 'evm-sepolia'
  
  // UI
  currentView: 'loading', // 'loading' | 'onboarding' | 'pin-lock' | 'dashboard'
};

function walletReducer(state, action) {
  switch (action.type) {
    case 'SET_VIEW':
      return { ...state, currentView: action.payload };
    case 'SET_WALLET':
      return {
        ...state,
        isCreated: true,
        mnemonic: action.payload.mnemonic || null,
        tron: action.payload.tron,
        evm: action.payload.evm,
      };
    case 'UNLOCK':
      return { ...state, isUnlocked: true, currentView: 'dashboard' };
    case 'LOCK':
      return {
        ...state,
        isUnlocked: false,
        currentView: 'pin-lock',
        tron: { ...state.tron, privateKey: '' },
        evm: { ...state.evm, privateKey: '' },
      };
    case 'SET_BALANCES':
      return {
        ...state,
        usdtBalance: action.payload.usdtBalance ?? state.usdtBalance,
        trxBalance: action.payload.trxBalance ?? state.trxBalance,
      };
    case 'SET_NETWORK':
      return { ...state, network: action.payload };
    case 'CLEAR':
      return { ...initialState, currentView: 'onboarding' };
    default:
      return state;
  }
}

export function WalletProvider({ children }) {
  const [state, dispatch] = useReducer(walletReducer, initialState);

  return (
    <WalletContext.Provider value={{ state, dispatch }}>
      {children}
    </WalletContext.Provider>
  );
}

export function useWallet() {
  const context = useContext(WalletContext);
  if (!context) throw new Error('useWallet must be used within WalletProvider');
  return context;
}
