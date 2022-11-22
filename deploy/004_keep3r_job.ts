import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from '@0xged/hardhat-deploy/types';
import { bytecode } from '../artifacts/contracts/DCAKeep3rJob/DCAKeep3rJob.sol/DCAKeep3rJob.json';
import { deployThroughDeterministicFactory } from '@mean-finance/deterministic-factory/utils/deployment';

const deployFunction: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer, msig } = await hre.getNamedAccounts();

  const keep3r = '0xeb02addCfD8B773A5FFA6B9d1FE99c566f8c44CC';

  if (hre.deployments.getNetworkName() !== 'ethereum') {
    console.log('Avoiding deployment of Keep3r Job');
    return;
  }

  const swapper = await hre.deployments.get('DCAHubSwapper');
  await deployThroughDeterministicFactory({
    deployer,
    name: 'DCAKeep3rJob',
    salt: 'MF-DCAV2-Keep3rJob-V1',
    contract: 'contracts/DCAKeep3rJob/DCAKeep3rJob.sol:DCAKeep3rJob',
    bytecode,
    constructorArgs: {
      types: ['address', 'address', 'address', 'address[]'],
      values: [keep3r, swapper.address, msig, []],
    },
    log: !process.env.TEST,
    overrides: !!process.env.COVERAGE
      ? {}
      : {
          gasLimit: 4_000_000,
        },
  });
};

deployFunction.dependencies = ['DCAHubSwapper'];
deployFunction.tags = ['DCAKeep3rJob'];
export default deployFunction;
