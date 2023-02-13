import chai, { expect } from 'chai';
import { ethers } from 'hardhat';
import { behaviours, constants, wallet } from '@test-utils';
import { contract, given, then, when } from '@test-utils/bdd';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { snapshot } from '@test-utils/evm';
import { DCAHubSwapperMock, DCAHubSwapperMock__factory, IDCAHub, IERC20, ISwapperRegistry } from '@typechained';
import { FakeContract, smock } from '@defi-wonderland/smock';
import { BigNumberish } from '@ethersproject/bignumber';
import { BytesLike } from '@ethersproject/bytes';
import { utils } from 'ethers';

chai.use(smock.matchers);

contract('DCAHubSwapper', () => {
  const BYTES = utils.hexlify(utils.randomBytes(10));
  let swapExecutioner: SignerWithAddress, recipient: SignerWithAddress, admin: SignerWithAddress, superAdmin: SignerWithAddress;
  let DCAHub: FakeContract<IDCAHub>;
  let DCAHubSwapperFactory: DCAHubSwapperMock__factory;
  let DCAHubSwapper: DCAHubSwapperMock;
  let swapperRegistry: FakeContract<ISwapperRegistry>;
  let tokenA: FakeContract<IERC20>, tokenB: FakeContract<IERC20>, intermediateToken: FakeContract<IERC20>;
  let swapExecutionRole: string, adminRole: string, superAdminRole: string;
  let snapshotId: string;

  const INDEXES = [{ indexTokenA: 0, indexTokenB: 1 }];
  let tokens: string[];

  before('Setup accounts and contracts', async () => {
    [, swapExecutioner, admin, recipient, superAdmin] = await ethers.getSigners();
    DCAHubSwapperFactory = await ethers.getContractFactory('contracts/mocks/DCAHubSwapper/DCAHubSwapper.sol:DCAHubSwapperMock');
    DCAHub = await smock.fake('IDCAHub');
    swapperRegistry = await smock.fake('ISwapperRegistry');
    DCAHubSwapper = await DCAHubSwapperFactory.deploy(swapperRegistry.address, superAdmin.address, [admin.address], [swapExecutioner.address]);
    tokenA = await smock.fake('IERC20');
    tokenB = await smock.fake('IERC20');
    intermediateToken = await smock.fake('IERC20');
    tokens = [tokenA.address, tokenB.address];
    swapExecutionRole = await DCAHubSwapper.SWAP_EXECUTION_ROLE();
    adminRole = await DCAHubSwapper.ADMIN_ROLE();
    superAdminRole = await DCAHubSwapper.SUPER_ADMIN_ROLE();
    snapshotId = await snapshot.take();
  });

  beforeEach('Deploy and configure', async () => {
    await snapshot.revert(snapshotId);
    DCAHub.swap.reset();
    swapperRegistry.isSwapperAllowlisted.reset();
    swapperRegistry.isSwapperAllowlisted.returns(true);
    swapperRegistry.isValidAllowanceTarget.returns(true);
    tokenA.transfer.reset();
    tokenA.transfer.returns(true);
    tokenB.transfer.returns(true);
    tokenA.transferFrom.returns(true);
    tokenB.transferFrom.returns(true);
  });
  describe('constructor', () => {
    when('super admin is zero address', () => {
      then('tx is reverted with reason error', async () => {
        await behaviours.deployShouldRevertWithMessage({
          contract: DCAHubSwapperFactory,
          args: [swapperRegistry.address, constants.ZERO_ADDRESS, [], []],
          message: 'ZeroAddress',
        });
      });
    });
    when('contract is initiated', () => {
      then('super admin is set correctly', async () => {
        const hasRole = await DCAHubSwapper.hasRole(superAdminRole, superAdmin.address);
        expect(hasRole).to.be.true;
      });
      then('initial admins are set correctly', async () => {
        const hasRole = await DCAHubSwapper.hasRole(adminRole, admin.address);
        expect(hasRole).to.be.true;
      });
      then('initial swap executioners are set correctly', async () => {
        const hasRole = await DCAHubSwapper.hasRole(swapExecutionRole, swapExecutioner.address);
        expect(hasRole).to.be.true;
      });
      then('super admin role is set as admin for super admin role', async () => {
        const admin = await DCAHubSwapper.getRoleAdmin(superAdminRole);
        expect(admin).to.equal(superAdminRole);
      });
      then('super admin role is set as admin for swap execution role', async () => {
        const admin = await DCAHubSwapper.getRoleAdmin(swapExecutionRole);
        expect(admin).to.equal(superAdminRole);
      });
      then('super admin role is set as admin for admin role', async () => {
        const admin = await DCAHubSwapper.getRoleAdmin(adminRole);
        expect(admin).to.equal(superAdminRole);
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
      args: () => [
        {
          hub: DCAHub.address,
          tokens,
          pairsToSwap: INDEXES,
          oracleData: BYTES,
          minimumOutput: [],
          maximumInput: [],
          recipient: SOME_RANDOM_ADDRESS,
          deadline: 0,
        },
      ],
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
          args: [
            {
              hub: DCAHub.address,
              tokens,
              pairsToSwap: INDEXES,
              oracleData: BYTES,
              minimumOutput: [MIN_OUTPUT, MIN_OUTPUT],
              maximumInput: [MAX_INPUT, MAX_INPUT],
              recipient: SOME_RANDOM_ADDRESS,
              deadline: constants.MAX_UINT_256,
            },
          ],
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
          contract: DCAHubSwapper.connect(swapExecutioner),
          func: 'swapForCaller',
          args: [
            {
              hub: DCAHub.address,
              tokens,
              pairsToSwap: INDEXES,
              oracleData: BYTES,
              minimumOutput: [MIN_OUTPUT, MIN_OUTPUT],
              maximumInput: [MAX_INPUT, MAX_INPUT],
              recipient: SOME_RANDOM_ADDRESS,
              deadline: constants.MAX_UINT_256,
            },
          ],
          message: 'ToProvideIsTooMuch',
        });
      });
    });
    when('swap is executed', () => {
      given(async () => {
        await DCAHubSwapper.connect(swapExecutioner).swapForCaller({
          hub: DCAHub.address,
          tokens,
          pairsToSwap: INDEXES,
          oracleData: BYTES,
          minimumOutput: [],
          maximumInput: [],
          recipient: SOME_RANDOM_ADDRESS,
          deadline: constants.MAX_UINT_256,
        });
      });
      thenHubIsCalledWith({
        rewardRecipient: SOME_RANDOM_ADDRESS,
        oracleData: BYTES,
      });
      then('swap executor is cleared', async () => {
        expect(await DCAHubSwapper.isSwapExecutorEmpty()).to.be.true;
      });
    });
    behaviours.shouldBeExecutableOnlyByRole({
      contract: () => DCAHubSwapper,
      funcAndSignature: 'swapForCaller',
      params: () => [
        {
          hub: DCAHub.address,
          tokens,
          pairsToSwap: INDEXES,
          oracleData: BYTES,
          minimumOutput: [0, 0],
          maximumInput: [constants.MAX_UINT_256, constants.MAX_UINT_256],
          recipient: SOME_RANDOM_ADDRESS,
          deadline: constants.MAX_UINT_256,
        },
      ],
      addressWithRole: () => swapExecutioner,
      role: () => swapExecutionRole,
    });
  });
  describe('revokeAllowances', () => {
    when('allowance is revoked', () => {
      given(async () => {
        await DCAHubSwapper.connect(admin).revokeAllowances([{ spender: recipient.address, tokens: [tokenA.address] }]);
      });
      then('revoke was called correctly', async () => {
        const calls = await DCAHubSwapper.revokeAllowancesCalls();
        expect(calls).to.have.lengthOf(1);
        expect(calls[0]).to.have.lengthOf(1);
        expect((calls[0][0] as any).spender).to.equal(recipient.address);
        expect((calls[0][0] as any).tokens).to.eql([tokenA.address]);
      });
    });
    behaviours.shouldBeExecutableOnlyByRole({
      contract: () => DCAHubSwapper,
      funcAndSignature: 'revokeAllowances',
      params: [[]],
      addressWithRole: () => admin,
      role: () => adminRole,
    });
  });
  describe('sendDust', () => {
    when('function is called', () => {
      given(async () => {
        await DCAHubSwapper.connect(admin).sendDust(tokenA.address, 10000, recipient.address);
      });
      then('send to recipient was called correctly', async () => {
        const calls = await DCAHubSwapper.sendToRecipientCalls();
        expect(calls).to.have.lengthOf(1);
        expect(calls).to.have.lengthOf(1);
        expect(calls[0].token).to.equal(tokenA.address);
        expect(calls[0].amount).to.equal(10000);
        expect(calls[0].recipient).to.equal(recipient.address);
      });
    });
    behaviours.shouldBeExecutableOnlyByRole({
      contract: () => DCAHubSwapper,
      funcAndSignature: 'sendDust',
      params: () => [tokenA.address, 10000, recipient.address],
      addressWithRole: () => admin,
      role: () => adminRole,
    });
  });
  describe('DCAHubSwapCall', () => {
    let tokensInSwap: { token: string; toProvide: BigNumberish; reward: BigNumberish; platformFee: BigNumberish }[];
    let hub: SignerWithAddress;
    given(async () => {
      tokensInSwap = [
        { token: tokenB.address, toProvide: utils.parseEther('0.1'), reward: 0, platformFee: 0 },
        { token: tokenA.address, toProvide: utils.parseEther('20'), reward: 0, platformFee: 0 },
      ];
      hub = await ethers.getSigner(DCAHub.address);
      await wallet.setBalance({ account: hub.address, balance: utils.parseEther('1') });
    });
    when('swap for caller', () => {
      given(async () => {
        await DCAHubSwapper.setSwapExecutor(swapExecutioner.address);
        await DCAHubSwapper.connect(hub).DCAHubSwapCall(DCAHubSwapper.address, tokensInSwap, [], []);
      });
      then('tokens are sent from the swap executor to the hub correctly', () => {
        for (const tokenInSwap of tokensInSwap) {
          const token = fromAddressToToken(tokenInSwap.token);
          expect(token.transferFrom).to.have.been.calledWith(swapExecutioner.address, hub.address, tokenInSwap.toProvide);
        }
      });
    });
  });
  function fromAddressToToken(tokenAddress: string): FakeContract<IERC20> {
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
    oracleData: expectedOracleData,
    rewardRecipient: expectedRewardRecipient,
  }: {
    rewardRecipient: string | (() => { address: string });
    oracleData: BytesLike;
  }) {
    then('hub was called with the correct parameters', () => {
      expect(DCAHub.swap).to.have.been.calledOnce;
      const [tokensInHub, indexes, rewardRecipient, callbackHandler, borrow, callbackData, oracleData] = DCAHub.swap.getCall(0).args;
      expect(tokensInHub).to.eql(tokens);
      expect((indexes as any)[0]).to.eql([0, 1]);
      expect(rewardRecipient).to.equal(
        typeof expectedRewardRecipient === 'string' ? expectedRewardRecipient : expectedRewardRecipient().address
      );
      expect(callbackHandler).to.equal(DCAHubSwapper.address);
      expect(borrow).to.have.lengthOf(2);
      expect((borrow as any)[0]).to.equal(constants.ZERO);
      expect((borrow as any)[1]).to.equal(constants.ZERO);
      expect(callbackData).to.equal('0x');
      expect(oracleData).to.equal(expectedOracleData);
    });
  }
});
