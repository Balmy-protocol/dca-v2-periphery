import chai, { expect } from 'chai';
import { ethers } from 'hardhat';
import { behaviours, constants, erc20, wallet } from '@test-utils';
import { contract, given, then, when } from '@test-utils/bdd';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signers';
import { snapshot } from '@test-utils/evm';
import {
  DCAHubCompanionSwapHandlerMock,
  DCAHubCompanionSwapHandlerMock__factory,
  IDCAHub,
  IERC20,
  WrappedPlatformTokenMock,
  WrappedPlatformTokenMock__factory,
} from '@typechained';
import { FakeContract, smock } from '@defi-wonderland/smock';
import { addExtra, ERC20TokenContract, TokenContract } from '@test-utils/erc20';
import { TransactionResponse } from '@ethersproject/abstract-provider';
import { BigNumber, BigNumberish } from '@ethersproject/bignumber';
import { BytesLike } from '@ethersproject/bytes';

chai.use(smock.matchers);

contract('DCAHubCompanionSwapHandler', () => {
  const ABI_CODER = new ethers.utils.AbiCoder();
  const DEX = constants.NOT_ZERO_ADDRESS;
  let swapper: SignerWithAddress, hub: SignerWithAddress, governor: SignerWithAddress;
  let DCAHub: FakeContract<IDCAHub>;
  let DCAHubCompanionSwapHandler: DCAHubCompanionSwapHandlerMock;
  let DCAHubCompanionSwapHandlerFactory: DCAHubCompanionSwapHandlerMock__factory;
  let wToken: TokenContract<WrappedPlatformTokenMock>;
  let tokenA: ERC20TokenContract, tokenB: ERC20TokenContract;
  let snapshotId: string;

  const INDEXES = [{ indexTokenA: 0, indexTokenB: 1 }];
  let tokens: string[];

  before('Setup accounts and contracts', async () => {
    [, swapper, hub, governor] = await ethers.getSigners();
    DCAHubCompanionSwapHandlerFactory = await ethers.getContractFactory(
      'contracts/mocks/DCAHubCompanion/DCAHubCompanionSwapHandler.sol:DCAHubCompanionSwapHandlerMock'
    );
    const wTokenFactory: WrappedPlatformTokenMock__factory = await ethers.getContractFactory(
      'contracts/mocks/WrappedPlatformTokenMock.sol:WrappedPlatformTokenMock'
    );
    wToken = await addExtra(await wTokenFactory.deploy('WETH', 'WETH', 18));
    DCAHub = await smock.fake('IDCAHub');
    DCAHubCompanionSwapHandler = await DCAHubCompanionSwapHandlerFactory.deploy(DCAHub.address, wToken.address, governor.address);
    const deploy = (decimals: number) => erc20.deploy({ name: 'A name', symbol: 'SYMB', decimals });
    const deployedTokens = await Promise.all([deploy(12), deploy(16)]);
    [tokenA, tokenB] = deployedTokens.sort((a, b) => a.address.localeCompare(b.address));
    tokens = [tokenA.address, tokenB.address];
    snapshotId = await snapshot.take();
  });

  beforeEach('Deploy and configure', async () => {
    await snapshot.revert(snapshotId);
    DCAHub.swap.reset();
  });
  describe('constructor', () => {
    when('contract is initiated', () => {
      then('no DEX is initially supported', async () => {
        expect(await DCAHubCompanionSwapHandler.isDexSupported(DEX)).to.be.false;
      });
    });
  });
  describe('defineDexSupport', () => {
    const DEX = wallet.generateRandomAddress();
    when('called with zero address', () => {
      then('reverts with message', async () => {
        await behaviours.txShouldRevertWithMessage({
          contract: DCAHubCompanionSwapHandler.connect(governor),
          func: 'defineDexSupport',
          args: [constants.ZERO_ADDRESS, true],
          message: 'ZeroAddress',
        });
      });
    });
    when('support is added', () => {
      given(async () => await DCAHubCompanionSwapHandler.connect(governor).defineDexSupport(DEX, true));
      then('it is reflected correctly', async () => {
        expect(await DCAHubCompanionSwapHandler.isDexSupported(DEX)).to.be.true;
      });
    });
    when('support is removed', () => {
      given(async () => {
        const contractWithGovernor = DCAHubCompanionSwapHandler.connect(governor);
        await contractWithGovernor.defineDexSupport(DEX, true);
        await contractWithGovernor.defineDexSupport(DEX, false);
      });
      then('it is reflected correctly', async () => {
        expect(await DCAHubCompanionSwapHandler.isDexSupported(DEX)).to.be.false;
      });
    });
    behaviours.shouldBeExecutableOnlyByGovernor({
      contract: () => DCAHubCompanionSwapHandler,
      funcAndSignature: 'defineDexSupport',
      params: () => [DEX, true],
      governor: () => governor,
    });
  });
  describe('swapForCaller', () => {
    const SOME_RANDOM_ADDRESS = wallet.generateRandomAddress();
    whenDeadlineHasExpiredThenTxReverts({
      func: 'swapForCaller',
      args: () => [tokens, INDEXES, [], [], SOME_RANDOM_ADDRESS, 0],
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
          contract: DCAHubCompanionSwapHandler,
          func: 'swapForCaller',
          args: [tokens, INDEXES, [MIN_OUTPUT, MIN_OUTPUT], [MAX_INPUT, MAX_INPUT], SOME_RANDOM_ADDRESS, constants.MAX_UINT_256],
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
          contract: DCAHubCompanionSwapHandler,
          func: 'swapForCaller',
          args: [tokens, INDEXES, [MIN_OUTPUT, MIN_OUTPUT], [MAX_INPUT, MAX_INPUT], SOME_RANDOM_ADDRESS, constants.MAX_UINT_256],
          message: 'ToProvideIsTooMuch',
        });
      });
    });
    when('swap is executed without any value', () => {
      given(async () => {
        await DCAHubCompanionSwapHandler.connect(swapper).swapForCaller(tokens, INDEXES, [], [], SOME_RANDOM_ADDRESS, constants.MAX_UINT_256);
      });
      thenHubIsCalledWith({
        rewardRecipient: SOME_RANDOM_ADDRESS,
        data: () => encode({ plan: 'swap for caller', bytes: { caller: swapper, msgValue: 0 } }),
      });
    });
    when('swap is executed with some value', () => {
      const SENT_VALUE = 1000;
      given(async () => {
        await DCAHubCompanionSwapHandler.connect(swapper).swapForCaller(tokens, INDEXES, [], [], SOME_RANDOM_ADDRESS, constants.MAX_UINT_256, {
          value: SENT_VALUE,
        });
      });
      thenHubIsCalledWith({
        rewardRecipient: SOME_RANDOM_ADDRESS,
        data: () => encode({ plan: 'swap for caller', bytes: { caller: swapper, msgValue: SENT_VALUE } }),
      });
    });
  });
  describe('swapWithDex', () => {
    const BYTES = ethers.utils.randomBytes(10);
    given(async () => await DCAHubCompanionSwapHandler.connect(governor).defineDexSupport(DEX, true));
    whenDeadlineHasExpiredThenTxReverts({
      func: 'swapWithDex',
      args: () => [DEX, tokens, INDEXES, [], false, constants.NOT_ZERO_ADDRESS, 0],
    });
    whenUnsupportedDexIsUsedThenTxReverts({
      func: 'swapWithDex',
      args: () => [wallet.generateRandomAddress(), tokens, INDEXES, [], false, constants.NOT_ZERO_ADDRESS, constants.MAX_UINT_256],
    });
    when('swap is executed without swap and transfer', () => {
      given(async () => {
        await DCAHubCompanionSwapHandler.connect(swapper).swapWithDex(
          DEX,
          tokens,
          INDEXES,
          [BYTES],
          false,
          swapper.address,
          constants.MAX_UINT_256
        );
      });
      thenHubIsCalledWith({
        rewardRecipient: () => DCAHubCompanionSwapHandler,
        data: () =>
          encode({
            plan: 'dex',
            bytes: { dex: DEX, leftoverRecipient: swapper, callsToDex: [BYTES], sendToProvideLeftoverToHub: false, swapAndTransfer: false },
          }),
      });
    });
    when('swap is executed with swap and transfer', () => {
      given(async () => {
        await DCAHubCompanionSwapHandler.connect(swapper).swapWithDex(
          DEX,
          tokens,
          INDEXES,
          [BYTES],
          true,
          swapper.address,
          constants.MAX_UINT_256
        );
      });
      thenHubIsCalledWith({
        rewardRecipient: () => DCAHubCompanionSwapHandler,
        data: () =>
          encode({
            plan: 'dex',
            bytes: { dex: DEX, leftoverRecipient: swapper, callsToDex: [BYTES], sendToProvideLeftoverToHub: false, swapAndTransfer: true },
          }),
      });
    });
  });
  describe('swapWithDexAndShareLeftoverWithHub', () => {
    const BYTES = ethers.utils.randomBytes(10);
    given(async () => await DCAHubCompanionSwapHandler.connect(governor).defineDexSupport(DEX, true));
    whenDeadlineHasExpiredThenTxReverts({
      func: 'swapWithDexAndShareLeftoverWithHub',
      args: () => [DEX, tokens, INDEXES, [], false, constants.NOT_ZERO_ADDRESS, 0],
    });
    whenUnsupportedDexIsUsedThenTxReverts({
      func: 'swapWithDexAndShareLeftoverWithHub',
      args: () => [wallet.generateRandomAddress(), tokens, INDEXES, [], false, constants.NOT_ZERO_ADDRESS, constants.MAX_UINT_256],
    });
    when('swap is executed without swap and transfer', () => {
      given(async () => {
        await DCAHubCompanionSwapHandler.connect(swapper).swapWithDexAndShareLeftoverWithHub(
          DEX,
          tokens,
          INDEXES,
          [BYTES],
          false,
          swapper.address,
          constants.MAX_UINT_256
        );
      });
      thenHubIsCalledWith({
        rewardRecipient: () => DCAHubCompanionSwapHandler,
        data: () =>
          encode({
            plan: 'dex',
            bytes: { dex: DEX, leftoverRecipient: swapper, callsToDex: [BYTES], sendToProvideLeftoverToHub: true, swapAndTransfer: false },
          }),
      });
    });
    when('swap is executed with swap and transfer', () => {
      given(async () => {
        await DCAHubCompanionSwapHandler.connect(swapper).swapWithDexAndShareLeftoverWithHub(
          DEX,
          tokens,
          INDEXES,
          [BYTES],
          true,
          swapper.address,
          constants.MAX_UINT_256
        );
      });
      thenHubIsCalledWith({
        rewardRecipient: () => DCAHubCompanionSwapHandler,
        data: () =>
          encode({
            plan: 'dex',
            bytes: { dex: DEX, leftoverRecipient: swapper, callsToDex: [BYTES], sendToProvideLeftoverToHub: true, swapAndTransfer: true },
          }),
      });
    });
  });

  describe('DCAHubSwapCall', () => {
    const AMOUNT_TO_PROVIDE_OF_WTOKEN = 200;
    let tokensInSwap: { token: string; toProvide: BigNumberish; reward: BigNumberish; platformFee: BigNumberish }[];
    let DCAHubCompanionSwapHandler: DCAHubCompanionSwapHandlerMock;
    given(async () => {
      tokensInSwap = [
        { token: wToken.address, toProvide: wToken.asUnits(AMOUNT_TO_PROVIDE_OF_WTOKEN), reward: 0, platformFee: 0 },
        { token: tokenA.address, toProvide: tokenA.asUnits(100), reward: 0, platformFee: 0 },
      ];
      DCAHubCompanionSwapHandler = await DCAHubCompanionSwapHandlerFactory.deploy(hub.address, wToken.address, governor.address);
    });
    when('caller is not the hub', () => {
      then('reverts with message', async () => {
        await behaviours.txShouldRevertWithMessage({
          contract: DCAHubCompanionSwapHandler,
          func: 'DCAHubSwapCall',
          args: [DCAHubCompanionSwapHandler.address, tokensInSwap, [], ethers.utils.randomBytes(5)],
          message: 'CallbackNotCalledByHub',
        });
      });
    });
    when('sender is not this same contract', () => {
      then('reverts with message', async () => {
        await behaviours.txShouldRevertWithMessage({
          contract: DCAHubCompanionSwapHandler.connect(hub),
          func: 'DCAHubSwapCall',
          args: [constants.NOT_ZERO_ADDRESS, tokensInSwap, [], ethers.utils.randomBytes(5)],
          message: 'SwapNotInitiatedByCompanion',
        });
      });
    });
    when('the swap plan is unexpected', () => {
      const SWAP_DATA = ABI_CODER.encode(['tuple(uint256, bytes)'], [[0, ethers.utils.randomBytes(5)]]);
      then('reverts with message', async () => {
        await behaviours.txShouldRevertWithMessage({
          contract: DCAHubCompanionSwapHandler.connect(hub),
          func: 'DCAHubSwapCall',
          args: [DCAHubCompanionSwapHandler.address, tokensInSwap, [], SWAP_DATA],
          message: 'UnexpectedSwapPlan',
        });
      });
    });
    when('the swap plan is invalid', () => {
      const SWAP_DATA = ABI_CODER.encode(['tuple(uint256, bytes)'], [[10, ethers.utils.randomBytes(5)]]);
      then('reverts with message', async () => {
        await behaviours.txShouldRevertWithMessage({
          contract: DCAHubCompanionSwapHandler.connect(hub),
          func: 'DCAHubSwapCall',
          args: [DCAHubCompanionSwapHandler.address, tokensInSwap, [], SWAP_DATA],
          // This happens when an invalid plan (not part of the enum) is sent
          message: `Transaction reverted and Hardhat couldn't infer the reason. Please report this to help us improve Hardhat.`,
        });
      });
    });
    describe('handleSwapForCaller', () => {
      const swapDataWithValue = (msgValue: BigNumberish) => encode({ plan: 'swap for caller', bytes: { caller: swapper, msgValue } });
      when('swap for caller plan is executed without less of protocol token than required', () => {
        let tx: Promise<TransactionResponse>;
        given(async () => {
          const sentProtocolToken = wToken.asUnits(AMOUNT_TO_PROVIDE_OF_WTOKEN).sub(1);
          await ethers.provider.send('hardhat_setBalance', [DCAHubCompanionSwapHandler.address, ethers.utils.hexValue(sentProtocolToken)]);
          const swapData = swapDataWithValue(sentProtocolToken);
          await mintAndApproveTokens();
          tx = DCAHubCompanionSwapHandler.connect(hub).DCAHubSwapCall(DCAHubCompanionSwapHandler.address, tokensInSwap, [], swapData);
        });
        then('tx reverts with message', async () => {
          await behaviours.checkTxRevertedWithMessage({ tx, message: 'Transaction reverted: function call failed to execute' });
        });
      });

      handleSwapForCallerTest({
        when: 'swap for caller plan is executed without protocol token',
        sentProtocolToken: 0,
      });

      handleSwapForCallerTest({
        when: 'swap for caller plan is executed with the exact amount of protocol token',
        sentProtocolToken: AMOUNT_TO_PROVIDE_OF_WTOKEN,
      });

      handleSwapForCallerTest({
        when: 'swap for caller plan is executed with more protocol token than needed',
        sentProtocolToken: AMOUNT_TO_PROVIDE_OF_WTOKEN + 1,
      });

      function handleSwapForCallerTest({ when: title, sentProtocolToken }: { when: string; sentProtocolToken: number }) {
        when(title, () => {
          let initialSwapperBalance: BigNumber;
          let sentProtocolTokenAsUnits: BigNumber;
          given(async () => {
            sentProtocolTokenAsUnits = wToken.asUnits(sentProtocolToken);
            const swapData = swapDataWithValue(sentProtocolTokenAsUnits);
            await ethers.provider.send('hardhat_setBalance', [
              DCAHubCompanionSwapHandler.address,
              ethers.utils.hexValue(sentProtocolTokenAsUnits),
            ]);
            await mintAndApproveTokens();
            initialSwapperBalance = await ethers.provider.getBalance(swapper.address);
            await DCAHubCompanionSwapHandler.connect(hub).DCAHubSwapCall(DCAHubCompanionSwapHandler.address, tokensInSwap, [], swapData);
          });
          then('tokens are sent from the swapper to the hub correctly', async () => {
            for (const tokenInSwap of tokensInSwap) {
              const token = fromAddressToToken(tokenInSwap.token);
              expect(await token.balanceOf(swapper.address)).to.equal(0);
              expect(await token.balanceOf(hub.address)).to.equal(tokenInSwap.toProvide);
            }
          });
          then(`companion's protocol token balance continues to be 0`, async () => {
            const balance = await ethers.provider.getBalance(DCAHubCompanionSwapHandler.address);
            expect(balance).to.equal(0);
          });
          if (sentProtocolToken > AMOUNT_TO_PROVIDE_OF_WTOKEN) {
            then('extra tokens are returned to original caller', async () => {
              const balance = await ethers.provider.getBalance(swapper.address);
              expect(balance).to.equal(initialSwapperBalance.add(sentProtocolTokenAsUnits.sub(wToken.asUnits(AMOUNT_TO_PROVIDE_OF_WTOKEN))));
            });
          }
        });
      }
      async function mintAndApproveTokens() {
        for (const tokenInSwap of tokensInSwap) {
          const token = fromAddressToToken(tokenInSwap.token);
          await token.mint(swapper.address, tokenInSwap.toProvide);
          await token.connect(swapper).approve(DCAHubCompanionSwapHandler.address, tokenInSwap.toProvide);
        }
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
          bytes: { dex: DEX, leftoverRecipient: swapper, callsToDex, swapAndTransfer, sendToProvideLeftoverToHub: sendToHubFlag },
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
          await DCAHubCompanionSwapHandler.connect(hub).DCAHubSwapCall(
            DCAHubCompanionSwapHandler.address,
            tokensInSwap,
            [],
            swapData({ callsToDex: BYTES, sendToHubFlag: true, swapAndTransfer: true })
          );
        });
        then('reward tokens are approved', () => {
          expect(tokenB.approve).to.have.been.calledOnce;
          expect(tokenB.approve).to.have.been.calledWith(DEX, REWARD_AMOUNT_TOKEN_B);
        });
        then('tokens that are not reward are not approved', () => {
          expect(tokenA.approve).to.not.have.been.called;
        });
        then('dex calls are executed', async () => {
          const calls = await DCAHubCompanionSwapHandler.callsToDex(DEX);
          for (let i = 0; i < BYTES.length; i++) {
            expect(calls[i]).to.equal(ethers.utils.hexlify(BYTES[i]));
          }
        });
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
            await DCAHubCompanionSwapHandler.connect(hub).DCAHubSwapCall(DCAHubCompanionSwapHandler.address, tokensInSwap, [], data);
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
        return wToken;
    }
    throw new Error('Unknown address');
  }
  function whenDeadlineHasExpiredThenTxReverts({ func, args }: { func: keyof DCAHubCompanionSwapHandlerMock['functions']; args: () => any[] }) {
    when('deadline has expired', () => {
      then('reverts with message', async () => {
        await behaviours.txShouldRevertWithMessage({
          contract: DCAHubCompanionSwapHandler,
          func,
          args: args(),
          message: 'Transaction too old',
        });
      });
    });
  }
  function whenUnsupportedDexIsUsedThenTxReverts({
    func,
    args,
  }: {
    func: keyof DCAHubCompanionSwapHandlerMock['functions'];
    args: () => any[];
  }) {
    when('deadline has expired', () => {
      then('reverts with message', async () => {
        await behaviours.txShouldRevertWithMessage({
          contract: DCAHubCompanionSwapHandler,
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
      const [tokens, indexes, rewardRecipient, callbackHandler, borrow, data] = DCAHub.swap.getCall(0).args;
      expect(tokens).to.eql(tokens);
      expect((indexes as any)[0]).to.eql([0, 1]);
      expect(rewardRecipient).to.equal(
        typeof expectedRewardRecipient === 'string' ? expectedRewardRecipient : expectedRewardRecipient().address
      );
      expect(callbackHandler).to.equal(DCAHubCompanionSwapHandler.address);
      expect(borrow).to.eql([constants.ZERO, constants.ZERO]);
      expect(data).to.equal(expectedData());
    });
  }
  type SwapForCallerData = { caller: { address: string }; msgValue: BigNumberish };
  type SwapWithDex = {
    dex: string;
    leftoverRecipient: { address: string };
    callsToDex: BytesLike[];
    sendToProvideLeftoverToHub: boolean;
    swapAndTransfer: boolean;
  };
  function encode({ plan, bytes }: { plan: 'none' | 'invalid' | 'swap for caller' | 'dex'; bytes: 'random' | SwapForCallerData | SwapWithDex }) {
    let swapPlan: number = 0;
    let swapData: BytesLike;
    if (plan === 'none') {
      swapPlan = 0;
    } else if (plan === 'swap for caller') {
      swapPlan = 1;
    } else if (plan === 'dex') {
      swapPlan = 2;
    } else if (plan === 'invalid') {
      swapPlan = 10;
    }
    if (bytes == 'random') {
      swapData = ethers.utils.randomBytes(10);
    } else if ('caller' in bytes) {
      swapData = ABI_CODER.encode(['tuple(address, uint256)'], [[bytes.caller.address, bytes.msgValue]]);
    } else {
      swapData = ABI_CODER.encode(
        ['tuple(address, bool, bool, address, bytes[])'],
        [[bytes.dex, bytes.sendToProvideLeftoverToHub, bytes.swapAndTransfer, bytes.leftoverRecipient.address, bytes.callsToDex]]
      );
    }
    return ABI_CODER.encode(['tuple(uint256, bytes)'], [[swapPlan, swapData]]);
  }
});
