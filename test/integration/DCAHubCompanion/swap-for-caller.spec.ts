import { expect } from 'chai';
import { deployments, ethers, getNamedAccounts } from 'hardhat';
import { JsonRpcSigner, TransactionResponse } from '@ethersproject/providers';
import { constants, wallet } from '@test-utils';
import { given, then, when } from '@test-utils/bdd';
import evm, { snapshot } from '@test-utils/evm';
import { DCAHubCompanion, IERC20 } from '@typechained';
import { DCAHub } from '@mean-finance/dca-v2-core/typechained';
import { abi as DCA_HUB_ABI } from '@mean-finance/dca-v2-core/artifacts/contracts/DCAHub/DCAHub.sol/DCAHub.json';
import { abi as IERC20_ABI } from '@openzeppelin/contracts/build/contracts/IERC20.json';
import { BigNumber, utils } from 'ethers';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signers';
import { SwapInterval } from '@test-utils/interval-utils';
import forkBlockNumber from '@integration/fork-block-numbers';

const WETH_ADDRESS = '0x4200000000000000000000000000000000000006';
const USDC_ADDRESS = '0x7f5c764cbc14f9669b88837ca1490cca17c31607';
const WETH_WHALE_ADDRESS = '0xaa30d6bba6285d0585722e2440ff89e23ef68864';
const USDC_WHALE_ADDRESS = '0xad7b4c162707e0b2b5f6fddbd3f8538a5fba0d60';

describe('Swap for caller', () => {
  let WETH: IERC20, USDC: IERC20;
  let governor: JsonRpcSigner;
  let cindy: SignerWithAddress, swapper: SignerWithAddress, recipient: SignerWithAddress;
  let DCAHubCompanion: DCAHubCompanion;
  let DCAHub: DCAHub;
  let initialPerformedSwaps: number;
  let snapshotId: string;

  const RATE = utils.parseEther('0.1');
  const AMOUNT_OF_SWAPS = 10;

  before(async () => {
    await evm.reset({
      network: 'optimism',
      blockNumber: forkBlockNumber['swap-for-caller'],
    });
    [cindy, swapper, recipient] = await ethers.getSigners();

    await deployments.fixture('DCAHubCompanion', { keepExistingDeployments: false });
    DCAHub = await ethers.getContract('DCAHub');
    DCAHubCompanion = await ethers.getContract('DCAHubCompanion');

    const namedAccounts = await getNamedAccounts();
    const governorAddress = namedAccounts.governor;
    governor = await wallet.impersonate(governorAddress);
    await ethers.provider.send('hardhat_setBalance', [governorAddress, '0xffffffffffffffff']);

    // Allow one minute interval
    await DCAHub.connect(governor).addSwapIntervalsToAllowedList([SwapInterval.ONE_MINUTE.seconds]);

    WETH = await ethers.getContractAt(IERC20_ABI, WETH_ADDRESS);
    USDC = await ethers.getContractAt(IERC20_ABI, USDC_ADDRESS);

    // Send tokens from whales, to our users
    await distributeTokensToUsers();

    const depositAmount = RATE.mul(AMOUNT_OF_SWAPS);
    await WETH.connect(cindy).approve(DCAHub.address, depositAmount);
    await USDC.connect(swapper).approve(DCAHubCompanion.address, BigNumber.from(10).pow(12));
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
        const swapTx = await DCAHubCompanion.connect(swapper).swapForCaller(
          [WETH_ADDRESS, USDC_ADDRESS],
          [{ indexTokenA: 0, indexTokenB: 1 }],
          [0, 0],
          [constants.MAX_UINT_256, constants.MAX_UINT_256],
          recipient.address,
          constants.MAX_UINT_256
        );
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
    const [weth, usdc] = swappedEvent.args.swapInformation.tokens;
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
