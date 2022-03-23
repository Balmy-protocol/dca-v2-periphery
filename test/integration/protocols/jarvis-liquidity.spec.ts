import { expect } from 'chai';
import { deployments, ethers, getNamedAccounts } from 'hardhat';
import { JsonRpcSigner, TransactionResponse } from '@ethersproject/providers';
import { constants, wallet } from '@test-utils';
import { given, then, when } from '@test-utils/bdd';
import evm, { snapshot } from '@test-utils/evm';
import { DCAHubCompanion, IERC20 } from '@typechained';
import { ChainlinkOracle, DCAHub } from '@mean-finance/dca-v2-core/typechained';
import { ChainlinkRegistry } from '@mean-finance/chainlink-registry/typechained';
import ChainlinkRegistryDeployment from '@mean-finance/chainlink-registry/deployments/polygon/FeedRegistry.json';
import ChainlinkOracleDeployment from '@mean-finance/dca-v2-core/deployments/polygon/ChainlinkOracle.json';
import { abi as DCA_HUB_ABI } from '@mean-finance/dca-v2-core/artifacts/contracts/DCAHub/DCAHub.sol/DCAHub.json';
import { abi as IERC20_ABI } from '@openzeppelin/contracts/build/contracts/IERC20.json';
import { BigNumber, utils } from 'ethers';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { SwapInterval } from '@test-utils/interval-utils';
import zrx from '@test-utils/zrx';
import { Denominations } from '@test-utils/chainlink';

const WETH_ADDRESS = '0x7ceb23fd6bc0add59e62ac25578270cff1b9f619';
const WETH_WHALE_ADDRESS = '0xdc9232e2df177d7a12fdff6ecbab114e2231198d';

