import { keccak256, Wallet } from 'ethers';
import { TronWeb } from 'tronweb';

export function deriveWalletFromPrivateKey(privateKey: string) {
  const clean = privateKey.replace(/^0x/, '').trim();
  const address = TronWeb.address.fromPrivateKey(clean);
  if (!address) {
    throw new Error('Could not derive TRON address from private key');
  }
  return { address, privateKey: clean };
}

export function generateNewWallet() {
  const wallet = Wallet.createRandom();
  const privateKey = wallet.privateKey.replace(/^0x/, '');
  const address = TronWeb.address.fromPrivateKey(privateKey);
  return {
    address,
    privateKey
  };
}

export function computeVaultAddress(input: {
  userAddress: string;
  relayerContract: string;
  walletImplementation: string;
}) {
  const deployerHex20 = TronWeb.address.toHex(input.relayerContract).slice(2);
  const implHex20 = TronWeb.address.toHex(input.walletImplementation).slice(2);
  const ownerHex20 = TronWeb.address.toHex(input.userAddress).slice(2);
  const salt = keccak256(`0x${ownerHex20}`);
  const creationCode = `0x3d602d80600a3d3981f3363d3d373d3d3d363d73${implHex20}5af43d82803e903d91602b57fd5bf3`;
  const codeHash = keccak256(creationCode);
  const hash = keccak256(`0x41${deployerHex20}${salt.slice(2)}${codeHash.slice(2)}`);
  return TronWeb.address.fromHex(`41${hash.slice(-40)}`);
}

export async function signRelayTransfer(input: {
  privateKey: string;
  userAddress: string;
  recipient: string;
  amountUsdt: string;
  feeUsdt: string;
  nonce: string;
  usdtContract: string;
  relayerContract: string;
  chainId: number;
  rpcUrl: string;
}) {
  const wallet = deriveWalletFromPrivateKey(input.privateKey);
  if (wallet.address !== input.userAddress) {
    throw new Error(`Wallet mismatch: selected ${input.userAddress}, private key signs as ${wallet.address}`);
  }

  const tronWeb = new TronWeb({
    fullHost: input.rpcUrl,
    privateKey: wallet.privateKey
  });

  const message = {
    token: input.usdtContract,
    receiver: input.recipient,
    value: String(Math.floor(Number(input.amountUsdt) * 1_000_000)),
    fee: String(Math.floor(Number(input.feeUsdt) * 1_000_000)),
    nonce: input.nonce,
    deadline: String(Math.floor(Date.now() / 1000) + 900)
  };

  const signature = await tronWeb.trx._signTypedData(
    {
      name: 'Z-Vault Pro',
      version: '2',
      chainId: input.chainId,
      verifyingContract: input.relayerContract
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

  return { message, signature };
}
