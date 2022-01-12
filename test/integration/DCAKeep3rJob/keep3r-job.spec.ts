import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signers';
import { JsonRpcSigner, TransactionResponse } from '@ethersproject/providers';
import { BigNumber, Contract, utils } from 'ethers';
import { deployments, ethers, getNamedAccounts } from 'hardhat';
import { abi as IERC20_ABI } from '@openzeppelin/contracts/build/contracts/IERC20.json';
import { expect } from 'chai';
import { DCAHubCompanion, DCAKeep3rJob, IDCAHub, IERC20 } from '@typechained';
import { SwapInterval } from '@test-utils/interval-utils';
import evm, { snapshot } from '@test-utils/evm';
import zrx from '@test-utils/zrx';
import { contract, given, then, when } from '@test-utils/bdd';
import { wallet, constants } from '@test-utils';
import KEEP3R_ABI from '../abis/Keep3r.json';
import UNI_V3_MANAGER_ABI from '../abis/UniV3PairManager.json';
import moment from 'moment';

const WETH_ADDRESS = '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2';
const USDC_ADDRESS = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48';
const K3PR_ADDRESS = '0x1ceb5cb57c4d4e2b2433641b95dd330a33185a44';
const UNISWAP_V3_PAIR_MANAGER = '0xfbba1784163212e7b639ed9e434e3aed48036b34';
const WETH_WHALE_ADDRESS = '0xf04a5cc80b1e94c69b48f5ee68a08cd2f09a7c3e';
const K3PR_WHALE_ADDRESS = '0x2fc52c61fb0c03489649311989ce2689d93dc1a2';

