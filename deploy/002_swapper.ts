import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from '@0xged/hardhat-deploy/types';
import { networkBeingForked } from '@test-utils/evm';
import { DCAHubSwapper__factory } from '../typechained';
import { deployThroughDeterministicFactory } from '@mean-finance/deterministic-factory/utils/deployment';

const deployFunction: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer, governor } = await hre.getNamedAccounts();

  let wProtocolToken: string;
  const network = hre.network.name !== 'hardhat' ? hre.network.name : networkBeingForked ?? hre.network.name;
  switch (network) {
    case 'hardhat':
    case 'mainnet':
      wProtocolToken = '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2'; // WETH
      break;
    case 'kovan':
      wProtocolToken = '0xd0a1e359811322d97991e03f863a0c30c2cf029c'; // WETH
      break;
    case 'optimism-kovan':
    case 'optimism':
      wProtocolToken = '0x4200000000000000000000000000000000000006'; // WETH
      break;
    case 'arbitrum':
      wProtocolToken = '0x82af49447d8a07e3bd95bd0d56f35241523fbab1'; // WETH
      break;
    case 'mumbai':
      wProtocolToken = '0x9c3C9283D3e44854697Cd22D3Faa240Cfb032889'; // WMATIC
      break;
    case 'polygon':
      wProtocolToken = '0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270'; // WMATIC
      break;
    default:
      throw new Error(`Unsupported chain '${hre.network.name}`);
  }
  const hub = await hre.deployments.get('DCAHub');

  await deployThroughDeterministicFactory({
    deployer,
    name: 'DCAHubSwapper',
    salt: 'MF-DCAV2-DCAHubSwapper-V2',
    contract: 'contracts/DCAHubSwapper/DCAHubSwapper.sol:DCAHubSwapper',
    bytecode: DCAHubSwapper__factory.bytecode,
    constructorArgs: {
      types: ['address', 'address', 'address'],
      values: [hub.address, wProtocolToken, governor],
    },
    log: !process.env.TEST,
  });
};

deployFunction.dependencies = ['DCAHubCompanion'];
deployFunction.tags = ['DCAHubSwapper'];
export default deployFunction;
