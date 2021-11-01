import chai, { expect } from 'chai';
import { ethers } from 'hardhat';
import { behaviours, constants } from '@test-utils';
import { contract, given, then, when } from '@test-utils/bdd';
import { snapshot } from '@test-utils/evm';
import { DCAHubCompanionETHPositionHandlerMock, DCAHubCompanionETHPositionHandlerMock__factory, IDCAHub, IWETH9 } from '@typechained';
import { FakeContract, smock } from '@defi-wonderland/smock';
import moment from 'moment';
import { TransactionResponse } from '@ethersproject/abstract-provider';

chai.use(smock.matchers);

contract('DCAHubCompanionETHPositionHandler', () => {
  const TO_TOKEN = constants.NOT_ZERO_ADDRESS;
  const AMOUNT = 10000000000;
  const AMOUNT_OF_SWAPS = 10;
  const SWAP_INTERVAL = moment().day(1).seconds();
  const OWNER = '0x0000000000000000000000000000000000000002';

  let DCAHub: FakeContract<IDCAHub>;
  let WETH: FakeContract<IWETH9>;
  let DCAHubCompanionETHPositionHandler: DCAHubCompanionETHPositionHandlerMock;
  let DCAHubCompanionETHPositionHandlerFactory: DCAHubCompanionETHPositionHandlerMock__factory;
  let snapshotId: string;

  before('Setup accounts and contracts', async () => {
    DCAHubCompanionETHPositionHandlerFactory = await ethers.getContractFactory(
      'contracts/mocks/DCAHubCompanion/DCAHubCompanionETHPositionHandler.sol:DCAHubCompanionETHPositionHandlerMock'
    );
    DCAHub = await smock.fake('IDCAHub');
    WETH = await smock.fake('IWETH9');
    DCAHubCompanionETHPositionHandler = await DCAHubCompanionETHPositionHandlerFactory.deploy(DCAHub.address, WETH.address);
    snapshotId = await snapshot.take();
  });

  beforeEach('Deploy and configure', async () => {
    await snapshot.revert(snapshotId);
    DCAHub.deposit.reset();
    WETH.approve.reset();
  });

  describe('depositUsingETH', () => {
    const OPERATOR = '0x0000000000000000000000000000000000000003';
    const PERMISSIONS: PermissionSet = { operator: OPERATOR, permissions: [0, 2] };

    type PermissionSet = { operator: string; permissions: (0 | 1 | 2 | 3)[] };

    when('trying to deposit more ETH that was sent', () => {
      then('reverts with message', async () => {
        const tx = DCAHubCompanionETHPositionHandler.depositUsingETH(TO_TOKEN, AMOUNT, AMOUNT_OF_SWAPS, SWAP_INTERVAL, OWNER, [], {
          value: AMOUNT - 1,
        });
        await behaviours.checkTxRevertedWithMessage({ tx, message: 'Transaction reverted: function call failed to execute' });
      });
    });
    when('a valid deposit is made', () => {
      const POSITION_ID = 10;
      let tx: TransactionResponse;
      given(async () => {
        DCAHub.deposit.returns(POSITION_ID);
        tx = await DCAHubCompanionETHPositionHandler.depositUsingETH(TO_TOKEN, AMOUNT, AMOUNT_OF_SWAPS, SWAP_INTERVAL, OWNER, [PERMISSIONS], {
          value: AMOUNT,
        });
      });
      then('WETH is approved for the hub', () => {
        expect(WETH.approve).to.have.been.calledOnceWith(DCAHub.address, AMOUNT);
      });
      then('deposit is executed', () => {
        expect(DCAHub.deposit).to.have.been.calledOnce;
        const [from, to, amount, amountOfSwaps, swapInterval, owner, uncastedPermissions] = DCAHub.deposit.getCall(0).args;
        expect(from).to.equal(WETH.address);
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
        expect(permissions[1].operator).to.equal(DCAHubCompanionETHPositionHandler.address);
        expect(permissions[1].permissions).to.eql([0, 1, 2, 3]);
      });
      then('event is emitted', async () => {
        await expect(tx)
          .to.emit(DCAHubCompanionETHPositionHandler, 'ConvertedDeposit')
          .withArgs(POSITION_ID, '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE', WETH.address);
      });
    });
  });
});
