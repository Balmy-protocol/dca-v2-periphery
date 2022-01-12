import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';
import { networkBeingForked } from '@test-utils/evm';

const deployFunction: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer, governor } = await hre.getNamedAccounts();

  let keep3r: string;

  const network = hre.network.name !== 'hardhat' ? hre.network.name : networkBeingForked ?? hre.network.name;
  switch (network) {
    case 'mainnet':
      keep3r = '0xdc02981c9C062d48a9bD54adBf51b816623dcc6E';
      break;
    default:
      console.log('Avoiding deployment of Keep3r Job');
      return;
  }

  const companion = await hre.deployments.get('DCAHubCompanion');
  await hre.deployments.deploy('DCAKeep3rJob', {
    contract: 'contracts/DCAKeep3rJob/DCAKeep3rJob.sol:DCAKeep3rJob',
    from: deployer,
    args: [companion.address, keep3r, governor],
    log: true,
  });
};

deployFunction.dependencies = ['DCAHubCompanion'];
deployFunction.tags = ['DCAKeep3rJob'];
export default deployFunction;
