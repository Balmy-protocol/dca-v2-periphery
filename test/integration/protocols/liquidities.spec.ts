import { expect } from 'chai';
import { deployments, ethers, getNamedAccounts } from 'hardhat';
import { JsonRpcSigner, TransactionResponse } from '@ethersproject/providers';
import { constants, wallet } from '@test-utils';
import { given, then, when } from '@test-utils/bdd';
import evm, { snapshot } from '@test-utils/evm';
import { DCAHubCompanion, IERC20 } from '@typechained';
import { ChainlinkOracle, DCAHub } from '@mean-finance/dca-v2-core/typechained';
import { ChainlinkRegistry, ChainlinkRegistry__factory } from '@mean-finance/chainlink-registry/typechained';
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

describe.skip('Liquidities tests', () => {
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
      skipHardhatDeployFork: true,
    });
    [cindy, recipient] = await ethers.getSigners();
    await deployments.run(['DCAHub', 'DCAHubCompanion'], {
      resetMemory: false,
      deletePreviousDeployments: false,
      writeDeploymentsToFiles: false,
    });
    DCAHub = await ethers.getContract('DCAHub');
    DCAHubCompanion = await ethers.getContract('DCAHubCompanion');
    console.log(DCAHub.address, DCAHubCompanion.address);
    console.log(await DCAHub.oracle());
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

    // Get feed registry of dca hub deployment
    chainlinkRegistry = await ethers.getContractAt<ChainlinkRegistry>(ChainlinkRegistry__factory.abi, await DCAHub.oracle());

    if (network == 'polygon') {
      console.log('pre set proxies', await chainlinkRegistry.governor(), governor._address);
      // await chainlinkRegistry.connect(governor).setFeedProxies([
      //   {
      //     base: '0xd6df932a45c0f255f85145f286ea0b292b21c90b',
      //     quote: '0x0000000000000000000000000000000000000348',
      //     feed: '0x72484b12719e23115761d5da1646945632979bb6'
      //   },
      // {
      //   "base": "0xdab529f40e671a1d4bf91361c21bf9f0c9712ab7",
      //   "quote": "0x0000000000000000000000000000000000000348",
      //   "feed": "0xe0dc07d5ed74741ceeda61284ee56a2a0f7a4cc9"
      // },
      // {
      //   "base": "0xd85d1e945766fea5eda9103f918bd915fbca63e6",
      //   "quote": "0x0000000000000000000000000000000000000348",
      //   "feed": "0xc9ecf45956f576681bdc01f79602a79bc2667b0c"
      // },
      // {
      //   "base": "0x8505b9d2254a7ae468c0e9dd10ccea3a837aef5c",
      //   "quote": "0x0000000000000000000000000000000000000348",
      //   "feed": "0x2a8758b7257102461bc958279054e372c2b1bde6"
      // },
      // {
      //   "base": "0x172370d5cd63279efa6d502dab29171933a610af",
      //   "quote": "0x0000000000000000000000000000000000000348",
      //   "feed": "0x336584c8e6dc19637a5b36206b1c79923111b405"
      // },
      // {
      //   "base": "0x8f3cf7ad23cd3cadbd9735aff958023239c6a063",
      //   "quote": "0x0000000000000000000000000000000000000348",
      //   "feed": "0x4746dec9e833a82ec7c2c1356372ccf2cfcd2f3d"
      // },
      // {
      //   "base": "0x45c32fa6df82ead1e2ef74d17b76547eddfaff89",
      //   "quote": "0x0000000000000000000000000000000000000348",
      //   "feed": "0x00dbeb1e45485d53df7c2f0df1aa0b6dc30311d3"
      // },
      // {
      //   "base": "0x5fe2b58c013d7601147dcdd68c143a77499f5531",
      //   "quote": "0x0000000000000000000000000000000000000348",
      //   "feed": "0x3fabbfb300b1e2d7c9b84512fe9d30aedf24c410"
      // },
      // {
      //   "base": "0x53e0bca35ec356bd5dddfebbd1fc0fd03fabad39",
      //   "quote": "0x0000000000000000000000000000000000000348",
      //   "feed": "0xd9ffdb71ebe7496cc440152d43986aae0ab76665"
      // },
      // {
      //   "base": "0xa1c57f48f0deb89f569dfbe6e2b7f46d33606fd4",
      //   "quote": "0x0000000000000000000000000000000000000348",
      //   "feed": "0xa1cbf3fe43bc3501e3fc4b573e822c70e76a7512"
      // },
      // {
      //   "base": "0x6f7c932e7684666c9fd1d44527765433e01ff61d",
      //   "quote": "0x0000000000000000000000000000000000000348",
      //   "feed": "0xa070427bf5ba5709f70e98b94cb2f435a242c46c"
      // },
      // {
      //   "base": "0x831753dd7087cac61ab5644b308642cc1c33dc13",
      //   "quote": "0x0000000000000000000000000000000000000348",
      //   "feed": "0xa058689f4bca95208bba3f265674ae95ded75b6d"
      // },
      // {
      //   "base": "0x00e5646f60ac6fb446f621d146b6e1886f002905",
      //   "quote": "0x0000000000000000000000000000000000000348",
      //   "feed": "0x7f45273fd7c644714825345670414ea649b50b16"
      // },
      // {
      //   "base": "0x50b728d8d964fd00c2d0aad81718b71311fef68a",
      //   "quote": "0x0000000000000000000000000000000000000348",
      //   "feed": "0xbf90a5d9b6ee9019028dbfc2a9e50056d5252894"
      // },
      // {
      //   "base": "0x0b3f868e0be5597d5db7feb59e1cadbb0fdda50a",
      //   "quote": "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
      //   "feed": "0x17414eb5159a082e8d41d243c1601c2944401431"
      // },
      // {
      //   "base": "0x0b3f868e0be5597d5db7feb59e1cadbb0fdda50a",
      //   "quote": "0x0000000000000000000000000000000000000348",
      //   "feed": "0x49b0c695039243bbfeb8ecd054eb70061fd54aa0"
      // },
      // {
      //   "base": "0x2e1ad108ff1d8c782fcbbb89aad783ac49586756",
      //   "quote": "0x0000000000000000000000000000000000000348",
      //   "feed": "0x7c5d415b64312d38c56b54358449d0a4058339d2"
      // },
      // {
      //   "base": "0x3066818837c5e6ed6601bd5a91b0762877a6b731",
      //   "quote": "0x0000000000000000000000000000000000000348",
      //   "feed": "0x33d9b1baadcf4b26ab6f8e83e9cb8a611b2b3956"
      // },
      // {
      //   "base": "0xb33eaad8d922b1083446dc23f610c2567fb5180f",
      //   "quote": "0x0000000000000000000000000000000000000348",
      //   "feed": "0xdf0fb4e4f928d2dcb76f438575fdd8682386e13c"
      // },
      // {
      //   "base": "0x2791bca1f2de4661ed88a30c99a7a9449aa84174",
      //   "quote": "0x0000000000000000000000000000000000000348",
      //   "feed": "0xfe4a8cc5b5b2366c1b58bea3858e81843581b2f7"
      // },
      // {
      //   "base": "0xc2132d05d31c914a87c6611c10748aeb04b58e8f",
      //   "quote": "0x0000000000000000000000000000000000000348",
      //   "feed": "0x0a6513e40db6eb1b165753ad52e80663aea50545"
      // },
      // {
      //   "base": "0xda537104d6a5edd53c6fbba9a898708e465260b6",
      //   "quote": "0x0000000000000000000000000000000000000348",
      //   "feed": "0x9d3a43c111e7b2c6601705d9fcf7a70c95b1dc55"
      // },
      // {
      //   "base": "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
      //   "quote": "0x0000000000000000000000000000000000000348",
      //   "feed": "0xf9680d99d6c9589e2a93a78a04a279e509205945"
      // },
      // {
      //   "base": "0x0000000000000000000000000000000000001010",
      //   "quote": "0x0000000000000000000000000000000000000348",
      //   "feed": "0xab594600376ec9fd91f8e885dadf0ce036862de0"
      // },
      // {
      //   "base": "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      //   "quote": "0x0000000000000000000000000000000000000348",
      //   "feed": "0xc907e116054ad103354f2d350fd2514433d57f6f"
      // }
      // ]);
      console.log('post feed proxy set');
    }

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
        console.log('pre oracle setup');
        await oracleSetup();
        console.log('pre deposit');
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
        console.log('pre get next swap info');
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
