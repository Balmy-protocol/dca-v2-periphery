import { expect } from 'chai';
import { deployments, ethers, getNamedAccounts } from 'hardhat';
import { JsonRpcSigner, TransactionResponse } from '@ethersproject/providers';
import { constants, wallet } from '@test-utils';
import { contract, given, then, when } from '@test-utils/bdd';
import evm, { snapshot } from '@test-utils/evm';
import { DCAHubCompanion, DCAHubSwapper, IERC20 } from '@typechained';
import { DCAHub } from '@mean-finance/dca-v2-core/typechained';
import { abi as DCA_HUB_ABI } from '@mean-finance/dca-v2-core/artifacts/contracts/DCAHub/DCAHub.sol/DCAHub.json';
import { abi as IERC20_ABI } from '@openzeppelin/contracts/build/contracts/IERC20.json';
import { BigNumber, utils } from 'ethers';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { SwapInterval } from '@test-utils/interval-utils';
import zrx from '@test-utils/dexes/zrx';
import { DeterministicFactory, DeterministicFactory__factory } from '@mean-finance/deterministic-factory/typechained';

const WETH_ADDRESS = '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2';
const USDC_ADDRESS = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48';
// USDC < WETH
const WETH_WHALE_ADDRESS = '0xf04a5cc80b1e94c69b48f5ee68a08cd2f09a7c3e';

