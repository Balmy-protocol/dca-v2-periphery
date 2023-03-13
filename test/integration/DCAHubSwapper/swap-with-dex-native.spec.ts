import { expect } from 'chai';
import { ethers } from 'hardhat';
import { JsonRpcSigner, TransactionResponse } from '@ethersproject/providers';
import { constants, wallet } from '@test-utils';
import { contract, given, then, when } from '@test-utils/bdd';
import evm, { snapshot } from '@test-utils/evm';
import { IERC20, ThirdPartyDCAHubSwapper } from '@typechained';
import { StatefulChainlinkOracle } from '@mean-finance/oracles';
import { DCAHub } from '@mean-finance/dca-v2-core';
import { abi as DCA_HUB_ABI } from '@mean-finance/dca-v2-core/artifacts/contracts/DCAHub/DCAHub.sol/DCAHub.json';
import { abi as IERC20_ABI } from '@openzeppelin/contracts/build/contracts/IERC20.json';
import { BigNumber, BigNumberish, BytesLike, utils } from 'ethers';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { SwapInterval } from '@test-utils/interval-utils';
import zrx from '@test-utils/dexes/zrx';
import { deploy } from '@integration/utils';

const ETH_ADDRESS = '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
const WETH_ADDRESS = '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2';
const USDC_ADDRESS = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48';
// USDC < WETH
const WETH_WHALE_ADDRESS = '0xf04a5cc80b1e94c69b48f5ee68a08cd2f09a7c3e';

