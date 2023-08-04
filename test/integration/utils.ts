import { DeterministicFactory, DeterministicFactory__factory } from '@mean-finance/deterministic-factory';
import { address as DETERMINISTIC_FACTORY_ADDRESS } from '@mean-finance/deterministic-factory/deployments/ethereum/DeterministicFactory.json';
import { wallet } from '@test-utils';
import { getNamedAccounts, deployments, ethers } from 'hardhat';
import { JsonRpcSigner } from '@ethersproject/providers';

export async function deploy(...contracts: string[]): Promise<{ msig: JsonRpcSigner; eoaAdmin: JsonRpcSigner; timelock: JsonRpcSigner }> {
  const { msig } = await getNamedAccounts();
  return deployWithAddress(msig, ...contracts);
}

export async function deployWithAddress(
  deployerAddress: string,
  ...contracts: string[]
): Promise<{ msig: JsonRpcSigner; eoaAdmin: JsonRpcSigner; timelock: JsonRpcSigner }> {
  const { eoaAdmin: eoaAdminAddress, deployer, msig: msigAddress } = await getNamedAccounts();
  const eoaAdmin = await wallet.impersonate(eoaAdminAddress);
  const msig = await wallet.impersonate(msigAddress);
  const deployerAdmin = await wallet.impersonate(deployerAddress);
  await ethers.provider.send('hardhat_setBalance', [eoaAdminAddress, '0xffffffffffffffff']);
  await ethers.provider.send('hardhat_setBalance', [msigAddress, '0xffffffffffffffff']);
  await ethers.provider.send('hardhat_setBalance', [deployerAddress, '0xffffffffffffffff']);

  const deterministicFactory = await ethers.getContractAt<DeterministicFactory>(
    DeterministicFactory__factory.abi,
    DETERMINISTIC_FACTORY_ADDRESS
  );

  await deterministicFactory.connect(deployerAdmin).grantRole(await deterministicFactory.DEPLOYER_ROLE(), deployer);
  await deployments.run(
    [
      'DCAHubPositionDescriptor',
      'ChainlinkFeedRegistry',
      'TransformerOracle',
      'ProtocolTokenWrapperTransformer',
      'TransformerRegistry',
      'DCAHub',
      'CallerOnlyDCAHubSwapper',
      ...contracts,
    ],
    {
      resetMemory: true,
      deletePreviousDeployments: false,
      writeDeploymentsToFiles: false,
    }
  );

  const timelockContract = await ethers.getContract('Timelock');
  const timelock = await wallet.impersonate(timelockContract.address);
  await ethers.provider.send('hardhat_setBalance', [timelockContract.address, '0xffffffffffffffff']);
  return { msig, eoaAdmin, timelock };
}