contract('Single pair swap with DEX', () => {
  let WETH: IERC20;
  let USDC: IERC20;
  let governor: JsonRpcSigner;
  let cindy: SignerWithAddress, recipient: SignerWithAddress;
  let DCAHubSwapper: DCAHubSwapper;
  let DCAHubCompanion: DCAHubCompanion;
  let DCAHub: DCAHub;
  let initialPerformedSwaps: number;
  let snapshotId: string;

  const RATE = utils.parseEther('0.1');
  const AMOUNT_OF_SWAPS = 10;

  before(async () => {
    await evm.reset({
      network: 'mainnet',
      skipHardhatDeployFork: true,
    });

    [cindy, recipient] = await ethers.getSigners();

    const namedAccounts = await getNamedAccounts();
    const governorAddress = namedAccounts.governor;
    governor = await wallet.impersonate(governorAddress);
    await ethers.provider.send('hardhat_setBalance', [governorAddress, '0xffffffffffffffff']);

    const deterministicFactory = await ethers.getContractAt<DeterministicFactory>(
      DeterministicFactory__factory.abi,
      '0xbb681d77506df5CA21D2214ab3923b4C056aa3e2'
    );

    await deterministicFactory.connect(governor).grantRole(await deterministicFactory.DEPLOYER_ROLE(), namedAccounts.deployer);

    await deployments.run(['DCAHub', 'DCAHubCompanion', 'DCAHubSwapper'], {
      resetMemory: true,
      deletePreviousDeployments: false,
      writeDeploymentsToFiles: false,
    });
    DCAHub = await ethers.getContract('DCAHub');
    DCAHubCompanion = await ethers.getContract('DCAHubCompanion');
    DCAHubSwapper = await ethers.getContract('DCAHubSwapper');

    const timelockContract = await ethers.getContract('Timelock');
    const timelock = await wallet.impersonate(timelockContract.address);
    await ethers.provider.send('hardhat_setBalance', [timelockContract.address, '0xffffffffffffffff']);

    // Allow tokens
    await DCAHub.connect(governor).setAllowedTokens([WETH_ADDRESS, USDC_ADDRESS], [true, true]);
    // Allow one minute interval
    await DCAHub.connect(governor).addSwapIntervalsToAllowedList([SwapInterval.ONE_MINUTE.seconds]);
    //We are setting a very high fee, so that there is a surplus in both reward and toProvide tokens
    await DCAHub.connect(timelock).setSwapFee(20000); // 2%

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
    swapWithDexTest({
      dex: '0x',
      isSwapAndTransfer: false,
      sendLeftoverToHub: false,
    });
    swapWithDexTest({
      dex: '0x',
      isSwapAndTransfer: false,
      sendLeftoverToHub: true,
    });
  });

  function swapWithDexTest({
    dex,
    isSwapAndTransfer,
    sendLeftoverToHub,
  }: {
    dex: string;
    isSwapAndTransfer: boolean;
    sendLeftoverToHub: boolean;
  }) {
    const title = `executing a swap with ${dex}, ${isSwapAndTransfer ? 'with' : 'without'} swap and transfer and ${
      !sendLeftoverToHub ? 'without ' : ''
    }sending leftover to hub`;
    when(title, () => {
      let initialHubWETHBalance: BigNumber, initialHubUSDCBalance: BigNumber, initialRecipientUSDCBalance: BigNumber;
      let reward: BigNumber, toProvide: BigNumber, sentToAgg: BigNumber, receivedFromAgg: BigNumber;
      given(async () => {
        initialHubWETHBalance = await WETH.balanceOf(DCAHub.address);
        initialHubUSDCBalance = await USDC.balanceOf(DCAHub.address);
        initialRecipientUSDCBalance = await USDC.balanceOf(recipient.address);
        const {
          tokens: [, weth],
        } = await DCAHubCompanion.getNextSwapInfo([{ tokenA: WETH_ADDRESS, tokenB: USDC_ADDRESS }]);
        const dexQuote = await zrx.quote({
          chainId: 1,
          sellToken: WETH_ADDRESS,
          buyToken: USDC_ADDRESS,
          sellAmount: weth.reward,
          slippagePercentage: 0.01, // 1%
          takerAddress: DCAHubSwapper.address,
          skipValidation: true,
        });
        await DCAHubSwapper.connect(governor).defineDexSupport(dexQuote.to, true);
        const dexFunction = sendLeftoverToHub ? 'swapWithDexAndShareLeftoverWithHub' : 'swapWithDex';
        const tokensInSwap = [USDC_ADDRESS, WETH_ADDRESS];
        const indexesInSwap = [{ indexTokenA: 0, indexTokenB: 1 }];
        const swapTx = await DCAHubSwapper[dexFunction](
          dexQuote.to,
          dexQuote.allowanceTarget,
          tokensInSwap,
          indexesInSwap,
          [dexQuote.data],
          isSwapAndTransfer,
          recipient.address,
          constants.MAX_UINT_256
        );
        ({ reward, toProvide, receivedFromAgg, sentToAgg } = await getTransfers(swapTx));
      });
      then('swap is executed', async () => {
        expect(await performedSwaps()).to.equal(initialPerformedSwaps + 1);
      });
      then('hub balance is correct', async () => {
        const hubWETHBalance = await WETH.balanceOf(DCAHub.address);
        const hubUSDCBalance = await USDC.balanceOf(DCAHub.address);
        expect(hubWETHBalance).to.equal(initialHubWETHBalance.sub(reward));
        if (!sendLeftoverToHub) {
          expect(hubUSDCBalance).to.equal(initialHubUSDCBalance.add(toProvide));
        } else {
          expect(hubUSDCBalance).to.equal(initialHubUSDCBalance.add(receivedFromAgg));
        }
      });
      then('all reward surpluss is sent to leftover recipient', async () => {
        const recipientWETHBalance = await WETH.balanceOf(recipient.address);
        expect(recipientWETHBalance).to.equal(reward.sub(sentToAgg));
      });
      if (!sendLeftoverToHub) {
        then('all "toProvide" surpluss is sent to leftover recipient', async () => {
          const recipientUSDCBalance = await USDC.balanceOf(recipient.address);
          expect(recipientUSDCBalance.sub(initialRecipientUSDCBalance)).to.equal(receivedFromAgg.sub(toProvide));
        });
      } else {
        then('leftover recipient has no "toProvide" balance', async () => {
          const recipientUSDCBalance = await USDC.balanceOf(recipient.address);
          expect(recipientUSDCBalance).to.equal(initialRecipientUSDCBalance);
        });
      }
    });
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
