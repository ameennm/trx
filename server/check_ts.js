
const { TronWeb } = require('tronweb');
const tronWeb = new TronWeb({ fullHost: 'https://nile.trongrid.io' });

async function check() {
    const block = await tronWeb.trx.getCurrentBlock();
    const timestamp = block.block_header.raw_data.timestamp;
    console.log('Current Block Timestamp (ms):', timestamp);
    console.log('Current Date:', new Date(timestamp).toISOString());
}
check();
