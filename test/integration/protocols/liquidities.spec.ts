import { expect } from 'chai';
import { deployments, ethers, getNamedAccounts } from 'hardhat';
import { JsonRpcSigner, TransactionResponse } from '@ethersproject/providers';
import { constants, wallet } from '@test-utils';
import { given, then, when } from '@test-utils/bdd';
import evm, { snapshot } from '@test-utils/evm';
import { DCAHubCompanion, IERC20 } from '@typechained';
import { ChainlinkOracle, DCAHub } from '@mean-finance/dca-v2-core/typechained';
import { ChainlinkRegistry } from '@mean-finance/chainlink-registry/typechained';
import { abi as DCA_HUB_ABI } from '@mean-finance/dca-v2-core/artifacts/contracts/DCAHub/DCAHub.sol/DCAHub.json';
import { abi as IERC20_ABI } from '@openzeppelin/contracts/build/contracts/IERC20.json';
import { BigNumber, utils } from 'ethers';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { SwapInterval } from '@test-utils/interval-utils';
import zrx from '@test-utils/zrx';
import { Denominations } from '@test-utils/chainlink';

const WETH_ADDRESS_BY_NETWORK: { [network: string]: string } = {
  polygon: '0x7ceb23fd6bc0add59e62ac25578270cff1b9f619',
};
const WETH_WHALE_ADDRESS_BY_NETWORK: { [network: string]: string } = {
  polygon: '0xdc9232e2df177d7a12fdff6ecbab114e2231198d',
};

