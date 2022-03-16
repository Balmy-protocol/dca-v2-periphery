import { expect } from 'chai';
import { deployments, ethers, getNamedAccounts } from 'hardhat';
import { JsonRpcSigner, TransactionResponse } from '@ethersproject/providers';
import { constants, wallet } from '@test-utils';
import { given, then, when } from '@test-utils/bdd';
import evm, { snapshot } from '@test-utils/evm';
import { DCAHubCompanion, IERC20 } from '@typechained';
import { DCAHub } from '@mean-finance/dca-v2-core/typechained';
import { ChainlinkRegistry } from '@mean-finance/chainlink-registry/typechained';
import ChainlinkRegistryDeployment from '@mean-finance/chainlink-registry/deployments/polygon/FeedRegistry.json';
import { abi as DCA_HUB_ABI } from '@mean-finance/dca-v2-core/artifacts/contracts/DCAHub/DCAHub.sol/DCAHub.json';
import { abi as IERC20_ABI } from '@openzeppelin/contracts/build/contracts/IERC20.json';
import { BigNumber, utils } from 'ethers';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { SwapInterval } from '@test-utils/interval-utils';
import zrx from '@test-utils/zrx';

const WETH_ADDRESS = '0x7ceb23fd6bc0add59e62ac25578270cff1b9f619';
const MAI_ADDRESS = '0xa3fa99a148fa48d14ed51d610c367c61876997f1';
const WETH_WHALE_ADDRESS = '0xdc9232e2df177d7a12fdff6ecbab114e2231198d';

