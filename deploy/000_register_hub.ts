import { abi as DCA_HUB_ABI, bytecode as DCA_HUB_BYTECODE } from '@mean-finance/dca-v2-core/artifacts/contracts/DCAHub/DCAHub.sol/DCAHub.json';
import {
  abi as PM_ABI,
  bytecode as PM_BYTECODE,
} from '@mean-finance/dca-v2-core/artifacts/contracts/DCAPermissionsManager/DCAPermissionsManager.sol/DCAPermissionsManager.json';
import {
  abi as CHAINLINK_ABI,
  bytecode as CHAINLINK_BYTECODE,
} from '@mean-finance/dca-v2-core/artifacts/contracts/oracles/ChainlinkOracle.sol/ChainlinkOracle.json';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';
import { networkBeingForked } from '@test-utils/evm';
import { BigNumber } from 'ethers';

const deployFunction: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  let hub: string;

  const network = hre.network.name !== 'hardhat' ? hre.network.name : networkBeingForked ?? hre.network.name;
  switch (network) {
    case 'optimism':
      hub = '0x230C63702D1B5034461ab2ca889a30E343D81349';
      break;
    case 'optimism-kovan':
      hub = '0xB1EDC6ea9011bCC5318e2b36954008357b59292F';
      break;
    case 'mumbai':
      hub = '0x230C63702D1B5034461ab2ca889a30E343D81349';
      break;
    case 'mainnet':
      // TODO: Remove when we deploy to mainnet
      const WETH = '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2';
      const CHAINLINK_REGISTRY = '0x47Fb2585D2C56Fe188D0E6ec628a38b74fCeeeDf';
      const DCA_TOKEN_DESCRIPTOR = '0x0000000000000000000000000000000000000001';
      const { deployer, governor } = await hre.getNamedAccounts();
      const chainlinkDeployment = await hre.deployments.deploy('Oracle', {
        from: deployer,
        contract: { abi: CHAINLINK_ABI, bytecode: CHAINLINK_BYTECODE },
        args: [WETH, CHAINLINK_REGISTRY, BigNumber.from(2).pow(32).sub(1), governor],
      });
      const permissionsManagerDeployment = await hre.deployments.deploy('PermissionsManager', {
        from: deployer,
        contract: { abi: PM_ABI, bytecode: PM_BYTECODE },
        args: [governor, DCA_TOKEN_DESCRIPTOR],
      });
      const hubDeployment = await hre.deployments.deploy('DCAHub', {
        from: deployer,
        contract: { abi: DCA_HUB_ABI, bytecode: DCA_HUB_BYTECODE },
        args: [governor, governor, chainlinkDeployment.address, permissionsManagerDeployment.address],
      });
      await hre.deployments.execute('PermissionsManager', { from: deployer }, 'setHub', hubDeployment.address);
      hub = hubDeployment.address;
      break;
    default:
      throw new Error(`Unsupported chain '${hre.network.name}`);
  }

  await hre.deployments.save('DCAHub', { abi: DCA_HUB_ABI, address: hub });
};
deployFunction.tags = ['DCAHub'];
export default deployFunction;
