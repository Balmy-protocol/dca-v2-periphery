import { expect } from 'chai';
import { ethers } from 'hardhat';
import { behaviours, constants } from '@test-utils';
import { contract, then, when } from '@test-utils/bdd';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signers';
import { snapshot } from '@test-utils/evm';
import { DCAHubCompanionParametersMock, DCAHubCompanionParametersMock__factory } from '@typechained';

contract('DCAHubCompanionParameters', () => {
  let hub: SignerWithAddress;
  let DCAHubCompanionParameters: DCAHubCompanionParametersMock;
  let DCAHubCompanionParametersFactory: DCAHubCompanionParametersMock__factory;
  let snapshotId: string;

  before('Setup accounts and contracts', async () => {
    [hub] = await ethers.getSigners();
    DCAHubCompanionParametersFactory = await ethers.getContractFactory(
      'contracts/mocks/DCAHubCompanion/DCAHubCompanionParameters.sol:DCAHubCompanionParametersMock'
    );
    DCAHubCompanionParameters = await DCAHubCompanionParametersFactory.deploy(hub.address);
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
          args: [constants.ZERO_ADDRESS],
          message: 'ZeroAddress',
        });
      });
    });
    when('contract is initiated', () => {
      then('hub is set correctly', async () => {
        expect(await DCAHubCompanionParameters.hub()).to.equal(hub.address);
      });
    });
  });
});
