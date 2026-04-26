/**
 * Z-Vault Pro — Wallet Reducer & State
 */

export const INITIAL_STATE = {
  address: null,
  privateKey: null,
  balances: { usdt: '0.00', trx: '0.00' },
  transactions: [],
  mode: 'onboard', 
  network: 'mainnet',
  autoLockMinutes: 5,
  loading: false,
  toast: null,
};

export function walletReducer(state, action) {
  switch (action.type) {
    case 'SET_MODE':
      return { ...state, mode: action.payload };
    case 'UNLOCK':
      return {
        ...state,
        address: action.payload.address,
        privateKey: action.payload.privateKey,
        mode: 'dashboard',
      };
    case 'LOCK':
      return { ...state, privateKey: null, mode: 'lock', balances: { usdt: '0.00', trx: '0.00' } };
    case 'SET_BALANCES':
      return { ...state, balances: action.payload };
    case 'SET_TRANSACTIONS':
      return { ...state, transactions: action.payload };
    case 'PREPEND_TRANSACTION':
      return { ...state, transactions: [action.payload, ...state.transactions] };
    case 'SET_NETWORK':
      return { ...state, network: action.payload, balances: { usdt: '0.00', trx: '0.00' } };
    case 'SET_LOADING':
      return { ...state, loading: action.payload };
    case 'SET_AUTO_LOCK':
      return { ...state, autoLockMinutes: action.payload };
    case 'TOAST':
      return { ...state, toast: action.payload };
    case 'CLEAR_TOAST':
      return { ...state, toast: null };
    default:
      return state;
  }
}
