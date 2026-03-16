
const { TronWeb } = require('tronweb');
const tronWeb = new TronWeb({ 
    fullHost: 'https://nile.trongrid.io',
    privateKey: 'f28e5958114b3f42e93e71e63c113e77c3f666e1e8fb737399c1cdf0f62ebca2'
});

const contractAddress = 'TTAoGyF4fXeasT4gQYiYna6EuRWnWnVMPQ';

async function check() {
    try {
        const contract = await tronWeb.contract().at(contractAddress);
        const name = await contract.NAME().call();
        const chainId = await contract.chainId().call();
        const relayer = await contract.relayer().call();
        const owner = await contract.owner().call();
        const usdt = await contract.usdt().call();

        console.log('Contract vars:');
        console.log('NAME:', name);
        console.log('chainId:', chainId.toString());
        console.log('relayer:', tronWeb.address.fromHex(relayer));
        console.log('owner:', tronWeb.address.fromHex(owner));
        console.log('usdt:', tronWeb.address.fromHex(usdt));
    } catch (e) {
        console.error('Error:', e);
    }
}
check();
