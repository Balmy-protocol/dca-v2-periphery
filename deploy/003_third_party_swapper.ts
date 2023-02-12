import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from '@0xged/hardhat-deploy/types';
import { bytecode } from '../artifacts/contracts/DCAHubSwapper/ThirdPartyDCAHubSwapper.sol/ThirdPartyDCAHubSwapper.json';
import { deployThroughDeterministicFactory } from '@mean-finance/deterministic-factory/utils/deployment';

const deployFunction: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();

  await deployThroughDeterministicFactory({
    deployer,
    name: 'ThirdPartyDCAHubSwapper',
    salt: 'MF-DCAV2-3PartySwapper-V1',
    contract: 'contracts/DCAHubSwapper/ThirdPartyDCAHubSwapper.sol:ThirdPartyDCAHubSwapper',
    bytecode,
    constructorArgs: {
      types: [],
      values: [],
    },
    log: !process.env.TEST,
    overrides: !!process.env.COVERAGE
      ? {}
      : {
          gasLimit: 12_000_000,
        },
  });
};

deployFunction.dependencies = [];
deployFunction.tags = ['ThirdPartyDCAHubSwapper'];
export default deployFunction;
