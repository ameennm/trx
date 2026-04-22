/**
 * Z-Vault Pro — Global Wallet State Store
 * React Context + useReducer pattern.
 */

import React, { useReducer, useEffect, useRef, useCallback } from 'react';
import { WalletContext } from './useWallet';
import { INITIAL_STATE, walletReducer } from './reducer';

export function WalletProvider({ children }) {
  const [state, dispatch] = useReducer(walletReducer, INITIAL_STATE);
  const lockTimerRef = useRef(null);

  /** Reset the auto-lock countdown on any user interaction */
  const resetAutoLock = useCallback(() => {
    if (lockTimerRef.current) clearTimeout(lockTimerRef.current);
    if (state.mode === 'dashboard' && state.autoLockMinutes > 0) {
      lockTimerRef.current = setTimeout(() => {
        dispatch({ type: 'LOCK' });
        dispatch({ type: 'TOAST', payload: { type: 'info', msg: 'Vault auto-locked after inactivity.' } });
      }, state.autoLockMinutes * 60 * 1000);
    }
  }, [state.mode, state.autoLockMinutes, dispatch]);

  // Set up auto-lock listener when in dashboard mode
  useEffect(() => {
    if (state.mode === 'dashboard') {
      const events = ['mousedown', 'keydown', 'touchstart'];
      events.forEach((e) => window.addEventListener(e, resetAutoLock));
      resetAutoLock(); // Start timer immediately
      return () => {
        events.forEach((e) => window.removeEventListener(e, resetAutoLock));
        if (lockTimerRef.current) clearTimeout(lockTimerRef.current);
      };
    }
  }, [state.mode, resetAutoLock]);

  // Auto-dismiss toast after 4 seconds
  useEffect(() => {
    if (state.toast) {
      const t = setTimeout(() => dispatch({ type: 'CLEAR_TOAST' }), 4000);
      return () => clearTimeout(t);
    }
  }, [state.toast, dispatch]);

  const toast = useCallback((type, msg) => 
    dispatch({ type: 'TOAST', payload: { type, msg } }), 
  [dispatch]);

  const value = React.useMemo(() => ({ state, dispatch, toast }), [state, dispatch, toast]);

  return (
    <WalletContext.Provider value={value}>
      {children}
    </WalletContext.Provider>
  );
}
