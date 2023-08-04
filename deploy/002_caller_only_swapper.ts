import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from '@0xged/hardhat-deploy/types';
import { bytecode } from '../artifacts/contracts/DCAHubSwapper/CallerOnlyDCAHubSwapper.sol/CallerOnlyDCAHubSwapper.json';
import { deployThroughDeterministicFactory } from '@mean-finance/deterministic-factory/utils/deployment';

const deployFunction: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();

  await deployThroughDeterministicFactory({
    deployer,
    name: 'CallerOnlyDCAHubSwapper',
    salt: 'MF-DCAV2-CallerDCAHubSwapper-V2',
    contract: 'contracts/DCAHubSwapper/CallerOnlyDCAHubSwapper.sol:CallerOnlyDCAHubSwapper',
    bytecode,
    constructorArgs: {
      types: [],
      values: [],
    },
    log: !process.env.TEST,
    overrides: !!process.env.COVERAGE
      ? {}
      : {
          gasLimit: 6_000_000,
        },
  });
};

deployFunction.dependencies = [];
deployFunction.tags = ['CallerOnlyDCAHubSwapper'];
export default deployFunction;
