
const { TronWeb } = require('tronweb');
const privateKey = 'f28e5958114b3f42e93e71e63c113e77c3f666e1e8fb737399c1cdf0f62ebca2';
const tronWeb = new TronWeb({
    fullHost: 'https://nile.trongrid.io',
    privateKey: privateKey
});

async function check() {
    const address = tronWeb.defaultAddress.base58;
    console.log('Address:', address);
    const balance = await tronWeb.trx.getBalance(address);
    console.log('Balance (sun):', balance);
    console.log('Balance (TRX):', balance / 1_000_000);
}

check().catch(console.error);
