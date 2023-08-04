import { expect } from 'chai';
import { ethers } from 'hardhat';
import { JsonRpcSigner, TransactionResponse } from '@ethersproject/providers';
import { constants, wallet } from '@test-utils';
import { contract, given, then, when } from '@test-utils/bdd';
import evm, { snapshot } from '@test-utils/evm';
import { CallerOnlyDCAHubSwapper, IERC20 } from '@typechained';
import { DCAHub } from '@mean-finance/dca-v2-core';
import { abi as DCA_HUB_ABI } from '@mean-finance/dca-v2-core/artifacts/contracts/DCAHub/DCAHub.sol/DCAHub.json';
import { abi as IERC20_ABI } from '@openzeppelin/contracts/build/contracts/IERC20.json';
import { BigNumber, utils } from 'ethers';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { SwapInterval } from '@test-utils/interval-utils';
import forkBlockNumber from '@integration/fork-block-numbers';
import { deploy } from '@integration/utils';

const WETH_ADDRESS = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2';
const USDC_ADDRESS = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48';
const WETH_WHALE_ADDRESS = '0xf04a5cc80b1e94c69b48f5ee68a08cd2f09a7c3e';
const USDC_WHALE_ADDRESS = '0xcffad3200574698b78f32232aa9d63eabd290703';

contract('Swap for caller', () => {
  let WETH: IERC20, USDC: IERC20;
  let governor: JsonRpcSigner;
  let cindy: SignerWithAddress, swapper: SignerWithAddress, recipient: SignerWithAddress;
  let DCAHubSwapper: CallerOnlyDCAHubSwapper;
  let DCAHub: DCAHub;
  let initialPerformedSwaps: number;
  let snapshotId: string;

  const RATE = utils.parseEther('0.1');
  const AMOUNT_OF_SWAPS = 10;

  before(async () => {
    await evm.reset({
      network: 'ethereum',
      blockNumber: forkBlockNumber['swap-for-caller'],
    });
    [cindy, swapper, recipient] = await ethers.getSigners();

    ({ msig: governor } = await deploy());

    DCAHub = await ethers.getContract('DCAHub');
    DCAHubSwapper = await ethers.getContract('CallerOnlyDCAHubSwapper');

    // Allow tokens
    await DCAHub.connect(governor).setAllowedTokens([WETH_ADDRESS, USDC_ADDRESS], [true, true]);

    // Allow one minute interval
    await DCAHub.connect(governor).addSwapIntervalsToAllowedList([SwapInterval.ONE_MINUTE.seconds]);

    // Allow swapper
    await DCAHub.connect(governor).grantRole(await DCAHub.PRIVILEGED_SWAPPER_ROLE(), DCAHubSwapper.address);
    await DCAHub.connect(governor).grantRole(await DCAHub.PRIVILEGED_SWAPPER_ROLE(), swapper.address);

    WETH = await ethers.getContractAt(IERC20_ABI, WETH_ADDRESS);
    USDC = await ethers.getContractAt(IERC20_ABI, USDC_ADDRESS);

    // Send tokens from whales, to our users
    await distributeTokensToUsers();

    const depositAmount = RATE.mul(AMOUNT_OF_SWAPS);
    await WETH.connect(cindy).approve(DCAHub.address, depositAmount);
    await USDC.connect(swapper).approve(DCAHubSwapper.address, BigNumber.from(10).pow(12));
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

  describe('swap for caller', () => {
    when('a swap for caller is executed', () => {
      let rewardWETH: BigNumber, toProvideUSDC: BigNumber;
      let initialHubWETHBalance: BigNumber, initialHubUSDCBalance: BigNumber;
      let initialSwapperUSDCBalance: BigNumber;
      given(async () => {
        initialSwapperUSDCBalance = await USDC.balanceOf(swapper.address);
        initialHubWETHBalance = await WETH.balanceOf(DCAHub.address);
        initialHubUSDCBalance = await USDC.balanceOf(DCAHub.address);
        const swapTx = await DCAHubSwapper.connect(swapper).swapForCaller({
          hub: DCAHub.address,
          tokens: [USDC_ADDRESS, WETH_ADDRESS],
          pairsToSwap: [{ indexTokenA: 0, indexTokenB: 1 }],
          oracleData: [],
          minimumOutput: [0, 0],
          maximumInput: [constants.MAX_UINT_256, constants.MAX_UINT_256],
          recipient: recipient.address,
          deadline: constants.MAX_UINT_256,
        });
        ({ rewardWETH, toProvideUSDC } = await getTransfers(swapTx));
      });
      then('swap is executed', async () => {
        expect(await performedSwaps()).to.equal(initialPerformedSwaps + 1);
      });
      then('hub balance is correct', async () => {
        const hubWETHBalance = await WETH.balanceOf(DCAHub.address);
        const hubUSDCBalance = await USDC.balanceOf(DCAHub.address);
        expect(hubWETHBalance).to.equal(initialHubWETHBalance.sub(RATE));
        expect(hubUSDCBalance).to.equal(initialHubUSDCBalance.add(toProvideUSDC));
      });
      then('all reward is sent to recipient', async () => {
        const recipientWETHBalance = await WETH.balanceOf(recipient.address);
        expect(recipientWETHBalance).to.equal(rewardWETH);
      });
      then('all "toProvide" is taken from swapper', async () => {
        const swapperUSDCBalance = await USDC.balanceOf(swapper.address);
        expect(swapperUSDCBalance).to.equal(initialSwapperUSDCBalance.sub(toProvideUSDC));
      });
    });
  });
  async function distributeTokensToUsers() {
    const wethWhale = await wallet.impersonate(WETH_WHALE_ADDRESS);
    const usdcWhale = await wallet.impersonate(USDC_WHALE_ADDRESS);
    await ethers.provider.send('hardhat_setBalance', [WETH_WHALE_ADDRESS, '0xffffffffffffffff']);
    await ethers.provider.send('hardhat_setBalance', [USDC_WHALE_ADDRESS, '0xffffffffffffffff']);
    await WETH.connect(wethWhale).transfer(cindy.address, BigNumber.from(10).pow(20));
    await WETH.connect(wethWhale).transfer(swapper.address, BigNumber.from(10).pow(20));
    await USDC.connect(usdcWhale).transfer(swapper.address, BigNumber.from(10).pow(12));
  }

  async function performedSwaps(): Promise<number> {
    const { performedSwaps } = await DCAHub.swapData(USDC_ADDRESS, WETH_ADDRESS, SwapInterval.ONE_MINUTE.mask);
    return performedSwaps;
  }

  async function getTransfers(tx: TransactionResponse) {
    const swappedEvent = await getSwappedEvent(tx);
    const [usdc, weth] = swappedEvent.args.swapInformation.tokens;
    const rewardWETH = weth.reward;
    const toProvideUSDC = usdc.toProvide;
    return { rewardWETH, toProvideUSDC };
  }

  function getSwappedEvent(tx: TransactionResponse): Promise<utils.LogDescription> {
    return findLogs(tx, new utils.Interface(DCA_HUB_ABI), 'Swapped');
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
