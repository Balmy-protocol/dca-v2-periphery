import chai, { expect } from 'chai';
import { ethers } from 'hardhat';
import { behaviours, constants } from '@test-utils';
import { contract, then, when } from '@test-utils/bdd';
import { snapshot } from '@test-utils/evm';
import { DCAKeep3rJob, DCAKeep3rJob__factory, IDCAHubSwapper, IKeep3r } from '@typechained';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { FakeContract, smock } from '@defi-wonderland/smock';
import { BigNumber } from 'ethers';

chai.use(smock.matchers);

contract('DCAKeep3rJob', () => {
  let superAdmin: SignerWithAddress, canSign: SignerWithAddress, random: SignerWithAddress;
  let DCAKeep3rJob: DCAKeep3rJob;
  let DCAKeep3rJobFactory: DCAKeep3rJob__factory;
  let keep3r: FakeContract<IKeep3r>;
  let DCAHubSwapper: FakeContract<IDCAHubSwapper>;
  let superAdminRole: string, canSignRole: string;
  let chainId: BigNumber;
  let snapshotId: string;

  before('Setup accounts and contracts', async () => {
    [, superAdmin, canSign, random] = await ethers.getSigners();
    keep3r = await smock.fake('IKeep3r');
    DCAHubSwapper = await smock.fake('IDCAHubSwapper');
    DCAKeep3rJobFactory = await ethers.getContractFactory('DCAKeep3rJob');
    DCAKeep3rJob = await DCAKeep3rJobFactory.deploy(keep3r.address, DCAHubSwapper.address, superAdmin.address, [canSign.address]);
    chainId = BigNumber.from((await ethers.provider.getNetwork()).chainId);
    superAdminRole = await DCAKeep3rJob.SUPER_ADMIN_ROLE();
    canSignRole = await DCAKeep3rJob.CAN_SIGN_ROLE();
    snapshotId = await snapshot.take();
  });

  beforeEach('Deploy and configure', async () => {
    await snapshot.revert(snapshotId);
    keep3r.isKeeper.reset();
    keep3r.worked.reset();
  });

  describe('constructor', () => {
    when('keep3r is zero address', () => {
      then('tx is reverted with reason error', async () => {
        await behaviours.deployShouldRevertWithMessage({
          contract: DCAKeep3rJobFactory,
          args: [constants.ZERO_ADDRESS, DCAHubSwapper.address, superAdmin.address, [canSign.address]],
          message: 'ZeroAddress',
        });
      });
    });
    when('swapper is zero address', () => {
      then('tx is reverted with reason error', async () => {
        await behaviours.deployShouldRevertWithMessage({
          contract: DCAKeep3rJobFactory,
          args: [keep3r.address, constants.ZERO_ADDRESS, superAdmin.address, [canSign.address]],
          message: 'ZeroAddress',
        });
      });
    });
    when('super admin is zero address', () => {
      then('tx is reverted with reason error', async () => {
        await behaviours.deployShouldRevertWithMessage({
          contract: DCAKeep3rJobFactory,
          args: [keep3r.address, DCAHubSwapper.address, constants.ZERO_ADDRESS, [canSign.address]],
          message: 'ZeroAddress',
        });
      });
    });
    when('contract is initiated', () => {
      then('super admin is set correctly', async () => {
        const hasRole = await DCAKeep3rJob.hasRole(superAdminRole, superAdmin.address);
        expect(hasRole).to.be.true;
      });
      then('initial signers are set correctly', async () => {
        const hasRole = await DCAKeep3rJob.hasRole(canSignRole, canSign.address);
        expect(hasRole).to.be.true;
      });
      then('super admin role is set as admin for super admin role', async () => {
        const admin = await DCAKeep3rJob.getRoleAdmin(superAdminRole);
        expect(admin).to.equal(superAdminRole);
      });
      then('super admin role is set as admin for can sign role role', async () => {
        const admin = await DCAKeep3rJob.getRoleAdmin(canSignRole);
        expect(admin).to.equal(superAdminRole);
      });
      then('keep3r is set correctly', async () => {
        const keep3rAddress = await DCAKeep3rJob.keep3r();
        expect(keep3rAddress).to.equal(keep3r.address);
      });
      then('swapper is set correctly', async () => {
        const { swapper } = await DCAKeep3rJob.swapperAndNonce();
        expect(swapper).to.equal(DCAHubSwapper.address);
      });
      then('nonce starts at 0', async () => {
        const { nonce } = await DCAKeep3rJob.swapperAndNonce();
        expect(nonce).to.equal(constants.ZERO);
      });
    });
  });
});
