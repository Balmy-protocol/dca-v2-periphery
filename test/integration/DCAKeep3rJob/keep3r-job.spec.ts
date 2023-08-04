import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { JsonRpcSigner, TransactionResponse } from '@ethersproject/providers';
import { BigNumber, BigNumberish, BytesLike, Contract, utils } from 'ethers';
import { ethers } from 'hardhat';
import { abi as IERC20_ABI } from '@openzeppelin/contracts/build/contracts/IERC20.json';
import { expect } from 'chai';
import { DCAKeep3rJob, IERC20, ThirdPartyDCAHubSwapper } from '@typechained';
import { SwapInterval } from '@test-utils/interval-utils';
import evm, { snapshot } from '@test-utils/evm';
import { contract, given, then, when } from '@test-utils/bdd';
import { wallet, constants } from '@test-utils';
import { deploy } from '@integration/utils';
import { DCAHub } from '@mean-finance/dca-v2-core';
import { fromRpcSig } from 'ethereumjs-util';
import KEEP3R_ABI from '../abis/Keep3r.json';
import { buildSDK } from '@mean-finance/sdk';

const WETH_ADDRESS = '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2';
const USDC_ADDRESS = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48';
const KP3R_ADDRESS = '0x1ceb5cb57c4d4e2b2433641b95dd330a33185a44';
const WETH_WHALE_ADDRESS = '0xf04a5cc80b1e94c69b48f5ee68a08cd2f09a7c3e';
const KEEP3R_GOVERNANCE = '0x0d5dc686d0a2abbfdafdfb4d0533e886517d4e83';

