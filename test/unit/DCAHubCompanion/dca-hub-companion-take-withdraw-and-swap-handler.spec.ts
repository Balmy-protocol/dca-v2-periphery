import chai, { expect } from 'chai';
import { ethers } from 'hardhat';
import { contract, given, then, when } from '@test-utils/bdd';
import { snapshot } from '@test-utils/evm';
import {
  DCAHubCompanionTakeWithdrawAndSwapHandlerMock,
  DCAHubCompanionTakeWithdrawAndSwapHandlerMock__factory,
  IERC20,
  ISwapperRegistry,
} from '@typechained';
import { FakeContract, smock } from '@defi-wonderland/smock';
import { BigNumber, Wallet } from 'ethers';
import { wallet } from '@test-utils';

chai.use(smock.matchers);

contract('DCAHubCompanionTakeWithdrawAndSwapHandlerMock', () => {
  let token: FakeContract<IERC20>;
  let takeWithdrawAndSwapHandler: DCAHubCompanionTakeWithdrawAndSwapHandlerMock;
  let snapshotId: string;

  before('Setup accounts and contracts', async () => {
    const DCAHubCompanionHubProxyHandlerFactory: DCAHubCompanionTakeWithdrawAndSwapHandlerMock__factory = await ethers.getContractFactory(
      'DCAHubCompanionTakeWithdrawAndSwapHandlerMock'
    );
    const registry = await smock.fake('ISwapperRegistry');
    token = await smock.fake('IERC20');
    takeWithdrawAndSwapHandler = await DCAHubCompanionHubProxyHandlerFactory.deploy(registry.address);
    snapshotId = await snapshot.take();
  });

  beforeEach(async () => {
    await snapshot.revert(snapshotId);
    token.transfer.reset();
    token.transfer.returns(true);
  });

  describe('sendToRecipient', () => {
    const AMOUNT = 123456789;
    const RECIPIENT = Wallet.createRandom();
    when('sending ERC20 tokens to the recipient', () => {
      given(async () => {
        await takeWithdrawAndSwapHandler.sendToRecipient(token.address, AMOUNT, RECIPIENT.address);
      });
      then('transfer is executed', async () => {
        expect(token.transfer).to.have.been.calledOnceWith(RECIPIENT.address, AMOUNT);
      });
    });
    when('sending ETH to the recipient', () => {
      given(async () => {
        await wallet.setBalance({ account: takeWithdrawAndSwapHandler.address, balance: BigNumber.from(AMOUNT) });
        await takeWithdrawAndSwapHandler.sendToRecipient(await takeWithdrawAndSwapHandler.PROTOCOL_TOKEN(), AMOUNT, RECIPIENT.address);
      });
      then('adapter no longer has balance', async () => {
        expect(await ethers.provider.getBalance(takeWithdrawAndSwapHandler.address)).to.equal(0);
      });
      then('balance is transferred to recipient', async () => {
        expect(await ethers.provider.getBalance(RECIPIENT.address)).to.equal(AMOUNT);
      });
    });
  });
});
