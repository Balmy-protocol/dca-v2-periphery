import chai, { expect } from 'chai';
import { ethers } from 'hardhat';
import { behaviours, constants } from '@test-utils';
import { contract, given, then, when } from '@test-utils/bdd';
import { snapshot } from '@test-utils/evm';
import {
  DCAHubCompanionWTokenPositionHandlerMock,
  DCAHubCompanionWTokenPositionHandlerMock__factory,
  IDCAHub,
  IWrappedProtocolToken,
} from '@typechained';
import { FakeContract, smock } from '@defi-wonderland/smock';
import moment from 'moment';
import { TransactionResponse } from '@ethersproject/abstract-provider';

chai.use(smock.matchers);

contract('DCAHubCompanionWTokenPositionHandlerMock', () => {
  const TO_TOKEN = constants.NOT_ZERO_ADDRESS;
  const AMOUNT = 10000000000;
  const AMOUNT_OF_SWAPS = 10;
  const SWAP_INTERVAL = moment().day(1).seconds();
  const OWNER = '0x0000000000000000000000000000000000000002';

  let DCAHub: FakeContract<IDCAHub>;
  let wToken: FakeContract<IWrappedProtocolToken>;
  let DCAHubCompanionWTokenPositionHandlerMock: DCAHubCompanionWTokenPositionHandlerMock;
  let DCAHubCompanionWTokenPositionHandlerMockFactory: DCAHubCompanionWTokenPositionHandlerMock__factory;
  let snapshotId: string;

  before('Setup accounts and contracts', async () => {
    DCAHubCompanionWTokenPositionHandlerMockFactory = await ethers.getContractFactory(
      'contracts/mocks/DCAHubCompanion/DCAHubCompanionWTokenPositionHandler.sol:DCAHubCompanionWTokenPositionHandlerMock'
    );
    DCAHub = await smock.fake('IDCAHub');
    wToken = await smock.fake('IWrappedProtocolToken');
    DCAHubCompanionWTokenPositionHandlerMock = await DCAHubCompanionWTokenPositionHandlerMockFactory.deploy(DCAHub.address, wToken.address);
    snapshotId = await snapshot.take();
  });

  beforeEach('Deploy and configure', async () => {
    await snapshot.revert(snapshotId);
    DCAHub.deposit.reset();
    DCAHub.increasePosition.reset();
    wToken.deposit.reset();
    wToken.approve.reset();
  });

  describe('depositUsingProtocolToken', () => {
    const OPERATOR = '0x0000000000000000000000000000000000000003';
    const PERMISSIONS: PermissionSet = { operator: OPERATOR, permissions: [0, 2] };

    type PermissionSet = { operator: string; permissions: (0 | 1 | 2 | 3)[] };

    when('trying to deposit more protocol token that was sent', () => {
      then('reverts with message', async () => {
        const tx = DCAHubCompanionWTokenPositionHandlerMock.depositUsingProtocolToken(
          TO_TOKEN,
          AMOUNT,
          AMOUNT_OF_SWAPS,
          SWAP_INTERVAL,
          OWNER,
          [],
          {
            value: AMOUNT - 1,
          }
        );
        await behaviours.checkTxRevertedWithMessage({ tx, message: 'Transaction reverted: function call failed to execute' });
      });
    });
    when('a valid deposit is made', () => {
      const POSITION_ID = 10;
      let tx: TransactionResponse;
      given(async () => {
        DCAHub.deposit.returns(POSITION_ID);
        tx = await DCAHubCompanionWTokenPositionHandlerMock.depositUsingProtocolToken(
          TO_TOKEN,
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
        expect(to).to.equal(TO_TOKEN);
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
        expect(permissions[1].operator).to.equal(DCAHubCompanionWTokenPositionHandlerMock.address);
        expect(permissions[1].permissions).to.eql([0, 1, 2, 3]);
      });
      then('event is emitted', async () => {
        await expect(tx)
          .to.emit(DCAHubCompanionWTokenPositionHandlerMock, 'ConvertedDeposit')
          .withArgs(POSITION_ID, '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE', wToken.address);
      });
    });
  });

  describe('increasePositionUsingProtocolToken', () => {
    const POSITION_ID = 10;
    when('trying to increase with more protocol token that was sent', () => {
      then('reverts with message', async () => {
        const tx = DCAHubCompanionWTokenPositionHandlerMock.increasePositionUsingProtocolToken(POSITION_ID, AMOUNT, AMOUNT_OF_SWAPS, {
          value: AMOUNT - 1,
        });
        await behaviours.checkTxRevertedWithMessage({ tx, message: 'Transaction reverted: function call failed to execute' });
      });
    });
    when('a valid increase is made', () => {
      given(async () => {
        await DCAHubCompanionWTokenPositionHandlerMock.increasePositionUsingProtocolToken(POSITION_ID, AMOUNT, AMOUNT_OF_SWAPS, {
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
  });
});
