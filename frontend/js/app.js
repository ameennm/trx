/**
 * Z-Vault — Main Application Controller
 * Wires together Wallet, Send, and UI modules.
 */

(function () {
    'use strict';

    // ─── DOM Elements ─────────────────────────────────────────
    const $privateKey = document.getElementById('input-private-key');
    const $recipient = document.getElementById('input-recipient');
    const $amount = document.getElementById('input-amount');

    // ─── Init ─────────────────────────────────────────────────
    document.addEventListener('DOMContentLoaded', () => {
        // Hide loading after a brief delay
        setTimeout(() => UI.setLoading(false), 800);

        // Init glow effects
        setTimeout(() => UI.initGlowEffect(), 1000);

        // ─── Connect Wallet ───────────────────────────────────
        document.getElementById('btn-connect').addEventListener('click', async () => {
            const key = $privateKey.value.trim();
            if (!key) {
                UI.toast('error', 'Please enter your private key');
                return;
            }

            UI.btnLoading('btn-connect', true);
            try {
                const result = await Wallet.connect(key);
                UI.toast('success', `Wallet connected: ${UI.truncateAddress(result.address)}`);

                // Update dashboard
                document.getElementById('display-address').textContent = UI.truncateAddress(result.address);
                document.getElementById('display-usdt').textContent = result.usdtBalance.toFixed(2);
                document.getElementById('display-trx').textContent = result.trxBalance.toFixed(2);

                // Switch to dashboard
                UI.switchView('dashboard');
                $privateKey.value = '';

                // Reinit glow for new cards
                setTimeout(() => UI.initGlowEffect(), 200);
            } catch (err) {
                UI.toast('error', err.message);
            } finally {
                UI.btnLoading('btn-connect', false);
            }
        });

        // ─── Toggle Key Visibility ────────────────────────────
        document.getElementById('btn-toggle-key').addEventListener('click', () => {
            $privateKey.type = $privateKey.type === 'password' ? 'text' : 'password';
        });

        // ─── Disconnect ───────────────────────────────────────
        document.getElementById('btn-disconnect').addEventListener('click', () => {
            Wallet.disconnect();
            Send.resetForm();
            UI.switchView('connect');
            UI.toast('info', 'Wallet disconnected');
        });

        // ─── Refresh Balances ─────────────────────────────────
        document.getElementById('btn-refresh').addEventListener('click', async () => {
            if (!Wallet.isConnected()) return;

            try {
                const btn = document.getElementById('btn-refresh');
                btn.style.animation = 'spin 0.6s linear';

                const balances = await Wallet.refreshBalances();
                document.getElementById('display-usdt').textContent = balances.usdtBalance.toFixed(2);
                document.getElementById('display-trx').textContent = balances.trxBalance.toFixed(2);

                UI.toast('success', 'Balances refreshed');
                setTimeout(() => btn.style.animation = '', 600);
            } catch (err) {
                UI.toast('error', 'Failed to refresh: ' + err.message);
            }
        });

        // ─── Copy Address ─────────────────────────────────────
        document.getElementById('btn-copy-address').addEventListener('click', () => {
            if (Wallet.address) {
                navigator.clipboard.writeText(Wallet.address);
                UI.toast('info', 'Address copied to clipboard');
            }
        });

        // ─── MAX Button ───────────────────────────────────────
        document.getElementById('btn-max').addEventListener('click', async () => {
            if (!Wallet.isConnected()) return;
            const balances = await Wallet.refreshBalances();
            // Leave some room for fees (estimate ~10 USDT for safety)
            const maxAmount = Math.max(0, balances.usdtBalance - 10);
            $amount.value = maxAmount.toFixed(2);
        });

        // ─── Get Quote ────────────────────────────────────────
        document.getElementById('btn-get-quote').addEventListener('click', async () => {
            const to = $recipient.value.trim();
            const amount = parseFloat($amount.value);

            if (!to) {
                UI.toast('error', 'Please enter a recipient address');
                return;
            }
            if (!amount || amount <= 0) {
                UI.toast('error', 'Please enter a valid amount');
                return;
            }

            // Basic TRON address validation
            if (!to.startsWith('T') || to.length !== 34) {
                UI.toast('error', 'Invalid TRON address format');
                return;
            }

            UI.btnLoading('btn-get-quote', true);
            try {
                const quote = await Send.getQuote(to, amount);
                Send.displayFeeBreakdown(quote);
                UI.toast('info', 'Fee quote received');
            } catch (err) {
                UI.toast('error', err.message);
            } finally {
                UI.btnLoading('btn-get-quote', false);
            }
        });

        // ─── Approve Contract ─────────────────────────────────
        document.getElementById('btn-approve').addEventListener('click', async () => {
            UI.btnLoading('btn-approve', true);
            try {
                const configRes = await fetch(`${Wallet.API_BASE}/api/config`);
                const cfg = await configRes.json();

                if (!cfg.gasStationContract) {
                    UI.toast('error', 'GasStation contract not deployed yet');
                    return;
                }

                const tx = await Wallet.approveContract(cfg.gasStationContract);
                UI.toast('success', 'Contract approved! You can now send USDT.');
                document.getElementById('approval-notice').style.display = 'none';
            } catch (err) {
                UI.toast('error', 'Approval failed: ' + err.message);
            } finally {
                UI.btnLoading('btn-approve', false);
            }
        });

        // ─── Sign & Send ──────────────────────────────────────
        document.getElementById('btn-send').addEventListener('click', async () => {
            // Clear previous results to avoid confusion
            document.getElementById('tx-result').style.display = 'none';
            
            UI.btnLoading('btn-send', true);
            try {
                const result = await Send.signAndSend();
                Send.showTxResult(result);

                UI.toast('success', 'Transaction submitted!');

                // Refresh balances after a delay
                setTimeout(async () => {
                    const balances = await Wallet.refreshBalances();
                    document.getElementById('display-usdt').textContent = balances.usdtBalance.toFixed(2);
                    document.getElementById('display-trx').textContent = balances.trxBalance.toFixed(2);
                }, 5000);
            } catch (err) {
                Send.showTxResult({ success: false, error: err.message });
                UI.toast('error', err.message);
            } finally {
                UI.btnLoading('btn-send', false);
            }
        });

        // ─── Enter Key Handlers ───────────────────────────────
        $privateKey.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') document.getElementById('btn-connect').click();
        });

        $amount.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') document.getElementById('btn-get-quote').click();
        });
    });
})();
