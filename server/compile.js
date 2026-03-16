
const fs = require('fs');
const path = require('path');
const solc = require('solc');

const contractPath = path.resolve(__dirname, '../contracts/GasStation.sol');
const source = fs.readFileSync(contractPath, 'utf8');

const input = {
    language: 'Solidity',
    sources: {
        'GasStation.sol': {
            content: source,
        },
    },
    settings: {
        optimizer: {
            enabled: true,
            runs: 200,
        },
        outputSelection: {
            '*': {
                '*': ['abi', 'evm.bytecode'],
            },
        },
    },
};

console.log('Compiling GasStation.sol...');
const output = JSON.parse(solc.compile(JSON.stringify(input)));

if (output.errors) {
    output.errors.forEach((err) => {
        console.error(err.formattedMessage);
    });
}

const contract = output.contracts['GasStation.sol']['GasStation'];
if (!contract) {
    console.error('Contract compilation failed. No contract found in output.');
    process.exit(1);
}

const abi = contract.abi;
const bytecode = contract.evm.bytecode.object;

fs.writeFileSync(path.resolve(__dirname, 'src/contractData.json'), JSON.stringify({ abi, bytecode }, null, 2));

console.log('✅ Compilation successful! Data saved to server/src/contractData.json');
