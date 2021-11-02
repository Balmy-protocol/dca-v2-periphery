import chai, { expect } from 'chai';
import { ethers } from 'hardhat';
import { behaviours } from '@test-utils';
import { contract, given, then, when } from '@test-utils/bdd';
import { snapshot } from '@test-utils/evm';
import {
  DCAHubCompanionWTokenPositionHandlerMock,
  DCAHubCompanionWTokenPositionHandlerMock__factory,
  IDCAHub,
  IERC20,
  IWrappedProtocolToken,
} from '@typechained';
import { FakeContract, smock } from '@defi-wonderland/smock';
import moment from 'moment';
import { TransactionResponse } from '@ethersproject/abstract-provider';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signers';

chai.use(smock.matchers);

contract('DCAHubCompanionWTokenPositionHandlerMock', () => {
  const AMOUNT = 10000000000;
  const AMOUNT_OF_SWAPS = 10;

  let signer: SignerWithAddress;
  let DCAHub: FakeContract<IDCAHub>;
  let wToken: FakeContract<IWrappedProtocolToken>;
  let erc20Token: FakeContract<IERC20>;
  let DCAHubCompanionWTokenPositionHandlerMock: DCAHubCompanionWTokenPositionHandlerMock;
  let DCAHubCompanionWTokenPositionHandlerMockFactory: DCAHubCompanionWTokenPositionHandlerMock__factory;
  let snapshotId: string;

  before('Setup accounts and contracts', async () => {
    [signer] = await ethers.getSigners();
    DCAHubCompanionWTokenPositionHandlerMockFactory = await ethers.getContractFactory(
      'contracts/mocks/DCAHubCompanion/DCAHubCompanionWTokenPositionHandler.sol:DCAHubCompanionWTokenPositionHandlerMock'
    );
    DCAHub = await smock.fake('IDCAHub');
    wToken = await smock.fake('IWrappedProtocolToken');
    erc20Token = await smock.fake('IERC20');
    DCAHubCompanionWTokenPositionHandlerMock = await DCAHubCompanionWTokenPositionHandlerMockFactory.deploy(DCAHub.address, wToken.address);
    snapshotId = await snapshot.take();
  });

  beforeEach('Deploy and configure', async () => {
    await snapshot.revert(snapshotId);
    erc20Token.approve.reset();
    DCAHub.deposit.reset();
    DCAHub.increasePosition.reset();
    wToken.deposit.reset();
    wToken.approve.reset();
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
        const tx = DCAHubCompanionWTokenPositionHandlerMock.depositUsingProtocolToken(
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
        await behaviours.checkTxRevertedWithMessage({ tx, message: 'NoProtocolToken' });
      });
    });
    when('sending more protocol token than expected', () => {
      then('reverts with message', async () => {
        const tx = DCAHubCompanionWTokenPositionHandlerMock.depositUsingProtocolToken(
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
        const tx = DCAHubCompanionWTokenPositionHandlerMock.depositUsingProtocolToken(
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
        tx = await DCAHubCompanionWTokenPositionHandlerMock.depositUsingProtocolToken(
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
        expect(permissions[1].operator).to.equal(DCAHubCompanionWTokenPositionHandlerMock.address);
        expect(permissions[1].permissions).to.eql([0, 1, 2, 3]);
      });
      then('event is emitted', async () => {
        await expect(tx)
          .to.emit(DCAHubCompanionWTokenPositionHandlerMock, 'ConvertedDeposit')
          .withArgs(POSITION_ID, PROTOCOL_TOKEN, wToken.address, erc20Token.address, erc20Token.address);
      });
    });
    when('to is protocol token', () => {
      const POSITION_ID = 10;
      let tx: TransactionResponse;
      given(async () => {
        erc20Token.transferFrom.returns(true);
        DCAHub.deposit.returns(POSITION_ID);
        tx = await DCAHubCompanionWTokenPositionHandlerMock.depositUsingProtocolToken(
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
        expect(erc20Token.transferFrom).to.have.been.calledWith(signer.address, DCAHubCompanionWTokenPositionHandlerMock.address, AMOUNT);
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
        expect(permissions[1].operator).to.equal(DCAHubCompanionWTokenPositionHandlerMock.address);
        expect(permissions[1].permissions).to.eql([0, 1, 2, 3]);
      });
      then('event is emitted', async () => {
        await expect(tx)
          .to.emit(DCAHubCompanionWTokenPositionHandlerMock, 'ConvertedDeposit')
          .withArgs(POSITION_ID, erc20Token.address, erc20Token.address, PROTOCOL_TOKEN, wToken.address);
      });
    });
  });

  describe('increasePositionUsingProtocolToken', () => {
    const POSITION_ID = 10;
    when('sending more protocol token than expected', () => {
      then('reverts with message', async () => {
        const tx = DCAHubCompanionWTokenPositionHandlerMock.increasePositionUsingProtocolToken(POSITION_ID, AMOUNT, AMOUNT_OF_SWAPS, {
          value: AMOUNT + 1,
        });
        await behaviours.checkTxRevertedWithMessage({ tx, message: 'InvalidAmountOfProtocolTokenReceived' });
      });
    });
    when('sending less protocol token than expected', () => {
      then('reverts with message', async () => {
        const tx = DCAHubCompanionWTokenPositionHandlerMock.increasePositionUsingProtocolToken(POSITION_ID, AMOUNT, AMOUNT_OF_SWAPS, {
          value: AMOUNT - 1,
        });
        await behaviours.checkTxRevertedWithMessage({ tx, message: 'InvalidAmountOfProtocolTokenReceived' });
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
