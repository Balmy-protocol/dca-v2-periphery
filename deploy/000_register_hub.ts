import { abi as DCA_HUB_ABI, bytecode as DCA_HUB_BYTECODE } from '@mean-finance/dca-v2-core/artifacts/contracts/DCAHub/DCAHub.sol/DCAHub.json';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';
import { networkBeingForked } from '@test-utils/evm';

const deployFunction: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  // const hubDeployment = await hre.deployments.getOrNull('DCAHub');
  // if (!hubDeployment) {
  // }
  // const network = hre.network.name !== 'hardhat' ? hre.network.name : networkBeingForked ?? hre.network.name;
  // switch (network) {
  //   case 'hardhat':
  //   case 'mainnet':
  //     hub = '0xE0F0eeA2bdaFCB913A2b2b7938C0Fce1A39f5754';
  //     break;
  //   case 'polygon':
  //   case 'optimism':
  //     hub = '0x230C63702D1B5034461ab2ca889a30E343D81349';
  //     break;
  //   case 'optimism-kovan':
  //     hub = '0xB1EDC6ea9011bCC5318e2b36954008357b59292F';
  //     break;
  //   case 'mumbai':
  //     hub = '0x898D220C7cd30bf2DCacc9178ca3463e39cbB803';
  //     break;
  //   default:
  //     throw new Error(`Unsupported chain '${hre.network.name}`);
  // }
  // await hre.deployments.save('DCAHub', { abi: DCA_HUB_ABI, address: hub });
};
deployFunction.tags = ['DCAHub'];
export default deployFunction;
