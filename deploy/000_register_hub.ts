import { abi as DCA_HUB_ABI } from '@mean-finance/dca-v2-core/artifacts/contracts/DCAHub/DCAHub.sol/DCAHub.json';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';
import { networkBeingForked } from '@test-utils/evm';

const deployFunction: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  let hub: string;

  const network = hre.network.name !== 'hardhat' ? hre.network.name : networkBeingForked ?? hre.network.name;
  switch (network) {
    case 'optimism':
      // TODO: Update to non-beta deployment
      hub = '0x24F85583FAa9F8BD0B8Aa7B1D1f4f53F0F450038';
      break;
    case 'optimism-kovan':
      hub = '0x2aCb69a8f2Ab6b496D482073eB70573A345a3272';
      break;
    default:
      throw new Error(`Unsupported chain '${hre.network.name}`);
  }

  await hre.deployments.save('DCAHub', { abi: DCA_HUB_ABI, address: hub });
};
deployFunction.tags = ['DCAHub'];
export default deployFunction;