describe.only('Jarvis liquidity', () => {
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

    await DCAHub.connect(timelock).setSwapFee(50000); // 5%

    // Init chainlink registry
    chainlinkRegistry = await ethers.getContractAt<ChainlinkRegistry>(ChainlinkRegistryDeployment.abi, ChainlinkRegistryDeployment.address);

    // Init chainlink oracle
    chainlinkOracle = await ethers.getContractAt<ChainlinkOracle>(ChainlinkOracleDeployment.abi, ChainlinkOracleDeployment.address);

    WETH = await ethers.getContractAt(IERC20_ABI, WETH_ADDRESS);
    const wethWhale = await wallet.impersonate(WETH_WHALE_ADDRESS);
    await ethers.provider.send('hardhat_setBalance', [WETH_WHALE_ADDRESS, depositAmount.mul(10).toHexString().replace('0x0', '0x')]);

    await WETH.connect(wethWhale).transfer(cindy.address, depositAmount);
    await WETH.connect(cindy).approve(DCAHub.address, depositAmount);

    snapshotId = await snapshot.take();
  });

  // testJarvisTokenLiquidity({
  //   jToken: 'jEUR',
  //   jTokenAddress: '0x4e3decbb3645551b8a19f0ea1678079fcb33fb4c',
  //   denomination: Denominations.EUR,
  //   chainlinkFeed: '0x73366Fe0AA0Ded304479862808e02506FE556a98',
  // });

  // testJarvisTokenLiquidity({
  //   jToken: 'jCHF',
  //   jTokenAddress: '0xbd1463f02f61676d53fd183c2b19282bff93d099',
  //   denomination: Denominations.CHF,
  //   chainlinkFeed: '0xc76f762CedF0F78a439727861628E0fdfE1e70c2',
  // });

  // testJarvisTokenLiquidity({
  //   jToken: 'jGBP',
  //   jTokenAddress: '0x767058f11800fba6a682e73a6e79ec5eb74fac8c',
  //   denomination: Denominations.GBP,
  //   chainlinkFeed: '0x099a2540848573e94fb1Ca0Fa420b00acbBc845a',
  // });

  testJarvisTokenLiquidity({
    jToken: 'jCAD',
    jTokenAddress: '0x8ca194a3b22077359b5732de53373d4afc11dee3',
    denomination: Denominations.CAD,
    chainlinkFeed: '0xACA44ABb8B04D07D883202F99FA5E3c53ed57Fb5',
  });

  // testJarvisTokenLiquidity({
  //   jToken: 'jSGD',
  //   jTokenAddress: '0xa926db7a4cc0cb1736d5ac60495ca8eb7214b503',
  //   denomination: Denominations.SGD,
  //   chainlinkFeed: '0x8CE3cAc0E6635ce04783709ca3CC4F5fc5304299',
  // });

  // testJarvisTokenLiquidity({
  //   jToken: 'jJPY',
  //   jTokenAddress: '0x8343091f2499fd4b6174a46d067a920a3b851ff9',
  //   denomination: Denominations.JPY,
  //   chainlinkFeed: '0xD647a6fC9BC6402301583C91decC5989d8Bc382D',
  // });

  async function testJarvisTokenLiquidity({
    jToken,
    jTokenAddress,
    denomination,
    chainlinkFeed,
  }: {
    jToken: string;
    jTokenAddress: string;
    denomination: Denominations;
    chainlinkFeed: string;
  }): Promise<void> {
    let initialHubWETHBalance: BigNumber;
    let reward: BigNumber;
    let toProvide: BigNumber;
    let JTOKEN: IERC20;
    describe(`WETH / ${jToken}`, () => {
      given(async () => {
        await snapshot.revert(snapshotId);
        JTOKEN = await ethers.getContractAt(IERC20_ABI, jTokenAddress);
        // Add jToken/USD feed
        await chainlinkRegistry.connect(governor).setFeedProxies([
          {
            base: denomination,
            quote: Denominations.USD,
            feed: chainlinkFeed,
          },
        ]);
        // Add jToken = FIAT_CURRENCY mapping
        await chainlinkOracle.connect(governor).addMappings([jTokenAddress], [denomination]);
        await DCAHub.connect(cindy)['deposit(address,address,uint256,uint32,uint32,address,(address,uint8[])[])'](
          WETH.address,
          jTokenAddress,
          depositAmount,
          AMOUNT_OF_SWAPS,
          SwapInterval.ONE_MINUTE.seconds,
          cindy.address,
          []
        );
        const sortedTokens = jTokenAddress < WETH_ADDRESS ? [jTokenAddress, WETH_ADDRESS] : [WETH_ADDRESS, jTokenAddress];
        const wethIndex = jTokenAddress < WETH_ADDRESS ? 1 : 0;
        initialPerformedSwaps = await performedSwaps(jTokenAddress);
        initialHubWETHBalance = await WETH.balanceOf(DCAHub.address);
        const { tokens } = await DCAHubCompanion.getNextSwapInfo([{ tokenA: sortedTokens[0], tokenB: sortedTokens[1] }]);
        const weth = tokens[wethIndex];
        console.log('weth reward', utils.formatEther(weth.reward));
        console.log('j to provide', utils.formatEther(tokens[jTokenAddress < WETH_ADDRESS ? 0 : 1].toProvide));
        const dexQuote = await zrx.quote({
          chainId: 137,
          sellToken: WETH_ADDRESS,
          buyToken: jTokenAddress,
          sellAmount: weth.reward,
          slippagePercentage: 0.04, // 4%
          takerAddress: DCAHubCompanion.address,
          skipValidation: true,
        });
        await DCAHubCompanion.connect(governor).defineDexSupport(dexQuote.to, true);
        const swapTx = await DCAHubCompanion.swapWithDex(
          dexQuote.to,
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
        expect(await performedSwaps(jTokenAddress)).to.equal(initialPerformedSwaps + 1);
      });
      then('hub balance is correct', async () => {
        const hubWETHBalance = await WETH.balanceOf(DCAHub.address);
        const hubJEURBalance = await JTOKEN.balanceOf(DCAHub.address);
        expect(hubWETHBalance).to.equal(initialHubWETHBalance.sub(reward));
        expect(hubJEURBalance).to.equal(toProvide);
      });
    });
  }

  async function performedSwaps(jTokenAddress: string): Promise<number> {
    const { performedSwaps } = await DCAHub.swapData(jTokenAddress, WETH_ADDRESS, SwapInterval.ONE_MINUTE.mask);
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
