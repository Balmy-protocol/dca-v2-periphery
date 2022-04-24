import TimelockController from '@openzeppelin/contracts/build/contracts/TimelockController.json';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';
import { ethers } from 'hardhat';
import moment from 'moment';
import {
  ChainlinkOracle__factory,
  DCAHub__factory,
  DCAPermissionsManager__factory,
  OracleAggregator__factory,
  UniswapV3Oracle__factory,
} from '@mean-finance/dca-v2-core/typechained';

const deployFunction: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const hub = await ethers.getContractOrNull('DCAHub');

  if (!hub) {
    console.log('deploy HUB');
    // We will use ethereum as our default network
    const WETH = '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2';
    const DCA_TOKEN_DESCRIPTOR = '0x0000000000000000000000000000000000000001';
    const { deployer, governor } = await hre.getNamedAccounts();
    const chainlinkOracleDeployment = await hre.deployments.deploy('Oracle', {
      from: deployer,
      contract: { abi: ChainlinkOracle__factory.abi, bytecode: ChainlinkOracle__factory.bytecode },
      args: [
        WETH,
        '0x47Fb2585D2C56Fe188D0E6ec628a38b74fCeeeDf', // Chainlink registry
        moment.duration('1', 'day').as('seconds'), // Max delay
        governor,
      ],
    });
    const uniswapOracleDeployment = await hre.deployments.deploy('UniswapOracle', {
      contract: { abi: UniswapV3Oracle__factory.abi, bytecode: UniswapV3Oracle__factory.bytecode },
      from: deployer,
      args: [
        governor,
        '0x1F98431c8aD98523631AE4a59f267346ea31F984', // Uniswap V3 Factory
        4, // Cadinality per minute
        moment.duration('5', 'minutes').as('seconds'), // Period
        moment.duration('5', 'minutes').as('seconds'), // Minimum period
        moment.duration('20', 'minutes').as('seconds'), // Maximum period
      ],
      log: true,
    });
    const oracleAggregator = await hre.deployments.deploy('OracleAggregator', {
      contract: { abi: OracleAggregator__factory.abi, bytecode: OracleAggregator__factory.bytecode },
      from: deployer,
      args: [chainlinkOracleDeployment.address, uniswapOracleDeployment.address, governor],
      log: true,
    });
    const permissionsManagerDeployment = await hre.deployments.deploy('PermissionsManager', {
      from: deployer,
      contract: { abi: DCAPermissionsManager__factory.abi, bytecode: DCAPermissionsManager__factory.bytecode },
      args: [governor, DCA_TOKEN_DESCRIPTOR],
    });
    const timelock = await hre.deployments.deploy('Timelock', {
      contract: TimelockController,
      from: deployer,
      args: [
        moment.duration('3', 'days').as('seconds'), // Min delay
        [governor], // Proposer
        [governor], // Executors
      ],
      log: true,
    });
    const hubDeployment = await hre.deployments.deploy('DCAHub', {
      from: deployer,
      contract: { abi: DCAHub__factory.abi, bytecode: DCAHub__factory.bytecode },
      args: [governor, timelock.address, oracleAggregator.address, permissionsManagerDeployment.address],
    });
    await hre.deployments.execute('PermissionsManager', { from: deployer }, 'setHub', hubDeployment.address);
  }
};
deployFunction.tags = ['DCACore'];
export default deployFunction;
