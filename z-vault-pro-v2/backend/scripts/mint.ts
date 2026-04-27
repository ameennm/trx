import { tronWeb } from '../src/lib/tron.js';
import { appConfig } from '../src/config.js';

async function main() {
  const target = 'TP1MMhrhzDv5yB9RNH7bGYbc4MqachmRa1';
  const amount = 10000;
  const sunAmount = String(amount * 1000000);

  console.log(`Minting ${amount} USDT to ${target}...`);
  console.log(`Contract: ${appConfig.USDT_CONTRACT}`);
  
  try {
    const token = await tronWeb.contract().at(appConfig.USDT_CONTRACT);
    const tx = await token.mint(target, sunAmount).send({
      feeLimit: 100000000
    });

    console.log('Success! Transaction hash:', tx);
  } catch (error) {
    console.error('Minting failed:', error);
  }
}

main().catch(console.error);