contract('DCAKeep3rJob', () => {
  let WETH: IERC20, K3PR: IERC20;

  let DCAKeep3rJob: DCAKeep3rJob;
  let thirdPartySwapper: ThirdPartyDCAHubSwapper;
  let DCAHub: DCAHub;
  let keep3rV2: Contract;

  let cindy: SignerWithAddress, signer: SignerWithAddress, keeper: SignerWithAddress;
  let msig: JsonRpcSigner, timelock: JsonRpcSigner, keep3rGovernance: JsonRpcSigner;
  let initialPerformedSwaps: number;
  let chainId: BigNumber;
  let snapshotId: string;

  before(async () => {
    [cindy, signer, keeper] = await ethers.getSigners();

    await evm.reset({
      network: 'ethereum',
    });

    ({ msig, timelock } = await deploy('ThirdPartyDCAHubSwapper', 'DCAKeep3rJob'));

    DCAHub = await ethers.getContract('DCAHub');
    thirdPartySwapper = await ethers.getContract('ThirdPartyDCAHubSwapper');
    DCAKeep3rJob = await ethers.getContract('DCAKeep3rJob');
    keep3rV2 = await ethers.getContractAt(KEEP3R_ABI, await DCAKeep3rJob.keep3r());

    const wethWhale = await wallet.impersonate(WETH_WHALE_ADDRESS);
    keep3rGovernance = await wallet.impersonate(KEEP3R_GOVERNANCE);
    await ethers.provider.send('hardhat_setBalance', [WETH_WHALE_ADDRESS, '0xffffffffffffffff']);
    await ethers.provider.send('hardhat_setBalance', [KEEP3R_GOVERNANCE, '0xffffffffffffffff']);

    await DCAHub.connect(timelock).setSwapFee(50000); // 5%
    await DCAHub.connect(msig).setAllowedTokens([WETH_ADDRESS, USDC_ADDRESS], [true, true]);
    await DCAHub.connect(msig).grantRole(await DCAHub.PRIVILEGED_SWAPPER_ROLE(), DCAKeep3rJob.address);
    await DCAKeep3rJob.connect(msig).grantRole(DCAKeep3rJob.CAN_SIGN_ROLE(), signer.address);

    WETH = await ethers.getContractAt(IERC20_ABI, WETH_ADDRESS);
    K3PR = await ethers.getContractAt(IERC20_ABI, KP3R_ADDRESS);

    const amountOfSwaps = 10;
    const depositAmount = utils.parseEther('0.1').mul(amountOfSwaps);
    await WETH.connect(wethWhale).transfer(cindy.address, depositAmount);
    await WETH.connect(cindy).approve(DCAHub.address, depositAmount);
    await DCAHub.connect(cindy)['deposit(address,address,uint256,uint32,uint32,address,(address,uint8[])[])'](
      WETH.address,
      USDC_ADDRESS,
      depositAmount,
      amountOfSwaps,
      SwapInterval.ONE_DAY.seconds,
      cindy.address,
      []
    );

    initialPerformedSwaps = await performedSwaps();
    chainId = BigNumber.from((await ethers.provider.getNetwork()).chainId);

    const bondTime = await keep3rV2.bondTime();
    await keep3rV2.connect(keeper).bond(K3PR.address, 0);
    await evm.advanceTimeAndBlock(bondTime.toNumber());
    await keep3rV2.connect(keeper).activate(K3PR.address);
    await keep3rV2.addJob(DCAKeep3rJob.address);

    snapshotId = await snapshot.take();
  });

  beforeEach(async () => {
    await snapshot.revert(snapshotId);
  });

  describe('work', () => {
    when("job doesn't have credits", () => {
      let workTx: Promise<TransactionResponse>;
      given(async () => {
        const {
          data,
          signature: { r, v, s },
        } = await generateCallAndSignature();
        workTx = DCAKeep3rJob.connect(keeper).work(data, v, r, s);
      });
      then('tx is reverted', async () => {
        await expect(workTx).to.be.reverted;
      });
    });

    when('job has credits and is worked by a keeper', () => {
      let initialBonds: BigNumber, initialCredits: BigNumber;
      given(async () => {
        await keep3rV2.connect(keep3rGovernance).forceLiquidityCreditsToJob(DCAKeep3rJob.address, utils.parseEther('10'));

        // Remember initial bonds and credits
        initialBonds = await keep3rV2.bonds(keeper.address, K3PR.address);
        initialCredits = await keep3rV2.jobLiquidityCredits(DCAKeep3rJob.address);

        // Execute work
        const {
          data,
          signature: { v, r, s },
        } = await generateCallAndSignature();
        await DCAKeep3rJob.connect(keeper).work(data, v, r, s);
      });
      then('credits are transfered to keeper as bonds', async () => {
        const bonds = await keep3rV2.bonds(keeper.address, K3PR.address);
        const credits = await keep3rV2.jobLiquidityCredits(DCAKeep3rJob.address);
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

  async function generateCallAndSignature() {
    const quote = await buildSDK()
      .quoteService.getAllQuotes({
        request: {
          chainId: 1,
          sellToken: WETH_ADDRESS,
          buyToken: USDC_ADDRESS,
          order: { type: 'sell', sellAmount: utils.parseEther('0.1').toBigInt() },
          slippagePercentage: 0.01,
          takerAddress: thirdPartySwapper.address,
        },
        config: {
          timeout: '3s',
        },
      })
      .then((quotes) => quotes[0]);

    const bytes = encodeSwap({
      allowanceTargets: [{ token: quote.sellToken.address, spender: quote.source.allowanceTarget, amount: quote.sellAmount.amount }],
      executions: [{ swapper: quote.tx.to, data: quote.tx.data }],
      leftoverRecipient: keeper,
      extraTokens: [],
    });

    const swapTx = await DCAHub.populateTransaction.swap(
      [USDC_ADDRESS, WETH_ADDRESS],
      [{ indexTokenA: 0, indexTokenB: 1 }],
      thirdPartySwapper.address,
      thirdPartySwapper.address,
      [0, 0],
      bytes,
      []
    );

    const signature = await getSignature({
      signer,
      swapper: DCAHub.address,
      data: swapTx.data!,
      nonce: 0,
      chainId,
    });

    return { data: swapTx.data!, signature };
  }

  async function performedSwaps(): Promise<number> {
    const { performedSwaps } = await DCAHub.swapData(USDC_ADDRESS, WETH_ADDRESS, SwapInterval.ONE_DAY.mask);
    return performedSwaps;
  }

  const Work = [
    { name: 'swapper', type: 'address' },
    { name: 'data', type: 'bytes' },
    { name: 'nonce', type: 'uint256' },
  ];

  async function getSignature(options: OperationData) {
    const { domain, types, value } = buildWorkData(options);
    const signature = await options.signer._signTypedData(domain, types, value);
    return fromRpcSig(signature);
  }

  function buildWorkData(options: OperationData) {
    return {
      primaryType: 'Work',
      types: { Work },
      domain: { name: 'Mean Finance - DCA Keep3r Job', version: '1', chainId: options.chainId, verifyingContract: DCAKeep3rJob.address },
      value: { swapper: options.swapper, data: options.data, nonce: options.nonce },
    };
  }

  type OperationData = {
    signer: SignerWithAddress;
    swapper: string;
    data: BytesLike;
    nonce: BigNumberish;
    chainId: BigNumberish;
  };

  type SwapData = {
    allowanceTargets: { token: string; spender: string; amount: BigNumberish }[];
    executions: { data: BytesLike; swapper: string }[];
    extraTokens: string[];
    leftoverRecipient: { address: string };
  };
  function encodeSwap(bytes: SwapData) {
    const abiCoder = new utils.AbiCoder();
    return abiCoder.encode(
      ['tuple(bool, uint256, tuple(address, address, uint256)[], tuple(address, uint256, bytes)[], address[], address)'],
      [
        [
          false,
          constants.MAX_UINT_256,
          bytes.allowanceTargets.map(({ token, spender, amount }) => [token, spender, amount]),
          bytes.executions.map(({ swapper, data }) => [swapper, 0, data]),
          bytes.extraTokens,
          bytes.leftoverRecipient.address,
        ],
      ]
    );
  }
});
