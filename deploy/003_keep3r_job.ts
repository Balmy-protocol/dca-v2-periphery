import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';
import { networkBeingForked } from '@test-utils/evm';
import constants from '@test-utils/constants';

const deployFunction: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer, governor } = await hre.getNamedAccounts();

  let keep3r: string;

  const network = hre.network.name !== 'hardhat' ? hre.network.name : networkBeingForked ?? hre.network.name;
  switch (network) {
    case 'hardhat':
    case 'mainnet':
      keep3r = '0x4a6cff9e1456eaa3b6f37572395c6fa0c959edab';
      break;
    default:
      console.log('Avoiding deployment of Keep3r Job');
      return;
  }

  const companion = await hre.deployments.getOrNull('DCAHubCompanion');

  const keep3rJob = await hre.deployments.getOrNull('DCAKeep3rJob');

  if (!keep3rJob) {
    await hre.deployments.deploy('DCAKeep3rJob', {
      contract: 'contracts/DCAKeep3rJob/DCAKeep3rJob.sol:DCAKeep3rJob',
      from: deployer,
      args: [!!companion ? companion.address : constants.ZERO_ADDRESS, keep3r, governor],
      log: true,
    });
  }
};

deployFunction.tags = ['DCAKeep3rJob'];
export default deployFunction;
