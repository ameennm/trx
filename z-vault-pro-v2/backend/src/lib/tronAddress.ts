import { TronWeb } from 'tronweb';
import { keccak256 } from 'ethers';

export function computeTronVaultAddress(
  deployerBase58: string,
  walletImplementationBase58: string,
  ownerBase58: string
): string {
  const deployerHex20 = TronWeb.address.toHex(deployerBase58).slice(2);
  const implHex20 = TronWeb.address.toHex(walletImplementationBase58).slice(2);
  const ownerHex20 = TronWeb.address.toHex(ownerBase58).slice(2);

  const salt = keccak256(`0x${ownerHex20}`);
  const creationCode = `0x3d602d80600a3d3981f3363d3d373d3d3d363d73${implHex20}5af43d82803e903d91602b57fd5bf3`;
  const codeHash = keccak256(creationCode);
  const hash = keccak256(`0x41${deployerHex20}${salt.slice(2)}${codeHash.slice(2)}`);

  return TronWeb.address.fromHex(`41${hash.slice(-40)}`);
}
