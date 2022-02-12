import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';
import { networkBeingForked } from '@test-utils/evm';

const deployFunction: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer, governor } = await hre.getNamedAccounts();

  let weth: string;

  const network = hre.network.name !== 'hardhat' ? hre.network.name : networkBeingForked ?? hre.network.name;
  switch (network) {
    case 'mainnet':
      weth = '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2';
      break;
    case 'kovan':
      weth = '0xd0a1e359811322d97991e03f863a0c30c2cf029c';
      break;
    case 'optimism-kovan':
    case 'optimism':
      weth = '0x4200000000000000000000000000000000000006';
      break;
    case 'mumbai':
      weth = '0x9c3C9283D3e44854697Cd22D3Faa240Cfb032889'; // Actually wMATIC
      break;
    default:
      throw new Error(`Unsupported chain '${hre.network.name}`);
  }

  const hub = await hre.deployments.get('DCAHub');
  await hre.deployments.deploy('DCAHubCompanion', {
    contract: 'contracts/DCAHubCompanion/DCAHubCompanion.sol:DCAHubCompanion',
    from: deployer,
    args: [hub.address, weth, governor],
    log: true,
  });
};

deployFunction.dependencies = ['DCAHub'];
deployFunction.tags = ['DCAHubCompanion'];
export default deployFunction;
