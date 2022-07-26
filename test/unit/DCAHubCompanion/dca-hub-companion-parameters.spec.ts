import { expect } from 'chai';
import { ethers } from 'hardhat';
import { behaviours, constants } from '@test-utils';
import { contract, then, when } from '@test-utils/bdd';
import { snapshot } from '@test-utils/evm';
import { DCAHubCompanionParametersMock, DCAHubCompanionParametersMock__factory } from '@typechained';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';

contract('DCAHubCompanionParameters', () => {
  const HUB = '0x0000000000000000000000000000000000000001';
  const PERMISSION_MANAGER = '0x0000000000000000000000000000000000000002';
  const WRAPPED_TOKEN = '0x0000000000000000000000000000000000000003';
  let DCAHubCompanionParameters: DCAHubCompanionParametersMock;
  let DCAHubCompanionParametersFactory: DCAHubCompanionParametersMock__factory;
  let governor: SignerWithAddress;
  let snapshotId: string;

  before('Setup accounts and contracts', async () => {
    [governor] = await ethers.getSigners();
    DCAHubCompanionParametersFactory = await ethers.getContractFactory(
      'contracts/mocks/DCAHubCompanion/DCAHubCompanionParameters.sol:DCAHubCompanionParametersMock'
    );
    DCAHubCompanionParameters = await DCAHubCompanionParametersFactory.deploy(HUB, PERMISSION_MANAGER, WRAPPED_TOKEN, governor.address);
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
          args: [constants.ZERO_ADDRESS, PERMISSION_MANAGER, WRAPPED_TOKEN, constants.NOT_ZERO_ADDRESS],
          message: 'ZeroAddress',
        });
      });
    });
    when('permission manager is zero address', () => {
      then('deployment is reverted with reason', async () => {
        await behaviours.deployShouldRevertWithMessage({
          contract: DCAHubCompanionParametersFactory,
          args: [HUB, constants.ZERO_ADDRESS, WRAPPED_TOKEN, constants.NOT_ZERO_ADDRESS],
          message: 'ZeroAddress',
        });
      });
    });
    when('wrapped token is zero address', () => {
      then('deployment is reverted with reason', async () => {
        await behaviours.deployShouldRevertWithMessage({
          contract: DCAHubCompanionParametersFactory,
          args: [HUB, PERMISSION_MANAGER, constants.ZERO_ADDRESS, constants.NOT_ZERO_ADDRESS],
          message: 'ZeroAddress',
        });
      });
    });
    when('contract is initiated', () => {
      then('hub is set correctly', async () => {
        expect(await DCAHubCompanionParameters.hub()).to.equal(HUB);
      });
      then('permission manager is set correctly', async () => {
        expect(await DCAHubCompanionParameters.permissionManager()).to.equal(PERMISSION_MANAGER);
      });
      then('wrapped token is set correctly', async () => {
        expect(await DCAHubCompanionParameters.wToken()).to.equal(WRAPPED_TOKEN);
      });
    });
  });
});
