
const { TronWeb } = require('tronweb');
const txId = 'efeb90d20a8ca3c84da08049256aafd26f8ee44c3fe7e317c1f9c2cde70ba09c';
const tronWeb = new TronWeb({
    fullHost: 'https://nile.trongrid.io'
});

async function check() {
    console.log('Checking Transaction:', txId);
    try {
        const tx = await tronWeb.trx.getTransaction(txId);
        console.log('Transaction Result:', JSON.stringify(tx, null, 2));
        
        const info = await tronWeb.trx.getTransactionInfo(txId);
        console.log('Transaction Info (Receipt):', JSON.stringify(info, null, 2));
        
        if (info.receipt && info.receipt.result === 'SUCCESS') {
           console.log('\n✅ SUCCESS! The gasless transfer was successfully executed on the blockchain.');
        } else if (info.resMessage) {
           console.log('\n❌ FAILED:', info.resMessage);
        } else {
           console.log('\n⚠️ Transaction found but result is not SUCCESS. Check logs above.');
        }
    } catch (e) {
        console.error('Error fetching tx:', e);
    }
}

check();
