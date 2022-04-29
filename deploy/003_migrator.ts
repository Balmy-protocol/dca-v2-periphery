import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';

const deployFunction: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();

  await hre.deployments.deploy('PositionMigrator', {
    contract: 'contracts/V2Migration/PositionMigrator.sol:PositionMigrator',
    from: deployer,
    log: true,
  });
};

deployFunction.tags = ['PositionMigrator'];
export default deployFunction;
