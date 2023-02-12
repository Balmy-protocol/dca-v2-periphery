import { expect } from 'chai';
import { ethers } from 'hardhat';
import { JsonRpcSigner } from '@ethersproject/providers';
import { constants, wallet } from '@test-utils';
import { contract } from '@test-utils/bdd';
import evm from '@test-utils/evm';
import { CallerOnlyDCAHubSwapper, IERC20, DCAFeeManager, ISwapperRegistry } from '@typechained';
import { DCAHub } from '@mean-finance/dca-v2-core';
import { abi as IERC20_ABI } from '@openzeppelin/contracts/build/contracts/IERC20.json';
import { BigNumber, utils } from 'ethers';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { SwapInterval } from '@test-utils/interval-utils';
import forkBlockNumber from '@integration/fork-block-numbers';
import { TransformerRegistry } from '@mean-finance/transformers';
import { TransformerOracle, StatefulChainlinkOracle } from '@mean-finance/oracles';
import { buildSwapInput } from '@test-utils/swap-utils';
import { deploy } from '@integration/utils';

const WETH_ADDRESS = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2';
const USDC_ADDRESS = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48';
const WBTC_ADDRESS = '0x2260fac5e5542a773aa44fbcfedf7c193bc2c599';
const WETH_WHALE_ADDRESS = '0xf04a5cc80b1e94c69b48f5ee68a08cd2f09a7c3e';
const USDC_WHALE_ADDRESS = '0xcffad3200574698b78f32232aa9d63eabd290703';
const WBTC_WHALE_ADDRESS = '0x9ff58f4ffb29fa2266ab25e75e2a8b3503311656';

