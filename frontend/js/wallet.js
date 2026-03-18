/**
 * Z-Vault — Wallet Management
 * Non-custodial key import and TronWeb initialization.
 */

const Wallet = {
    /** @type {any} TronWeb instance */
    tronWeb: null,

    /** @type {string} User's base58 address */
    address: '',

    /** @type {string} Private key (in memory only) */
    _privateKey: '',

    /** Relayer API base URL */
    API_BASE: 'http://localhost:3000',

    /**
     * Connect wallet using a private key.
     * @param {string} privateKey
     * @returns {Promise<{address: string, usdtBalance: number, trxBalance: number}>}
     */
    async connect(privateKey) {
        // Validate key format (should be 64 hex characters)
        const cleanKey = privateKey.trim().replace(/^0x/, '');
        if (!/^[0-9a-fA-F]{64}$/.test(cleanKey)) {
            throw new Error('Invalid private key format. Must be 64 hexadecimal characters.');
        }

        // Initialize TronWeb with user's key (for signing only)
        try {
            // In TronWeb v6+, when loaded via script tag, the constructor is often at TronWeb.TronWeb
            const TronWebConstructor = window.TronWeb?.TronWeb || window.TronWeb;
            
            if (typeof TronWebConstructor !== 'function') {
                console.error('TronWeb library not found or incorrectly loaded.', { 
                    windowTronWeb: window.TronWeb,
                    type: typeof window.TronWeb 
                });
                throw new Error('TronWeb library is not ready. Please refresh the page.');
            }

            this.tronWeb = new TronWebConstructor({
                fullHost: 'https://nile.trongrid.io',
                privateKey: cleanKey,
            });
            console.log('TronWeb initialized successfully for address:', this.tronWeb.defaultAddress.base58);
        } catch (e) {
            console.error('Failed to initialize TronWeb:', e);
            throw new Error('Wallet initialization failed: ' + e.message);
        }

        this.address = this.tronWeb.defaultAddress.base58;
        this._privateKey = cleanKey;

        // Fetch balances
        const balances = await this.refreshBalances();

        return {
            address: this.address,
            ...balances,
        };
    },

    /**
     * Refresh USDT and TRX balances.
     */
    async refreshBalances() {
        let usdtBalance = 0;
        let trxBalance = 0;

        console.log('Refreshing balances for:', this.address);

        try {
            // TRX balance
            const trxSun = await this.tronWeb.trx.getBalance(this.address);
            trxBalance = trxSun / 1_000_000;
            console.log('TRX Balance fetched:', trxBalance);
        } catch (e) {
            console.warn('Could not fetch TRX balance:', e.message);
            console.error('TRX balance error details:', e);
        }

        try {
            // USDT balance from relayer API
            console.log('Fetching USDT balance from relayer API...');
            const res = await fetch(`${this.API_BASE}/api/balance/${this.address}`);
            if (res.ok) {
                const data = await res.json();
                usdtBalance = data.balance || 0;
                console.log('USDT Balance (API):', usdtBalance);
            } else {
                console.warn('Relayer API returned error status for balance:', res.status);
                throw new Error('API failed');
            }
        } catch (e) {
            console.warn('Could not fetch USDT balance from API:', e.message);
            // Fallback: try direct contract call
            try {
                console.log('Trying fallback direct contract call for USDT balance...');
                const configRes = await fetch(`${this.API_BASE}/api/config`);
                if (configRes.ok) {
                    const cfg = await configRes.json();
                    const contract = await this.tronWeb.contract().at(cfg.usdtContract);
                    const bal = await contract.balanceOf(this.address).call();
                    usdtBalance = Number(bal) / 1_000_000;
                    console.log('USDT Balance (Contract Fallback):', usdtBalance);
                }
            } catch (e2) {
                console.warn('Direct USDT balance fetch also failed:', e2.message);
                console.error('Fallback balance error details:', e2);
            }
        }

        return { usdtBalance, trxBalance };
    },

    /**
     * Sign a message hash with the user's private key.
     * Uses RAW ECDSA signing (no prefix) to match the contract's ecrecover.
     * @param {string} messageHash - hex string (0x-prefixed)
     */
    async signHash(messageHash) {
        if (!messageHash || messageHash.trim() === "") {
            throw new Error('Internal Error: No transaction hash was generated. Please get a quote again.');
        }
        const cleanHash = messageHash.trim();
        console.log('Signing message hash (RAW ECDSA):', cleanHash);
        
        try {
            // Ensure 0x prefix for ethers
            const hash = cleanHash.startsWith('0x') ? cleanHash : '0x' + cleanHash;

            // Use ethers.js for raw ECDSA signing (no message prefix)
            // This produces a signature that matches Solidity's ecrecover exactly
            const wallet = new ethers.Wallet(this._privateKey);
            const sig = wallet._signingKey().signDigest(hash);
            
            let v = sig.v;
            if (v < 27) v += 27;

            console.log(`Signature (RAW ECDSA): v=${v}, r=${sig.r.slice(0,10)}..., s=${sig.s.slice(0,10)}...`);
            return { v, r: sig.r, s: sig.s };
        } catch (e) {
            console.error('Signing failed:', e);
            throw new Error('Failed to sign transaction: ' + e.message);
        }
    },

    /**
     * Approve the GasStation contract to spend USDT.
     * @param {string} gasStationAddress
     */
    async approveContract(gasStationAddress) {
        if (!gasStationAddress) throw new Error('GasStation address is required');
        const cleanAddress = gasStationAddress.trim();
        const MAX_UINT = '115792089237316195423570985008687907853269984665640564039457584007913129639935';

        console.log('Approving GasStation contract:', cleanAddress);

        try {
            // Get USDT contract
            const configRes = await fetch(`${this.API_BASE}/api/config`);
            const cfg = await configRes.json();
            
            console.log('Using USDT contract:', cfg.usdtContract);

            const usdtContract = await this.tronWeb.contract().at(cfg.usdtContract.trim());

            // Call approve
            console.log('Sending approval transaction...');
            const tx = await usdtContract.approve(cleanAddress, MAX_UINT).send({
                feeLimit: 100_000_000,
            });
            
            console.log('Approval transaction hash:', tx);
            return tx;
        } catch (e) {
            console.error('Contract approval failed:', e);
            throw new Error('Approval failed: ' + e.message);
        }
    },

    /**
     * Disconnect wallet (clear state).
     */
    disconnect() {
        this.tronWeb = null;
        this.address = '';
        this._privateKey = '';
    },

    /**
     * Check if wallet is connected.
     */
    isConnected() {
        return !!this.address;
    },
};
