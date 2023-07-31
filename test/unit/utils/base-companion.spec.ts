import chai, { expect } from 'chai';
import { ethers } from 'hardhat';
import { contract, given, then, when } from '@test-utils/bdd';
import { snapshot } from '@test-utils/evm';
import behaviors from '@test-utils/behaviours';
import { BaseCompanionMock, BaseCompanionMock__factory, IERC20, IPermit2, ISwapper } from '@typechained';
import { FakeContract, smock } from '@defi-wonderland/smock';
import { BytesLike, Wallet, constants } from 'ethers';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';

chai.use(smock.matchers);

contract('BaseCompanion', () => {
  const AMOUNT = 123456789;
  const RECIPIENT = Wallet.createRandom();
  let token: FakeContract<IERC20>;
  let permit2: FakeContract<IPermit2>;
  let swapper: FakeContract<ISwapper>;
  let baseCompanion: BaseCompanionMock;
  let caller: SignerWithAddress, governor: SignerWithAddress;
  let snapshotId: string;

  before('Setup accounts and contracts', async () => {
    const baseCompanionFactory: BaseCompanionMock__factory = await ethers.getContractFactory('BaseCompanionMock');
    const registry = await smock.fake('ISwapperRegistry');
    token = await smock.fake('IERC20');
    permit2 = await smock.fake('IPermit2');
    swapper = await smock.fake('ISwapper');
    [caller, governor] = await ethers.getSigners();
    baseCompanion = await baseCompanionFactory.deploy(swapper.address, swapper.address, governor.address, permit2.address);
    snapshotId = await snapshot.take();
  });

  beforeEach(async () => {
    await snapshot.revert(snapshotId);
    token.transfer.reset();
    token.balanceOf.reset();
    token.approve.reset();
    token.transferFrom.returns(true);
    token.transfer.returns(true);
  });

  describe('sendToRecipient', () => {
    when('sending to a recipient', () => {
      given(async () => {
        await baseCompanion.sendToRecipient(token.address, AMOUNT, RECIPIENT.address);
      });
      then('internal function is called correctly', async () => {
        const calls = await baseCompanion.sendToRecipientCalls();
        expect(calls).to.have.lengthOf(1);
        expect(calls[0].token).to.equal(token.address);
        expect(calls[0].amount).to.equal(AMOUNT);
        expect(calls[0].recipient).to.equal(RECIPIENT.address);
      });
    });
  });

  describe('takeFromCaller', () => {
    const AMOUNT = 123456789;
    when('taking token from caller', () => {
      given(async () => {
        await baseCompanion.takeFromCaller(token.address, AMOUNT);
      });
      then('internal function is called correctly', async () => {
        const calls = await baseCompanion.takeFromMsgSenderCalls();
        expect(calls).to.have.lengthOf(1);
        expect(calls[0].token).to.equal(token.address);
        expect(calls[0].amount).to.equal(AMOUNT);
      });
    });
  });

  describe('runSwap', () => {
    let swapExecution: BytesLike;
    given(async () => {
      const { data } = await swapper.populateTransaction.swap(token.address, 1000, token.address);
      swapExecution = data!;
    });
    when('swap is executed', () => {
      given(async () => {
        await baseCompanion.runSwap(token.address, 0, swapExecution, token.address, 0);
      });
      then('max approval is given', () => {
        expect(token.approve).to.have.been.calledOnceWith(swapper.address, constants.MaxUint256);
      });
      then('swapper is called correctly', () => {
        expect(swapper.swap).to.have.been.calledWith(token.address, 1000, token.address);
      });
      then('balance is checked correctly', () => {
        expect(token.balanceOf).to.have.been.calledOnceWith(baseCompanion.address);
      });
    });
    when('allowance token is not set', () => {
      given(async () => {
        await baseCompanion.runSwap(constants.AddressZero, 0, swapExecution, token.address, 0);
      });
      then('approve is not called', () => {
        expect(token.approve).to.not.have.been.called;
      });
    });
    when('returned balance is less than expected', () => {
      then('call reverts', async () => {
        const tx = baseCompanion.runSwap(constants.AddressZero, 0, swapExecution, token.address, 1);
        expect(tx).to.have.revertedWith('ReceivedTooLittleTokenOut(0,1)');
      });
    });
  });

  describe('sendBalanceOnContractToRecipient', () => {
    when('sending balance on contract to a recipient', () => {
      given(async () => {
        await baseCompanion.sendBalanceOnContractToRecipient(token.address, RECIPIENT.address);
      });
      then('internal function is called correctly', async () => {
        const calls = await baseCompanion.sendBalanceOnContractToRecipientCalls();
        expect(calls).to.have.lengthOf(1);
        expect(calls[0].token).to.equal(token.address);
        expect(calls[0].recipient).to.equal(RECIPIENT.address);
      });
    });
  });

  describe('permitTakeFromCaller', () => {
    when('taking from caller with permit', () => {
      given(async () => {
        await baseCompanion.permitTakeFromCaller(token.address, 12345, 678910, 2468, '0x1234', swapper.address);
      });
      then('internal function is called correctly', async () => {
        expect(permit2['permitTransferFrom(((address,uint256),uint256,uint256),(address,uint256),address,bytes)']).to.have.been.calledOnce;
        const {
          args: [permit, transferDetails, owner, signature],
        } = permit2['permitTransferFrom(((address,uint256),uint256,uint256),(address,uint256),address,bytes)'].getCall(0) as { args: any[] };
        expect(permit.permitted.token).to.equal(token.address);
        expect(permit.permitted.amount).to.equal(12345);
        expect(permit.nonce).to.equal(678910);
        expect(permit.deadline).to.equal(2468);
        expect(transferDetails.to).to.equal(swapper.address);
        expect(transferDetails.requestedAmount).to.equal(12345);
        expect(owner).to.equal(caller.address);
        expect(signature).to.equal('0x1234');
      });
    });
  });

  describe('batchPermitTakeFromCaller', () => {
    when('taking from caller with permit', () => {
      given(async () => {
        await baseCompanion.batchPermitTakeFromCaller([{ token: token.address, amount: 12345 }], 678910, 2468, '0x1234', swapper.address);
      });
      then('internal function is called correctly', async () => {
        expect(permit2['permitTransferFrom(((address,uint256)[],uint256,uint256),(address,uint256)[],address,bytes)']).to.have.been.calledOnce;
        const {
          args: [permit, transferDetails, owner, signature],
        } = permit2['permitTransferFrom(((address,uint256)[],uint256,uint256),(address,uint256)[],address,bytes)'].getCall(0) as { args: any[] };
        expect(permit.permitted).to.have.lengthOf(1);
        expect(permit.permitted[0].token).to.equal(token.address);
        expect(permit.permitted[0].amount).to.equal(12345);
        expect(permit.nonce).to.equal(678910);
        expect(permit.deadline).to.equal(2468);
        expect(transferDetails).to.have.lengthOf(1);
        expect(transferDetails[0].to).to.equal(swapper.address);
        expect(transferDetails[0].requestedAmount).to.equal(12345);
        expect(owner).to.equal(caller.address);
        expect(signature).to.equal('0x1234');
      });
    });
  });

  describe('setSwapper', () => {
    const newSwapper = '0x0000000000000000000000000000000000000001';
    const newAllowanceTarget = '0x0000000000000000000000000000000000000002';
    when('setting a new swapper', () => {
      given(async () => {
        await baseCompanion.connect(governor).setSwapper(newSwapper, newAllowanceTarget);
      });
      then('it is set correctly', async () => {
        expect(await baseCompanion.swapper()).to.equal(newSwapper);
        expect(await baseCompanion.allowanceTarget()).to.equal(newAllowanceTarget);
      });
    });
    behaviors.shouldBeExecutableOnlyByGovernor({
      contract: () => baseCompanion,
      funcAndSignature: 'setSwapper',
      params: [newSwapper, newSwapper],
      governor: () => governor,
    });
  });
});
