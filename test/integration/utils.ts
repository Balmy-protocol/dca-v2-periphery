import { DeterministicFactory, DeterministicFactory__factory } from '@mean-finance/deterministic-factory/typechained';
import { wallet } from '@test-utils';
import { getNamedAccounts, deployments, ethers } from 'hardhat';
import { JsonRpcSigner } from '@ethersproject/providers';

export async function deploy(...contracts: string[]): Promise<{ msig: JsonRpcSigner; eoaAdmin: JsonRpcSigner }> {
  const { eoaAdmin: eoaAdminAddress, deployer, msig: msigAddress } = await getNamedAccounts();
  const eoaAdmin = await wallet.impersonate(eoaAdminAddress);
  const msig = await wallet.impersonate(msigAddress);
  await ethers.provider.send('hardhat_setBalance', [eoaAdminAddress, '0xffffffffffffffff']);
  await ethers.provider.send('hardhat_setBalance', [msigAddress, '0xffffffffffffffff']);

  const deterministicFactory = await ethers.getContractAt<DeterministicFactory>(
    DeterministicFactory__factory.abi,
    '0xbb681d77506df5CA21D2214ab3923b4C056aa3e2'
  );

  await deterministicFactory.connect(eoaAdmin).grantRole(await deterministicFactory.DEPLOYER_ROLE(), deployer);
  await deployments.run(
    [
      'DCAHubPositionDescriptor',
      'ChainlinkFeedRegistry',
      'TransformerOracle',
      'ProtocolTokenWrapperTransformer',
      'TransformerRegistry',
      'SwapperRegistry',
      'DCAHub',
      'DCAHubSwapper',
      ...contracts,
    ],
    {
      resetMemory: true,
      deletePreviousDeployments: false,
      writeDeploymentsToFiles: false,
    }
  );
  return { msig, eoaAdmin };
}
