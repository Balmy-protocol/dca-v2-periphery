import chai, { expect } from 'chai';
import { ethers } from 'hardhat';
import { behaviours, constants, erc20, wallet } from '@test-utils';
import { contract, given, then, when } from '@test-utils/bdd';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { snapshot } from '@test-utils/evm';
import {
  DCAHubSwapperSwapHandlerMock,
  DCAHubSwapperSwapHandlerMock__factory,
  IDCAHub,
  IERC20,
  ISwapper,
  ISwapperRegistry,
  WrappedPlatformTokenMock,
  WrappedPlatformTokenMock__factory,
} from '@typechained';
import { FakeContract, smock } from '@defi-wonderland/smock';
import { addExtra, ERC20TokenContract, TokenContract } from '@test-utils/erc20';
import { BigNumberish } from '@ethersproject/bignumber';
import { BytesLike } from '@ethersproject/bytes';
import { TransactionResponse } from '@ethersproject/abstract-provider';

chai.use(smock.matchers);

contract('DCAHubSwapperSwapHandler', () => {
  const ABI_CODER = new ethers.utils.AbiCoder();
  const DEX = constants.NOT_ZERO_ADDRESS;
  const TOKENS_PROXY = wallet.generateRandomAddress();
  let swapper: SignerWithAddress, hub: SignerWithAddress, governor: SignerWithAddress, recipient: SignerWithAddress;
  let DCAHub: FakeContract<IDCAHub>;
  let DCAHubSwapperSwapHandler: DCAHubSwapperSwapHandlerMock;
  let DCAHubSwapperSwapHandlerFactory: DCAHubSwapperSwapHandlerMock__factory;
  let swapperRegistry: FakeContract<ISwapperRegistry>;
  let wToken: TokenContract<WrappedPlatformTokenMock>;
  let tokenA: ERC20TokenContract, tokenB: ERC20TokenContract;
  let snapshotId: string;

  const INDEXES = [{ indexTokenA: 0, indexTokenB: 1 }];
  let tokens: string[];

  before('Setup accounts and contracts', async () => {
    [, swapper, hub, governor, recipient] = await ethers.getSigners();
    DCAHubSwapperSwapHandlerFactory = await ethers.getContractFactory(
      'contracts/mocks/DCAHubSwapper/DCAHubSwapperSwapHandler.sol:DCAHubSwapperSwapHandlerMock'
    );
    const wTokenFactory: WrappedPlatformTokenMock__factory = await ethers.getContractFactory(
      'contracts/mocks/WrappedPlatformTokenMock.sol:WrappedPlatformTokenMock'
    );
    wToken = await addExtra(await wTokenFactory.deploy('WETH', 'WETH', 18));
    DCAHub = await smock.fake('IDCAHub');
    swapperRegistry = await smock.fake('ISwapperRegistry');
    DCAHubSwapperSwapHandler = await DCAHubSwapperSwapHandlerFactory.deploy(
      DCAHub.address,
      wToken.address,
      governor.address,
      swapperRegistry.address
    );
    const deploy = (decimals: number) => erc20.deploy({ name: 'A name', symbol: 'SYMB', decimals });
    const deployedTokens = await Promise.all([deploy(12), deploy(16)]);
    [tokenA, tokenB] = deployedTokens.sort((a, b) => a.address.localeCompare(b.address));
    tokens = [tokenA.address, tokenB.address];
    snapshotId = await snapshot.take();
  });

  beforeEach('Deploy and configure', async () => {
    await snapshot.revert(snapshotId);
    DCAHub.swap.reset();
    swapperRegistry.isSwapperAllowlisted.reset();
    swapperRegistry.isSwapperAllowlisted.returns(true);
    swapperRegistry.isValidAllowanceTarget.returns(true);
  });
  describe('constructor', () => {
    when('contract is initiated', () => {
      then('no DEX is initially supported', async () => {
        expect(await DCAHubSwapperSwapHandler.isDexSupported(DEX)).to.be.false;
      });
      then('swap executor starts empty', async () => {
        expect(await DCAHubSwapperSwapHandler.isSwapExecutorEmpty()).to.be.true;
      });
    });
  });
  describe('defineDexSupport', () => {
    const DEX = wallet.generateRandomAddress();
    when('called with zero address', () => {
      then('reverts with message', async () => {
        await behaviours.txShouldRevertWithMessage({
          contract: DCAHubSwapperSwapHandler.connect(governor),
          func: 'defineDexSupport',
          args: [constants.ZERO_ADDRESS, true],
          message: 'ZeroAddress',
        });
      });
    });
    when('support is added', () => {
      given(async () => await DCAHubSwapperSwapHandler.connect(governor).defineDexSupport(DEX, true));
      then('it is reflected correctly', async () => {
        expect(await DCAHubSwapperSwapHandler.isDexSupported(DEX)).to.be.true;
      });
    });
    when('support is removed', () => {
      given(async () => {
        const contractWithGovernor = DCAHubSwapperSwapHandler.connect(governor);
        await contractWithGovernor.defineDexSupport(DEX, true);
        await contractWithGovernor.defineDexSupport(DEX, false);
      });
      then('it is reflected correctly', async () => {
        expect(await DCAHubSwapperSwapHandler.isDexSupported(DEX)).to.be.false;
      });
    });
    behaviours.shouldBeExecutableOnlyByGovernor({
      contract: () => DCAHubSwapperSwapHandler,
      funcAndSignature: 'defineDexSupport',
      params: () => [DEX, true],
      governor: () => governor,
    });
  });
  describe('swapForCaller', () => {
    const SOME_RANDOM_ADDRESS = wallet.generateRandomAddress();
    whenDeadlineHasExpiredThenTxReverts({
      func: 'swapForCaller',
      args: () => [DCAHub.address, tokens, INDEXES, [], [], SOME_RANDOM_ADDRESS, 0],
    });
    when('hub returns less than minimum output', () => {
      const MIN_OUTPUT = 200000;
      const MAX_INPUT = constants.MAX_UINT_256;
      given(() => {
        DCAHub.swap.returns({
          tokens: [
            {
              token: tokenA.address,
              reward: MIN_OUTPUT - 1,
              toProvide: MAX_INPUT,
              platformFee: 0,
            },
            {
              token: tokenB.address,
              reward: MIN_OUTPUT - 1,
              toProvide: MAX_INPUT,
              platformFee: 0,
            },
          ],
          pairs: [],
        });
      });
      then('reverts with message', async () => {
        await behaviours.txShouldRevertWithMessage({
          contract: DCAHubSwapperSwapHandler,
          func: 'swapForCaller',
          args: [DCAHub.address, tokens, INDEXES, [MIN_OUTPUT, MIN_OUTPUT], [MAX_INPUT, MAX_INPUT], SOME_RANDOM_ADDRESS, constants.MAX_UINT_256],
          message: 'RewardNotEnough',
        });
      });
    });
    when('hub asks for more than maximum input', () => {
      const MIN_OUTPUT = 200000;
      const MAX_INPUT = 5000000;
      given(() => {
        DCAHub.swap.returns({
          tokens: [
            {
              token: tokenA.address,
              reward: MIN_OUTPUT,
              toProvide: MAX_INPUT + 1,
              platformFee: 0,
            },
            {
              token: tokenB.address,
              reward: MIN_OUTPUT,
              toProvide: MAX_INPUT + 1,
              platformFee: 0,
            },
          ],
          pairs: [],
        });
      });
      then('reverts with message', async () => {
        await behaviours.txShouldRevertWithMessage({
          contract: DCAHubSwapperSwapHandler,
          func: 'swapForCaller',
          args: [DCAHub.address, tokens, INDEXES, [MIN_OUTPUT, MIN_OUTPUT], [MAX_INPUT, MAX_INPUT], SOME_RANDOM_ADDRESS, constants.MAX_UINT_256],
          message: 'ToProvideIsTooMuch',
        });
      });
    });
    when('swap is executed', () => {
      given(async () => {
        await DCAHubSwapperSwapHandler.connect(swapper).swapForCaller(
          DCAHub.address,
          tokens,
          INDEXES,
          [],
          [],
          SOME_RANDOM_ADDRESS,
          constants.MAX_UINT_256
        );
      });
      thenHubIsCalledWith({
        rewardRecipient: SOME_RANDOM_ADDRESS,
        data: () => encode({ plan: 'swap for caller', bytes: 'none' }),
      });
      then('swap executor is cleared', async () => {
        expect(await DCAHubSwapperSwapHandler.isSwapExecutorEmpty()).to.be.true;
      });
    });
  });
  describe('swapWithDexes', () => {
    const BYTES = ethers.utils.randomBytes(10);
    whenDeadlineHasExpiredThenTxReverts({
      func: 'swapWithDexes',
      args: () => [
        {
          hub: DCAHub.address,
          tokens: [],
          pairsToSwap: [],
          allowanceTargets: [],
          swappers: [],
          executions: [],
          leftoverRecipient: recipient.address,
          deadline: 0,
        },
      ],
    });
    when('executing a swap with dexes', () => {
      given(async () => {
        await DCAHubSwapperSwapHandler.connect(swapper).swapWithDexes({
          hub: DCAHub.address,
          tokens: tokens,
          pairsToSwap: INDEXES,
          allowanceTargets: [{ token: tokenA.address, allowanceTarget: DEX, minAllowance: 2000 }],
          swappers: [DEX],
          executions: [{ swapData: BYTES, swapperIndex: 0 }],
          leftoverRecipient: recipient.address,
          deadline: constants.MAX_UINT_256,
        });
      });
      then('allowance was called correctly', async () => {
        const calls = await DCAHubSwapperSwapHandler.maxApproveSpenderCalls();
        expect(calls).to.have.lengthOf(1);
        expect(calls[0].token).to.equal(tokenA.address);
        expect(calls[0].spender).to.equal(DEX);
        expect(calls[0].minAllowance).to.equal(2000);
        expect(calls[0].alreadyValidatedSpender).to.be.false;
      });
      thenHubIsCalledWith({
        rewardRecipient: () => DCAHubSwapperSwapHandler,
        data: () =>
          encode({
            plan: 'dexes',
            bytes: {
              swappers: [DEX],
              executions: [{ data: BYTES, index: 0 }],
              sendToProvideLeftoverToHub: false,
              leftoverRecipient: recipient,
            },
          }),
      });
    });
  });
  describe('swapWithDexesByMeanKeepers', () => {
    const BYTES = ethers.utils.randomBytes(10);
    whenDeadlineHasExpiredThenTxReverts({
      func: 'swapWithDexesByMeanKeepers',
      args: () => [
        {
          hub: DCAHub.address,
          tokens: [],
          pairsToSwap: [],
          allowanceTargets: [],
          swappers: [],
          executions: [],
          leftoverRecipient: recipient.address,
          deadline: 0,
        },
      ],
    });
    when('executing a swap with dexes', () => {
      given(async () => {
        await DCAHubSwapperSwapHandler.connect(swapper).swapWithDexesByMeanKeepers({
          hub: DCAHub.address,
          tokens: tokens,
          pairsToSwap: INDEXES,
          allowanceTargets: [{ token: tokenA.address, allowanceTarget: DEX, minAllowance: 2000 }],
          swappers: [DEX],
          executions: [{ swapData: BYTES, swapperIndex: 0 }],
          leftoverRecipient: recipient.address,
          deadline: constants.MAX_UINT_256,
        });
      });
      then('allowance was called correctly', async () => {
        const calls = await DCAHubSwapperSwapHandler.maxApproveSpenderCalls();
        expect(calls).to.have.lengthOf(1);
        expect(calls[0].token).to.equal(tokenA.address);
        expect(calls[0].spender).to.equal(DEX);
        expect(calls[0].minAllowance).to.equal(2000);
        expect(calls[0].alreadyValidatedSpender).to.be.false;
      });
      thenHubIsCalledWith({
        rewardRecipient: () => DCAHubSwapperSwapHandler,
        data: () =>
          encode({
            plan: 'dexes',
            bytes: {
              swappers: [DEX],
              executions: [{ data: BYTES, index: 0 }],
              sendToProvideLeftoverToHub: true,
              leftoverRecipient: recipient,
            },
          }),
      });
    });
  });
  describe('swapWithDex', () => {
    const BYTES = ethers.utils.randomBytes(10);
    given(async () => await DCAHubSwapperSwapHandler.connect(governor).defineDexSupport(DEX, true));
    whenDeadlineHasExpiredThenTxReverts({
      func: 'swapWithDex',
      args: () => [DEX, TOKENS_PROXY, tokens, INDEXES, [], false, constants.NOT_ZERO_ADDRESS, 0],
    });
    whenUnsupportedDexIsUsedThenTxReverts({
      func: 'swapWithDex',
      args: () => [wallet.generateRandomAddress(), TOKENS_PROXY, tokens, INDEXES, [], false, constants.NOT_ZERO_ADDRESS, constants.MAX_UINT_256],
    });
    when('swap is executed without swap and transfer', () => {
      given(async () => {
        await DCAHubSwapperSwapHandler.connect(swapper).swapWithDex(
          DEX,
          TOKENS_PROXY,
          tokens,
          INDEXES,
          [BYTES],
          false,
          swapper.address,
          constants.MAX_UINT_256
        );
      });
      thenHubIsCalledWith({
        rewardRecipient: () => DCAHubSwapperSwapHandler,
        data: () =>
          encode({
            plan: 'dex',
            bytes: {
              dex: DEX,
              tokensProxy: TOKENS_PROXY,
              leftoverRecipient: swapper,
              callsToDex: [BYTES],
              sendToProvideLeftoverToHub: false,
              swapAndTransfer: false,
            },
          }),
      });
    });
    when('swap is executed with swap and transfer', () => {
      given(async () => {
        await DCAHubSwapperSwapHandler.connect(swapper).swapWithDex(
          DEX,
          TOKENS_PROXY,
          tokens,
          INDEXES,
          [BYTES],
          true,
          swapper.address,
          constants.MAX_UINT_256
        );
      });
      thenHubIsCalledWith({
        rewardRecipient: () => DCAHubSwapperSwapHandler,
        data: () =>
          encode({
            plan: 'dex',
            bytes: {
              dex: DEX,
              tokensProxy: TOKENS_PROXY,
              leftoverRecipient: swapper,
              callsToDex: [BYTES],
              sendToProvideLeftoverToHub: false,
              swapAndTransfer: true,
            },
          }),
      });
    });
  });
  describe('swapWithDexAndShareLeftoverWithHub', () => {
    const BYTES = ethers.utils.randomBytes(10);
    given(async () => await DCAHubSwapperSwapHandler.connect(governor).defineDexSupport(DEX, true));
    whenDeadlineHasExpiredThenTxReverts({
      func: 'swapWithDexAndShareLeftoverWithHub',
      args: () => [DEX, TOKENS_PROXY, tokens, INDEXES, [], false, constants.NOT_ZERO_ADDRESS, 0],
    });
    whenUnsupportedDexIsUsedThenTxReverts({
      func: 'swapWithDexAndShareLeftoverWithHub',
      args: () => [wallet.generateRandomAddress(), TOKENS_PROXY, tokens, INDEXES, [], false, constants.NOT_ZERO_ADDRESS, constants.MAX_UINT_256],
    });
    when('swap is executed without swap and transfer', () => {
      given(async () => {
        await DCAHubSwapperSwapHandler.connect(swapper).swapWithDexAndShareLeftoverWithHub(
          DEX,
          TOKENS_PROXY,
          tokens,
          INDEXES,
          [BYTES],
          false,
          swapper.address,
          constants.MAX_UINT_256
        );
      });
      thenHubIsCalledWith({
        rewardRecipient: () => DCAHubSwapperSwapHandler,
        data: () =>
          encode({
            plan: 'dex',
            bytes: {
              dex: DEX,
              tokensProxy: TOKENS_PROXY,
              leftoverRecipient: swapper,
              callsToDex: [BYTES],
              sendToProvideLeftoverToHub: true,
              swapAndTransfer: false,
            },
          }),
      });
    });
    when('swap is executed with swap and transfer', () => {
      given(async () => {
        await DCAHubSwapperSwapHandler.connect(swapper).swapWithDexAndShareLeftoverWithHub(
          DEX,
          TOKENS_PROXY,
          tokens,
          INDEXES,
          [BYTES],
          true,
          swapper.address,
          constants.MAX_UINT_256
        );
      });
      thenHubIsCalledWith({
        rewardRecipient: () => DCAHubSwapperSwapHandler,
        data: () =>
          encode({
            plan: 'dex',
            bytes: {
              dex: DEX,
              tokensProxy: TOKENS_PROXY,
              leftoverRecipient: swapper,
              callsToDex: [BYTES],
              sendToProvideLeftoverToHub: true,
              swapAndTransfer: true,
            },
          }),
      });
    });
  });

  describe('DCAHubSwapCall', () => {
    let tokensInSwap: { token: string; toProvide: BigNumberish; reward: BigNumberish; platformFee: BigNumberish }[];
    let DCAHubSwapperSwapHandler: DCAHubSwapperSwapHandlerMock;
    given(async () => {
      tokensInSwap = [
        { token: wToken.address, toProvide: wToken.asUnits(200), reward: 0, platformFee: 0 },
        { token: tokenA.address, toProvide: tokenA.asUnits(100), reward: 0, platformFee: 0 },
      ];
      DCAHubSwapperSwapHandler = await DCAHubSwapperSwapHandlerFactory.deploy(
        hub.address,
        wToken.address,
        governor.address,
        swapperRegistry.address
      );
    });
    when('the swap plan is unexpected', () => {
      const SWAP_DATA = ABI_CODER.encode(['tuple(uint256, bytes)'], [[0, ethers.utils.randomBytes(5)]]);
      then('reverts with message', async () => {
        await behaviours.txShouldRevertWithMessage({
          contract: DCAHubSwapperSwapHandler.connect(hub),
          func: 'DCAHubSwapCall',
          args: [DCAHubSwapperSwapHandler.address, tokensInSwap, [], SWAP_DATA],
          message: 'UnexpectedSwapPlan',
        });
      });
    });
    when('the swap plan is invalid', () => {
      const SWAP_DATA = ABI_CODER.encode(['tuple(uint256, bytes)'], [[10, ethers.utils.randomBytes(5)]]);
      then('reverts with message', async () => {
        await behaviours.txShouldRevertWithMessage({
          contract: DCAHubSwapperSwapHandler.connect(hub),
          func: 'DCAHubSwapCall',
          args: [DCAHubSwapperSwapHandler.address, tokensInSwap, [], SWAP_DATA],
          // This happens when an invalid plan (not part of the enum) is sent
          message: `Transaction reverted and Hardhat couldn't infer the reason. Please report this to help us improve Hardhat.`,
        });
      });
    });
    describe('handleSwapForCaller', () => {
      when('swap for caller plan is executed', () => {
        given(async () => {
          await mintAndApproveTokens();
          await DCAHubSwapperSwapHandler.setSwapExecutor(swapper.address);
          await DCAHubSwapperSwapHandler.connect(hub).DCAHubSwapCall(
            DCAHubSwapperSwapHandler.address,
            tokensInSwap,
            [],
            encode({ plan: 'swap for caller', bytes: 'none' })
          );
        });
        then('tokens are sent from the swap executor to the hub correctly', async () => {
          for (const tokenInSwap of tokensInSwap) {
            const token = fromAddressToToken(tokenInSwap.token);
            expect(await token.balanceOf(swapper.address)).to.equal(0);
            expect(await token.balanceOf(hub.address)).to.equal(tokenInSwap.toProvide);
          }
        });
      });
      async function mintAndApproveTokens() {
        for (const tokenInSwap of tokensInSwap) {
          const token = fromAddressToToken(tokenInSwap.token);
          await token.mint(swapper.address, tokenInSwap.toProvide);
          await token.connect(swapper).approve(DCAHubSwapperSwapHandler.address, tokenInSwap.toProvide);
        }
      }
    });
    describe('handleSwapWithDexes', () => {
      const swapData = ({ callsToSwapper, sendToHubFlag }: { callsToSwapper: BytesLike[]; sendToHubFlag: boolean }) =>
        encode({
          plan: 'dexes',
          bytes: {
            swappers: [swapper.address],
            executions: callsToSwapper.map((swap) => ({ index: 0, data: swap })),
            leftoverRecipient: recipient,
            sendToProvideLeftoverToHub: sendToHubFlag,
          },
        });

      let token: FakeContract<IERC20>;
      let swapper: FakeContract<ISwapper>;
      let swapExecution: BytesLike;
      given(async () => {
        token = await smock.fake('IERC20');
        token.transfer.returns(true);
        swapper = await smock.fake('ISwapper');
        const { data } = await swapper.populateTransaction.swap(token.address, 1000, token.address);
        swapExecution = data!;
      });
      when('swapper is not allowlisted', () => {
        let tx: Promise<TransactionResponse>;
        given(() => {
          swapperRegistry.isSwapperAllowlisted.returns(false);
          const data = swapData({ callsToSwapper: [], sendToHubFlag: true });
          tx = DCAHubSwapperSwapHandler.connect(hub).DCAHubSwapCall(constants.ZERO_ADDRESS, [], [], data);
        });
        then('swap fails', async () => {
          await expect(tx).to.have.revertedWith('SwapperNotAllowlisted');
        });
      });

      when('swapper call fails', () => {
        let tx: Promise<TransactionResponse>;
        given(() => {
          swapper.swap.reverts();
          const data = swapData({ callsToSwapper: [swapExecution], sendToHubFlag: true });
          tx = DCAHubSwapperSwapHandler.connect(hub).DCAHubSwapCall(constants.ZERO_ADDRESS, [], [], data);
        });
        then('then swap reverts', async () => {
          await expect(tx).to.have.revertedWith('Call to swapper failed');
        });
      });

      handleSwapWithDexes({
        when: 'token needs to be provided and hub flag is set',
        then: 'everything is transferred to the hub',
        sendToHubFlag: true,
        balance: 12345,
        toProvide: 10000,
        assertion: (token) => expect(token.transfer).to.have.been.calledOnceWith(hub.address, 12345),
      });

      handleSwapWithDexes({
        when: 'token needs to be provided but there is no leftover',
        then: 'available balance is sent to the hub only',
        sendToHubFlag: false,
        balance: 12345,
        toProvide: 12345,
        assertion: (token) => expect(token.transfer).to.have.been.calledOnceWith(hub.address, 12345),
      });

      handleSwapWithDexes({
        when: 'token needs to be provided and there is some leftover',
        then: 'leftover is sent to the recipient',
        sendToHubFlag: false,
        balance: 12345,
        toProvide: 10000,
        assertion: (token, recipient) => {
          expect(token.transfer).to.have.been.calledTwice;
          expect(token.transfer).to.have.been.calledWith(hub.address, 10000);
          expect(token.transfer).to.have.been.calledWith(recipient, 2345);
        },
      });

      handleSwapWithDexes({
        when: 'token is reward (to provide is zero)',
        then: 'everything is transferred to recipient',
        balance: 12345,
        toProvide: 0,
        assertion: (token, recipient) => expect(token.transfer).to.have.been.calledOnceWith(recipient, 12345),
      });

      function handleSwapWithDexes({
        when: title,
        then: thenTitle,
        balance,
        toProvide,
        sendToHubFlag,
        assertion,
      }: {
        when: string;
        then: string;
        balance: BigNumberish;
        toProvide?: BigNumberish;
        sendToHubFlag?: boolean;
        assertion: (_: FakeContract<IERC20>, recipient: string) => void;
      }) {
        when(title, () => {
          given(async () => {
            const tokensInSwap = [{ token: token.address, toProvide: toProvide ?? 0, reward: 0, platformFee: 0 }];
            token.balanceOf.returns(balance);
            const data = swapData({ callsToSwapper: [swapExecution], sendToHubFlag: sendToHubFlag ?? true });
            await DCAHubSwapperSwapHandler.connect(hub).DCAHubSwapCall(constants.ZERO_ADDRESS, tokensInSwap, [], data);
          });
          then(thenTitle, () => assertion(token, recipient.address));
          then('registry is queried correctly', () => {
            expect(swapperRegistry.isSwapperAllowlisted).to.have.been.calledOnceWith(swapper.address);
          });
          then('swap is executed correctly', () => {
            expect(swapper.swap).to.have.been.calledOnceWith(token.address, 1000, token.address);
          });
        });
      }
    });
    describe('handleSwapWithDex', () => {
      const swapData = ({
        callsToDex,
        sendToHubFlag,
        swapAndTransfer,
      }: {
        callsToDex: BytesLike[];
        sendToHubFlag: boolean;
        swapAndTransfer: boolean;
      }) =>
        encode({
          plan: 'dex',
          bytes: {
            dex: DEX,
            tokensProxy: TOKENS_PROXY,
            leftoverRecipient: swapper,
            callsToDex,
            swapAndTransfer,
            sendToProvideLeftoverToHub: sendToHubFlag,
          },
        });

      let tokenA: FakeContract<IERC20>;
      let tokenB: FakeContract<IERC20>;
      given(async () => {
        tokenA = await smock.fake('IERC20');
        tokenB = await smock.fake('IERC20');
        tokenA.transfer.returns(true);
        tokenB.transfer.returns(true);
      });
      when('swap with dex plan is executed', () => {
        const BYTES = [ethers.utils.randomBytes(10), ethers.utils.randomBytes(20)];
        const AMOUNT_TO_PROVIDE_TOKEN_A = 2000000;
        const REWARD_AMOUNT_TOKEN_B = 3000000;
        let tokensInSwap: { token: string; toProvide: BigNumberish; reward: BigNumberish; platformFee: BigNumberish }[];
        given(async () => {
          tokensInSwap = [
            { token: tokenA.address, toProvide: AMOUNT_TO_PROVIDE_TOKEN_A, reward: 0, platformFee: 0 },
            { token: tokenB.address, toProvide: 0, reward: REWARD_AMOUNT_TOKEN_B, platformFee: 0 },
          ];
          await DCAHubSwapperSwapHandler.connect(hub).DCAHubSwapCall(
            DCAHubSwapperSwapHandler.address,
            tokensInSwap,
            [],
            swapData({ callsToDex: BYTES, sendToHubFlag: true, swapAndTransfer: true })
          );
        });
        then('reward tokens are approved', () => {
          expect(tokenB.approve).to.have.been.calledOnce;
          expect(tokenB.approve).to.have.been.calledWith(TOKENS_PROXY, REWARD_AMOUNT_TOKEN_B + 1);
        });
        then('tokens that are not reward are not approved', () => {
          expect(tokenA.approve).to.not.have.been.called;
        });
        then('dex calls are executed', async () => {
          const calls = await DCAHubSwapperSwapHandler.callsToDex(DEX);
          for (let i = 0; i < BYTES.length; i++) {
            expect(calls[i]).to.equal(ethers.utils.hexlify(BYTES[i]));
          }
        });
      });

      approveWhenHandlingSwapWithDex({
        when: 'token has no issue with approvals',
        then: '1 extra is approved',
        hasIssue: false,
        reward: 100,
        assertion: (token) => expect(token.approve).to.have.been.calledWith(TOKENS_PROXY, 100 + 1),
      });

      approveWhenHandlingSwapWithDex({
        when: 'token has issues with approvals but allowance is more than reward',
        then: 'nothing is approved',
        hasIssue: true,
        reward: 100,
        allowance: 101,
        assertion: (token) => expect(token.approve).to.not.have.been.called,
      });

      approveWhenHandlingSwapWithDex({
        when: 'token has issues with approvals but is not zero',
        then: 'approve is called twice',
        hasIssue: true,
        reward: 100,
        allowance: 1,
        assertion: (token) => {
          expect(token.approve).to.have.been.called.calledTwice;
          expect(token.approve).to.have.been.calledWith(TOKENS_PROXY, 0);
          expect(token.approve).to.have.been.calledWith(TOKENS_PROXY, 100);
        },
      });

      approveWhenHandlingSwapWithDex({
        when: 'token has issues with approvals but is zero',
        then: 'approve is called only once',
        hasIssue: true,
        reward: 100,
        allowance: 0,
        assertion: (token) => {
          expect(token.approve).to.have.been.calledOnceWith(TOKENS_PROXY, 100);
        },
      });

      handleSwapWithDex({
        when: 'token has no balance',
        then: 'no transfer is executed',
        balance: 0,
        assertion: (token) => expect(token.transfer).to.not.have.been.called,
      });

      handleSwapWithDex({
        when: 'token has balance but it does not need to be sent to the hub',
        then: 'balance is sent entirely to the recipient',
        balance: 100,
        toProvide: 0,
        assertion: (token, recipient) => expect(token.transfer).to.have.been.calledOnceWith(recipient, 100),
      });

      handleSwapWithDex({
        when: 'token needs to be sent to the hub, and there is no extra balance',
        then: 'balance is sent entirely to the hub even if the flag is off',
        balance: 100,
        toProvide: 100,
        sendToHubFlag: false,
        assertion: (token) => expect(token.transfer).to.have.been.calledOnceWith(hub.address, 100),
      });

      handleSwapWithDex({
        when: 'token needs to be sent to the hub, there is some extra balance and flag is on',
        then: 'balance is sent entirely to the hub',
        balance: 150,
        toProvide: 100,
        sendToHubFlag: true,
        assertion: (token) => expect(token.transfer).to.have.been.calledOnceWith(hub.address, 150),
      });

      handleSwapWithDex({
        when: 'token needs to be sent to the hub, there is some extra balance and flag is off',
        then: 'balance is split between hub and recipient',
        balance: 150,
        toProvide: 100,
        sendToHubFlag: false,
        assertion: (token, recipient) => {
          expect(token.transfer).to.have.been.calledTwice;
          expect(token.transfer).to.have.been.calledWith(hub.address, 100);
          expect(token.transfer).to.have.been.calledWith(recipient, 50);
        },
      });

      handleSwapWithDex({
        when: 'dex performs swap and transfer and flag is on',
        then: 'balance is sent entirely to the hub',
        balance: 150,
        toProvide: 100,
        sendToHubFlag: true,
        swapAndTransfer: true,
        assertion: (token) => expect(token.transfer).to.have.been.calledOnceWith(hub.address, 150),
      });

      handleSwapWithDex({
        when: 'dex performs swap and transfer and flag is off',
        then: 'balance is sent entirely to the recipient',
        balance: 100,
        toProvide: 100,
        sendToHubFlag: false,
        swapAndTransfer: true,
        assertion: (token, recipient) => expect(token.transfer).to.have.been.calledOnceWith(recipient, 100),
      });

      function approveWhenHandlingSwapWithDex({
        when: title,
        then: thenTitle,
        allowance,
        reward,
        hasIssue,
        assertion,
      }: {
        when: string;
        then: string;
        allowance?: BigNumberish;
        reward: BigNumberish;
        hasIssue: boolean;
        assertion: (_: FakeContract<IERC20>, recipient: string) => void;
      }) {
        when(title, () => {
          given(async () => {
            const tokensInSwap = [{ token: tokenA.address, reward: reward ?? 0, toProvide: 0, platformFee: 0 }];
            tokenA.allowance.returns(allowance ?? 0);
            await DCAHubSwapperSwapHandler.connect(governor).setTokensWithApprovalIssues([tokenA.address], [hasIssue ?? false]);
            const data = swapData({ callsToDex: [], sendToHubFlag: true, swapAndTransfer: false });
            await DCAHubSwapperSwapHandler.connect(hub).DCAHubSwapCall(DCAHubSwapperSwapHandler.address, tokensInSwap, [], data);
          });
          then(thenTitle, () => assertion(tokenA, swapper.address));
        });
      }

      function handleSwapWithDex({
        when: title,
        then: thenTitle,
        balance,
        toProvide,
        sendToHubFlag,
        swapAndTransfer,
        assertion,
      }: {
        when: string;
        then: string;
        balance: BigNumberish;
        toProvide?: BigNumberish;
        sendToHubFlag?: boolean;
        swapAndTransfer?: boolean;
        assertion: (_: FakeContract<IERC20>, recipient: string) => void;
      }) {
        when(title, () => {
          given(async () => {
            const tokensInSwap = [{ token: tokenA.address, toProvide: toProvide ?? 0, reward: 0, platformFee: 0 }];
            tokenA.balanceOf.returns(balance);
            const data = swapData({ callsToDex: [], sendToHubFlag: sendToHubFlag ?? true, swapAndTransfer: swapAndTransfer ?? false });
            await DCAHubSwapperSwapHandler.connect(hub).DCAHubSwapCall(DCAHubSwapperSwapHandler.address, tokensInSwap, [], data);
          });
          then(thenTitle, () => assertion(tokenA, swapper.address));
        });
      }
    });
  });
  function fromAddressToToken(tokenAddress: string): TokenContract<ERC20TokenContract> {
    switch (tokenAddress) {
      case tokenA.address:
        return tokenA;
      case tokenB.address:
        return tokenB;
      case wToken.address:
        return wToken as any;
    }
    throw new Error('Unknown address');
  }
  function whenDeadlineHasExpiredThenTxReverts({ func, args }: { func: keyof DCAHubSwapperSwapHandlerMock['functions']; args: () => any[] }) {
    when('deadline has expired', () => {
      then('reverts with message', async () => {
        await behaviours.txShouldRevertWithMessage({
          contract: DCAHubSwapperSwapHandler,
          func,
          args: args(),
          message: 'Transaction too old',
        });
      });
    });
  }
  function whenUnsupportedDexIsUsedThenTxReverts({ func, args }: { func: keyof DCAHubSwapperSwapHandlerMock['functions']; args: () => any[] }) {
    when('deadline has expired', () => {
      then('reverts with message', async () => {
        await behaviours.txShouldRevertWithMessage({
          contract: DCAHubSwapperSwapHandler,
          func,
          args: args(),
          message: 'UnsupportedDex',
        });
      });
    });
  }
  function thenHubIsCalledWith({
    data: expectedData,
    rewardRecipient: expectedRewardRecipient,
  }: {
    rewardRecipient: string | (() => { address: string });
    data: () => BytesLike;
  }) {
    then('hub was called with the correct parameters', () => {
      expect(DCAHub.swap).to.have.been.calledOnce;
      const [tokensInHub, indexes, rewardRecipient, callbackHandler, borrow, data] = DCAHub.swap.getCall(0).args;
      expect(tokensInHub).to.eql(tokens);
      expect((indexes as any)[0]).to.eql([0, 1]);
      expect(rewardRecipient).to.equal(
        typeof expectedRewardRecipient === 'string' ? expectedRewardRecipient : expectedRewardRecipient().address
      );
      expect(callbackHandler).to.equal(DCAHubSwapperSwapHandler.address);
      expect(borrow).to.eql([constants.ZERO, constants.ZERO]);
      expect(data).to.equal(expectedData());
    });
  }
  type SwapWithDex = {
    dex: string;
    tokensProxy: string;
    leftoverRecipient: { address: string };
    callsToDex: BytesLike[];
    sendToProvideLeftoverToHub: boolean;
    swapAndTransfer: boolean;
  };
  type SwapWithDexes = {
    swappers: string[];
    executions: { data: BytesLike; index: number }[];
    sendToProvideLeftoverToHub: boolean;
    leftoverRecipient: { address: string };
  };
  function encode({
    plan,
    bytes,
  }: {
    plan: 'none' | 'invalid' | 'swap for caller' | 'dex' | 'dexes';
    bytes: 'none' | 'random' | SwapWithDexes | SwapWithDex;
  }) {
    let swapPlan: number = 0;
    let swapData: BytesLike;
    if (plan === 'none') {
      swapPlan = 0;
    } else if (plan === 'swap for caller') {
      swapPlan = 1;
    } else if (plan === 'dexes') {
      swapPlan = 2;
    } else if (plan === 'dex') {
      swapPlan = 3;
    } else if (plan === 'invalid') {
      swapPlan = 10;
    }
    if (bytes == 'random') {
      swapData = ethers.utils.randomBytes(10);
    } else if (bytes == 'none') {
      swapData = [];
    } else if ('swappers' in bytes) {
      swapData = ABI_CODER.encode(
        ['tuple(address[], tuple(uint8, bytes)[], address, bool)'],
        [
          [
            bytes.swappers,
            bytes.executions.map(({ index, data }) => [index, data]),
            bytes.leftoverRecipient.address,
            bytes.sendToProvideLeftoverToHub,
          ],
        ]
      );
    } else {
      swapData = ABI_CODER.encode(
        ['tuple(address, address, bool, bool, address, bytes[])'],
        [
          [
            bytes.dex,
            bytes.tokensProxy,
            bytes.sendToProvideLeftoverToHub,
            bytes.swapAndTransfer,
            bytes.leftoverRecipient.address,
            bytes.callsToDex,
          ],
        ]
      );
    }
    return ABI_CODER.encode(['tuple(uint256, bytes)'], [[swapPlan, swapData]]);
  }
});
