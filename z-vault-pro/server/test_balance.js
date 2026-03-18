const TronWeb = require('tronweb').TronWeb;
const tw = new TronWeb({ fullHost: 'https://nile.trongrid.io' });

const USDT_ABI = [
  {
    "inputs": [{ "name": "_owner", "type": "address" }],
    "name": "balanceOf",
    "outputs": [{ "name": "balance", "type": "uint256" }],
    "stateMutability": "view",
    "type": "function"
  }
];

async function main() {
  const contract = await tw.contract(USDT_ABI, 'TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf');
  const bal = await contract.methods.balanceOf('TJBpgUDZEq66PypXhD9x7aLrehZ9puPuaX').call();
  console.log('Raw balance fetch:', JSON.stringify(bal));
  console.log('Value:', bal);
  console.log('Number(bal):', Number(bal));
}

main();
