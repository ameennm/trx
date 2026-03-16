
const { TronWeb } = require('tronweb');
const fs = require('fs');
const dotenv = require('dotenv');

dotenv.config({ path: '../.env' });

async function checkChainId() {
    const tronWeb = new TronWeb({ 
        fullHost: process.env.NILE_RPC_URL,
        privateKey: process.env.RELAYER_PRIVATE_KEY
    });
    
    const contractAddress = process.env.GAS_STATION_CONTRACT;
    console.log('Contract Address:', contractAddress);

    const abi = [
        { "inputs": [], "name": "chainId", "outputs": [{ "type": "uint256" }], "stateMutability": "view", "type": "function" },
        { "inputs": [], "name": "getDomainSeparator", "outputs": [{ "type": "bytes32" }], "stateMutability": "view", "type": "function" }
    ];

    try {
        const contract = await tronWeb.contract(abi, contractAddress);
        const actualChainId = await contract.methods.chainId().call();
        const domainSeparator = await contract.methods.getDomainSeparator().call();
        
        console.log('--- Network Info ---');
        console.log('Contract ChainId:', actualChainId.toString());
        console.log('Config ChainId:  ', process.env.CHAIN_ID);
        console.log('Domain Separator:', domainSeparator);
        console.log('--------------------');
        
        if (actualChainId.toString() !== process.env.CHAIN_ID) {
            console.log('🚨 MISMATCH DETECTED!');
        } else {
            console.log('✅ Chain IDs match.');
        }
    } catch (e) {
        console.error('Error checking contract:', e.message);
    }
}

checkChainId();
