import chai from 'chai';
import { ethers } from 'hardhat';
import { behaviours, constants } from '@test-utils';
import { contract } from '@test-utils/bdd';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { snapshot } from '@test-utils/evm';
import { DCAHubSwapperDustHandlerMock, DCAHubSwapperDustHandlerMock__factory, IERC20 } from '@typechained';
import { FakeContract, smock } from '@defi-wonderland/smock';

chai.use(smock.matchers);

contract('DCAHubSwapperDustHandler', () => {
  let governor: SignerWithAddress;
  let DCAHubSwapperDustHandler: DCAHubSwapperDustHandlerMock;
  let DCAHubSwapperDustHandlerFactory: DCAHubSwapperDustHandlerMock__factory;
  let token: FakeContract<IERC20>;
  let snapshotId: string;

  before('Setup accounts and contracts', async () => {
    [, governor] = await ethers.getSigners();
    DCAHubSwapperDustHandlerFactory = await ethers.getContractFactory(
      'contracts/mocks/DCAHubSwapper/DCAHubSwapperDustHandler.sol:DCAHubSwapperDustHandlerMock'
    );
    token = await smock.fake('IERC20');
    token.transfer.returns(true);
    DCAHubSwapperDustHandler = await DCAHubSwapperDustHandlerFactory.deploy(governor.address);
    snapshotId = await snapshot.take();
  });

  beforeEach('Deploy and configure', async () => {
    await snapshot.revert(snapshotId);
  });

  describe('sendDust', () => {
    behaviours.shouldBeExecutableOnlyByGovernor({
      contract: () => DCAHubSwapperDustHandler,
      funcAndSignature: 'sendDust',
      params: () => [constants.NOT_ZERO_ADDRESS, token.address, 2000],
      governor: () => governor,
    });
  });
});
