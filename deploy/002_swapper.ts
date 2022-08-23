import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from '@0xged/hardhat-deploy/types';
import { bytecode } from '../artifacts/contracts/DCAHubSwapper/DCAHubSwapper.sol/DCAHubSwapper.json';
import { deployThroughDeterministicFactory } from '@mean-finance/deterministic-factory/utils/deployment';

const deployFunction: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer, msig } = await hre.getNamedAccounts();

  const swapperRegistry = await hre.deployments.get('SwapperRegistry');

  await deployThroughDeterministicFactory({
    deployer,
    name: 'DCAHubSwapper',
    salt: 'MF-DCAV2-DCAHubSwapper-V3',
    contract: 'contracts/DCAHubSwapper/DCAHubSwapper.sol:DCAHubSwapper',
    bytecode,
    constructorArgs: {
      types: ['address', 'address', 'address[]', 'address[]'],
      values: [swapperRegistry.address, msig, [msig], []],
    },
    log: !process.env.TEST,
    overrides: !!process.env.TEST
      ? {}
      : {
          gasLimit: 6_000_000,
        },
  });
};

deployFunction.dependencies = [];
deployFunction.tags = ['DCAHubSwapper'];
export default deployFunction;
