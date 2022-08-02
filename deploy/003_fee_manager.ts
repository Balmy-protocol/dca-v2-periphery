import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from '@0xged/hardhat-deploy/types';
import { bytecode } from '../artifacts/contracts/DCAFeeManager/DCAFeeManager.sol/DCAFeeManager.json';
import { deployThroughDeterministicFactory } from '@mean-finance/deterministic-factory/utils/deployment';

const deployFunction: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer, governor } = await hre.getNamedAccounts();

  const swapperRegistry = await hre.deployments.get('SwapperRegistry');

  await deployThroughDeterministicFactory({
    deployer,
    name: 'DCAFeeManager',
    salt: 'MF-DCAV2-DCAFeeManager-V3',
    contract: 'contracts/DCAFeeManager/DCAFeeManager.sol:DCAFeeManager',
    bytecode,
    constructorArgs: {
      types: ['address', 'address', 'address[]'],
      values: [swapperRegistry.address, governor, [governor]],
    },
    log: !process.env.TEST,
  });
};

deployFunction.tags = ['DCAFeeManager'];
export default deployFunction;
