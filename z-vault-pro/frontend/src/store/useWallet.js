import { useContext, createContext } from 'react';

export const WalletContext = createContext(null);

export function useWallet() {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error('useWallet must be used inside WalletProvider');
  return ctx;
}
