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

const LINK_ADDRESS = '0x514910771af9ca656af840dff83e8264ecf986ca';
const USDC_ADDRESS = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48';
const WETH_ADDRESS = '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2';
// LINK < USDC < WETH
const WETH_WHALE_ADDRESS = '0xf04a5cc80b1e94c69b48f5ee68a08cd2f09a7c3e';

contract('Multi pair swap with DEX', () => {
  let WETH: IERC20, USDC: IERC20, LINK: IERC20;
  let governor: JsonRpcSigner;
  let cindy: SignerWithAddress, recipient: SignerWithAddress;
  let DCAHubCompanion: DCAHubCompanion;
  let DCAHub: DCAHub;
  let DCAHubSwapper: DCAHubSwapper;
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
    await DCAHub.connect(governor).setAllowedTokens([WETH_ADDRESS, USDC_ADDRESS, LINK_ADDRESS], [true, true, true]);
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
      let initialHubWETHBalance: BigNumber,
        initialHubUSDCBalance: BigNumber,
        initialHubLINKBalance: BigNumber,
        initialRecipientUSDCBalance: BigNumber,
        initialRecipientLINKBalance: BigNumber;
      given(async () => {
        initialHubLINKBalance = await LINK.balanceOf(DCAHub.address);
        initialHubUSDCBalance = await USDC.balanceOf(DCAHub.address);
        initialHubWETHBalance = await WETH.balanceOf(DCAHub.address);
        initialRecipientLINKBalance = await LINK.balanceOf(recipient.address);
        initialRecipientUSDCBalance = await USDC.balanceOf(recipient.address);
        const {
          tokens: [link, usdc],
        } = await DCAHubCompanion.getNextSwapInfo([
          { tokenA: WETH_ADDRESS, tokenB: USDC_ADDRESS },
          { tokenA: WETH_ADDRESS, tokenB: LINK_ADDRESS },
        ]);
        const dexQuotes = await Promise.all([
          zrx.quote({
            chainId: 1,
            sellToken: WETH_ADDRESS,
            buyToken: USDC_ADDRESS,
            buyAmount: usdc.toProvide,
            slippagePercentage: 0.01,
            takerAddress: DCAHubSwapper.address,
            skipValidation: true,
          }),
          zrx.quote({
            chainId: 1,
            sellToken: WETH_ADDRESS,
            buyToken: LINK_ADDRESS,
            buyAmount: link.toProvide,
            slippagePercentage: 0.01,
            takerAddress: DCAHubSwapper.address,
            skipValidation: true,
          }),
        ]);
        const dexAddress = dexQuotes[0].to;
        await DCAHubSwapper.connect(governor).defineDexSupport(dexAddress, true);
        const tokensInSwap = [LINK_ADDRESS, USDC_ADDRESS, WETH_ADDRESS];
        const indexesInSwap = [
          { indexTokenA: 0, indexTokenB: 2 },
          { indexTokenA: 1, indexTokenB: 2 },
        ];
        const swapTx = await DCAHubSwapper.swapWithDex(
          dexAddress,
          dexQuotes[0].allowanceTarget,
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
        expect(recipientUSDCBalance.sub(initialRecipientUSDCBalance)).to.equal(receivedUSDCFromAgg.sub(toProvideUSDC));
        const recipientLINKBalance = await LINK.balanceOf(recipient.address);
        expect(recipientLINKBalance.sub(initialRecipientLINKBalance)).to.equal(receivedLINKFromAgg.sub(toProvideLINK));
      });
    });
  });

  async function performedSwaps(): Promise<number> {
    const { performedSwaps } = await DCAHub.swapData(USDC_ADDRESS, WETH_ADDRESS, SwapInterval.ONE_MINUTE.mask);
    return performedSwaps;
  }

  async function getTransfers(tx: TransactionResponse) {
    const swappedEvent = await getSwappedEvent(tx);
    const [link, usdc, weth] = swappedEvent.args.swapInformation.tokens;
    const rewardWETH = weth.reward;
    const toProvideUSDC = usdc.toProvide;
    const toProvideLINK = link.toProvide;

    const [receivedUSDCFromAgg] = await findTransferValue(tx, USDC_ADDRESS, { notFrom: DCAHub, to: DCAHubSwapper });
    const [receivedLINKFromAgg] = await findTransferValue(tx, LINK_ADDRESS, { notFrom: DCAHub, to: DCAHubSwapper });
    const receivedWETHFromAgg = await findTransferValue(tx, WETH_ADDRESS, { notFrom: DCAHub, to: DCAHubSwapper });
    const sentWETHToAgg = await findTransferValue(tx, WETH_ADDRESS, { from: DCAHubSwapper, notTo: [DCAHub, recipient] });
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
