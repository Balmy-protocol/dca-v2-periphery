import chai, { expect } from 'chai';
import { ethers } from 'hardhat';
import { behaviours, constants, wallet } from '@test-utils';
import { contract, given, then, when } from '@test-utils/bdd';
import { snapshot } from '@test-utils/evm';
import {
  DCAHubCompanionWTokenPositionHandlerMock,
  DCAHubCompanionWTokenPositionHandlerMock__factory,
  IDCAHub,
  IDCAPermissionManager,
  IERC20,
  IWrappedProtocolToken,
} from '@typechained';
import { FakeContract, smock } from '@defi-wonderland/smock';
import moment from 'moment';
import { TransactionResponse } from '@ethersproject/abstract-provider';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signers';
import { BigNumber, Wallet } from 'ethers';

chai.use(smock.matchers);

contract('DCAHubCompanionWTokenPositionHandler', () => {
  const AMOUNT = 10000000000;
  const AMOUNT_OF_SWAPS = 10;

  let signer: SignerWithAddress, recipient: SignerWithAddress;
  let DCAPermissionManager: FakeContract<IDCAPermissionManager>;
  let DCAHub: FakeContract<IDCAHub>;
  let wToken: FakeContract<IWrappedProtocolToken>;
  let erc20Token: FakeContract<IERC20>;
  let DCAHubCompanionWTokenPositionHandler: DCAHubCompanionWTokenPositionHandlerMock;
  let DCAHubCompanionWTokenPositionHandlerFactory: DCAHubCompanionWTokenPositionHandlerMock__factory;
  let snapshotId: string;

  before('Setup accounts and contracts', async () => {
    [signer, recipient] = await ethers.getSigners();
    DCAHubCompanionWTokenPositionHandlerFactory = await ethers.getContractFactory(
      'contracts/mocks/DCAHubCompanion/DCAHubCompanionWTokenPositionHandler.sol:DCAHubCompanionWTokenPositionHandlerMock'
    );
    DCAPermissionManager = await smock.fake('IDCAPermissionManager');
    DCAHub = await smock.fake('IDCAHub');
    DCAHub.permissionManager.returns(DCAPermissionManager.address);
    wToken = await smock.fake('IWrappedProtocolToken');
    erc20Token = await smock.fake('IERC20');
    DCAHubCompanionWTokenPositionHandler = await DCAHubCompanionWTokenPositionHandlerFactory.deploy(DCAHub.address, wToken.address);
    snapshotId = await snapshot.take();
  });

  beforeEach('Deploy and configure', async () => {
    await snapshot.revert(snapshotId);
    erc20Token.approve.reset();
    DCAPermissionManager.hasPermission.reset();
    DCAPermissionManager.hasPermission.returns(({ _address }: { _address: string }) => _address === signer.address); // Give full access to signer
    DCAHub.deposit.reset();
    DCAHub.withdrawSwapped.reset();
    DCAHub.withdrawSwappedMany.reset();
    DCAHub.increasePosition.reset();
    DCAHub.reducePosition.reset();
    DCAHub.terminate.reset();
    wToken.deposit.reset();
    wToken.approve.reset();
    wToken.withdraw.reset();
  });

  describe('constructor', () => {
    when('contract is deployed', () => {
      then('permission manager is set correctly', async () => {
        expect(await DCAHubCompanionWTokenPositionHandler.permissionManager()).to.equal(DCAPermissionManager.address);
      });
    });
  });

  describe('depositUsingProtocolToken', () => {
    const PROTOCOL_TOKEN = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';
    const SWAP_INTERVAL = moment().day(1).seconds();
    const OWNER = '0x0000000000000000000000000000000000000002';
    const OPERATOR = '0x0000000000000000000000000000000000000003';
    const PERMISSIONS: PermissionSet = { operator: OPERATOR, permissions: [0, 2] };

    type PermissionSet = { operator: string; permissions: (0 | 1 | 2 | 3)[] };

    when('neither from nor to are prototol tokens', () => {
      then('reverts with message', async () => {
        const tx = DCAHubCompanionWTokenPositionHandler.depositUsingProtocolToken(
          '0x0000000000000000000000000000000000000004',
          erc20Token.address,
          AMOUNT,
          AMOUNT_OF_SWAPS,
          SWAP_INTERVAL,
          OWNER,
          [],
          {
            value: AMOUNT,
          }
        );
        await behaviours.checkTxRevertedWithMessage({ tx, message: 'InvalidTokens' });
      });
    });
    when('both from and to are prototol tokens', () => {
      then('reverts with message', async () => {
        const tx = DCAHubCompanionWTokenPositionHandler.depositUsingProtocolToken(
          PROTOCOL_TOKEN,
          PROTOCOL_TOKEN,
          AMOUNT,
          AMOUNT_OF_SWAPS,
          SWAP_INTERVAL,
          OWNER,
          [],
          {
            value: AMOUNT,
          }
        );
        await behaviours.checkTxRevertedWithMessage({ tx, message: 'InvalidTokens' });
      });
    });
    when('sending more protocol token than expected', () => {
      then('reverts with message', async () => {
        const tx = DCAHubCompanionWTokenPositionHandler.depositUsingProtocolToken(
          PROTOCOL_TOKEN,
          erc20Token.address,
          AMOUNT,
          AMOUNT_OF_SWAPS,
          SWAP_INTERVAL,
          OWNER,
          [],
          {
            value: AMOUNT + 1,
          }
        );
        await behaviours.checkTxRevertedWithMessage({ tx, message: 'InvalidAmountOfProtocolTokenReceived' });
      });
    });
    when('sending less protocol token than expected', () => {
      then('reverts with message', async () => {
        const tx = DCAHubCompanionWTokenPositionHandler.depositUsingProtocolToken(
          PROTOCOL_TOKEN,
          erc20Token.address,
          AMOUNT,
          AMOUNT_OF_SWAPS,
          SWAP_INTERVAL,
          OWNER,
          [],
          {
            value: AMOUNT - 1,
          }
        );
        await behaviours.checkTxRevertedWithMessage({ tx, message: 'InvalidAmountOfProtocolTokenReceived' });
      });
    });
    when('from is protocol token', () => {
      const POSITION_ID = 10;
      let tx: TransactionResponse;
      given(async () => {
        DCAHub.deposit.returns(POSITION_ID);
        tx = await DCAHubCompanionWTokenPositionHandler.depositUsingProtocolToken(
          PROTOCOL_TOKEN,
          erc20Token.address,
          AMOUNT,
          AMOUNT_OF_SWAPS,
          SWAP_INTERVAL,
          OWNER,
          [PERMISSIONS],
          {
            value: AMOUNT,
          }
        );
      });
      then('protocol token is wrapped', async () => {
        expect(wToken.deposit).to.have.been.calledOnce;
        expect(await ethers.provider.getBalance(wToken.address)).to.equal(AMOUNT);
      });
      then('wrapped token is approved for the hub', () => {
        expect(wToken.approve).to.have.been.calledOnceWith(DCAHub.address, AMOUNT);
      });
      then('deposit is executed', () => {
        expect(DCAHub.deposit).to.have.been.calledOnce;
        const [from, to, amount, amountOfSwaps, swapInterval, owner, uncastedPermissions] = DCAHub.deposit.getCall(0).args;
        expect(from).to.equal(wToken.address);
        expect(to).to.equal(erc20Token.address);
        expect(amount).to.equal(AMOUNT);
        expect(amountOfSwaps).to.equal(AMOUNT_OF_SWAPS);
        expect(swapInterval).to.equal(SWAP_INTERVAL);
        expect(owner).to.equal(OWNER);

        const permissions = uncastedPermissions as PermissionSet[];
        expect(permissions.length).to.equal(2);
        // Make sure that original permissions was not modified
        expect(permissions[0].operator).to.equal(PERMISSIONS.operator);
        expect(permissions[0].permissions).to.eql(PERMISSIONS.permissions);
        // Make sure that handler was added with full access
        expect(permissions[1].operator).to.equal(DCAHubCompanionWTokenPositionHandler.address);
        expect(permissions[1].permissions).to.eql([0, 1, 2, 3]);
      });
      then('event is emitted', async () => {
        await expect(tx)
          .to.emit(DCAHubCompanionWTokenPositionHandler, 'ConvertedDeposit')
          .withArgs(POSITION_ID, PROTOCOL_TOKEN, wToken.address, erc20Token.address, erc20Token.address);
      });
    });
    when('to is protocol token', () => {
      const POSITION_ID = 10;
      let tx: TransactionResponse;
      given(async () => {
        erc20Token.transferFrom.returns(true);
        DCAHub.deposit.returns(POSITION_ID);
        tx = await DCAHubCompanionWTokenPositionHandler.depositUsingProtocolToken(
          erc20Token.address,
          PROTOCOL_TOKEN,
          AMOUNT,
          AMOUNT_OF_SWAPS,
          SWAP_INTERVAL,
          OWNER,
          [PERMISSIONS],
          {
            value: AMOUNT,
          }
        );
      });
      then('protocol token is not wrapped', async () => {
        expect(wToken.deposit).to.not.have.been.called;
        expect(await ethers.provider.getBalance(wToken.address)).to.equal(0);
      });
      then('from token is transfered to the companion', () => {
        expect(erc20Token.transferFrom).to.have.been.calledWith(signer.address, DCAHubCompanionWTokenPositionHandler.address, AMOUNT);
      });
      then('from token is approved for the hub', () => {
        expect(erc20Token.approve).to.have.been.calledOnceWith(DCAHub.address, AMOUNT);
      });
      then('deposit is executed', () => {
        expect(DCAHub.deposit).to.have.been.calledOnce;
        const [from, to, amount, amountOfSwaps, swapInterval, owner, uncastedPermissions] = DCAHub.deposit.getCall(0).args;
        expect(from).to.equal(erc20Token.address);
        expect(to).to.equal(wToken.address);
        expect(amount).to.equal(AMOUNT);
        expect(amountOfSwaps).to.equal(AMOUNT_OF_SWAPS);
        expect(swapInterval).to.equal(SWAP_INTERVAL);
        expect(owner).to.equal(OWNER);

        const permissions = uncastedPermissions as PermissionSet[];
        expect(permissions.length).to.equal(2);
        // Make sure that original permissions was not modified
        expect(permissions[0].operator).to.equal(PERMISSIONS.operator);
        expect(permissions[0].permissions).to.eql(PERMISSIONS.permissions);
        // Make sure that handler was added with full access
        expect(permissions[1].operator).to.equal(DCAHubCompanionWTokenPositionHandler.address);
        expect(permissions[1].permissions).to.eql([0, 1, 2, 3]);
      });
      then('event is emitted', async () => {
        await expect(tx)
          .to.emit(DCAHubCompanionWTokenPositionHandler, 'ConvertedDeposit')
          .withArgs(POSITION_ID, erc20Token.address, erc20Token.address, PROTOCOL_TOKEN, wToken.address);
      });
    });
  });

  enum Permission {
    INCREASE,
    REDUCE,
    WITHDRAW,
    TERMINATE,
  }

  describe('withdrawSwappedUsingProtocolToken', () => {
    const POSITION_ID = 10;
    const SWAPPED = 200000;
    when('a withdraw is executed', () => {
      let initialRecipientBalance: BigNumber;
      given(async () => {
        DCAHub.withdrawSwapped.returns(SWAPPED);
        initialRecipientBalance = await ethers.provider.getBalance(recipient.address);

        // This is meant to simulate wToken#withdraw
        await addPlatformTokenBalance(DCAHubCompanionWTokenPositionHandler, SWAPPED);
        await DCAHubCompanionWTokenPositionHandler.withdrawSwappedUsingProtocolToken(POSITION_ID, recipient.address);
      });
      then(`hub's withdraw is executed with companion as recipient`, () => {
        expect(DCAHub.withdrawSwapped).to.have.been.calledOnceWith(POSITION_ID, DCAHubCompanionWTokenPositionHandler.address);
      });
      then('wToken is unwrapped', async () => {
        expect(wToken.withdraw).to.have.been.calledOnceWith(SWAPPED);
      });
      then('platform token is sent to the recipient', async () => {
        const currentRecipientBalance = await ethers.provider.getBalance(recipient.address);
        expect(currentRecipientBalance.sub(initialRecipientBalance)).to.equal(SWAPPED);
      });
      then('companion has no balance remaining', async () => {
        expect(await ethers.provider.getBalance(DCAHubCompanionWTokenPositionHandler.address)).to.equal(0);
      });
    });

    permissionTest({
      permission: Permission.WITHDRAW,
      execute: (DCAHubCompanionWTokenPositionHandler) =>
        DCAHubCompanionWTokenPositionHandler.withdrawSwappedUsingProtocolToken(POSITION_ID, recipient.address),
    });
  });

  describe('withdrawSwappedManyUsingProtocolToken', () => {
    const POSITION_IDS = [BigNumber.from(10), BigNumber.from(20), BigNumber.from(30)];
    const TOTAL_SWAPPED = 200000;
    given(async () => {
      DCAHub.withdrawSwappedMany.returns([TOTAL_SWAPPED]);
      // This is meant to simulate wToken#withdraw
      await addPlatformTokenBalance(DCAHubCompanionWTokenPositionHandler, TOTAL_SWAPPED);
    });
    when('a withdraw is executed', () => {
      let initialRecipientBalance: BigNumber;
      given(async () => {
        initialRecipientBalance = await ethers.provider.getBalance(recipient.address);
        await DCAHubCompanionWTokenPositionHandler.withdrawSwappedManyUsingProtocolToken(POSITION_IDS, recipient.address);
      });
      then(`hub's withdraw is executed with companion as recipient`, () => {
        expect(DCAHub.withdrawSwappedMany).to.have.been.calledOnce;
        const [positionsUncasted, recipient] = DCAHub.withdrawSwappedMany.getCall(0).args;
        const positions = positionsUncasted as { token: string; positionIds: number[] }[];
        expect(positions.length).to.equal(1);
        expect(positions[0].token).to.equal(wToken.address);
        expect(positions[0].positionIds).to.eql(POSITION_IDS);
        expect(recipient).to.equal(DCAHubCompanionWTokenPositionHandler.address);
      });
      then('wToken is unwrapped', async () => {
        expect(wToken.withdraw).to.have.been.calledOnceWith(TOTAL_SWAPPED);
      });
      then('platform token is sent to the recipient', async () => {
        const currentRecipientBalance = await ethers.provider.getBalance(recipient.address);
        expect(currentRecipientBalance.sub(initialRecipientBalance)).to.equal(TOTAL_SWAPPED);
      });
      then('companion has no balance remaining', async () => {
        expect(await ethers.provider.getBalance(DCAHubCompanionWTokenPositionHandler.address)).to.equal(0);
      });
    });

    permissionTest({
      permission: Permission.WITHDRAW,
      execute: (DCAHubCompanionWTokenPositionHandler) =>
        DCAHubCompanionWTokenPositionHandler.withdrawSwappedManyUsingProtocolToken(POSITION_IDS, recipient.address),
    });
  });

  describe('increasePositionUsingProtocolToken', () => {
    const POSITION_ID = 10;
    when('sending more protocol token than expected', () => {
      then('reverts with message', async () => {
        const tx = DCAHubCompanionWTokenPositionHandler.increasePositionUsingProtocolToken(POSITION_ID, AMOUNT, AMOUNT_OF_SWAPS, {
          value: AMOUNT + 1,
        });
        await behaviours.checkTxRevertedWithMessage({ tx, message: 'InvalidAmountOfProtocolTokenReceived' });
      });
    });
    when('sending less protocol token than expected', () => {
      then('reverts with message', async () => {
        const tx = DCAHubCompanionWTokenPositionHandler.increasePositionUsingProtocolToken(POSITION_ID, AMOUNT, AMOUNT_OF_SWAPS, {
          value: AMOUNT - 1,
        });
        await behaviours.checkTxRevertedWithMessage({ tx, message: 'InvalidAmountOfProtocolTokenReceived' });
      });
    });
    when('a valid increase is made', () => {
      given(async () => {
        await DCAHubCompanionWTokenPositionHandler.increasePositionUsingProtocolToken(POSITION_ID, AMOUNT, AMOUNT_OF_SWAPS, {
          value: AMOUNT,
        });
      });
      then('protocol token is wrapped', async () => {
        expect(wToken.deposit).to.have.been.calledOnce;
        expect(await ethers.provider.getBalance(wToken.address)).to.equal(AMOUNT);
      });
      then('wrapped token is approved for the hub', () => {
        expect(wToken.approve).to.have.been.calledOnceWith(DCAHub.address, AMOUNT);
      });
      then('increase is executed', () => {
        expect(DCAHub.increasePosition).to.have.been.calledOnceWith(POSITION_ID, AMOUNT, AMOUNT_OF_SWAPS);
      });
    });

    permissionTest({
      permission: Permission.INCREASE,
      execute: (DCAHubCompanionWTokenPositionHandler) =>
        DCAHubCompanionWTokenPositionHandler.increasePositionUsingProtocolToken(POSITION_ID, AMOUNT, AMOUNT_OF_SWAPS),
      context: () => addPlatformTokenBalance(DCAHubCompanionWTokenPositionHandler, AMOUNT),
    });
  });

  describe('reducePositionUsingProtocolToken', () => {
    const POSITION_ID = 10;
    when('a reduce is executed', () => {
      let initialRecipientBalance: BigNumber;
      given(async () => {
        initialRecipientBalance = await ethers.provider.getBalance(recipient.address);

        // This is meant to simulate wToken#withdraw
        await addPlatformTokenBalance(DCAHubCompanionWTokenPositionHandler, AMOUNT);
        await DCAHubCompanionWTokenPositionHandler.reducePositionUsingProtocolToken(POSITION_ID, AMOUNT, AMOUNT_OF_SWAPS, recipient.address);
      });
      then(`hub's reduce is executed with companion as recipient`, () => {
        expect(DCAHub.reducePosition).to.have.been.calledOnceWith(
          POSITION_ID,
          AMOUNT,
          AMOUNT_OF_SWAPS,
          DCAHubCompanionWTokenPositionHandler.address
        );
      });
      then('wToken is unwrapped', async () => {
        expect(wToken.withdraw).to.have.been.calledOnceWith(AMOUNT);
      });
      then('platform token is sent to the recipient', async () => {
        const currentRecipientBalance = await ethers.provider.getBalance(recipient.address);
        expect(currentRecipientBalance.sub(initialRecipientBalance)).to.equal(AMOUNT);
      });
      then('companion has no balance remaining', async () => {
        expect(await ethers.provider.getBalance(DCAHubCompanionWTokenPositionHandler.address)).to.equal(0);
      });
    });

    permissionTest({
      permission: Permission.REDUCE,
      execute: (DCAHubCompanionWTokenPositionHandler) =>
        DCAHubCompanionWTokenPositionHandler.reducePositionUsingProtocolToken(POSITION_ID, AMOUNT, AMOUNT_OF_SWAPS, recipient.address),
      context: () => addPlatformTokenBalance(DCAHubCompanionWTokenPositionHandler, AMOUNT),
    });
  });

  describe('terminateUsingProtocolTokenAsFrom', () => {
    const POSITION_ID = 10;
    const SWAPPED_RECIPIENT = constants.NOT_ZERO_ADDRESS;
    when('a terminate is executed', () => {
      let initialRecipientBalance: BigNumber;
      given(async () => {
        initialRecipientBalance = await ethers.provider.getBalance(recipient.address);
        // This is meant to simulate wToken#withdraw
        await addPlatformTokenBalance(DCAHubCompanionWTokenPositionHandler, AMOUNT);

        DCAHub.terminate.returns([AMOUNT, AMOUNT]);
        await DCAHubCompanionWTokenPositionHandler.terminateUsingProtocolTokenAsFrom(POSITION_ID, recipient.address, SWAPPED_RECIPIENT);
      });
      then(`hub's terminate is executed with companion as recipient`, () => {
        expect(DCAHub.terminate).to.have.been.calledOnceWith(POSITION_ID, DCAHubCompanionWTokenPositionHandler.address, SWAPPED_RECIPIENT);
      });
      then('wToken is unwrapped', async () => {
        expect(wToken.withdraw).to.have.been.calledOnceWith(AMOUNT);
      });
      then('platform token is sent to the recipient', async () => {
        const currentRecipientBalance = await ethers.provider.getBalance(recipient.address);
        expect(currentRecipientBalance.sub(initialRecipientBalance)).to.equal(AMOUNT);
      });
      then('companion has no balance remaining', async () => {
        expect(await ethers.provider.getBalance(DCAHubCompanionWTokenPositionHandler.address)).to.equal(0);
      });
    });

    permissionTest({
      permission: Permission.TERMINATE,
      execute: (DCAHubCompanionWTokenPositionHandler) =>
        DCAHubCompanionWTokenPositionHandler.terminateUsingProtocolTokenAsFrom(POSITION_ID, recipient.address, recipient.address),
      context: () => addPlatformTokenBalance(DCAHubCompanionWTokenPositionHandler, AMOUNT),
    });
  });

  describe('terminateUsingProtocolTokenAsTo', () => {
    const POSITION_ID = 10;
    const UNSWAPPED_RECIPIENT = constants.NOT_ZERO_ADDRESS;
    when('a terminate is executed', () => {
      let initialRecipientBalance: BigNumber;
      given(async () => {
        initialRecipientBalance = await ethers.provider.getBalance(recipient.address);
        // This is meant to simulate wToken#withdraw
        await addPlatformTokenBalance(DCAHubCompanionWTokenPositionHandler, AMOUNT);

        DCAHub.terminate.returns([AMOUNT, AMOUNT]);
        await DCAHubCompanionWTokenPositionHandler.terminateUsingProtocolTokenAsTo(POSITION_ID, UNSWAPPED_RECIPIENT, recipient.address);
      });
      then(`hub's terminate is executed with companion as recipient`, () => {
        expect(DCAHub.terminate).to.have.been.calledOnceWith(POSITION_ID, UNSWAPPED_RECIPIENT, DCAHubCompanionWTokenPositionHandler.address);
      });
      then('wToken is unwrapped', async () => {
        expect(wToken.withdraw).to.have.been.calledOnceWith(AMOUNT);
      });
      then('platform token is sent to the recipient', async () => {
        const currentRecipientBalance = await ethers.provider.getBalance(recipient.address);
        expect(currentRecipientBalance.sub(initialRecipientBalance)).to.equal(AMOUNT);
      });
      then('companion has no balance remaining', async () => {
        expect(await ethers.provider.getBalance(DCAHubCompanionWTokenPositionHandler.address)).to.equal(0);
      });
    });

    permissionTest({
      permission: Permission.TERMINATE,
      execute: (DCAHubCompanionWTokenPositionHandler) =>
        DCAHubCompanionWTokenPositionHandler.terminateUsingProtocolTokenAsTo(POSITION_ID, recipient.address, recipient.address),
      context: () => addPlatformTokenBalance(DCAHubCompanionWTokenPositionHandler, AMOUNT),
    });
  });

  function permissionTest({
    permission,
    execute,
    context,
  }: {
    permission: Permission;
    execute: (params: DCAHubCompanionWTokenPositionHandlerMock) => Promise<TransactionResponse>;
    context?: () => Promise<void>;
  }) {
    let operator: Wallet;

    describe('Permission', () => {
      given(async () => {
        operator = await wallet.generateRandom();
        DCAPermissionManager.hasPermission.reset();
        await context?.();
      });
      when(`executing address has permission`, () => {
        given(() => DCAPermissionManager.hasPermission.returns(({ _permission }: { _permission: Permission }) => permission === _permission));
        then('they can execute the operation', async () => {
          const result: Promise<TransactionResponse> = execute(DCAHubCompanionWTokenPositionHandler.connect(operator));
          await result;
          await expect(result).to.not.be.reverted;
        });
      });

      when(`executing address doesn't have permission`, () => {
        given(() => DCAPermissionManager.hasPermission.returns(false));
        then('operation is reverted', async () => {
          const result: Promise<TransactionResponse> = execute(DCAHubCompanionWTokenPositionHandler.connect(operator));
          await expect(result).to.be.revertedWith('UnauthorizedCaller');
        });
      });
    });
  }
  async function addPlatformTokenBalance(recipient: { address: string }, amount: number) {
    await ethers.provider.send('hardhat_setBalance', [recipient.address, ethers.utils.hexValue(amount)]);
  }
});
