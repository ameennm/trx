import { Wallet } from 'ethers';
import { TronWeb } from 'tronweb';
import { appConfig } from '../src/config.js';
import { tronWeb } from '../src/lib/tron.js';
import { getVaultStatus, submitRelay } from '../src/services/relayService.js';

function toSun(usdt: number) {
  return String(Math.floor(usdt * 1_000_000));
}

async function main() {
  if (appConfig.NETWORK !== 'nile') {
    throw new Error('This script only runs when NETWORK=nile');
  }
  if (appConfig.ENERGY_PROVIDER_MODE !== 'mock') {
    throw new Error('This script requires ENERGY_PROVIDER_MODE=mock');
  }

  const userWallet = Wallet.createRandom();
  const userPrivateKey = userWallet.privateKey.replace(/^0x/, '');
  const userAddress = TronWeb.address.fromPrivateKey(userPrivateKey);
  if (!userAddress) {
    throw new Error('Failed to create user address');
  }

  const recipientWallet = Wallet.createRandom();
  const recipientAddress = TronWeb.address.fromPrivateKey(recipientWallet.privateKey.replace(/^0x/, ''));
  if (!recipientAddress) {
    throw new Error('Failed to create recipient address');
  }

  const initialVault = await getVaultStatus(userAddress);
  const token = await tronWeb.contract().at(appConfig.USDT_CONTRACT);
  const mintTx = await token.mint(initialVault.vaultAddress, toSun(10)).send({ feeLimit: 100_000_000 });

  const fundedVault = await getVaultStatus(userAddress);
  const userTronWeb = new TronWeb({
    fullHost: appConfig.TRONGRID_RPC_URL,
    privateKey: userPrivateKey
  });

  const message = {
    token: appConfig.USDT_CONTRACT,
    receiver: recipientAddress,
    value: toSun(2),
    fee: toSun(appConfig.PLATFORM_FEE_USDT),
    nonce: fundedVault.nonce,
    deadline: String(Math.floor(Date.now() / 1000) + 900)
  };

  const signature = await userTronWeb.trx._signTypedData(
    {
      name: 'Z-Vault Pro',
      version: '2',
      chainId: 0xcd8690dc,
      verifyingContract: appConfig.RELAYER_CONTRACT
    },
    {
      Transfer: [
        { name: 'token', type: 'address' },
        { name: 'receiver', type: 'address' },
        { name: 'value', type: 'uint256' },
        { name: 'fee', type: 'uint256' },
        { name: 'nonce', type: 'uint256' },
        { name: 'deadline', type: 'uint256' }
      ]
    },
    message
  );

  const relayResult = await submitRelay({
    idempotencyKey: `nile-e2e-${Date.now()}`,
    correlationId: `nile-e2e-${Date.now()}`,
    userAddress,
    recipient: recipientAddress,
    amountUsdt: '2',
    signature,
    message
  });

  const finalVault = await getVaultStatus(userAddress);
  const recipientBalance = (await token.balanceOf(recipientAddress).call()).toString();
  const treasuryBalance = (await token.balanceOf(appConfig.TREASURY_ADDRESS).call()).toString();

  console.log(JSON.stringify({
    userAddress,
    vaultAddress: initialVault.vaultAddress,
    recipientAddress,
    mintTx,
    relayResult,
    finalVault,
    recipientBalance,
    treasuryBalance
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
