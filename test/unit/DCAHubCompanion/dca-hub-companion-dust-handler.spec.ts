import chai from 'chai';
import { ethers } from 'hardhat';
import { behaviours, constants } from '@test-utils';
import { contract } from '@test-utils/bdd';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signers';
import { snapshot } from '@test-utils/evm';
import { DCAHubCompanionDustHandlerMock, DCAHubCompanionDustHandlerMock__factory, IERC20 } from '@typechained';
import { FakeContract, smock } from '@defi-wonderland/smock';

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
    behaviours.shouldBeExecutableOnlyByGovernor({
      contract: () => DCAHubCompanionDustHandler,
      funcAndSignature: 'sendDust',
      params: () => [constants.NOT_ZERO_ADDRESS, token.address, 2000],
      governor: () => governor,
    });
  });
});