contract('Swap with DEX, using native', () => {
  const ABI_CODER = new utils.AbiCoder();
  let WETH: IERC20;
  let USDC: IERC20;
  let governor: JsonRpcSigner, timelock: JsonRpcSigner;
  let cindy: SignerWithAddress, recipient: SignerWithAddress, swapStarter: SignerWithAddress;
  let DCAHubSwapper: ThirdPartyDCAHubSwapper;
  let DCAHub: DCAHub;
  let initialPerformedSwaps: number;
  let snapshotId: string;

  const RATE = utils.parseEther('0.1');
  const AMOUNT_OF_SWAPS = 10;

  before(async () => {
    await evm.reset({
      network: 'ethereum',
    });

    [cindy, swapStarter, recipient] = await ethers.getSigners();

    ({ msig: governor, timelock } = await deploy('ThirdPartyDCAHubSwapper'));
    DCAHub = await ethers.getContract('DCAHub');
    DCAHubSwapper = await ethers.getContract('ThirdPartyDCAHubSwapper');
    const chainlinkOracle = await ethers.getContract<StatefulChainlinkOracle>('StatefulChainlinkOracle');

    // Allow tokens
    await DCAHub.connect(governor).setAllowedTokens([WETH_ADDRESS, USDC_ADDRESS], [true, true]);
    // Allow one minute interval
    await DCAHub.connect(governor).addSwapIntervalsToAllowedList([SwapInterval.ONE_MINUTE.seconds]);
    //We are setting a very high fee, so that there is a surplus in both reward and toProvide tokens
    await DCAHub.connect(timelock).setSwapFee(20000); // 2%
    // Allow swap started
    await DCAHub.connect(governor).grantRole(await DCAHub.PRIVILEGED_SWAPPER_ROLE(), swapStarter.address);

    await chainlinkOracle.connect(governor).addMappings([WETH_ADDRESS], ['0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE']);

    WETH = await ethers.getContractAt(IERC20_ABI, WETH_ADDRESS);
    USDC = await ethers.getContractAt(IERC20_ABI, USDC_ADDRESS);
    const wethWhale = await wallet.impersonate(WETH_WHALE_ADDRESS);
    await ethers.provider.send('hardhat_setBalance', [WETH_WHALE_ADDRESS, '0xffffffffffffffff']);

    const depositAmount = RATE.mul(AMOUNT_OF_SWAPS);
    await WETH.connect(wethWhale).transfer(cindy.address, depositAmount);
    await WETH.connect(cindy).approve(DCAHub.address, depositAmount);
    await DCAHub.connect(cindy)['deposit(address,address,uint256,uint32,uint32,address,(address,uint8[])[])'](
      WETH.address,
      USDC.address,
      depositAmount,
      AMOUNT_OF_SWAPS,
      SwapInterval.ONE_MINUTE.seconds,
      cindy.address,
      []
    );
    initialPerformedSwaps = await performedSwaps();

    snapshotId = await snapshot.take();
  });
  beforeEach('Deploy and configure', async () => {
    await snapshot.revert(snapshotId);
  });

  describe('swap with dex', () => {
    when('executing a swap with 0x', () => {
      let initialHubWETHBalance: BigNumber, initialHubUSDCBalance: BigNumber, initialRecipientUSDCBalance: BigNumber;
      let reward: BigNumber, receivedFromAgg: BigNumber;
      given(async () => {
        initialHubWETHBalance = await WETH.balanceOf(DCAHub.address);
        initialHubUSDCBalance = await USDC.balanceOf(DCAHub.address);
        initialRecipientUSDCBalance = await USDC.balanceOf(recipient.address);
        const dexQuote = await zrx.quote({
          chainId: 1,
          sellToken: ETH_ADDRESS,
          buyToken: USDC_ADDRESS,
          sellAmount: RATE,
          slippagePercentage: 0.01, // 1%
          takerAddress: DCAHubSwapper.address,
          skipValidation: true,
        });
        const tokensInSwap = [USDC_ADDRESS, WETH_ADDRESS];
        const indexesInSwap = [{ indexTokenA: 0, indexTokenB: 1 }];
        const data = encode({
          allowanceTargets: [],
          executions: [{ swapper: dexQuote.to, data: dexQuote.data, value: RATE }],
          sendToProvideLeftoverToHub: true,
        });
        const swapTx = await DCAHubSwapper.connect(swapStarter).executeSwap(DCAHub.address, tokensInSwap, indexesInSwap, [0, 0], data, '0x', {
          value: RATE,
        });
        ({ reward, receivedFromAgg } = await getTransfers(swapTx));
      });
      then('swap is executed', async () => {
        expect(await performedSwaps()).to.equal(initialPerformedSwaps + 1);
      });
      then('hub balance is correct', async () => {
        const hubWETHBalance = await WETH.balanceOf(DCAHub.address);
        const hubUSDCBalance = await USDC.balanceOf(DCAHub.address);
        expect(hubWETHBalance).to.equal(initialHubWETHBalance.sub(reward));
        expect(hubUSDCBalance).to.equal(initialHubUSDCBalance.add(receivedFromAgg));
      });
      then('all reward is sent to leftover recipient', async () => {
        const recipientWETHBalance = await WETH.balanceOf(recipient.address);
        expect(recipientWETHBalance).to.equal(reward);
      });
      then('leftover recipient has no "toProvide" balance', async () => {
        const recipientUSDCBalance = await USDC.balanceOf(recipient.address);
        expect(recipientUSDCBalance).to.equal(initialRecipientUSDCBalance);
      });
    });
  });

  type SwapData = {
    allowanceTargets?: { token: string; spender: string; amount: BigNumberish }[];
    executions: { data: BytesLike; swapper: string; value: BigNumberish }[];
    extraTokens?: string[];
    sendToProvideLeftoverToHub?: boolean;
  };
  function encode(bytes: SwapData) {
    return ABI_CODER.encode(
      ['tuple(uint256, tuple(address, address, uint256)[], tuple(address, uint256, bytes)[], address[], address, bool)'],
      [
        [
          constants.MAX_UINT_256,
          bytes.allowanceTargets?.map(({ token, spender, amount }) => [token, spender, amount]) ?? [],
          bytes.executions?.map(({ swapper, data, value }) => [swapper, value, data]) ?? [],
          bytes.extraTokens ?? [],
          recipient.address,
          bytes.sendToProvideLeftoverToHub ?? false,
        ],
      ]
    );
  }

  async function performedSwaps(): Promise<number> {
    const { performedSwaps } = await DCAHub.swapData(USDC_ADDRESS, WETH_ADDRESS, SwapInterval.ONE_MINUTE.mask);
    return performedSwaps;
  }

  async function getTransfers(
    tx: TransactionResponse
  ): Promise<{ reward: BigNumber; toProvide: BigNumber; sentToAgg: BigNumber; receivedFromAgg: BigNumber }> {
    const swappedEvent = await getSwappedEvent(tx);
    const [tokenA, tokenB] = swappedEvent.args.swapInformation.tokens;
    const reward = tokenA.reward.gt(tokenB.reward) ? tokenA.reward : tokenB.reward;
    const toProvide = tokenA.toProvide.gt(tokenB.toProvide) ? tokenA.toProvide : tokenB.toProvide;

    const receivedFromAgg = await findTransferValue(tx, { notFrom: DCAHub, to: DCAHubSwapper });
    const sentToAgg = await findTransferValue(tx, { from: DCAHubSwapper, notTo: DCAHub });
    return { reward, toProvide, receivedFromAgg, sentToAgg };
  }

  function getSwappedEvent(tx: TransactionResponse): Promise<utils.LogDescription> {
    return findLogs(tx, new utils.Interface(DCA_HUB_ABI), 'Swapped');
  }

  async function findTransferValue(
    tx: TransactionResponse,
    {
      from,
      notFrom,
      to,
      notTo,
    }: { from?: { address: string }; notFrom?: { address: string }; to?: { address: string }; notTo?: { address: string } }
  ) {
    const log = await findLogs(
      tx,
      USDC.interface,
      'Transfer',
      (log) =>
        (!from || log.args.from === from.address) &&
        (!to || log.args.to === to.address) &&
        (!notFrom || log.args.from !== notFrom.address) &&
        (!notTo || log.args.to !== notTo.address)
    );
    return BigNumber.from(log.args.value);
  }

  async function findLogs(
    tx: TransactionResponse,
    contractInterface: utils.Interface,
    eventTopic: string,
    extraFilter?: (_: utils.LogDescription) => boolean
  ): Promise<utils.LogDescription> {
    const txReceipt = await tx.wait();
    const logs = txReceipt.logs;
    for (let i = 0; i < logs.length; i++) {
      for (let x = 0; x < logs[i].topics.length; x++) {
        if (logs[i].topics[x] === contractInterface.getEventTopic(eventTopic)) {
          const parsedLog = contractInterface.parseLog(logs[i]);
          if (!extraFilter || extraFilter(parsedLog)) {
            return parsedLog;
          }
        }
      }
    }
    return Promise.reject();
  }
});