contract('DCAKeep3rJob', () => {
  let WETH: IERC20, K3PR: IERC20;
  let DCAKeep3rJob: DCAKeep3rJob;
  let DCAHubCompanion: DCAHubCompanion;
  let DCAHub: IDCAHub;
  let keep3rProtocol: Contract;
  let uniswapv3PairManager: Contract;

  let cindy: SignerWithAddress, signer: SignerWithAddress;
  let keeper: SignerWithAddress, jobOwner: SignerWithAddress;
  let governor: JsonRpcSigner;
  let initialPerformedSwaps: number;
  let chainId: BigNumber;
  let snapshotId: string;

  before(async () => {
    await evm.reset({
      network: 'mainnet',
    });

    await deployments.fixture(['DCAHubCompanion', 'DCAKeep3rJob'], { keepExistingDeployments: false });

    DCAHub = await ethers.getContract('DCAHub');
    DCAHubCompanion = await ethers.getContract('DCAHubCompanion');
    DCAKeep3rJob = await ethers.getContract('DCAKeep3rJob');
    keep3rProtocol = await ethers.getContractAt(KEEP3R_ABI, await DCAKeep3rJob.keep3r());
    uniswapv3PairManager = await ethers.getContractAt(UNI_V3_MANAGER_ABI, UNISWAP_V3_PAIR_MANAGER);
    [cindy, signer, keeper, jobOwner] = await ethers.getSigners();

    const namedAccounts = await getNamedAccounts();
    const governorAddress = namedAccounts.governor;
    governor = await wallet.impersonate(governorAddress);
    await ethers.provider.send('hardhat_setBalance', [governorAddress, '0xffffffffffffffff']);
    const wethWhale = await wallet.impersonate(WETH_WHALE_ADDRESS);
    await ethers.provider.send('hardhat_setBalance', [WETH_WHALE_ADDRESS, '0xffffffffffffffff']);
    const k3prWhale = await wallet.impersonate(K3PR_WHALE_ADDRESS);
    await ethers.provider.send('hardhat_setBalance', [K3PR_WHALE_ADDRESS, '0xffffffffffffffff']);

    // Set companion as swapper
    await DCAKeep3rJob.connect(governor).setSwapper(DCAHubCompanion.address);
    // Allow one minute interval
    await DCAHub.connect(governor).addSwapIntervalsToAllowedList([SwapInterval.ONE_MINUTE.seconds]);
    // Allow signer to sign work
    await DCAKeep3rJob.connect(governor).setIfAddressCanSign(signer.address, true);

    // Add job and register keeper
    await keep3rProtocol.addJob(DCAKeep3rJob.address);
    await keep3rProtocol.connect(keeper).bond(K3PR_ADDRESS, 0);
    await evm.advanceTimeAndBlock(moment.duration(3, 'days').as('seconds'));
    await keep3rProtocol.connect(keeper).activate(K3PR_ADDRESS);

    WETH = await ethers.getContractAt(IERC20_ABI, WETH_ADDRESS);
    K3PR = await ethers.getContractAt(IERC20_ABI, K3PR_ADDRESS);

    await WETH.connect(wethWhale).transfer(jobOwner.address, utils.parseEther('100'));
    await K3PR.connect(k3prWhale).transfer(jobOwner.address, utils.parseEther('100'));

    const amountOfSwaps = 10;
    const depositAmount = utils.parseEther('0.1').mul(amountOfSwaps);
    await WETH.connect(wethWhale).transfer(cindy.address, depositAmount);
    await WETH.connect(cindy).approve(DCAHub.address, depositAmount);
    await DCAHub.connect(cindy).deposit(
      WETH.address,
      USDC_ADDRESS,
      depositAmount,
      amountOfSwaps,
      SwapInterval.ONE_MINUTE.seconds,
      cindy.address,
      []
    );

    initialPerformedSwaps = await performedSwaps();
    chainId = BigNumber.from((await ethers.provider.getNetwork()).chainId);
    snapshotId = await snapshot.take();
  });

  beforeEach('Deploy and configure', async () => {
    await snapshot.revert(snapshotId);
  });

  describe('work', () => {
    when("job doesn't have credits", () => {
      let workTx: Promise<TransactionResponse>;
      given(async () => {
        const { bytes, signature } = await generateCallAndSignature();
        workTx = DCAKeep3rJob.connect(keeper).work(bytes, signature);
      });
      then('tx is reverted', async () => {
        await expect(workTx).to.be.reverted;
      });
    });

    when('job has credits and is worked by a keeper', () => {
      let initialBonds: BigNumber, initialCredits: BigNumber;
      given(async () => {
        // Add liquidity to job and wait till credits are assigned
        const liquidity = await addLiquidityToPair();
        await uniswapv3PairManager.connect(jobOwner).approve(keep3rProtocol.address, liquidity);
        await keep3rProtocol.connect(jobOwner).addLiquidityToJob(DCAKeep3rJob.address, uniswapv3PairManager.address, liquidity);
        await evm.advanceTimeAndBlock(moment.duration(5, 'days').as('seconds'));

        // Remember initial bonds and credits
        initialBonds = await keep3rProtocol.bonds(keeper.address, K3PR_ADDRESS);
        initialCredits = await keep3rProtocol.jobLiquidityCredits(DCAKeep3rJob.address);

        // Execute work
        const { bytes, signature } = await generateCallAndSignature();
        await DCAKeep3rJob.connect(keeper).work(bytes, signature);
      });
      then('credits are transfered to keeper as bonds', async () => {
        const bonds = await keep3rProtocol.bonds(keeper.address, K3PR_ADDRESS);
        const credits = await keep3rProtocol.jobLiquidityCredits(DCAKeep3rJob.address);
        const liquidityCreditsSpent = initialCredits.sub(credits);
        const bondsEarned = bonds.sub(initialBonds);
        expect(liquidityCreditsSpent).to.be.eq(bondsEarned);
        expect(liquidityCreditsSpent).to.be.gt(0);
      });
      then('swap gets executed', async () => {
        expect(await performedSwaps()).to.equal(initialPerformedSwaps + 1);
      });
    });
  });

  async function addLiquidityToPair() {
    const amount = utils.parseEther('10');

    // make ERC20 approvals to mint liquidity
    await WETH.connect(jobOwner).approve(uniswapv3PairManager.address, amount);
    await K3PR.connect(jobOwner).approve(uniswapv3PairManager.address, amount);

    // mint liquidity
    const liquidity = await uniswapv3PairManager.connect(jobOwner).callStatic.mint(amount, amount, 0, 0, jobOwner.address);
    await uniswapv3PairManager.connect(jobOwner).mint(amount, amount, 0, 0, jobOwner.address);
    return liquidity;
  }

  async function generateCallAndSignature() {
    const {
      tokens: [, weth],
    } = await DCAHubCompanion.getNextSwapInfo([{ tokenA: WETH_ADDRESS, tokenB: USDC_ADDRESS }]);
    const dexQuote = await zrx.quote({
      chainId: 1,
      sellToken: WETH_ADDRESS,
      buyToken: USDC_ADDRESS,
      sellAmount: weth.reward,
      sippagePercentage: 0.001,
      takerAddress: DCAHubCompanion.address,
      skipValidation: true,
    });
    await DCAHubCompanion.connect(governor).defineDexSupport(dexQuote.to, true);
    const tokensInSwap = [USDC_ADDRESS, WETH_ADDRESS];
    const indexesInSwap = [{ indexTokenA: 0, indexTokenB: 1 }];
    const { data } = await DCAHubCompanion.populateTransaction.swapWithDex(
      dexQuote.to,
      tokensInSwap,
      indexesInSwap,
      [dexQuote.data],
      false,
      constants.NOT_ZERO_ADDRESS,
      constants.MAX_UINT_256
    );
    return sign(data!);
  }

  async function performedSwaps(): Promise<number> {
    const { performedSwaps } = await DCAHub.swapData(USDC_ADDRESS, WETH_ADDRESS, SwapInterval.ONE_MINUTE.mask);
    return performedSwaps;
  }

  async function sign(data: string) {
    const bytes = encode(data);
    const messageHash = ethers.utils.solidityKeccak256(['bytes'], [bytes]);
    const signature = await signer.signMessage(ethers.utils.arrayify(messageHash));
    return { bytes, signature };
  }
  function encode(data: string) {
    const coder = new ethers.utils.AbiCoder();
    return coder.encode(['tuple(bytes, uint256, uint256, uint256)'], [[data, 0, chainId, constants.MAX_UINT_256]]);
  }
});