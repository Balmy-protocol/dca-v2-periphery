import { expect } from 'chai';
import { ethers } from 'hardhat';
import { behaviours, constants, wallet } from '@test-utils';
import { contract, given, then, when } from '@test-utils/bdd';
import { snapshot } from '@test-utils/evm';
import { DCAKeep3rJob, DCAKeep3rJob__factory, IDCAHubCompanion } from '@typechained';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signers';
import { FakeContract, smock } from '@defi-wonderland/smock';
import { TransactionResponse } from '@ethersproject/abstract-provider';

contract('DCAKeep3rJob', () => {
  let governor: SignerWithAddress;
  let DCAKeep3rJob: DCAKeep3rJob;
  let DCAKeep3rJobFactory: DCAKeep3rJob__factory;
  let DCAHubCompanion: FakeContract<IDCAHubCompanion>;
  let snapshotId: string;

  before('Setup accounts and contracts', async () => {
    [, governor] = await ethers.getSigners();
    DCAHubCompanion = await smock.fake('IDCAHubCompanion');
    DCAKeep3rJobFactory = await ethers.getContractFactory('contracts/DCAKeep3rJob/DCAKeep3rJob.sol:DCAKeep3rJob');
    DCAKeep3rJob = await DCAKeep3rJobFactory.deploy(DCAHubCompanion.address, governor.address);
    snapshotId = await snapshot.take();
  });

  beforeEach('Deploy and configure', async () => {
    await snapshot.revert(snapshotId);
  });

  describe('constructor', () => {
    when('companion is zero address', () => {
      then('deployment is reverted with reason', async () => {
        await behaviours.deployShouldRevertWithMessage({
          contract: DCAKeep3rJobFactory,
          args: [constants.ZERO_ADDRESS, governor.address],
          message: 'ZeroAddress',
        });
      });
    });
    when('contract is initiated', () => {
      then('companion is set correctly', async () => {
        expect(await DCAKeep3rJob.companion()).to.equal(DCAHubCompanion.address);
      });
    });
  });
});
