import chai, { expect } from 'chai';
import { ethers } from 'hardhat';
import { contract, given, then, when } from '@test-utils/bdd';
import { snapshot } from '@test-utils/evm';
import { DCAHubCompanionTakeSendAndSwapHandlerMock, DCAHubCompanionTakeSendAndSwapHandlerMock__factory, IERC20 } from '@typechained';
import { FakeContract, smock } from '@defi-wonderland/smock';
import { BigNumber, Wallet } from 'ethers';
import { wallet } from '@test-utils';

chai.use(smock.matchers);

contract('DCAHubCompanionTakeSendAndSwapHandler', () => {
  let token: FakeContract<IERC20>;
  let TakeSendAndSwapHandler: DCAHubCompanionTakeSendAndSwapHandlerMock;
  let snapshotId: string;

  before('Setup accounts and contracts', async () => {
    const DCAHubCompanionHubProxyHandlerFactory: DCAHubCompanionTakeSendAndSwapHandlerMock__factory = await ethers.getContractFactory(
      'DCAHubCompanionTakeSendAndSwapHandlerMock'
    );
    const registry = await smock.fake('ISwapperRegistry');
    token = await smock.fake('IERC20');
    TakeSendAndSwapHandler = await DCAHubCompanionHubProxyHandlerFactory.deploy(registry.address);
    snapshotId = await snapshot.take();
  });

  beforeEach(async () => {
    await snapshot.revert(snapshotId);
    token.transfer.reset();
    token.transferFrom.returns(true);
    token.transfer.returns(true);
  });

  describe('sendToRecipient', () => {
    const AMOUNT = 123456789;
    const RECIPIENT = Wallet.createRandom();
    when('sending ERC20 tokens to the recipient', () => {
      given(async () => {
        await TakeSendAndSwapHandler.sendToRecipient(token.address, AMOUNT, RECIPIENT.address);
      });
      then('transfer is executed', async () => {
        expect(token.transfer).to.have.been.calledOnceWith(RECIPIENT.address, AMOUNT);
      });
    });
    when('sending ETH to the recipient', () => {
      given(async () => {
        await wallet.setBalance({ account: TakeSendAndSwapHandler.address, balance: BigNumber.from(AMOUNT) });
        await TakeSendAndSwapHandler.sendToRecipient(await TakeSendAndSwapHandler.PROTOCOL_TOKEN(), AMOUNT, RECIPIENT.address);
      });
      then('adapter no longer has balance', async () => {
        expect(await ethers.provider.getBalance(TakeSendAndSwapHandler.address)).to.equal(0);
      });
      then('balance is transferred to recipient', async () => {
        expect(await ethers.provider.getBalance(RECIPIENT.address)).to.equal(AMOUNT);
      });
    });
  });

  describe('takeFromCaller', () => {
    const AMOUNT = 123456789;
    when('taking token from caller', () => {
      given(async () => {
        await TakeSendAndSwapHandler.takeFromCaller(token.address, AMOUNT);
      });
      then('internal function is called correctly', async () => {
        const calls = await TakeSendAndSwapHandler.takeFromMsgSenderCalls();
        expect(calls).to.have.lengthOf(1);
        expect(calls[0].token).to.equal(token.address);
        expect(calls[0].amount).to.equal(AMOUNT);
      });
    });
  });

  describe('sendBalanceOnContractToRecipient', () => {
    const RECIPIENT = Wallet.createRandom();
    when('sending balance on contract to a recipient', () => {
      given(async () => {
        await TakeSendAndSwapHandler.sendBalanceOnContractToRecipient(token.address, RECIPIENT.address);
      });
      then('internal function is called correctly', async () => {
        const calls = await TakeSendAndSwapHandler.sendBalanceToRecipientCalls();
        expect(calls).to.have.lengthOf(1);
        expect(calls[0].token).to.equal(token.address);
        expect(calls[0].recipient).to.equal(RECIPIENT.address);
      });
    });
  });
});
