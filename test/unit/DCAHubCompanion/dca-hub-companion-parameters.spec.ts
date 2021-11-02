import { expect } from 'chai';
import { ethers } from 'hardhat';
import { behaviours, constants } from '@test-utils';
import { contract, then, when } from '@test-utils/bdd';
import { snapshot } from '@test-utils/evm';
import { DCAHubCompanionParametersMock, DCAHubCompanionParametersMock__factory } from '@typechained';

contract('DCAHubCompanionParameters', () => {
  const HUB = '0x0000000000000000000000000000000000000001';
  const WRAPPED_TOKEN = '0x0000000000000000000000000000000000000002';
  let DCAHubCompanionParameters: DCAHubCompanionParametersMock;
  let DCAHubCompanionParametersFactory: DCAHubCompanionParametersMock__factory;
  let snapshotId: string;

  before('Setup accounts and contracts', async () => {
    DCAHubCompanionParametersFactory = await ethers.getContractFactory(
      'contracts/mocks/DCAHubCompanion/DCAHubCompanionParameters.sol:DCAHubCompanionParametersMock'
    );
    DCAHubCompanionParameters = await DCAHubCompanionParametersFactory.deploy(HUB, WRAPPED_TOKEN);
    snapshotId = await snapshot.take();
  });

  beforeEach('Deploy and configure', async () => {
    await snapshot.revert(snapshotId);
  });

  describe('constructor', () => {
    when('hub is zero address', () => {
      then('deployment is reverted with reason', async () => {
        await behaviours.deployShouldRevertWithMessage({
          contract: DCAHubCompanionParametersFactory,
          args: [constants.ZERO_ADDRESS, WRAPPED_TOKEN],
          message: 'ZeroAddress',
        });
      });
    });
    when('wrapped token is zero address', () => {
      then('deployment is reverted with reason', async () => {
        await behaviours.deployShouldRevertWithMessage({
          contract: DCAHubCompanionParametersFactory,
          args: [HUB, constants.ZERO_ADDRESS],
          message: 'ZeroAddress',
        });
      });
    });
    when('contract is initiated', () => {
      then('hub is set correctly', async () => {
        expect(await DCAHubCompanionParameters.hub()).to.equal(HUB);
      });
      then('wrapped token is set correctly', async () => {
        expect(await DCAHubCompanionParameters.wToken()).to.equal(WRAPPED_TOKEN);
      });
    });
  });
});
