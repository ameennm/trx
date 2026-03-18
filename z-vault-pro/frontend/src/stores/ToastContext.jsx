import { createContext, useContext, useCallback, useRef } from 'react';

const ToastContext = createContext(null);

export function ToastProvider({ children }) {
  const containerRef = useRef(null);

  const toast = useCallback((type, message, duration = 4000) => {
    const container = containerRef.current;
    if (!container) return;

    const el = document.createElement('div');
    el.className = `toast ${type}`;
    const icons = { success: '✓', error: '✕', warning: '⚠', info: 'ℹ' };
    el.innerHTML = `<span>${icons[type] || ''}</span><span>${message}</span>`;
    container.appendChild(el);

    setTimeout(() => {
      el.classList.add('exiting');
      setTimeout(() => el.remove(), 300);
    }, duration);
  }, []);

  return (
    <ToastContext.Provider value={toast}>
      <div ref={containerRef} className="toast-container" />
      {children}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used within ToastProvider');
  return context;
}
