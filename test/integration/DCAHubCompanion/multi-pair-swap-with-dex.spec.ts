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
import zrx from '@test-utils/zrx';

const WETH_ADDRESS = '0x7ceb23fd6bc0add59e62ac25578270cff1b9f619';
const USDC_ADDRESS = '0x2791bca1f2de4661ed88a30c99a7a9449aa84174';
const LINK_ADDRESS = '0x53e0bca35ec356bd5dddfebbd1fc0fd03fabad39';
const WETH_WHALE_ADDRESS = '0xdc9232e2df177d7a12fdff6ecbab114e2231198d';

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
    //We are setting a very high fee, so that there is a surplus in both reward and toProvide tokens
    await DCAHub.connect(timelock).setSwapFee(50000); // 5%

    WETH = await ethers.getContractAt(IERC20_ABI, WETH_ADDRESS);
    USDC = await ethers.getContractAt(IERC20_ABI, USDC_ADDRESS);
    LINK = await ethers.getContractAt(IERC20_ABI, LINK_ADDRESS);
    const wethWhale = await wallet.impersonate(WETH_WHALE_ADDRESS);
    await ethers.provider.send('hardhat_setBalance', [WETH_WHALE_ADDRESS, '0xffffffffffffffff']);

    const depositAmount = RATE.mul(AMOUNT_OF_SWAPS);
    await WETH.connect(wethWhale).transfer(cindy.address, depositAmount.mul(2));
    await WETH.connect(cindy).approve(DCAHub.address, depositAmount.mul(2));
    await DCAHub.connect(cindy)['deposit(address,address,uint256,uint32,uint32,address,(address,uint8[])[])'](
      WETH.address,
      USDC.address,
      depositAmount,
      AMOUNT_OF_SWAPS,
      SwapInterval.ONE_MINUTE.seconds,
      cindy.address,
      []
    );
    await DCAHub.connect(cindy)['deposit(address,address,uint256,uint32,uint32,address,(address,uint8[])[])'](
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
        sentWETHToAgg: BigNumber[],
        receivedUSDCFromAgg: BigNumber,
        receivedLINKFromAgg: BigNumber,
        receivedWETHFromAgg: BigNumber[];
      let initialHubWETHBalance: BigNumber, initialHubUSDCBalance: BigNumber, initialHubLINKBalance: BigNumber;
      given(async () => {
        initialHubWETHBalance = await WETH.balanceOf(DCAHub.address);
        initialHubUSDCBalance = await USDC.balanceOf(DCAHub.address);
        initialHubLINKBalance = await LINK.balanceOf(DCAHub.address);
        const {
          tokens: [usdc, link],
        } = await DCAHubCompanion.getNextSwapInfo([
          { tokenA: WETH_ADDRESS, tokenB: USDC_ADDRESS },
          { tokenA: WETH_ADDRESS, tokenB: LINK_ADDRESS },
        ]);
        const dexQuotes = await Promise.all([
          zrx.quote({
            chainId: 137,
            sellToken: WETH_ADDRESS,
            buyToken: USDC_ADDRESS,
            buyAmount: usdc.toProvide,
            sippagePercentage: 0.01,
            takerAddress: DCAHubCompanion.address,
            skipValidation: true,
          }),
          zrx.quote({
            chainId: 137,
            sellToken: WETH_ADDRESS,
            buyToken: LINK_ADDRESS,
            buyAmount: link.toProvide,
            sippagePercentage: 0.01,
            takerAddress: DCAHubCompanion.address,
            skipValidation: true,
          }),
        ]);
        const dexAddress = dexQuotes[0].to;
        await DCAHubCompanion.connect(governor).defineDexSupport(dexAddress, true);
        const tokensInSwap = [USDC_ADDRESS, LINK_ADDRESS, WETH_ADDRESS];
        const indexesInSwap = [
          { indexTokenA: 0, indexTokenB: 2 },
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
        ({ rewardWETH, toProvideUSDC, toProvideLINK, receivedUSDCFromAgg, receivedLINKFromAgg, sentWETHToAgg, receivedWETHFromAgg } =
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
        const sent = sentWETHToAgg.reduce((accum, curr) => accum.sub(curr), rewardWETH);
        const expected = receivedWETHFromAgg.reduce((accum, curr) => accum.add(curr), sent); // Sometimes, the aggregator might return unspent WETH to the Companion
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
    const [usdc, link, weth] = swappedEvent.args.swapInformation.tokens;
    const rewardWETH = weth.reward;
    const toProvideUSDC = usdc.toProvide;
    const toProvideLINK = link.toProvide;

    const [receivedUSDCFromAgg] = await findTransferValue(tx, USDC_ADDRESS, { notFrom: DCAHub, to: DCAHubCompanion });
    const [receivedLINKFromAgg] = await findTransferValue(tx, LINK_ADDRESS, { notFrom: DCAHub, to: DCAHubCompanion });
    const receivedWETHFromAgg = await findTransferValue(tx, WETH_ADDRESS, { notFrom: DCAHub, to: DCAHubCompanion });
    const sentWETHToAgg = await findTransferValue(tx, WETH_ADDRESS, { from: DCAHubCompanion, notTo: [DCAHub, recipient] });
    return { rewardWETH, toProvideUSDC, toProvideLINK, receivedUSDCFromAgg, receivedLINKFromAgg, sentWETHToAgg, receivedWETHFromAgg };
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
