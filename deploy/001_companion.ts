import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';

const deployFunction: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer, governor } = await hre.getNamedAccounts();

  const WETH_MAINNET_ADDRESS = '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2';
  const WETH_KOVAN_ADDRESS = '0xd0a1e359811322d97991e03f863a0c30c2cf029c';
  const WETH_OPTIMISM_KOVAN_ADDRESS = '0x4200000000000000000000000000000000000006';
  const WETH_OPTIMISM_ADDRESS = '0x4200000000000000000000000000000000000006';
  const ZRX_MAINNET_ADDRESS = '0xdef1c0ded9bec7f1a1670819833240f027b25eff';

  let weth: string;
  let zrx: string = '0x0000000000000000000000000000000000000001';

  switch (hre.network.name) {
    case 'mainnet':
    case 'hardhat':
      weth = WETH_MAINNET_ADDRESS;
      zrx = ZRX_MAINNET_ADDRESS;
      break;
    case 'kovan':
      weth = WETH_KOVAN_ADDRESS;
      break;
    case 'optimismkovan':
      weth = WETH_OPTIMISM_KOVAN_ADDRESS;
      break;
    case 'optimism':
      weth = WETH_OPTIMISM_ADDRESS;
      break;
    default:
      throw new Error(`Unsupported chain '${hre.network.name}`);
  }

  const hub = await hre.deployments.get('DCAHub');
  await hre.deployments.deploy('DCAHubCompanion', {
    contract: 'contracts/DCAHubCompanion/DCAHubCompanion.sol:DCAHubCompanion',
    from: deployer,
    args: [hub.address, weth, governor],
  });
};

deployFunction.dependencies = ['DCAHub'];
deployFunction.tags = ['DCAHubCompanion'];
export default deployFunction;
