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
  WrappedPlatformTokenMock,
  WrappedPlatformTokenMock__factory,
} from '@typechained';
import { FakeContract, smock } from '@defi-wonderland/smock';
import moment from 'moment';
import { TransactionResponse } from '@ethersproject/abstract-provider';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { BigNumber, Wallet } from 'ethers';

chai.use(smock.matchers);

contract('DCAHubCompanionWTokenPositionHandler', () => {
  const INITIAL_WTOKEN_AND_PLATFORM_BALANCE = 100000000000;
  const AMOUNT = 10000000000;
  const AMOUNT_OF_SWAPS = 10;

  let signer: SignerWithAddress, recipient: SignerWithAddress;
  let DCAPermissionManager: FakeContract<IDCAPermissionManager>;
  let DCAHub: FakeContract<IDCAHub>;
  let erc20Token: FakeContract<IERC20>;
  let wToken: WrappedPlatformTokenMock;
  let DCAHubCompanionWTokenPositionHandler: DCAHubCompanionWTokenPositionHandlerMock;
  let initialRecipientPlatformBalance: BigNumber;
  let snapshotId: string;

  before('Setup accounts and contracts', async () => {
    [signer, recipient] = await ethers.getSigners();
    const DCAHubCompanionWTokenPositionHandlerFactory: DCAHubCompanionWTokenPositionHandlerMock__factory = await ethers.getContractFactory(
      'contracts/mocks/DCAHubCompanion/DCAHubCompanionWTokenPositionHandler.sol:DCAHubCompanionWTokenPositionHandlerMock'
    );
    const wTokenFactory: WrappedPlatformTokenMock__factory = await ethers.getContractFactory(
      'contracts/mocks/WrappedPlatformTokenMock.sol:WrappedPlatformTokenMock'
    );
    wToken = await wTokenFactory.deploy('WETH', 'WETH', 18);
    DCAPermissionManager = await smock.fake('IDCAPermissionManager');
    DCAHub = await smock.fake('IDCAHub');
    erc20Token = await smock.fake('IERC20');
    DCAHubCompanionWTokenPositionHandler = await DCAHubCompanionWTokenPositionHandlerFactory.deploy(
      DCAHub.address,
      DCAPermissionManager.address,
      wToken.address,
      signer.address
    );
    initialRecipientPlatformBalance = await getPlatformBalance(recipient);
    await setPlatformTokenBalance(wToken, INITIAL_WTOKEN_AND_PLATFORM_BALANCE);
    await setPlatformTokenBalance(DCAHubCompanionWTokenPositionHandler, INITIAL_WTOKEN_AND_PLATFORM_BALANCE);
    await wToken.mint(DCAHubCompanionWTokenPositionHandler.address, INITIAL_WTOKEN_AND_PLATFORM_BALANCE);
    snapshotId = await snapshot.take();
  });

  beforeEach('Deploy and configure', async () => {
    await snapshot.revert(snapshotId);
    erc20Token.approve.reset();
    DCAPermissionManager.hasPermission.reset();
    DCAPermissionManager.hasPermission.returns(({ _address }: { _address: string }) => _address === signer.address); // Give full access to signer
    DCAHub['deposit(address,address,uint256,uint32,uint32,address,(address,uint8[])[],bytes)'].reset();
    DCAHub.withdrawSwapped.reset();
    DCAHub.withdrawSwappedMany.reset();
    DCAHub.increasePosition.reset();
    DCAHub.reducePosition.reset();
    DCAHub.terminate.reset();
  });

  describe('constructor', () => {
    when('contract is deployed', () => {
      then('hub is approved for wToken', async () => {
        expect(await wToken.allowance(DCAHubCompanionWTokenPositionHandler.address, DCAHub.address)).to.equal(constants.MAX_UINT_256);
      });
    });
  });

  describe('depositUsingProtocolToken', () => {
    const PROTOCOL_TOKEN = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';
    const SWAP_INTERVAL = moment().day(1).seconds();
    const OWNER = '0x0000000000000000000000000000000000000002';
    const OPERATOR = '0x0000000000000000000000000000000000000003';
    const PERMISSIONS: PermissionSet = { operator: OPERATOR, permissions: [0, 2] };
    const MISC = ethers.utils.randomBytes(10);

    type PermissionSet = { operator: string; permissions: (0 | 1 | 2 | 3)[] };

    when('from is not the prototol token', () => {
      then('reverts with message', async () => {
        const tx = DCAHubCompanionWTokenPositionHandler.depositUsingProtocolToken(
          '0x0000000000000000000000000000000000000004',
          erc20Token.address,
          AMOUNT,
          AMOUNT_OF_SWAPS,
          SWAP_INTERVAL,
          OWNER,
          [],
          MISC,
          {
            value: AMOUNT,
          }
        );
        await behaviours.checkTxRevertedWithMessage({ tx, message: 'InvalidTokens' });
      });
    });
    when('to is the prototol token', () => {
      then('reverts with message', async () => {
        const tx = DCAHubCompanionWTokenPositionHandler.depositUsingProtocolToken(
          erc20Token.address,
          PROTOCOL_TOKEN,
          AMOUNT,
          AMOUNT_OF_SWAPS,
          SWAP_INTERVAL,
          OWNER,
          [],
          MISC,
          {
            value: AMOUNT,
          }
        );
        await behaviours.checkTxRevertedWithMessage({ tx, message: 'InvalidTokens' });
      });
    });
    when('from is protocol token', () => {
      const POSITION_ID = 10;
      let tx: TransactionResponse;
      given(async () => {
        DCAHub['deposit(address,address,uint256,uint32,uint32,address,(address,uint8[])[],bytes)'].returns(POSITION_ID);
        tx = await DCAHubCompanionWTokenPositionHandler.depositUsingProtocolToken(
          PROTOCOL_TOKEN,
          erc20Token.address,
          AMOUNT,
          AMOUNT_OF_SWAPS,
          SWAP_INTERVAL,
          OWNER,
          [PERMISSIONS],
          MISC,
          {
            value: AMOUNT,
          }
        );
      });
      then('deposit is executed', () => {
        expect(DCAHub['deposit(address,address,uint256,uint32,uint32,address,(address,uint8[])[],bytes)']).to.have.been.calledOnce;
        const [from, to, amount, amountOfSwaps, swapInterval, owner, uncastedPermissions, misc] =
          DCAHub['deposit(address,address,uint256,uint32,uint32,address,(address,uint8[])[],bytes)'].getCall(0).args;
        expect(from).to.equal(wToken.address);
        expect(to).to.equal(erc20Token.address);
        expect(amount).to.equal(AMOUNT);
        expect(amountOfSwaps).to.equal(AMOUNT_OF_SWAPS);
        expect(swapInterval).to.equal(SWAP_INTERVAL);
        expect(owner).to.equal(OWNER);
        expect(misc).to.equal(ethers.utils.hexlify(MISC));

        const permissions = uncastedPermissions as PermissionSet[];
        expect(permissions.length).to.equal(1);
        expect(permissions[0].operator).to.equal(PERMISSIONS.operator);
        expect(permissions[0].permissions).to.eql(PERMISSIONS.permissions);
      });
      thenTokenIsWrapped(AMOUNT);
    });
    when('from is protocol token but misc is empty', () => {
      const POSITION_ID = 10;
      let tx: TransactionResponse;
      given(async () => {
        DCAHub['deposit(address,address,uint256,uint32,uint32,address,(address,uint8[])[])'].returns(POSITION_ID);
        tx = await DCAHubCompanionWTokenPositionHandler.depositUsingProtocolToken(
          PROTOCOL_TOKEN,
          erc20Token.address,
          AMOUNT,
          AMOUNT_OF_SWAPS,
          SWAP_INTERVAL,
          OWNER,
          [PERMISSIONS],
          ethers.utils.randomBytes(0),
          {
            value: AMOUNT,
          }
        );
      });
      then('deposit is executed', () => {
        expect(DCAHub['deposit(address,address,uint256,uint32,uint32,address,(address,uint8[])[])']).to.have.been.calledOnce;
        const [from, to, amount, amountOfSwaps, swapInterval, owner, uncastedPermissions] =
          DCAHub['deposit(address,address,uint256,uint32,uint32,address,(address,uint8[])[])'].getCall(0).args;
        expect(from).to.equal(wToken.address);
        expect(to).to.equal(erc20Token.address);
        expect(amount).to.equal(AMOUNT);
        expect(amountOfSwaps).to.equal(AMOUNT_OF_SWAPS);
        expect(swapInterval).to.equal(SWAP_INTERVAL);
        expect(owner).to.equal(OWNER);

        const permissions = uncastedPermissions as PermissionSet[];
        expect(permissions.length).to.equal(1);
        expect(permissions[0].operator).to.equal(PERMISSIONS.operator);
        expect(permissions[0].permissions).to.eql(PERMISSIONS.permissions);
      });
      thenTokenIsWrapped(AMOUNT);
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
      given(async () => {
        DCAHub.withdrawSwapped.returns(SWAPPED);
        await DCAHubCompanionWTokenPositionHandler.withdrawSwappedUsingProtocolToken(POSITION_ID, recipient.address);
      });
      thenTokenIsUnwrappedAndSentToRecipient(SWAPPED);
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
    });
    when('a withdraw is executed', () => {
      given(async () => {
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
      thenTokenIsUnwrappedAndSentToRecipient(TOTAL_SWAPPED);
    });

    permissionTest({
      permission: Permission.WITHDRAW,
      execute: (DCAHubCompanionWTokenPositionHandler) =>
        DCAHubCompanionWTokenPositionHandler.withdrawSwappedManyUsingProtocolToken(POSITION_IDS, recipient.address),
    });
  });

  describe('increasePositionUsingProtocolToken', () => {
    const POSITION_ID = 10;
    when('a valid increase is made', () => {
      given(async () => {
        await DCAHubCompanionWTokenPositionHandler.increasePositionUsingProtocolToken(POSITION_ID, AMOUNT, AMOUNT_OF_SWAPS, {
          value: AMOUNT,
        });
      });
      then('increase is executed', () => {
        expect(DCAHub.increasePosition).to.have.been.calledOnceWith(POSITION_ID, AMOUNT, AMOUNT_OF_SWAPS);
      });
      thenTokenIsWrapped(AMOUNT);
    });

    permissionTest({
      permission: Permission.INCREASE,
      execute: (DCAHubCompanionWTokenPositionHandler) =>
        DCAHubCompanionWTokenPositionHandler.increasePositionUsingProtocolToken(POSITION_ID, AMOUNT, AMOUNT_OF_SWAPS, { value: AMOUNT }),
    });
  });

  describe('reducePositionUsingProtocolToken', () => {
    const POSITION_ID = 10;
    when('a reduce is executed', () => {
      given(async () => {
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
      thenTokenIsUnwrappedAndSentToRecipient(AMOUNT);
    });

    permissionTest({
      permission: Permission.REDUCE,
      execute: (DCAHubCompanionWTokenPositionHandler) =>
        DCAHubCompanionWTokenPositionHandler.reducePositionUsingProtocolToken(POSITION_ID, AMOUNT, AMOUNT_OF_SWAPS, recipient.address),
    });
  });

  describe('terminateUsingProtocolTokenAsFrom', () => {
    const POSITION_ID = 10;
    const SWAPPED_RECIPIENT = constants.NOT_ZERO_ADDRESS;
    when('a terminate is executed', () => {
      given(async () => {
        DCAHub.terminate.returns([AMOUNT, AMOUNT]);
        await DCAHubCompanionWTokenPositionHandler.terminateUsingProtocolTokenAsFrom(POSITION_ID, recipient.address, SWAPPED_RECIPIENT);
      });
      then(`hub's terminate is executed with companion as recipient`, () => {
        expect(DCAHub.terminate).to.have.been.calledOnceWith(POSITION_ID, DCAHubCompanionWTokenPositionHandler.address, SWAPPED_RECIPIENT);
      });
      thenTokenIsUnwrappedAndSentToRecipient(AMOUNT);
    });

    permissionTest({
      permission: Permission.TERMINATE,
      execute: (DCAHubCompanionWTokenPositionHandler) =>
        DCAHubCompanionWTokenPositionHandler.terminateUsingProtocolTokenAsFrom(POSITION_ID, recipient.address, recipient.address),
    });
  });

  describe('terminateUsingProtocolTokenAsTo', () => {
    const POSITION_ID = 10;
    const UNSWAPPED_RECIPIENT = constants.NOT_ZERO_ADDRESS;
    when('a terminate is executed', () => {
      given(async () => {
        DCAHub.terminate.returns([AMOUNT, AMOUNT]);
        await DCAHubCompanionWTokenPositionHandler.terminateUsingProtocolTokenAsTo(POSITION_ID, UNSWAPPED_RECIPIENT, recipient.address);
      });
      then(`hub's terminate is executed with companion as recipient`, () => {
        expect(DCAHub.terminate).to.have.been.calledOnceWith(POSITION_ID, UNSWAPPED_RECIPIENT, DCAHubCompanionWTokenPositionHandler.address);
      });
      thenTokenIsUnwrappedAndSentToRecipient(AMOUNT);
    });

    permissionTest({
      permission: Permission.TERMINATE,
      execute: (DCAHubCompanionWTokenPositionHandler) =>
        DCAHubCompanionWTokenPositionHandler.terminateUsingProtocolTokenAsTo(POSITION_ID, recipient.address, recipient.address),
    });
  });

  function permissionTest({
    permission,
    execute,
  }: {
    permission: Permission;
    execute: (params: DCAHubCompanionWTokenPositionHandlerMock) => Promise<TransactionResponse>;
  }) {
    let operator: Wallet;

    describe('Permission', () => {
      given(async () => {
        operator = await wallet.generateRandom();
        DCAPermissionManager.hasPermission.reset();
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

  function thenTokenIsWrapped(amount: number) {
    then('protocol token is wrapped', async () => {
      const wTokenBalance = await getPlatformBalance(wToken);
      expect(wTokenBalance).to.equal(INITIAL_WTOKEN_AND_PLATFORM_BALANCE + amount);
    });
    then(`companion's ERC20 balance increases`, async () => {
      const wTokenBalance = await wToken.balanceOf(DCAHubCompanionWTokenPositionHandler.address);
      expect(wTokenBalance).to.equal(INITIAL_WTOKEN_AND_PLATFORM_BALANCE + amount);
    });
  }

  function thenTokenIsUnwrappedAndSentToRecipient(amount: number) {
    then(`wToken's platform balance is reduced`, async () => {
      const wTokenBalance = await getPlatformBalance(wToken);
      expect(wTokenBalance).to.equal(INITIAL_WTOKEN_AND_PLATFORM_BALANCE - amount);
    });
    then(`companion's ERC20 balance is reduced`, async () => {
      const wTokenBalance = await wToken.balanceOf(DCAHubCompanionWTokenPositionHandler.address);
      expect(wTokenBalance).to.equal(INITIAL_WTOKEN_AND_PLATFORM_BALANCE - amount);
    });
    then('platform token is sent to the recipient', async () => {
      const currentRecipientBalance = await getPlatformBalance(recipient);
      expect(currentRecipientBalance.sub(initialRecipientPlatformBalance)).to.equal(amount);
    });
    then(`companion's platform token balance stays the same`, async () => {
      const companionBalance = await getPlatformBalance(DCAHubCompanionWTokenPositionHandler);
      expect(companionBalance).to.equal(INITIAL_WTOKEN_AND_PLATFORM_BALANCE);
    });
  }

  function getPlatformBalance(hasAddress: { address: string }) {
    return ethers.provider.getBalance(hasAddress.address);
  }

  async function setPlatformTokenBalance(recipient: { address: string }, amount: number) {
    await ethers.provider.send('hardhat_setBalance', [recipient.address, ethers.utils.hexValue(amount)]);
    return BigNumber.from(amount);
  }
});
