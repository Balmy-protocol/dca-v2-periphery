import { expect } from 'chai';
import { ethers } from 'hardhat';
import { contract, then, when } from '@test-utils/bdd';
import { snapshot } from '@test-utils/evm';
import { DCAFeeManager, DCAFeeManager__factory } from '@typechained';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { duration } from 'moment';

contract('DCAFeeManager', () => {
  const HUB = '0x0000000000000000000000000000000000000001';
  let DCAFeeManager: DCAFeeManager;
  let DCAFeeManagerFactory: DCAFeeManager__factory;
  let governor: SignerWithAddress;
  let snapshotId: string;

  before('Setup accounts and contracts', async () => {
    [governor] = await ethers.getSigners();
    DCAFeeManagerFactory = await ethers.getContractFactory('contracts/DCAFeeManager/DCAFeeManager.sol:DCAFeeManager');
    DCAFeeManager = await DCAFeeManagerFactory.deploy(HUB, governor.address);
    snapshotId = await snapshot.take();
  });

  beforeEach(async () => {
    await snapshot.revert(snapshotId);
  });

  describe('constructor', () => {
    when('contract is initiated', () => {
      then('hub is set correctly', async () => {
        expect(await DCAFeeManager.hub()).to.equal(HUB);
      });
      then('max token distribution is set correctly', async () => {
        expect(await DCAFeeManager.MAX_TOKEN_DISTRIBUTION()).to.equal(10000);
      });
      then('swap interval is set to daily', async () => {
        expect(await DCAFeeManager.SWAP_INTERVAL()).to.equal(duration(1, 'day').asSeconds());
      });
    });
  });
});
