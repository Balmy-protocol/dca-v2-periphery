import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';
import { networkBeingForked } from '@test-utils/evm';

const deployFunction: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();

  let betaHub: string;

  const network = hre.network.name !== 'hardhat' ? hre.network.name : networkBeingForked ?? hre.network.name;
  switch (network) {
    case 'optimism':
      betaHub = '0x24F85583FAa9F8BD0B8Aa7B1D1f4f53F0F450038';
      break;
    case 'optimism-kovan':
      betaHub = '0x19BB8c1130649BD2a114c2f2d4C3a6AFa3Bd4944';
      break;
    default:
      console.log('Avoiding deployment of Beta Migrator');
      return;
  }

  const hub = await hre.deployments.get('DCAHub');
  await hre.deployments.deploy('BetaMigrator', {
    contract: 'contracts/V2Migration/BetaMigrator.sol:BetaMigrator',
    from: deployer,
    args: [betaHub, hub.address],
    log: true,
  });
};

deployFunction.dependencies = ['DCAHub'];
deployFunction.tags = ['BetaMigrator'];
export default deployFunction;
