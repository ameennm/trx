const fs = require('fs');
const path = require('path');
const solc = require(path.resolve(__dirname, 'server/node_modules/solc'));

const contractPath = path.resolve(__dirname, 'contracts/GasStation.sol');
const source = fs.readFileSync(contractPath, 'utf8');

const input = {
    language: 'Solidity',
    sources: {
        'GasStation.sol': {
            content: source,
        },
    },
    settings: {
        outputSelection: {
            '*': {
                '*': ['*'],
            },
        },
    },
};

console.log('Compiling...');
const output = JSON.parse(solc.compile(JSON.stringify(input)));

if (output.errors) {
    output.errors.forEach((err) => {
        console.error(err.formattedMessage);
    });
    if (output.errors.some(e => e.severity === 'error')) process.exit(1);
}

const contract = output.contracts['GasStation.sol']['GasStation'];
const data = {
    abi: contract.abi,
    bytecode: contract.evm.bytecode.object,
};

fs.writeFileSync(
    path.resolve(__dirname, 'server/src/contractData.json'),
    JSON.stringify(data, null, 2)
);

console.log('✅ contractData.json updated successfully!');
