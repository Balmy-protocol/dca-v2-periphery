import chai, { expect } from 'chai';
import { ethers } from 'hardhat';
import { behaviours, constants, erc20, wallet } from '@test-utils';
import { contract, given, then, when } from '@test-utils/bdd';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { snapshot } from '@test-utils/evm';
import { DCAHubSwapperMock, DCAHubSwapperMock__factory, IDCAHub, IERC20, ISwapper, ISwapperRegistry } from '@typechained';
import { FakeContract, smock } from '@defi-wonderland/smock';
import { ERC20TokenContract, TokenContract } from '@test-utils/erc20';
import { BigNumberish } from '@ethersproject/bignumber';
import { BytesLike } from '@ethersproject/bytes';
import { TransactionResponse } from '@ethersproject/abstract-provider';
import { utils } from 'ethers';

chai.use(smock.matchers);

contract('DCAHubSwapper', () => {
  const ABI_CODER = new ethers.utils.AbiCoder();
  const DEX = constants.NOT_ZERO_ADDRESS;
  let swapExecutioner: SignerWithAddress, recipient: SignerWithAddress, admin: SignerWithAddress;
  let DCAHub: FakeContract<IDCAHub>;
  let DCAHubSwapperFactory: DCAHubSwapperMock__factory;
  let DCAHubSwapper: DCAHubSwapperMock;
  let swapperRegistry: FakeContract<ISwapperRegistry>;
  let tokenA: ERC20TokenContract, tokenB: ERC20TokenContract;
  let swapExecutionRole: string, adminRole: string;
  let snapshotId: string;

  const INDEXES = [{ indexTokenA: 0, indexTokenB: 1 }];
  let tokens: string[];

  before('Setup accounts and contracts', async () => {
    [, swapExecutioner, admin, recipient] = await ethers.getSigners();
    DCAHubSwapperFactory = await ethers.getContractFactory('contracts/mocks/DCAHubSwapper/DCAHubSwapper.sol:DCAHubSwapperMock');
    DCAHub = await smock.fake('IDCAHub');
    swapperRegistry = await smock.fake('ISwapperRegistry');
    DCAHubSwapper = await DCAHubSwapperFactory.deploy(swapperRegistry.address, admin.address, [swapExecutioner.address]);
    const deploy = (decimals: number) => erc20.deploy({ name: 'A name', symbol: 'SYMB', decimals });
    const deployedTokens = await Promise.all([deploy(12), deploy(16)]);
    [tokenA, tokenB] = deployedTokens.sort((a, b) => a.address.localeCompare(b.address));
    tokens = [tokenA.address, tokenB.address];
    swapExecutionRole = await DCAHubSwapper.SWAP_EXECUTION_ROLE();
    adminRole = await DCAHubSwapper.ADMIN_ROLE();
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
    when('super admin is zero address', () => {
      then('tx is reverted with reason error', async () => {
        await behaviours.deployShouldRevertWithMessage({
          contract: DCAHubSwapperFactory,
          args: [swapperRegistry.address, constants.ZERO_ADDRESS, []],
          message: 'ZeroAddress',
        });
      });
    });
    when('contract is initiated', () => {
      then('admin is set correctly', async () => {
        const hasRole = await DCAHubSwapper.hasRole(adminRole, admin.address);
        expect(hasRole).to.be.true;
      });
      then('initial swap executioners are set correctly', async () => {
        const hasRole = await DCAHubSwapper.hasRole(swapExecutionRole, swapExecutioner.address);
        expect(hasRole).to.be.true;
      });
      then('admin role is set as swap execution role', async () => {
        const admin = await DCAHubSwapper.getRoleAdmin(swapExecutionRole);
        expect(admin).to.equal(adminRole);
      });
      then('swap executor starts empty', async () => {
        expect(await DCAHubSwapper.isSwapExecutorEmpty()).to.be.true;
      });
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
          contract: DCAHubSwapper.connect(swapExecutioner),
          func: 'swapForCaller',
          args: [DCAHub.address, tokens, INDEXES, [MIN_OUTPUT, MIN_OUTPUT], [MAX_INPUT, MAX_INPUT], SOME_RANDOM_ADDRESS, constants.MAX_UINT_256],
          message: 'RewardNotEnough',
        });
      });
      behaviours.shouldBeExecutableOnlyByRole({
        contract: () => DCAHubSwapper,
        funcAndSignature: 'swapForCaller',
        params: () => [
          DCAHub.address,
          tokens,
          INDEXES,
          [MIN_OUTPUT, MIN_OUTPUT],
          [MAX_INPUT, MAX_INPUT],
          SOME_RANDOM_ADDRESS,
          constants.MAX_UINT_256,
        ],
        addressWithRole: () => swapExecutioner,
        role: () => swapExecutionRole,
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
          contract: DCAHubSwapper.connect(swapExecutioner),
          func: 'swapForCaller',
          args: [DCAHub.address, tokens, INDEXES, [MIN_OUTPUT, MIN_OUTPUT], [MAX_INPUT, MAX_INPUT], SOME_RANDOM_ADDRESS, constants.MAX_UINT_256],
          message: 'ToProvideIsTooMuch',
        });
      });
    });
    when('swap is executed', () => {
      given(async () => {
        await DCAHubSwapper.connect(swapExecutioner).swapForCaller(
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
        expect(await DCAHubSwapper.isSwapExecutorEmpty()).to.be.true;
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
        await DCAHubSwapper.connect(swapExecutioner).swapWithDexes({
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
        const calls = await DCAHubSwapper.maxApproveSpenderCalls();
        expect(calls).to.have.lengthOf(1);
        expect(calls[0].token).to.equal(tokenA.address);
        expect(calls[0].spender).to.equal(DEX);
        expect(calls[0].minAllowance).to.equal(2000);
        expect(calls[0].alreadyValidatedSpender).to.be.false;
      });
      thenHubIsCalledWith({
        rewardRecipient: () => DCAHubSwapper,
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
    behaviours.shouldBeExecutableOnlyByRole({
      contract: () => DCAHubSwapper,
      funcAndSignature: 'swapWithDexes',
      params: () => [
        {
          hub: DCAHub.address,
          tokens: tokens,
          pairsToSwap: INDEXES,
          allowanceTargets: [{ token: tokenA.address, allowanceTarget: DEX, minAllowance: 2000 }],
          swappers: [DEX],
          executions: [{ swapData: BYTES, swapperIndex: 0 }],
          leftoverRecipient: recipient.address,
          deadline: constants.MAX_UINT_256,
        },
      ],
      addressWithRole: () => swapExecutioner,
      role: () => swapExecutionRole,
    });
  });
  describe('swapWithDexesForMean', () => {
    const BYTES = ethers.utils.randomBytes(10);
    whenDeadlineHasExpiredThenTxReverts({
      func: 'swapWithDexesForMean',
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
        await DCAHubSwapper.connect(swapExecutioner).swapWithDexesForMean({
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
        const calls = await DCAHubSwapper.maxApproveSpenderCalls();
        expect(calls).to.have.lengthOf(1);
        expect(calls[0].token).to.equal(tokenA.address);
        expect(calls[0].spender).to.equal(DEX);
        expect(calls[0].minAllowance).to.equal(2000);
        expect(calls[0].alreadyValidatedSpender).to.be.false;
      });
      thenHubIsCalledWith({
        rewardRecipient: () => DCAHubSwapper,
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
    behaviours.shouldBeExecutableOnlyByRole({
      contract: () => DCAHubSwapper,
      funcAndSignature: 'swapWithDexesForMean',
      params: () => [
        {
          hub: DCAHub.address,
          tokens: tokens,
          pairsToSwap: INDEXES,
          allowanceTargets: [{ token: tokenA.address, allowanceTarget: DEX, minAllowance: 2000 }],
          swappers: [DEX],
          executions: [{ swapData: BYTES, swapperIndex: 0 }],
          leftoverRecipient: recipient.address,
          deadline: constants.MAX_UINT_256,
        },
      ],
      addressWithRole: () => swapExecutioner,
      role: () => swapExecutionRole,
    });
  });
  describe('DCAHubSwapCall', () => {
    let tokensInSwap: { token: string; toProvide: BigNumberish; reward: BigNumberish; platformFee: BigNumberish }[];
    let hub: SignerWithAddress;
    given(async () => {
      tokensInSwap = [
        { token: tokenB.address, toProvide: tokenB.asUnits(200), reward: 0, platformFee: 0 },
        { token: tokenA.address, toProvide: tokenA.asUnits(100), reward: 0, platformFee: 0 },
      ];
      hub = await ethers.getSigner(DCAHub.address);
      await wallet.setBalance({ account: hub.address, balance: utils.parseEther('1') });
    });
    when('the swap plan is unexpected', () => {
      const SWAP_DATA = ABI_CODER.encode(['tuple(uint256, bytes)'], [[0, ethers.utils.randomBytes(5)]]);
      then('reverts with message', async () => {
        await behaviours.txShouldRevertWithMessage({
          contract: DCAHubSwapper.connect(hub),
          func: 'DCAHubSwapCall',
          args: [DCAHubSwapper.address, tokensInSwap, [], SWAP_DATA],
          message: 'UnexpectedSwapPlan',
        });
      });
    });
    when('the swap plan is invalid', () => {
      const SWAP_DATA = ABI_CODER.encode(['tuple(uint256, bytes)'], [[10, ethers.utils.randomBytes(5)]]);
      then('reverts with message', async () => {
        await behaviours.txShouldRevertWithMessage({
          contract: DCAHubSwapper.connect(hub),
          func: 'DCAHubSwapCall',
          args: [DCAHubSwapper.address, tokensInSwap, [], SWAP_DATA],
          // This happens when an invalid plan (not part of the enum) is sent
          message: `Transaction reverted and Hardhat couldn't infer the reason. Please report this to help us improve Hardhat.`,
        });
      });
    });
    describe('handleSwapForCaller', () => {
      when('swap for caller plan is executed', () => {
        given(async () => {
          await mintAndApproveTokens();
          await DCAHubSwapper.setSwapExecutor(swapExecutioner.address);
          await DCAHubSwapper.connect(hub).DCAHubSwapCall(
            DCAHubSwapper.address,
            tokensInSwap,
            [],
            encode({ plan: 'swap for caller', bytes: 'none' })
          );
        });
        then('tokens are sent from the swap executor to the hub correctly', async () => {
          for (const tokenInSwap of tokensInSwap) {
            const token = fromAddressToToken(tokenInSwap.token);
            expect(await token.balanceOf(swapExecutioner.address)).to.equal(0);
            expect(await token.balanceOf(hub.address)).to.equal(tokenInSwap.toProvide);
          }
        });
      });
      async function mintAndApproveTokens() {
        for (const tokenInSwap of tokensInSwap) {
          const token = fromAddressToToken(tokenInSwap.token);
          await token.mint(swapExecutioner.address, tokenInSwap.toProvide);
          await token.connect(swapExecutioner).approve(DCAHubSwapper.address, tokenInSwap.toProvide);
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
          tx = DCAHubSwapper.connect(hub).DCAHubSwapCall(constants.ZERO_ADDRESS, [], [], data);
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
          tx = DCAHubSwapper.connect(hub).DCAHubSwapCall(constants.ZERO_ADDRESS, [], [], data);
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
            await DCAHubSwapper.connect(hub).DCAHubSwapCall(constants.ZERO_ADDRESS, tokensInSwap, [], data);
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
  });
  function fromAddressToToken(tokenAddress: string): TokenContract<ERC20TokenContract> {
    switch (tokenAddress) {
      case tokenA.address:
        return tokenA;
      case tokenB.address:
        return tokenB;
    }
    throw new Error('Unknown address');
  }
  function whenDeadlineHasExpiredThenTxReverts({ func, args }: { func: keyof DCAHubSwapperMock['functions']; args: () => any[] }) {
    when('deadline has expired', () => {
      then('reverts with message', async () => {
        await behaviours.txShouldRevertWithMessage({
          contract: DCAHubSwapper.connect(swapExecutioner),
          func,
          args: args(),
          message: 'Transaction too old',
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
      expect(callbackHandler).to.equal(DCAHubSwapper.address);
      expect(borrow).to.eql([constants.ZERO, constants.ZERO]);
      expect(data).to.equal(expectedData());
    });
  }
  type SwapWithDexes = {
    swappers: string[];
    executions: { data: BytesLike; index: number }[];
    sendToProvideLeftoverToHub: boolean;
    leftoverRecipient: { address: string };
  };
  function encode({ plan, bytes }: { plan: 'none' | 'invalid' | 'swap for caller' | 'dexes'; bytes: 'none' | 'random' | SwapWithDexes }) {
    let swapPlan: number = 0;
    let swapData: BytesLike;
    if (plan === 'none') {
      swapPlan = 0;
    } else if (plan === 'swap for caller') {
      swapPlan = 1;
    } else if (plan === 'dexes') {
      swapPlan = 2;
    } else if (plan === 'invalid') {
      swapPlan = 10;
    }
    if (bytes == 'random') {
      swapData = ethers.utils.randomBytes(10);
    } else if (bytes == 'none') {
      swapData = [];
    } else {
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
    }
    return ABI_CODER.encode(['tuple(uint256, bytes)'], [[swapPlan, swapData]]);
  }
});
