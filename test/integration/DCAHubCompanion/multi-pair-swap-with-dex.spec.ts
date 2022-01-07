import { expect } from 'chai';
import { deployments, ethers, getNamedAccounts } from 'hardhat';
import { JsonRpcSigner, TransactionResponse } from '@ethersproject/providers';
import { constants, wallet } from '@test-utils';
import { given, then, when } from '@test-utils/bdd';
import evm, { snapshot } from '@test-utils/evm';
import { DCAHubCompanion, IERC20 } from '@typechained';
import { DCAHub } from '@mean-finance/dca-v2-core/typechained';
import { abi as DCA_HUB_ABI } from '@mean-finance/dca-v2-core/artifacts/contracts/DCAHub/DCAHub.sol/DCAHub.json';
import { getNodeUrl } from '@utils/network';
import { abi as IERC20_ABI } from '@openzeppelin/contracts/build/contracts/IERC20.json';
import { BigNumber, utils } from 'ethers';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signers';
import { SwapInterval } from '@test-utils/interval-utils';
import zrx from '@test-utils/zrx';

const WETH_ADDRESS = '0x4200000000000000000000000000000000000006';
const USDC_ADDRESS = '0x7f5c764cbc14f9669b88837ca1490cca17c31607';
const LINK_ADDRESS = '0x350a791bfc2c21f9ed5d10980dad2e2638ffa7f6';
const WETH_WHALE_ADDRESS = '0xaa30d6bba6285d0585722e2440ff89e23ef68864';

