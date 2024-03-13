import chai, { expect } from 'chai';
import { ethers } from 'hardhat';
import { contract, given, then, when } from '@test-utils/bdd';
import { snapshot } from '@test-utils/evm';
import { DCAFeeManagerMock, DCAFeeManagerMock__factory, IDCAHub, IDCAHubPositionHandler, IERC20 } from '@typechained';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { duration } from 'moment';
import { behaviours, wallet } from '@test-utils';
import { IDCAFeeManager } from '@typechained/contracts/DCAFeeManager/DCAFeeManager';
import { FakeContract, smock } from '@defi-wonderland/smock';
import { BigNumber, BigNumberish, constants, utils } from 'ethers';

chai.use(smock.matchers);

contract('DCAFeeManager', () => {
  const TOKEN_A = '0x0000000000000000000000000000000000000010';
  const TOKEN_B = '0x0000000000000000000000000000000000000011';
  const MAX_SHARES = 10000;
  const SWAP_INTERVAL = duration(1, 'day').asSeconds();
  let DCAHub: FakeContract<IDCAHub>;
  let DCAFeeManager: DCAFeeManagerMock;
  let DCAFeeManagerFactory: DCAFeeManagerMock__factory;
  let erc20Token: FakeContract<IERC20>;
  let random: SignerWithAddress, superAdmin: SignerWithAddress, admin: SignerWithAddress;
  let superAdminRole: string, adminRole: string;
  let snapshotId: string;

  before('Setup accounts and contracts', async () => {
    [random, superAdmin, admin] = await ethers.getSigners();
    DCAHub = await smock.fake('IDCAHub');
    erc20Token = await smock.fake('IERC20');
    DCAFeeManagerFactory = await ethers.getContractFactory('contracts/mocks/DCAFeeManager/DCAFeeManager.sol:DCAFeeManagerMock');
    DCAFeeManager = await DCAFeeManagerFactory.deploy(superAdmin.address, [admin.address]);
    superAdminRole = await DCAFeeManager.SUPER_ADMIN_ROLE();
    adminRole = await DCAFeeManager.ADMIN_ROLE();
    snapshotId = await snapshot.take();
  });

  beforeEach(async () => {
    await snapshot.revert(snapshotId);
    DCAHub.platformBalance.reset();
    DCAHub.withdrawFromPlatformBalance.reset();
    DCAHub.withdrawSwappedMany.reset();
    DCAHub['deposit(address,address,uint256,uint32,uint32,address,(address,uint8[])[])'].reset();
    DCAHub.increasePosition.reset();
    DCAHub.terminate.reset();
    erc20Token.allowance.reset();
    erc20Token.approve.reset();
    erc20Token.transfer.reset();
    erc20Token.approve.returns(true);
  });

  describe('constructor', () => {
    when('super admin is zero address', () => {
      then('tx is reverted with reason error', async () => {
        await behaviours.deployShouldRevertWithMessage({
          contract: DCAFeeManagerFactory,
          args: [constants.AddressZero, []],
          message: 'ZeroAddress',
        });
      });
    });
    when('contract is initiated', () => {
      then('super admin is set correctly', async () => {
        const hasRole = await DCAFeeManager.hasRole(superAdminRole, superAdmin.address);
        expect(hasRole).to.be.true;
      });
      then('initial admins are set correctly', async () => {
        const hasRole = await DCAFeeManager.hasRole(adminRole, admin.address);
        expect(hasRole).to.be.true;
      });
      then('super admin role is set as admin for super admin role', async () => {
        const admin = await DCAFeeManager.getRoleAdmin(superAdminRole);
        expect(admin).to.equal(superAdminRole);
      });
      then('super admin role is set as admin for admin role', async () => {
        const admin = await DCAFeeManager.getRoleAdmin(adminRole);
        expect(admin).to.equal(superAdminRole);
      });
    });
  });

  describe('runSwapsAndTransferMany', () => {
    // Note: we can't test that the underlying function was called
    behaviours.shouldBeExecutableOnlyByRole({
      contract: () => DCAFeeManager,
      funcAndSignature: 'runSwapsAndTransferMany',
      params: () => [
        {
          allowanceTargets: [],
          swappers: [],
          swaps: [],
          swapContext: [],
          transferOutBalance: [],
        },
      ],
      addressWithRole: () => admin,
      role: () => adminRole,
    });
  });

  describe('withdrawFromPlatformBalance', () => {
    const RECIPIENT = wallet.generateRandomAddress();
    when('withdraw is executed', () => {
      const AMOUNT_TO_WITHDRAW = [{ token: TOKEN_A, amount: utils.parseEther('1') }];
      given(async () => {
        await DCAFeeManager.connect(admin).withdrawFromPlatformBalance(DCAHub.address, AMOUNT_TO_WITHDRAW, RECIPIENT);
      });
      then('hub is called correctly', () => {
        expect(DCAHub.withdrawFromPlatformBalance).to.have.been.calledOnce;
        const [amountToWithdraw, recipient] = DCAHub.withdrawFromPlatformBalance.getCall(0).args as [AmountToWithdraw[], string];
        expectAmounToWithdrawToBe(amountToWithdraw, AMOUNT_TO_WITHDRAW);
        expect(recipient).to.equal(RECIPIENT);
      });
    });
    behaviours.shouldBeExecutableOnlyByRole({
      contract: () => DCAFeeManager,
      funcAndSignature: 'withdrawFromPlatformBalance',
      params: () => [DCAHub.address, [], RECIPIENT],
      addressWithRole: () => admin,
      role: () => adminRole,
    });
  });

  describe('withdrawFromBalance', () => {
    const RECIPIENT = wallet.generateRandomAddress();
    when('withdraw is executed', () => {
      const AMOUNT_TO_WITHDRAW = utils.parseEther('1');
      given(async () => {
        await DCAFeeManager.connect(admin).withdrawFromBalance([{ token: erc20Token.address, amount: AMOUNT_TO_WITHDRAW }], RECIPIENT);
      });
      then('internal function is called correctly', async () => {
        const calls = await DCAFeeManager.sendToRecipientCalls();
        expect(calls).to.have.lengthOf(1);
        expect(calls[0].token).to.equal(erc20Token.address);
        expect(calls[0].amount).to.equal(AMOUNT_TO_WITHDRAW);
        expect(calls[0].recipient).to.equal(RECIPIENT);
        expect(await DCAFeeManager.sendBalanceOnContractToRecipientCalls()).to.be.empty;
      });
    });
    when('withdraw with max(uint256) is executed', () => {
      given(async () => {
        await DCAFeeManager.connect(admin).withdrawFromBalance([{ token: erc20Token.address, amount: constants.MaxUint256 }], RECIPIENT);
      });
      then('internal function is called correctly', async () => {
        const calls = await DCAFeeManager.sendBalanceOnContractToRecipientCalls();
        expect(calls).to.have.lengthOf(1);
        expect(calls[0].token).to.equal(erc20Token.address);
        expect(calls[0].recipient).to.equal(RECIPIENT);
        expect(await DCAFeeManager.sendToRecipientCalls()).to.be.empty;
      });
    });
    behaviours.shouldBeExecutableOnlyByRole({
      contract: () => DCAFeeManager,
      funcAndSignature: 'withdrawFromBalance',
      params: [[], RECIPIENT],
      addressWithRole: () => admin,
      role: () => adminRole,
    });
  });

  describe('availableBalances', () => {
    when('function is executed', () => {
      const PLATFORM_BALANCE = utils.parseEther('1');
      const FEE_MANAGER_BALANCE = utils.parseEther('2');
      given(async () => {
        DCAHub.platformBalance.returns(PLATFORM_BALANCE);
        erc20Token.balanceOf.returns(FEE_MANAGER_BALANCE);
      });
      then('balances are returned correctly', async () => {
        const balances = await DCAFeeManager.availableBalances(DCAHub.address, [erc20Token.address]);
        expect(balances).to.have.lengthOf(1);
        expect(balances[0].token).to.equal(erc20Token.address);
        expect(balances[0].platformBalance).to.equal(PLATFORM_BALANCE);
        expect(balances[0].feeManagerBalance).to.equal(FEE_MANAGER_BALANCE);
      });
    });
  });

  describe('revokeAllowances', () => {
    when('allowance is revoked', () => {
      given(async () => {
        await DCAFeeManager.connect(admin).revokeAllowances([{ spender: random.address, tokens: [erc20Token.address] }]);
      });
      then('revoke was called correctly', async () => {
        const calls = await DCAFeeManager.revokeAllowancesCalls();
        expect(calls).to.have.lengthOf(1);
        expect(calls[0]).to.have.lengthOf(1);
        expect((calls[0][0] as any).spender).to.equal(random.address);
        expect((calls[0][0] as any).tokens).to.eql([erc20Token.address]);
      });
    });
    behaviours.shouldBeExecutableOnlyByRole({
      contract: () => DCAFeeManager,
      funcAndSignature: 'revokeAllowances',
      params: [[]],
      addressWithRole: () => admin,
      role: () => adminRole,
    });
  });

  type AmountToWithdraw = { token: string; amount: BigNumberish };
  function expectAmounToWithdrawToBe(actual: AmountToWithdraw[], expected: AmountToWithdraw[]) {
    expect(actual).to.have.lengthOf(expected.length);
    for (let i = 0; i < actual.length; i++) {
      expect(actual[i].token).to.equal(expected[i].token);
      expect(actual[i].amount).to.equal(expected[i].amount);
    }
  }

  type PositionSet = { token: string; positionIds: BigNumberish[] };
  function expectPositionSetsToBe(actual: PositionSet[], expected: PositionSet[]) {
    expect(actual).to.have.lengthOf(expected.length);
    for (let i = 0; i < actual.length; i++) {
      expect(actual[i].token).to.equal(expected[i].token);
      expect(actual[i].positionIds).to.have.lengthOf(expected[i].positionIds.length);
      for (let j = 0; j < actual[i].positionIds.length; j++) {
        expect(actual[i].positionIds[j]).to.equal(expected[i].positionIds[j]);
      }
    }
  }
});
