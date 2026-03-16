
const { TronWeb } = require('tronweb');
const pk = 'f28e5958114b3f42e93e71e63c113e77c3f666e1e8fb737399c1cdf0f62ebca2';
const tw = new TronWeb({ fullHost: 'https://nile.trongrid.io', privateKey: pk });

async function check() {
    const hash = '0x1234567890123456789012345678901234567890123456789012345678901234';
    const sig = await tw.trx.sign(hash, pk, false);
    console.log('Signature:', sig);
    console.log('Length:', sig.length);
}
check();
