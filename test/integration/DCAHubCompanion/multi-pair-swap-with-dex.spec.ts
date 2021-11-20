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
import forkBlockNumber from '@integration/fork-block-numbers';

const WETH_ADDRESS = '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2';
const USDC_ADDRESS = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48';
const MANA_ADDRESS = '0x0f5d2fb29fb7d3cfee444a200298f468908cc942';
const WETH_WHALE_ADDRESS = '0xf04a5cc80b1e94c69b48f5ee68a08cd2f09a7c3e';

describe('Multi pair swap with DEX', () => {
  let WETH: IERC20, USDC: IERC20, MANA: IERC20;
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
      jsonRpcUrl: getNodeUrl('mainnet'),
      blockNumber: forkBlockNumber['multi-pair-swap-with-dex'],
    });
    [cindy, recipient] = await ethers.getSigners();

    await deployments.fixture('DCAHubCompanion', { keepExistingDeployments: false });
    DCAHub = await ethers.getContract('DCAHub');
    DCAHubCompanion = await ethers.getContract('DCAHubCompanion');

    const namedAccounts = await getNamedAccounts();
    const governorAddress = namedAccounts.governor;
    governor = await wallet.impersonate(governorAddress);

    // Allow one minute interval
    await DCAHub.connect(governor).addSwapIntervalsToAllowedList([SwapInterval.ONE_MINUTE.seconds]);
    //We are setting a very high fee, so that there is a surplus in both reward and toProvide tokens
    await DCAHub.connect(governor).setSwapFee(20000); // 2%

    WETH = await ethers.getContractAt(IERC20_ABI, WETH_ADDRESS);
    USDC = await ethers.getContractAt(IERC20_ABI, USDC_ADDRESS);
    MANA = await ethers.getContractAt(IERC20_ABI, MANA_ADDRESS);
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
      MANA.address,
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
        toProvideMANA: BigNumber,
        sentToAgg: BigNumber[],
        receivedUSDCFromAgg: BigNumber,
        receivedMANAFromAgg: BigNumber;
      given(async () => {
        const tokensInSwap = [MANA_ADDRESS, USDC_ADDRESS, WETH_ADDRESS];
        const indexesInSwap = [
          { indexTokenA: 0, indexTokenB: 2 },
          { indexTokenA: 1, indexTokenB: 2 },
        ];
        const dexQuotes = await quotes();
        const dexAddress = dexQuotes[0].to;
        await DCAHubCompanion.connect(governor).defineDexSupport(dexAddress, true);
        const swapTx = await DCAHubCompanion.swapWithDex(
          dexAddress,
          tokensInSwap,
          indexesInSwap,
          dexQuotes.map(({ data }) => data),
          false,
          recipient.address,
          constants.MAX_UINT_256
        );
        ({ rewardWETH, toProvideUSDC, toProvideMANA, receivedUSDCFromAgg, receivedMANAFromAgg, sentToAgg } = await getTransfers(swapTx));
      });
      then('swap is executed', async () => {
        expect(await performedSwaps()).to.equal(initialPerformedSwaps + 1);
      });
      then('hub balance is correct', async () => {
        const hubWETHBalance = await WETH.balanceOf(DCAHub.address);
        const hubUSDCBalance = await USDC.balanceOf(DCAHub.address);
        const hubMANABalance = await MANA.balanceOf(DCAHub.address);
        expect(hubWETHBalance).to.equal(RATE.mul(AMOUNT_OF_SWAPS - 1).mul(2));
        expect(hubUSDCBalance).to.equal(toProvideUSDC);
        expect(hubMANABalance).to.equal(toProvideMANA);
      });
      then('all reward surpluss is sent to leftover recipient', async () => {
        const [sentToAgg1, sentToAgg2] = sentToAgg;
        const recipientWETHBalance = await WETH.balanceOf(recipient.address);
        expect(recipientWETHBalance).to.equal(rewardWETH.sub(sentToAgg1).sub(sentToAgg2));
      });
      then('all "toProvide" surpluss is sent to leftover recipient', async () => {
        const recipientUSDCBalance = await USDC.balanceOf(recipient.address);
        expect(recipientUSDCBalance).to.equal(receivedUSDCFromAgg.sub(toProvideUSDC));
        const recipientMANABalance = await MANA.balanceOf(recipient.address);
        expect(recipientMANABalance).to.equal(receivedMANAFromAgg.sub(toProvideMANA));
      });
    });
  });

  function quotes() {
    return Promise.all([
      zrx.quote({
        chainId: 1,
        sellToken: WETH_ADDRESS,
        buyToken: USDC_ADDRESS,
        sellAmount: RATE.sub(100), // We sell a little less than necessary, so that we can test the leftover
        sippagePercentage: 0.001,
      }),
      zrx.quote({
        chainId: 1,
        sellToken: WETH_ADDRESS,
        buyToken: MANA_ADDRESS,
        sellAmount: RATE.sub(100), // We sell a little less than necessary, so that we can test the leftover
        sippagePercentage: 0.001,
      }),
    ]);
  }

  async function performedSwaps(): Promise<number> {
    const { performedSwaps } = await DCAHub.swapData(USDC_ADDRESS, WETH_ADDRESS, SwapInterval.ONE_MINUTE.mask);
    return performedSwaps;
  }

  async function getTransfers(tx: TransactionResponse) {
    const swappedEvent = await getSwappedEvent(tx);
    const [mana, usdc, weth] = swappedEvent.args.swapInformation.tokens;
    const rewardWETH = weth.reward;
    const toProvideUSDC = usdc.toProvide;
    const toProvideMANA = mana.toProvide;

    const [receivedUSDCFromAgg] = await findTransferValue(tx, USDC_ADDRESS, { notFrom: DCAHub, to: DCAHubCompanion });
    const [receivedMANAFromAgg] = await findTransferValue(tx, MANA_ADDRESS, { notFrom: DCAHub, to: DCAHubCompanion });
    const sentToAgg = await findTransferValue(tx, WETH_ADDRESS, { from: DCAHubCompanion, notTo: DCAHub });
    return { rewardWETH, toProvideUSDC, toProvideMANA, receivedUSDCFromAgg, receivedMANAFromAgg, sentToAgg };
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
    }: { from?: { address: string }; notFrom?: { address: string }; to?: { address: string }; notTo?: { address: string } }
  ) {
    const logs = await findLogs(
      tx,
      USDC.interface,
      'Transfer',
      (log) =>
        (!from || log.args.from === from.address) &&
        (!to || log.args.to === to.address) &&
        (!notFrom || log.args.from !== notFrom.address) &&
        (!notTo || log.args.to !== notTo.address),
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
