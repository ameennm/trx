
const { TronWeb } = require('tronweb');
const tronWeb = new TronWeb({ fullHost: 'https://nile.trongrid.io' });

async function checkTx(txId) {
    try {
        const info = await tronWeb.trx.getTransactionInfo(txId);
        console.log('Transaction Info:', JSON.stringify(info, null, 2));
        if (info.receipt && info.receipt.result === 'REVERT') {
            console.log('Reason (hex):', info.resMessage);
            if (info.resMessage) {
                console.log('Reason (text):', Buffer.from(info.resMessage, 'hex').toString());
            }
        }
    } catch (e) {
        console.error('Error fetching tx info:', e);
    }
}

checkTx('203530023961e55bc54049febd4e96df145dbf4998dacab50d4051acd4af2108');
