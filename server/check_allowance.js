
const { TronWeb } = require('tronweb');
const tronWeb = new TronWeb({
    fullHost: 'https://nile.trongrid.io'
});

const user = 'TUFy8Dx2SFSMC9s6PHgC3ZRja4c8myYD94';
const contract = 'TEAc1PSNRXVpmnmC15Q3FsE1J2gHcDTN1m';
const usdt = 'TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf';

// Necessary for some call operations in Node.js TronWeb
tronWeb.setAddress(user);

async function check() {
    try {
        const usdtContract = await tronWeb.contract().at(usdt);
        const allowance = await usdtContract.allowance(user, contract).call();
        console.log('Allowance:', allowance.toString());
        
        const balance = await usdtContract.balanceOf(user).call();
        console.log('Balance:', balance.toString());
    } catch (e) {
        console.error(e);
    }
}

check();
