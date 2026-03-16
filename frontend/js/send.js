/**
 * Z-Vault — Send USDT Logic
 * Fee quoting, signing, and relaying transactions.
 */

const Send = {
    /** Cached quote from the relayer */
    _currentQuote: null,

    /**
     * Request a fee quote from the relayer.
     * @param {string} toAddress
     * @param {number} amount
     */
    async getQuote(toAddress, amount) {
        const res = await fetch(`${Wallet.API_BASE}/api/quote`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                from: Wallet.address,
                to: toAddress,
                amount: amount,
            }),
        });

        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.error || 'Failed to get quote');
        }

        const data = await res.json();
        if (!data.success) {
            throw new Error(data.error || 'Quote request failed');
        }

        this._currentQuote = data.quote;
        return data.quote;
    },

    /**
     * Display the fee breakdown in the UI.
     * @param {object} quote
     */
    displayFeeBreakdown(quote) {
        const fee = quote.fee;

        // Account type badge
        const badge = document.getElementById('fee-account-type');
        if (fee.recipientIsActive) {
            badge.textContent = 'Active Account';
            badge.className = 'fee-badge active';
        } else {
            badge.textContent = 'New Account';
            badge.className = 'fee-badge new-account';
        }

        // Fee values
        document.getElementById('fee-send-amount').textContent = UI.formatUsdt(fee.sendAmount);
        document.getElementById('fee-trx-amount').textContent = fee.networkFeeTRX.toFixed(1);
        document.getElementById('fee-network-usdt').textContent = UI.formatUsdt(fee.networkFeeUSDT);
        document.getElementById('fee-markup-usdt').textContent = UI.formatUsdt(fee.markupUSDT);
        document.getElementById('fee-total').textContent = UI.formatUsdt(fee.totalFeeUSDT);
        document.getElementById('fee-deduction').textContent = UI.formatUsdt(fee.totalDeduction);

        // Show the breakdown
        document.getElementById('fee-breakdown').style.display = 'block';

        // Check allowance
        if (!quote.allowanceSufficient && quote.gasStationContract) {
            document.getElementById('approval-notice').style.display = 'flex';
        } else {
            document.getElementById('approval-notice').style.display = 'none';
        }

        // Check balance
        if (!quote.balanceSufficient) {
            UI.toast('warning', `Insufficient USDT balance. Need ${UI.formatUsdt(fee.totalDeduction)}, have ${UI.formatUsdt(quote.userBalance)}`);
        }
    },

    /**
     * Sign and relay the transaction.
     */
    async signAndSend() {
        if (!this._currentQuote) {
            throw new Error('No active quote. Get a quote first.');
        }

        const quote = this._currentQuote;

        // Sign the typed data hash
        const { v, r, s } = await Wallet.signHash(quote.typedDataHash);

        // Send to relayer
        const res = await fetch(`${Wallet.API_BASE}/api/relay`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                from: Wallet.address,
                to: document.getElementById('input-recipient').value.trim(),
                sendAmount: quote.fee.sendAmount.toString(),
                feeAmount: quote.fee.totalFeeUSDT.toString(),
                deadline: quote.deadline.toString(),
                v: v.toString(),
                r: r,
                s: s,
            }),
        });

        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.error || 'Relay failed');
        }

        const data = await res.json();
        if (!data.success) {
            throw new Error(data.error || 'Transaction failed');
        }

        return data;
    },

    /**
     * Show transaction result in the UI.
     */
    showTxResult(result) {
        const txResult = document.getElementById('tx-result');
        const statusIcon = document.getElementById('tx-status-icon');
        const statusText = document.getElementById('tx-status-text');
        const hashDisplay = document.getElementById('tx-hash-display');
        const explorerLink = document.getElementById('tx-explorer-link');

        if (result.success) {
            statusIcon.className = 'tx-status-icon success';
            statusIcon.innerHTML = '<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>';
            statusText.textContent = 'Transaction Submitted!';
            hashDisplay.textContent = result.txHash;
            explorerLink.href = result.explorerUrl || `https://nile.tronscan.org/#/transaction/${result.txHash}`;
            explorerLink.style.display = 'inline';
        } else {
            statusIcon.className = 'tx-status-icon error';
            statusIcon.innerHTML = '<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
            statusText.textContent = 'Transaction Failed';
            hashDisplay.textContent = result.error || 'Unknown error';
            explorerLink.style.display = 'none';
        }

        txResult.style.display = 'block';

        // Clear the quote
        this._currentQuote = null;
    },

    /**
     * Reset the send form.
     */
    resetForm() {
        document.getElementById('input-recipient').value = '';
        document.getElementById('input-amount').value = '';
        document.getElementById('fee-breakdown').style.display = 'none';
        document.getElementById('tx-result').style.display = 'none';
        this._currentQuote = null;
    },
};
