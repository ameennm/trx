
const { TronWeb } = require('tronweb');
const tw = new TronWeb({ fullHost: 'https://nile.trongrid.io' });

const addr = 'TXfbhF5SGRbyMhMa5cVAUUfYM6wZMYYWUS4';
try {
    const hex = tw.address.toHex(addr);
    console.log('Original:', addr);
    console.log('Hex:', hex);
    console.log('EVM Hex:', '0x' + hex.slice(2));
} catch (e) {
    console.log('Error:', e.message);
}