describe('Swap through DEX for MAI pair', () => {
  // Setup params
  let WETH: IERC20;
  let MAI: IERC20;
  let governor: JsonRpcSigner;
  let cindy: SignerWithAddress, recipient: SignerWithAddress;
  let DCAHubCompanion: DCAHubCompanion;
  let DCAHub: DCAHub;
  let initialPerformedSwaps: number;
  let snapshotId: string;

  // Deposit params
  const RATE = utils.parseEther('10');
  const AMOUNT_OF_SWAPS = 10;

  // Trade params
  let initialHubWETHBalance: BigNumber;
  let reward: BigNumber;
  let toProvide: BigNumber;
  let sentToAgg: BigNumber;
  let receivedFromAgg: BigNumber;

  before(async () => {
    await evm.reset({
      network: 'polygon',
    });
    [cindy, recipient] = await ethers.getSigners();

    await deployments.fixture('DCAHubCompanion', { keepExistingDeployments: false });
    DCAHub = await ethers.getContract('DCAHub');
    DCAHubCompanion = await ethers.getContract('DCAHubCompanion');

    const namedAccounts = await getNamedAccounts();
    const governorAddress = namedAccounts.governor;
    governor = await wallet.impersonate(governorAddress);
    const timelock = await wallet.impersonate('0xE0F0eeA2bdaFCB913A2b2b7938C0Fce1A39f5754');
    await ethers.provider.send('hardhat_setBalance', [governorAddress, '0xffffffffffffffff']);
    await ethers.provider.send('hardhat_setBalance', [timelock._address, '0xffffffffffffffff']);

    // Allow one minute interval
    await DCAHub.connect(governor).addSwapIntervalsToAllowedList([SwapInterval.ONE_MINUTE.seconds]);

    // Add MAI as a stable-coin
    const chainlinkRegistry = await ethers.getContractAt<ChainlinkRegistry>(
      ChainlinkRegistryDeployment.abi,
      ChainlinkRegistryDeployment.address
    );
    await chainlinkRegistry.connect(governor).setFeedProxies([
      {
        base: MAI_ADDRESS,
        quote: '0x0000000000000000000000000000000000000348', // USD
        feed: '0xd8d483d813547CfB624b8Dc33a00F2fcbCd2D428',
      },
    ]);

    WETH = await ethers.getContractAt(IERC20_ABI, WETH_ADDRESS);
    MAI = await ethers.getContractAt(IERC20_ABI, MAI_ADDRESS);
    const wethWhale = await wallet.impersonate(WETH_WHALE_ADDRESS);
    await ethers.provider.send('hardhat_setBalance', [WETH_WHALE_ADDRESS, '0xffffffffffffffff']);

    const depositAmount = RATE.mul(AMOUNT_OF_SWAPS);
    await WETH.connect(wethWhale).transfer(cindy.address, depositAmount);
    await WETH.connect(cindy).approve(DCAHub.address, depositAmount);
    await DCAHub.connect(cindy)['deposit(address,address,uint256,uint32,uint32,address,(address,uint8[])[])'](
      WETH.address,
      MAI.address,
      depositAmount,
      AMOUNT_OF_SWAPS,
      SwapInterval.ONE_MINUTE.seconds,
      cindy.address,
      []
    );

    initialPerformedSwaps = await performedSwaps();
    initialHubWETHBalance = await WETH.balanceOf(DCAHub.address);
    const {
      tokens: [weth],
    } = await DCAHubCompanion.getNextSwapInfo([{ tokenA: WETH_ADDRESS, tokenB: MAI_ADDRESS }]);
    const dexQuote = await zrx.quote({
      chainId: 137,
      sellToken: WETH_ADDRESS,
      buyToken: MAI_ADDRESS,
      sellAmount: weth.reward,
      slippagePercentage: 0.005, // 0.5%
      takerAddress: DCAHubCompanion.address,
      skipValidation: true,
    });
    await DCAHubCompanion.connect(governor).defineDexSupport(dexQuote.to, true);
    const swapTx = await DCAHubCompanion.swapWithDex(
      dexQuote.to,
      [WETH_ADDRESS, MAI_ADDRESS],
      [{ indexTokenA: 0, indexTokenB: 1 }],
      [dexQuote.data],
      false,
      recipient.address,
      constants.MAX_UINT_256
    );

    ({ reward, toProvide, receivedFromAgg, sentToAgg } = await getTransfers(swapTx));

    snapshotId = await snapshot.take();
  });

  when('we are able to find liquidity', () => {
    given(async () => {
      await snapshot.revert(snapshotId);
    });
    then('swap is executed', async () => {
      expect(await performedSwaps()).to.equal(initialPerformedSwaps + 1);
    });
    then('hub balance is correct', async () => {
      const hubWETHBalance = await WETH.balanceOf(DCAHub.address);
      const hubMAIBalance = await MAI.balanceOf(DCAHub.address);
      expect(hubWETHBalance).to.equal(initialHubWETHBalance.sub(reward));
      expect(hubMAIBalance).to.equal(toProvide);
    });
    then('all reward surpluss is sent to leftover recipient', async () => {
      const recipientWETHBalance = await WETH.balanceOf(recipient.address);
      expect(recipientWETHBalance).to.equal(reward.sub(sentToAgg));
    });
    then('all "toProvide" surpluss is sent to leftover recipient', async () => {
      const recipientMAIBalance = await MAI.balanceOf(recipient.address);
      expect(recipientMAIBalance).to.equal(receivedFromAgg.sub(toProvide));
    });
  });

  async function performedSwaps(): Promise<number> {
    const { performedSwaps } = await DCAHub.swapData(MAI_ADDRESS, WETH_ADDRESS, SwapInterval.ONE_MINUTE.mask);
    return performedSwaps;
  }

  async function getTransfers(
    tx: TransactionResponse
  ): Promise<{ reward: BigNumber; toProvide: BigNumber; sentToAgg: BigNumber; receivedFromAgg: BigNumber }> {
    const swappedEvent = await getSwappedEvent(tx);
    const [tokenA, tokenB] = swappedEvent.args.swapInformation.tokens;
    const reward = tokenA.reward.gt(tokenB.reward) ? tokenA.reward : tokenB.reward;
    const toProvide = tokenA.toProvide.gt(tokenB.toProvide) ? tokenA.toProvide : tokenB.toProvide;

    const receivedFromAgg = await findTransferValue(tx, { notFrom: DCAHub, to: DCAHubCompanion });
    const sentToAgg = await findTransferValue(tx, { from: DCAHubCompanion, notTo: DCAHub });
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
      MAI.interface,
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
