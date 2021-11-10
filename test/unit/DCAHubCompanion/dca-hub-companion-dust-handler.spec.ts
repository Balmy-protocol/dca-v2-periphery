import chai, { expect } from 'chai';
import { ethers } from 'hardhat';
import { constants, wallet } from '@test-utils';
import { contract, given, then, when } from '@test-utils/bdd';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signers';
import { snapshot } from '@test-utils/evm';
import { DCAHubCompanionDustHandlerMock, DCAHubCompanionDustHandlerMock__factory, IERC20 } from '@typechained';
import { FakeContract, smock } from '@defi-wonderland/smock';
import { TransactionResponse } from '@ethersproject/abstract-provider';

chai.use(smock.matchers);

contract('DCAHubCompanionDustHandler', () => {
  let governor: SignerWithAddress;
  let DCAHubCompanionDustHandler: DCAHubCompanionDustHandlerMock;
  let DCAHubCompanionDustHandlerFactory: DCAHubCompanionDustHandlerMock__factory;
  let token: FakeContract<IERC20>;
  let snapshotId: string;

  before('Setup accounts and contracts', async () => {
    [, governor] = await ethers.getSigners();
    DCAHubCompanionDustHandlerFactory = await ethers.getContractFactory(
      'contracts/mocks/DCAHubCompanion/DCAHubCompanionDustHandler.sol:DCAHubCompanionDustHandlerMock'
    );
    token = await smock.fake('IERC20');
    token.transfer.returns(true);
    DCAHubCompanionDustHandler = await DCAHubCompanionDustHandlerFactory.deploy(governor.address);
    snapshotId = await snapshot.take();
  });

  beforeEach('Deploy and configure', async () => {
    await snapshot.revert(snapshotId);
  });

  describe('sendDust', () => {
    when('not called from governor', () => {
      let onlyGovernorAllowedTx: Promise<TransactionResponse>;
      given(async () => {
        const notGovernor = await wallet.generateRandom();
        onlyGovernorAllowedTx = DCAHubCompanionDustHandler.connect(notGovernor).sendDust(constants.NOT_ZERO_ADDRESS, token.address, 2000);
      });
      then('tx is reverted with reason', async () => {
        await expect(onlyGovernorAllowedTx).to.be.revertedWith('Governable: only governor');
      });
    });
    when('called from governor', () => {
      let onlyGovernorAllowedTx: Promise<TransactionResponse>;
      given(async () => {
        onlyGovernorAllowedTx = DCAHubCompanionDustHandler.connect(governor).sendDust(constants.NOT_ZERO_ADDRESS, token.address, 2000);
      });
      then('tx is not reverted or not reverted with reason only governor', async () => {
        await expect(onlyGovernorAllowedTx).to.not.be.reverted;
      });
    });
  });
});
