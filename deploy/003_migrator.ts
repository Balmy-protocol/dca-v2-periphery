import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from '@0xged/hardhat-deploy/types';
import { deployThroughDeterministicFactory } from '@mean-finance/deterministic-factory/utils/deployment';
import { PositionMigrator__factory } from '../typechained';

const deployFunction: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();

  await deployThroughDeterministicFactory({
    deployer,
    name: 'PositionMigrator',
    salt: 'MF-DCAV2-PositionMigrator',
    contract: 'contracts/V2Migration/PositionMigrator.sol:PositionMigrator',
    bytecode: PositionMigrator__factory.bytecode,
    constructorArgs: {
      types: [],
      values: [],
    },
    log: !process.env.TEST,
  });
};

deployFunction.tags = ['PositionMigrator'];
export default deployFunction;
