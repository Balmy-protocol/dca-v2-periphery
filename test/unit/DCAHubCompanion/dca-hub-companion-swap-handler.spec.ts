import chai, { expect } from 'chai';
import { ethers } from 'hardhat';
import { behaviours, constants, erc20 } from '@test-utils';
import { contract, given, then, when } from '@test-utils/bdd';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signers';
import { snapshot } from '@test-utils/evm';
import {
  DCAHubCompanionSwapHandlerMock,
  DCAHubCompanionSwapHandlerMock__factory,
  IDCAHub,
  WrappedPlatformTokenMock,
  WrappedPlatformTokenMock__factory,
} from '@typechained';
import { FakeContract, smock } from '@defi-wonderland/smock';
import { addExtra, ERC20TokenContract, TokenContract } from '@test-utils/erc20';
import moment from 'moment';
import { TransactionResponse } from '@ethersproject/abstract-provider';
import { BigNumber, BigNumberish } from '@ethersproject/bignumber';
import { BytesLike } from '@ethersproject/bytes';

chai.use(smock.matchers);

contract.only('DCAHubCompanionSwapHandler', () => {
  const ABI_CODER = new ethers.utils.AbiCoder();
  const ZRX = constants.NOT_ZERO_ADDRESS;
  let swapper: SignerWithAddress, hub: SignerWithAddress;
  let DCAHub: FakeContract<IDCAHub>;
  let DCAHubCompanionSwapHandler: DCAHubCompanionSwapHandlerMock;
  let DCAHubCompanionSwapHandlerFactory: DCAHubCompanionSwapHandlerMock__factory;
  let wToken: TokenContract<WrappedPlatformTokenMock>;
  let tokenA: ERC20TokenContract, tokenB: ERC20TokenContract;
  let snapshotId: string;

  const INDEXES = [{ indexTokenA: 0, indexTokenB: 1 }];
  let tokens: string[];

  before('Setup accounts and contracts', async () => {
    [, swapper, hub] = await ethers.getSigners();
    DCAHubCompanionSwapHandlerFactory = await ethers.getContractFactory(
      'contracts/mocks/DCAHubCompanion/DCAHubCompanionSwapHandler.sol:DCAHubCompanionSwapHandlerMock'
    );
    const wTokenFactory: WrappedPlatformTokenMock__factory = await ethers.getContractFactory(
      'contracts/mocks/WrappedPlatformTokenMock.sol:WrappedPlatformTokenMock'
    );
    wToken = await addExtra(await wTokenFactory.deploy('WETH', 'WETH', 18));
    DCAHub = await smock.fake('IDCAHub');
    DCAHubCompanionSwapHandler = await DCAHubCompanionSwapHandlerFactory.deploy(DCAHub.address, wToken.address, ZRX);
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
    when('ZRX is zero address', () => {
      then('deployment is reverted with reason', async () => {
        await behaviours.deployShouldRevertWithMessage({
          contract: DCAHubCompanionSwapHandlerFactory,
          args: [constants.NOT_ZERO_ADDRESS, constants.NOT_ZERO_ADDRESS, constants.ZERO_ADDRESS],
          message: 'ZeroAddress',
        });
      });
    });
    when('contract is initiated', () => {
      then('ZRX is set correctly', async () => {
        expect(await DCAHubCompanionSwapHandler.ZRX()).to.equal(ZRX);
      });
    });
  });
  describe('swapForCaller', () => {
    whenDeadlineHasExpiredThenTxReverts({
      func: 'swapForCaller',
      args: () => [tokens, INDEXES, [], [], moment().unix() - 1],
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
          args: [tokens, INDEXES, [MIN_OUTPUT, MIN_OUTPUT], [MAX_INPUT, MAX_INPUT], constants.MAX_UINT_256],
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
          args: [tokens, INDEXES, [MIN_OUTPUT, MIN_OUTPUT], [MAX_INPUT, MAX_INPUT], constants.MAX_UINT_256],
          message: 'ToProvideIsTooMuch',
        });
      });
    });
    when('swap is executed without any value', () => {
      given(async () => {
        await DCAHubCompanionSwapHandler.connect(swapper).swapForCaller(tokens, INDEXES, [], [], constants.MAX_UINT_256);
      });
      thenHubWasCalledWith({
        rewardRecipient: () => swapper,
        data: () => encode({ plan: 'swap for caller', bytes: { caller: swapper, msgValue: 0 } }),
      });
    });
    when('swap is executed with some value', () => {
      const SENT_VALUE = 1000;
      given(async () => {
        await DCAHubCompanionSwapHandler.connect(swapper).swapForCaller(tokens, INDEXES, [], [], constants.MAX_UINT_256, { value: SENT_VALUE });
      });
      thenHubWasCalledWith({
        rewardRecipient: () => swapper,
        data: () => encode({ plan: 'swap for caller', bytes: { caller: swapper, msgValue: SENT_VALUE } }),
      });
    });
  });
  describe('swapWith0x', () => {
    const BYTES = ethers.utils.randomBytes(10);
    whenDeadlineHasExpiredThenTxReverts({
      func: 'swapWith0x',
      args: () => [tokens, INDEXES, [], constants.NOT_ZERO_ADDRESS, moment().unix() - 1],
    });
    when('swap is executed', () => {
      given(async () => {
        await DCAHubCompanionSwapHandler.connect(swapper).swapWith0x(tokens, INDEXES, [BYTES], swapper.address, constants.MAX_UINT_256);
      });
      thenHubWasCalledWith({
        rewardRecipient: () => DCAHubCompanionSwapHandler,
        data: () => encode({ plan: '0x', bytes: { leftoverRecipient: swapper, callsTo0x: [BYTES], sendToProvideLeftoverToHub: false } }),
      });
    });
  });
  describe('swapWith0xAndShareLeftoverWithHub', () => {
    const BYTES = ethers.utils.randomBytes(10);
    whenDeadlineHasExpiredThenTxReverts({
      func: 'swapWith0xAndShareLeftoverWithHub',
      args: () => [tokens, INDEXES, [], constants.NOT_ZERO_ADDRESS, moment().unix() - 1],
    });
    when('swap is executed', () => {
      given(async () => {
        await DCAHubCompanionSwapHandler.connect(swapper).swapWith0xAndShareLeftoverWithHub(
          tokens,
          INDEXES,
          [BYTES],
          swapper.address,
          constants.MAX_UINT_256
        );
      });
      thenHubWasCalledWith({
        rewardRecipient: () => DCAHubCompanionSwapHandler,
        data: () => encode({ plan: '0x', bytes: { leftoverRecipient: swapper, callsTo0x: [BYTES], sendToProvideLeftoverToHub: true } }),
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
      DCAHubCompanionSwapHandler = await DCAHubCompanionSwapHandlerFactory.deploy(hub.address, wToken.address, ZRX);
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
      const swapDataWithValue = (msgValue: BigNumberish) => encode({ plan: 'swap for caller', bytes: { caller: swapper, msgValue: msgValue } });
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
  function thenHubWasCalledWith({
    data: expectedData,
    rewardRecipient: expectedRewardRecipient,
  }: {
    rewardRecipient: () => { address: string };
    data: () => BytesLike;
  }) {
    then('hub was called with the correct parameters', () => {
      expect(DCAHub.swap).to.have.been.calledOnce;
      const [tokens, indexes, rewardRecipient, callbackHandler, borrow, data] = DCAHub.swap.getCall(0).args;
      expect(tokens).to.eql(tokens);
      expect((indexes as any)[0]).to.eql([0, 1]);
      expect(rewardRecipient).to.equal(expectedRewardRecipient().address);
      expect(callbackHandler).to.equal(DCAHubCompanionSwapHandler.address);
      expect(borrow).to.eql([constants.ZERO, constants.ZERO]);
      expect(data).to.equal(expectedData());
    });
  }
  type SwapForCallerData = { caller: { address: string }; msgValue: BigNumberish };
  type SwapWith0x = { leftoverRecipient: { address: string }; callsTo0x: BytesLike[]; sendToProvideLeftoverToHub: boolean };
  function encode({ plan, bytes }: { plan: 'none' | 'invalid' | 'swap for caller' | '0x'; bytes: 'random' | SwapForCallerData | SwapWith0x }) {
    let swapPlan: number = 0;
    let swapData: BytesLike;
    if (plan === 'none') {
      swapPlan = 0;
    } else if (plan === 'swap for caller') {
      swapPlan = 1;
    } else if (plan === '0x') {
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
        ['tuple(address, bytes[], bool)'],
        [[bytes.leftoverRecipient.address, bytes.callsTo0x, bytes.sendToProvideLeftoverToHub]]
      );
    }
    return ABI_CODER.encode(['tuple(uint256, bytes)'], [[swapPlan, swapData]]);
  }
});