describe('Multi pair swap with DEX', () => {
  let WETH: IERC20, USDC: IERC20, LINK: IERC20;
  let governor: JsonRpcSigner;
  let cindy: SignerWithAddress, recipient: SignerWithAddress;
  let DCAHubCompanion: DCAHubCompanion;
  let DCAHub: DCAHub;
  let initialPerformedSwaps: number;
  let snapshotId: string;

  const RATE = utils.parseEther('0.1');
  const AMOUNT_OF_SWAPS = 10;

  before(async () => {
    await evm.reset({
      network: 'optimism',
    });
    [cindy, recipient] = await ethers.getSigners();

    await deployments.fixture('DCAHubCompanion', { keepExistingDeployments: false });
    DCAHub = await ethers.getContract('DCAHub');
    DCAHubCompanion = await ethers.getContract('DCAHubCompanion');

    const namedAccounts = await getNamedAccounts();
    const governorAddress = namedAccounts.governor;
    governor = await wallet.impersonate(governorAddress);
    const timelock = await wallet.impersonate('0x19BB8c1130649BD2a114c2f2d4C3a6AFa3Bd4944');
    await ethers.provider.send('hardhat_setBalance', [governorAddress, '0xffffffffffffffff']);
    await ethers.provider.send('hardhat_setBalance', [timelock._address, '0xffffffffffffffff']);

    // Allow one minute interval
    await DCAHub.connect(governor).addSwapIntervalsToAllowedList([SwapInterval.ONE_MINUTE.seconds]);
    //We are setting a very high fee, so that there is a surplus in both reward and toProvide tokens
    await DCAHub.connect(timelock).setSwapFee(20000); // 2%

    WETH = await ethers.getContractAt(IERC20_ABI, WETH_ADDRESS);
    USDC = await ethers.getContractAt(IERC20_ABI, USDC_ADDRESS);
    LINK = await ethers.getContractAt(IERC20_ABI, LINK_ADDRESS);
    const wethWhale = await wallet.impersonate(WETH_WHALE_ADDRESS);
    await ethers.provider.send('hardhat_setBalance', [WETH_WHALE_ADDRESS, '0xffffffffffffffff']);

    const depositAmount = RATE.mul(AMOUNT_OF_SWAPS);
    await WETH.connect(wethWhale).transfer(cindy.address, depositAmount.mul(2));
    await WETH.connect(cindy).approve(DCAHub.address, depositAmount.mul(2));
    await DCAHub.connect(cindy).deposit(
      WETH.address,
      USDC.address,
      depositAmount,
      AMOUNT_OF_SWAPS,
      SwapInterval.ONE_MINUTE.seconds,
      cindy.address,
      []
    );
    await DCAHub.connect(cindy).deposit(
      WETH.address,
      LINK.address,
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
    when('swapping multiple pairs with 0x', () => {
      let rewardWETH: BigNumber,
        toProvideUSDC: BigNumber,
        toProvideLINK: BigNumber,
        sentToAgg: BigNumber[],
        receivedUSDCFromAgg: BigNumber,
        receivedLINKFromAgg: BigNumber,
        receivedWETHFromAgg: BigNumber;
      let initialHubWETHBalance: BigNumber, initialHubUSDCBalance: BigNumber, initialHubLINKBalance: BigNumber;
      given(async () => {
        initialHubWETHBalance = await WETH.balanceOf(DCAHub.address);
        initialHubUSDCBalance = await USDC.balanceOf(DCAHub.address);
        initialHubLINKBalance = await LINK.balanceOf(DCAHub.address);
        const {
          tokens: [link, , usdc],
        } = await DCAHubCompanion.getNextSwapInfo([
          { tokenA: WETH_ADDRESS, tokenB: USDC_ADDRESS },
          { tokenA: WETH_ADDRESS, tokenB: LINK_ADDRESS },
        ]);
        const dexQuotes = await Promise.all([
          zrx.quote({
            chainId: 10,
            sellToken: WETH_ADDRESS,
            buyToken: USDC_ADDRESS,
            buyAmount: usdc.toProvide,
            sippagePercentage: 0.001,
          }),
          zrx.quote({
            chainId: 10,
            sellToken: WETH_ADDRESS,
            buyToken: LINK_ADDRESS,
            buyAmount: link.toProvide,
            sippagePercentage: 0.001,
          }),
        ]);
        const dexAddress = dexQuotes[0].to;
        await DCAHubCompanion.connect(governor).defineDexSupport(dexAddress, true);
        const tokensInSwap = [LINK_ADDRESS, WETH_ADDRESS, USDC_ADDRESS];
        const indexesInSwap = [
          { indexTokenA: 0, indexTokenB: 1 },
          { indexTokenA: 1, indexTokenB: 2 },
        ];
        const swapTx = await DCAHubCompanion.swapWithDex(
          dexAddress,
          tokensInSwap,
          indexesInSwap,
          dexQuotes.map(({ data }) => data),
          false,
          recipient.address,
          constants.MAX_UINT_256
        );
        ({ rewardWETH, toProvideUSDC, toProvideLINK, receivedUSDCFromAgg, receivedLINKFromAgg, sentToAgg, receivedWETHFromAgg } =
          await getTransfers(swapTx));
      });
      then('swap is executed', async () => {
        expect(await performedSwaps()).to.equal(initialPerformedSwaps + 1);
      });
      then('hub balance is correct', async () => {
        const hubWETHBalance = await WETH.balanceOf(DCAHub.address);
        const hubUSDCBalance = await USDC.balanceOf(DCAHub.address);
        const hubLINKBalance = await LINK.balanceOf(DCAHub.address);
        expect(hubWETHBalance).to.equal(initialHubWETHBalance.sub(rewardWETH));
        expect(hubUSDCBalance).to.equal(initialHubUSDCBalance.add(toProvideUSDC));
        expect(hubLINKBalance).to.equal(initialHubLINKBalance.add(toProvideLINK));
      });
      then('all reward surpluss is sent to leftover recipient', async () => {
        const expected = sentToAgg.reduce((accum, curr) => accum.sub(curr), rewardWETH).add(receivedWETHFromAgg); // Sometimes, the aggregator might return unspent WETH to the Companion
        const recipientWETHBalance = await WETH.balanceOf(recipient.address);
        expect(recipientWETHBalance).to.equal(expected);
      });
      then('all "toProvide" surpluss is sent to leftover recipient', async () => {
        const recipientUSDCBalance = await USDC.balanceOf(recipient.address);
        expect(recipientUSDCBalance).to.equal(receivedUSDCFromAgg.sub(toProvideUSDC));
        const recipientLINKBalance = await LINK.balanceOf(recipient.address);
        expect(recipientLINKBalance).to.equal(receivedLINKFromAgg.sub(toProvideLINK));
      });
    });
  });

  async function performedSwaps(): Promise<number> {
    const { performedSwaps } = await DCAHub.swapData(USDC_ADDRESS, WETH_ADDRESS, SwapInterval.ONE_MINUTE.mask);
    return performedSwaps;
  }

  async function getTransfers(tx: TransactionResponse) {
    const swappedEvent = await getSwappedEvent(tx);
    const [link, weth, usdc] = swappedEvent.args.swapInformation.tokens;
    const rewardWETH = weth.reward;
    const toProvideUSDC = usdc.toProvide;
    const toProvideLINK = link.toProvide;

    const [receivedUSDCFromAgg] = await findTransferValue(tx, USDC_ADDRESS, { notFrom: DCAHub, to: DCAHubCompanion });
    const [receivedLINKFromAgg] = await findTransferValue(tx, LINK_ADDRESS, { notFrom: DCAHub, to: DCAHubCompanion });
    const [receivedWETHFromAgg] = await findTransferValue(tx, WETH_ADDRESS, { notFrom: DCAHub, to: DCAHubCompanion });
    const sentToAgg = await findTransferValue(tx, WETH_ADDRESS, { from: DCAHubCompanion, notTo: [DCAHub, recipient] });
    return { rewardWETH, toProvideUSDC, toProvideLINK, receivedUSDCFromAgg, receivedLINKFromAgg, sentToAgg, receivedWETHFromAgg };
  }

  async function getSwappedEvent(tx: TransactionResponse): Promise<utils.LogDescription> {
    const [event] = await findLogs(tx, new utils.Interface(DCA_HUB_ABI), 'Swapped');
    return event;
  }

  async function findTransferValue(
    tx: TransactionResponse,
    tokenAddress: string,
    {
      from,
      notFrom,
      to,
      notTo,
    }: { from?: { address: string }; notFrom?: { address: string }; to?: { address: string }; notTo?: { address: string }[] }
  ) {
    const logs = await findLogs(
      tx,
      USDC.interface,
      'Transfer',
      (log) =>
        (!from || log.args.from === from.address) &&
        (!to || log.args.to === to.address) &&
        (!notFrom || log.args.from !== notFrom.address) &&
        (!notTo || !notTo.some(({ address }) => address === log.args.to)),
      tokenAddress
    );
    return logs.map((log) => BigNumber.from(log.args.value));
  }

  async function findLogs(
    tx: TransactionResponse,
    contractInterface: utils.Interface,
    eventTopic: string,
    extraFilter?: (_: utils.LogDescription) => boolean,
    byAddress?: string
  ): Promise<utils.LogDescription[]> {
    const result: utils.LogDescription[] = [];
    const txReceipt = await tx.wait();
    const logs = txReceipt.logs;
    for (let i = 0; i < logs.length; i++) {
      for (let x = 0; x < logs[i].topics.length; x++) {
        if (
          (!byAddress || logs[i].address.toLowerCase() === byAddress.toLowerCase()) &&
          logs[i].topics[x] === contractInterface.getEventTopic(eventTopic)
        ) {
          const parsedLog = contractInterface.parseLog(logs[i]);
          if (!extraFilter || extraFilter(parsedLog)) {
            result.push(parsedLog);
          }
        }
      }
    }
    return result;
  }
});