describe('Liquidities tests', () => {
  // Setup params
  let WETH: IERC20;
  let governor: JsonRpcSigner;
  let cindy: SignerWithAddress, recipient: SignerWithAddress;
  let DCAHubCompanion: DCAHubCompanion;
  let DCAHub: DCAHub;
  let initialPerformedSwaps: number;
  let snapshotId: string;
  let chainlinkOracle: ChainlinkOracle;
  let chainlinkRegistry: ChainlinkRegistry;

  // Deposit params
  const RATE = utils.parseEther('1');
  const AMOUNT_OF_SWAPS = 10;
  const depositAmount = RATE.mul(AMOUNT_OF_SWAPS);

  context('on Polygon', () => {
    before(async () => {
      snapshotId = await liquidityTestSetup({ network: 'polygon' });
    });
    describe('Jarvis', () => {
      testJarvisLiquidity({
        ticker: 'jEUR',
        tokenAddress: '0x4e3decbb3645551b8a19f0ea1678079fcb33fb4c',
        denomination: Denominations.EUR,
        chainlinkFeed: '0x73366Fe0AA0Ded304479862808e02506FE556a98',
      });

      testJarvisLiquidity({
        ticker: 'jCHF',
        tokenAddress: '0xbd1463f02f61676d53fd183c2b19282bff93d099',
        denomination: Denominations.CHF,
        chainlinkFeed: '0xc76f762CedF0F78a439727861628E0fdfE1e70c2',
      });

      testJarvisLiquidity({
        ticker: 'jGBP',
        tokenAddress: '0x767058f11800fba6a682e73a6e79ec5eb74fac8c',
        denomination: Denominations.GBP,
        chainlinkFeed: '0x099a2540848573e94fb1Ca0Fa420b00acbBc845a',
      });
    });
    describe('QiDAO', () => {
      testTokenLiquidity({
        ticker: 'MAI',
        tokenAddress: '0xa3fa99a148fa48d14ed51d610c367c61876997f1',
        network: 'polygon',
        oracleSetup: () =>
          chainlinkRegistry.connect(governor).setFeedProxies([
            {
              base: '0xa3fa99a148fa48d14ed51d610c367c61876997f1',
              quote: Denominations.USD,
              feed: '0xd8d483d813547CfB624b8Dc33a00F2fcbCd2D428',
            },
          ]),
      });
    });
  });

  async function liquidityTestSetup({ network, swapFee }: { network: string; swapFee?: number }): Promise<string> {
    await evm.reset({
      network: network,
    });
    [cindy, recipient] = await ethers.getSigners();
    await deployments.run(['DCAHubCompanion'], { resetMemory: false, deletePreviousDeployments: false, writeDeploymentsToFiles: false });
    DCAHub = await ethers.getContract('DCAHub');
    DCAHubCompanion = await ethers.getContract('DCAHubCompanion');

    const namedAccounts = await getNamedAccounts();
    const governorAddress = namedAccounts.governor;
    governor = await wallet.impersonate(governorAddress);
    await wallet.setBalance({ account: governorAddress, balance: constants.MAX_UINT_256 });
    const timelockContract = await ethers.getContract('Timelock');
    const timelock = await wallet.impersonate(timelockContract.address);
    await wallet.setBalance({ account: timelock._address, balance: constants.MAX_UINT_256 });

    // Allow one minute interval
    await DCAHub.connect(governor).addSwapIntervalsToAllowedList([SwapInterval.ONE_MINUTE.seconds]);
    if (swapFee) await DCAHub.connect(timelock).setSwapFee(swapFee);

    // Init chainlink registry
    chainlinkRegistry = await ethers.getContract<ChainlinkRegistry>('FeedRegistry');

    // Init chainlink oracle
    chainlinkOracle = await ethers.getContract<ChainlinkOracle>('ChainlinkOracle');

    WETH = await ethers.getContractAt(IERC20_ABI, WETH_ADDRESS_BY_NETWORK[network]);
    const wethWhale = await wallet.impersonate(WETH_WHALE_ADDRESS_BY_NETWORK[network]);
    await wallet.setBalance({ account: WETH_WHALE_ADDRESS_BY_NETWORK[network], balance: constants.MAX_UINT_256 });

    await WETH.connect(wethWhale).transfer(cindy.address, depositAmount);
    await WETH.connect(cindy).approve(DCAHub.address, depositAmount);

    return await snapshot.take();
  }

  async function testJarvisLiquidity({
    ticker,
    tokenAddress,
    denomination,
    chainlinkFeed,
  }: {
    ticker: string;
    tokenAddress: string;
    denomination: Denominations;
    chainlinkFeed: string;
  }): Promise<void> {
    await testTokenLiquidity({
      ticker,
      tokenAddress,
      network: 'polygon',
      oracleSetup: async () => {
        // Add token/USD feed
        await chainlinkRegistry.connect(governor).setFeedProxies([
          {
            base: denomination,
            quote: Denominations.USD,
            feed: chainlinkFeed,
          },
        ]);
        // Add token = FIAT_CURRENCY mapping
        await chainlinkOracle.connect(governor).addMappings([tokenAddress], [denomination]);
      },
    });
  }

  async function testTokenLiquidity({
    ticker,
    tokenAddress,
    oracleSetup,
    network,
    slippage,
  }: {
    ticker: string;
    tokenAddress: string;
    oracleSetup: () => Promise<any>;
    network: string;
    slippage?: number;
  }): Promise<void> {
    let initialHubWETHBalance: BigNumber;
    let initialHubTokenBalance: BigNumber;
    let reward: BigNumber;
    let toProvide: BigNumber;
    let token: IERC20;
    describe(`WETH/${ticker}`, () => {
      const WETH_ADDRESS = WETH_ADDRESS_BY_NETWORK[network];
      given(async () => {
        await snapshot.revert(snapshotId);
        token = await ethers.getContractAt(IERC20_ABI, tokenAddress);
        await oracleSetup();
        await DCAHub.connect(cindy)['deposit(address,address,uint256,uint32,uint32,address,(address,uint8[])[])'](
          WETH.address,
          tokenAddress,
          depositAmount,
          AMOUNT_OF_SWAPS,
          SwapInterval.ONE_MINUTE.seconds,
          cindy.address,
          []
        );
        const sortedTokens = tokenAddress < WETH_ADDRESS ? [tokenAddress, WETH_ADDRESS] : [WETH_ADDRESS, tokenAddress];
        const wethIndex = tokenAddress < WETH_ADDRESS ? 1 : 0;
        initialPerformedSwaps = await performedSwaps({ tokenAddress, wethAddress: WETH_ADDRESS });
        initialHubWETHBalance = await WETH.balanceOf(DCAHub.address);
        initialHubTokenBalance = await token.balanceOf(DCAHub.address);
        const { tokens } = await DCAHubCompanion.getNextSwapInfo([{ tokenA: sortedTokens[0], tokenB: sortedTokens[1] }]);
        const weth = tokens[wethIndex];
        const dexQuote = await zrx.quote({
          chainId: 137,
          sellToken: WETH_ADDRESS,
          buyToken: tokenAddress,
          sellAmount: weth.reward,
          slippagePercentage: slippage ?? 0.005, // 0.5% as default
          takerAddress: DCAHubCompanion.address,
          skipValidation: true,
        });
        await DCAHubCompanion.connect(governor).defineDexSupport(dexQuote.to, true);
        const swapTx = await DCAHubCompanion.swapWithDex(
          dexQuote.to,
          dexQuote.allowanceTarget,
          [sortedTokens[0], sortedTokens[1]],
          [{ indexTokenA: 0, indexTokenB: 1 }],
          [dexQuote.data],
          false,
          recipient.address,
          constants.MAX_UINT_256
        );

        ({ reward, toProvide } = await getTransfers(swapTx));
      });
      then('swap is executed', async () => {
        expect(await performedSwaps({ tokenAddress, wethAddress: WETH_ADDRESS })).to.equal(initialPerformedSwaps + 1);
      });
      then('hub balance is correct', async () => {
        const hubWETHBalance = await WETH.balanceOf(DCAHub.address);
        const hubTokenBalance = await token.balanceOf(DCAHub.address);
        expect(hubWETHBalance, 'Hub WETH balance is incorrect').to.equal(initialHubWETHBalance.sub(reward));
        expect(hubTokenBalance, `Hub ${ticker} balance is incorrect`).to.equal(initialHubTokenBalance.add(toProvide));
      });
    });
  }

  async function performedSwaps({ tokenAddress, wethAddress }: { tokenAddress: string; wethAddress: string }): Promise<number> {
    const { performedSwaps } = await DCAHub.swapData(tokenAddress, wethAddress, SwapInterval.ONE_MINUTE.mask);
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
      WETH.interface,
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
