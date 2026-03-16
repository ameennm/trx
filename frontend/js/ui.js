/**
 * Z-Vault — UI Utilities
 * Toast notifications, loading states, DOM helpers.
 */

const UI = {
    /**
     * Show a toast notification.
     * @param {'success'|'error'|'warning'|'info'} type
     * @param {string} message
     * @param {number} duration — ms
     */
    toast(type, message, duration = 4000) {
        const container = document.getElementById('toast-container');
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;

        const icons = {
            success: '✓',
            error: '✕',
            warning: '⚠',
            info: 'ℹ',
        };

        toast.innerHTML = `<span>${icons[type] || ''}</span><span>${message}</span>`;
        container.appendChild(toast);

        setTimeout(() => {
            toast.classList.add('exiting');
            setTimeout(() => toast.remove(), 300);
        }, duration);
    },

    /**
     * Show/hide loading overlay.
     */
    setLoading(visible) {
        const overlay = document.getElementById('loading-overlay');
        if (visible) {
            overlay.classList.remove('hidden');
        } else {
            overlay.classList.add('hidden');
        }
    },

    /**
     * Show loading state on a button.
     */
    btnLoading(btnId, loading) {
        const btn = document.getElementById(btnId);
        if (!btn) return;
        const text = btn.querySelector('.btn-text');
        const loader = btn.querySelector('.btn-loader');
        if (loading) {
            btn.disabled = true;
            if (text) text.style.display = 'none';
            if (loader) loader.style.display = 'block';
        } else {
            btn.disabled = false;
            if (text) text.style.display = 'inline';
            if (loader) loader.style.display = 'none';
        }
    },

    /**
     * Switch between views.
     * @param {'connect'|'dashboard'} view
     */
    switchView(view) {
        document.getElementById('view-connect').style.display = view === 'connect' ? 'block' : 'none';
        document.getElementById('view-dashboard').style.display = view === 'dashboard' ? 'block' : 'none';

        if (view === 'connect') {
            document.getElementById('view-connect').classList.add('active');
            document.getElementById('view-dashboard').classList.remove('active');
        } else {
            document.getElementById('view-dashboard').classList.add('active');
            document.getElementById('view-connect').classList.remove('active');
        }

        // Show/hide disconnect button
        document.getElementById('btn-disconnect').style.display = view === 'dashboard' ? 'flex' : 'none';
    },

    /**
     * Truncate an address for display: TXyz...abcd
     */
    truncateAddress(address, startLen = 6, endLen = 4) {
        if (!address || address.length <= startLen + endLen) return address;
        return `${address.slice(0, startLen)}...${address.slice(-endLen)}`;
    },

    /**
     * Format a USDT amount with appropriate decimals.
     */
    formatUsdt(amount) {
        if (typeof amount === 'string') amount = parseFloat(amount);
        if (isNaN(amount)) return '0.00';
        return amount.toFixed(amount < 1 ? 6 : 2) + ' USDT';
    },

    /**
     * Format TRX amount.
     */
    formatTrx(amount) {
        if (typeof amount === 'string') amount = parseFloat(amount);
        if (isNaN(amount)) return '0.00';
        return amount.toFixed(2) + ' TRX';
    },

    /**
     * Track mouse position for card glow effect.
     */
    initGlowEffect() {
        document.querySelectorAll('.glass-card').forEach(card => {
            card.addEventListener('mousemove', (e) => {
                const rect = card.getBoundingClientRect();
                const x = ((e.clientX - rect.left) / rect.width) * 100;
                const y = ((e.clientY - rect.top) / rect.height) * 100;
                card.style.setProperty('--mouse-x', `${x}%`);
                card.style.setProperty('--mouse-y', `${y}%`);
            });
        });
    },
};
