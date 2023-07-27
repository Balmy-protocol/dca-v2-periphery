import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from '@0xged/hardhat-deploy/types';
import { bytecode } from '../artifacts/contracts/DCAHubCompanion/DCAHubCompanion.sol/DCAHubCompanion.json';
import { deployThroughDeterministicFactory } from '@mean-finance/deterministic-factory/utils/deployment';

const deployFunction: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer, msig } = await hre.getNamedAccounts();

  const permit2 = '0x000000000022d473030f116ddee9f6b43ac78ba3';
  const swapperRegistry = await hre.deployments.get('SwapperRegistry');

  await deployThroughDeterministicFactory({
    deployer,
    name: 'DCAHubCompanion',
    salt: 'MF-DCAV2-DCAHubCompanion-V3',
    contract: 'contracts/DCAHubCompanion/DCAHubCompanion.sol:DCAHubCompanion',
    bytecode,
    constructorArgs: {
      types: ['address', 'address', 'address'],
      values: [swapperRegistry.address, msig, permit2],
    },
    log: !process.env.TEST,
    overrides: !!process.env.COVERAGE
      ? {}
      : {
          gasLimit: 6_000_000,
        },
  });
};

deployFunction.tags = ['DCAHubCompanion'];
export default deployFunction;