contract('DCAFeeManager', () => {
  const RECIPIENT = wallet.generateRandomAddress();
  let WETH: IERC20, USDC: IERC20, WBTC: IERC20;
  let superAdmin: JsonRpcSigner;
  let cindy: SignerWithAddress, allowed: SignerWithAddress, swapper: SignerWithAddress;
  let DCAFeeManager: DCAFeeManager;
  let DCAHubSwapper: CallerOnlyDCAHubSwapper;
  let DCAHub: DCAHub;
  let transformerRegistry: TransformerRegistry;
  let swapperRegistry: ISwapperRegistry;

  before(async () => {
    [cindy, allowed, swapper] = await ethers.getSigners();
    await evm.reset({
      network: 'ethereum',
      blockNumber: forkBlockNumber['dca-fee-manager'],
    });

    ({ msig: superAdmin } = await deploy('DCAFeeManager'));

    DCAHub = await ethers.getContract('DCAHub');
    DCAHubSwapper = await ethers.getContract('DCAHubSwapper');
    DCAFeeManager = await ethers.getContract('DCAFeeManager');
    transformerRegistry = await ethers.getContract('TransformerRegistry');
    swapperRegistry = await ethers.getContract('SwapperRegistry');
    const transformerOracle = await ethers.getContract<TransformerOracle>('TransformerOracle');
    const protocolTokenTransformer = await ethers.getContract('ProtocolTokenWrapperTransformer');
    const chainlinkOracle = await ethers.getContract<StatefulChainlinkOracle>('StatefulChainlinkOracle');

    // Set up tokens and permissions
    await DCAHub.connect(superAdmin).setAllowedTokens([WETH_ADDRESS, USDC_ADDRESS, WBTC_ADDRESS], [true, true, true]);
    await DCAHub.connect(superAdmin).grantRole(await DCAHub.PLATFORM_WITHDRAW_ROLE(), DCAFeeManager.address);
    await DCAFeeManager.connect(superAdmin).grantRole(await DCAFeeManager.ADMIN_ROLE(), allowed.address);
    await swapperRegistry.connect(superAdmin).allowSwappers([transformerRegistry.address]);
    await DCAHubSwapper.connect(superAdmin).grantRole(await DCAHubSwapper.SWAP_EXECUTION_ROLE(), swapper.address);

    WETH = await ethers.getContractAt(IERC20_ABI, WETH_ADDRESS);
    USDC = await ethers.getContractAt(IERC20_ABI, USDC_ADDRESS);
    WBTC = await ethers.getContractAt(IERC20_ABI, WBTC_ADDRESS);

    // Send tokens from whales, to our users
    await distributeTokensToUsers();
    await transformerRegistry
      .connect(superAdmin)
      .registerTransformers([{ transformer: protocolTokenTransformer.address, dependents: [WETH.address] }]);
    await transformerOracle.connect(superAdmin).avoidMappingToUnderlying([WETH.address]);
    await chainlinkOracle
      .connect(superAdmin)
      .addMappings(
        [WETH.address, WBTC.address],
        [await protocolTokenTransformer.PROTOCOL_TOKEN(), '0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB']
      );

    // Handle approvals
    await USDC.connect(swapper).approve(DCAHubSwapper.address, constants.MAX_UINT_256);
    await WETH.connect(swapper).approve(DCAHubSwapper.address, constants.MAX_UINT_256);
    await WBTC.connect(cindy).approve(DCAHub.address, constants.MAX_UINT_256);
  });

  it('swap, convert and withdraw as protocol token', async () => {
    // Deposit
    await DCAHub.connect(cindy)['deposit(address,address,uint256,uint32,uint32,address,(address,uint8[])[])'](
      WBTC.address,
      USDC.address,
      utils.parseUnits('0.1', 6),
      1,
      SwapInterval.ONE_DAY.seconds,
      cindy.address,
      []
    );

    // Execute swap
    await swap({ from: WBTC, to: USDC });

    // Calculate and verify balances
    const [usdcBalance, wbtcBalance] = await DCAFeeManager.availableBalances(DCAHub.address, [USDC.address, WBTC.address]);
    expect(usdcBalance.platformBalance.gt(0)).to.be.true;
    expect(usdcBalance.feeManagerBalance).to.equal(0);
    expect(wbtcBalance.platformBalance).to.equal(0);
    expect(wbtcBalance.feeManagerBalance.gt(0)).to.be.true;
    expect(wbtcBalance.positions).to.have.lengthOf(0);

    // Prepare data to withdraw USDC from platform balance
    const { data: withdrawData } = await DCAFeeManager.populateTransaction.withdrawFromPlatformBalance(
      DCAHub.address,
      [{ token: USDC.address, amount: usdcBalance.platformBalance }],
      DCAFeeManager.address
    );

    // Prepare data to send WBTC and USDC to Hub, to DCA for WETH
    const { data: fillData } = await DCAFeeManager.populateTransaction.fillPositions(
      DCAHub.address,
      [
        { token: USDC.address, amount: usdcBalance.platformBalance, amountOfSwaps: 1 },
        { token: WBTC.address, amount: wbtcBalance.feeManagerBalance, amountOfSwaps: 1 },
      ],
      [{ token: WETH.address, shares: 10000 }]
    );

    // Execute withdraw + fill
    await DCAFeeManager.connect(allowed).multicall([withdrawData!, fillData!]);

    // Execute swap
    await swap({ from: USDC, to: WETH }, { from: WBTC, to: WETH });

    // Check balances
    const [wethBalance] = await DCAFeeManager.availableBalances(DCAHub.address, [WETH.address]);
    expect(wethBalance.platformBalance.gt(0)).to.be.true;
    expect(wethBalance.positions).to.have.lengthOf(2);
    const [position1, position2] = wethBalance.positions;
    expect(position1.from.toLowerCase()).to.equal(USDC.address.toLowerCase());
    expect(position1.to.toLowerCase()).to.eql(WETH.address.toLowerCase());
    expect(position1.swapped.gt(0)).to.be.true;
    expect(position1.remaining).to.equal(0);
    expect(position2.from.toLowerCase()).to.equal(WBTC.address.toLowerCase());
    expect(position2.to.toLowerCase()).to.equal(WETH.address.toLowerCase());
    expect(position2.swapped.gt(0)).to.be.true;
    expect(position2.remaining).to.equal(0);

    // Execute withdraw as protocol token
    const total = wethBalance.platformBalance.add(wethBalance.positions[0].swapped).add(wethBalance.positions[1].swapped);
    const { data: withdrawPlatformBalanceData } = await DCAFeeManager.populateTransaction.withdrawFromPlatformBalance(
      DCAHub.address,
      [{ token: WETH.address, amount: wethBalance.platformBalance }],
      DCAFeeManager.address
    );
    const { data: withdrawPositionsData } = await DCAFeeManager.populateTransaction.withdrawFromPositions(
      DCAHub.address,
      [{ token: WETH.address, positionIds: [position1.positionId, position2.positionId] }],
      DCAFeeManager.address
    );
    const { data: unwrapExecutionData } = await transformerRegistry.populateTransaction.transformToUnderlying(
      WETH.address,
      total,
      DCAFeeManager.address,
      [{ underlying: await transformerRegistry.PROTOCOL_TOKEN(), amount: total }],
      constants.MAX_UINT_256
    );
    const { data: unwrapData } = await DCAFeeManager.populateTransaction.runSwap({
      swapper: transformerRegistry.address,
      allowanceTarget: transformerRegistry.address,
      swapData: unwrapExecutionData!,
      tokenIn: WETH.address,
      amountIn: total,
    });
    const { data: withdrawProtocolTokenData } = await DCAFeeManager.populateTransaction.withdrawFromBalance(
      [{ token: await DCAFeeManager.PROTOCOL_TOKEN(), amount: total }],
      RECIPIENT
    );
    await DCAFeeManager.connect(allowed).multicall([
      withdrawPlatformBalanceData!,
      withdrawPositionsData!,
      unwrapData!,
      withdrawProtocolTokenData!,
    ]);

    // Make sure that everything was transferred to recipient
    const recipientBalance = await ethers.provider.getBalance(RECIPIENT);
    const [wethBalanceAfter] = await DCAFeeManager.availableBalances(DCAHub.address, [WETH.address]);
    expect(wethBalanceAfter.platformBalance).to.equal(0);
    const [position1After, position2After] = wethBalanceAfter.positions;
    expect(recipientBalance).to.equal(wethBalance.platformBalance.add(position1.swapped).add(position2.swapped));
    expect(position1After.swapped).to.equal(0);
    expect(position2After.swapped).to.equal(0);
  });

  async function distributeTokensToUsers() {
    const wethWhale = await wallet.impersonate(WETH_WHALE_ADDRESS);
    const usdcWhale = await wallet.impersonate(USDC_WHALE_ADDRESS);
    const wbtcWhale = await wallet.impersonate(WBTC_WHALE_ADDRESS);
    await ethers.provider.send('hardhat_setBalance', [WBTC_WHALE_ADDRESS, '0xffffffffffffffff']);
    await ethers.provider.send('hardhat_setBalance', [WETH_WHALE_ADDRESS, '0xffffffffffffffff']);
    await ethers.provider.send('hardhat_setBalance', [USDC_WHALE_ADDRESS, '0xffffffffffffffff']);
    await WBTC.connect(wbtcWhale).transfer(cindy.address, BigNumber.from(10).pow(12));
    await WETH.connect(wethWhale).transfer(swapper.address, BigNumber.from(10).pow(22));
    await USDC.connect(usdcWhale).transfer(swapper.address, BigNumber.from(10).pow(12));
  }

  async function swap(...pairs: { from: IERC20; to: IERC20 }[]) {
    const { tokens, pairIndexes } = buildSwapInput(
      pairs.map(({ from, to }) => ({ tokenA: from.address, tokenB: to.address })),
      []
    );
    await DCAHubSwapper.connect(swapper).swapForCaller({
      hub: DCAHub.address,
      tokens,
      pairsToSwap: pairIndexes,
      oracleData: [],
      minimumOutput: tokens.map((_) => 0),
      maximumInput: tokens.map((_) => constants.MAX_UINT_256),
      recipient: DCAFeeManager.address,
      deadline: constants.MAX_UINT_256,
    });
  }
});
