import { expect } from 'chai';
import { ethers } from 'hardhat';
import { contract, given, then, when } from '@test-utils/bdd';
import { snapshot } from '@test-utils/evm';
import { DCAFeeManager, DCAFeeManager__factory } from '@typechained';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { duration } from 'moment';
import { behaviours, wallet } from '@test-utils';
import { readArgFromEventOrFail } from '@test-utils/event-utils';
import { TransactionResponse } from '@ethersproject/providers';
import { IDCAFeeManager } from '@typechained/DCAFeeManager';

contract('DCAFeeManager', () => {
  const HUB = '0x0000000000000000000000000000000000000001';
  const TOKEN_A = '0x0000000000000000000000000000000000000010';
  const TOKEN_B = '0x0000000000000000000000000000000000000011';
  const TOKEN_C = '0x0000000000000000000000000000000000000012';
  const MAX_SHARES = 10000;
  const DEFAULT_DISTRIBUTION = [{ token: TOKEN_A, shares: MAX_SHARES }];
  let DCAFeeManager: DCAFeeManager;
  let DCAFeeManagerFactory: DCAFeeManager__factory;
  let random: SignerWithAddress, governor: SignerWithAddress;
  let snapshotId: string;

  before('Setup accounts and contracts', async () => {
    [random, governor] = await ethers.getSigners();
    DCAFeeManagerFactory = await ethers.getContractFactory('contracts/DCAFeeManager/DCAFeeManager.sol:DCAFeeManager');
    DCAFeeManager = await DCAFeeManagerFactory.deploy(HUB, DEFAULT_DISTRIBUTION, governor.address);
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
      then('max token total share is set correctly', async () => {
        expect(await DCAFeeManager.MAX_TOKEN_TOTAL_SHARE()).to.equal(MAX_SHARES);
      });
      then('swap interval is set to daily', async () => {
        expect(await DCAFeeManager.SWAP_INTERVAL()).to.equal(duration(1, 'day').asSeconds());
      });
      then('default distribution is set correctly', async () => {
        const distribution = await DCAFeeManager.targetTokensDistribution();
        expectDistributionsToBeEqual(distribution, DEFAULT_DISTRIBUTION);
      });
    });
  });

  describe('setAccess', () => {
    const USER = wallet.generateRandomAddress();
    when('giving access to a user', () => {
      let tx: TransactionResponse;
      given(async () => {
        tx = await DCAFeeManager.connect(governor).setAccess([{ user: USER, access: true }]);
      });
      then('user has access', async () => {
        expect(await DCAFeeManager.hasAccess(USER)).to.be.true;
      });
      then('event is emitted', async () => {
        await expect(tx).to.emit(DCAFeeManager, 'NewAccess');
        // Can't compare array of objects directly, so will read the arg and compare manually
        const access: IDCAFeeManager.UserAccessStruct[] = await readArgFromEventOrFail(tx, 'NewAccess', 'access');
        expect(access).to.have.lengthOf(1);
        expect(access[0].user).to.equal(USER);
        expect(access[0].access).to.equal(true);
      });
    });
    when('taking access from a user', () => {
      let tx: TransactionResponse;
      given(async () => {
        await DCAFeeManager.connect(governor).setAccess([{ user: USER, access: true }]);
        tx = await DCAFeeManager.connect(governor).setAccess([{ user: USER, access: false }]);
      });
      then('user lost access', async () => {
        expect(await DCAFeeManager.hasAccess(USER)).to.be.false;
      });
      then('event is emitted', async () => {
        await expect(tx).to.emit(DCAFeeManager, 'NewAccess');
        // Can't compare array of objects directly, so will read the arg and compare manually
        const access: IDCAFeeManager.UserAccessStruct[] = await readArgFromEventOrFail(tx, 'NewAccess', 'access');
        expect(access).to.have.lengthOf(1);
        expect(access[0].user).to.equal(USER);
        expect(access[0].access).to.equal(false);
      });
    });
    behaviours.shouldBeExecutableOnlyByGovernor({
      contract: () => DCAFeeManager,
      funcAndSignature: 'setAccess',
      params: () => [[{ user: random.address, access: true }]],
      governor: () => governor,
    });
  });

  describe('setTargetTokensDistribution', () => {
    when('not all shares are assigned', () => {
      then('reverts with message', async () => {
        await behaviours.txShouldRevertWithMessage({
          contract: DCAFeeManager,
          func: 'setTargetTokensDistribution',
          args: [
            [
              { token: TOKEN_A, shares: 10 },
              { token: TOKEN_B, shares: 50 },
            ],
          ],
          message: 'InvalidAmountOfShares',
        });
      });
    });
    distributionTest({
      when: 'the number of target tokens increases',
      newDistribution: [
        { token: TOKEN_B, shares: MAX_SHARES / 2 },
        { token: TOKEN_C, shares: MAX_SHARES / 2 },
      ],
    });
    distributionTest({
      when: 'the number of target tokens stays the same',
      newDistribution: [{ token: TOKEN_B, shares: MAX_SHARES }],
    });
    distributionTest({
      when: 'the number of target tokens is reduced',
      prevDistribution: [
        { token: TOKEN_A, shares: MAX_SHARES / 2 },
        { token: TOKEN_B, shares: MAX_SHARES / 2 },
      ],
      newDistribution: [{ token: TOKEN_C, shares: MAX_SHARES }],
    });
    shouldBeExecutableByGovernorOrAllowed({
      funcAndSignature: 'setTargetTokensDistribution',
      params: [{ token: TOKEN_B, shares: MAX_SHARES }],
    });

    function distributionTest({
      when: title,
      prevDistribution,
      newDistribution,
    }: {
      when: string;
      prevDistribution?: Distribution;
      newDistribution: Distribution;
    }) {
      when(title, () => {
        let tx: TransactionResponse;
        given(async () => {
          if (prevDistribution) {
            await DCAFeeManager.setTargetTokensDistribution(prevDistribution);
          }
          tx = await DCAFeeManager.setTargetTokensDistribution(newDistribution);
        });
        then('distribution is set correctly', async () => {
          const distribution = await DCAFeeManager.targetTokensDistribution();
          expectDistributionsToBeEqual(distribution, newDistribution);
        });
        then('event is emitted', async () => {
          await expect(tx).to.emit(DCAFeeManager, 'NewDistribution');

          // Can't compare array of objects directly, so will read the arg and compare manually
          const distribution: Distribution = await readArgFromEventOrFail(tx, 'NewDistribution', 'distribution');
          expectDistributionsToBeEqual(distribution, newDistribution);
        });
      });
    }
  });

  type Distribution = { token: string; shares: number }[];
  function expectDistributionsToBeEqual(actual: Distribution, expected: Distribution) {
    expect(actual).to.be.lengthOf(expected.length);
    for (let i = 0; i < actual.length; i++) {
      expect(actual[i].token).to.be.equal(expected[i].token);
      expect(actual[i].shares).to.be.equal(expected[i].shares);
    }
  }

  function shouldBeExecutableByGovernorOrAllowed({ funcAndSignature, params }: { funcAndSignature: string; params?: any[] | (() => any[]) }) {
    let realParams: any[];
    given(() => {
      realParams = typeof params === 'function' ? params() : params ?? [];
    });
    when('called from allowed', () => {
      let onlyAllowed: Promise<TransactionResponse>;
      given(async () => {
        await DCAFeeManager.setAccess([{ user: random.address, access: true }]);
        onlyAllowed = (DCAFeeManager as any).connect(random)[funcAndSignature](...realParams!);
      });
      then(`tx is not reverted or not reverted with reason 'CallerMustBeOwnerOrHaveAccess'`, async () => {
        await expect(onlyAllowed).to.not.be.revertedWith('CallerMustBeOwnerOrHaveAccess');
      });
    });
    when('called by governor', () => {
      let onlyGovernor: Promise<TransactionResponse>;
      given(async () => {
        onlyGovernor = (DCAFeeManager as any).connect(governor)[funcAndSignature](...realParams!);
      });
      then(`tx is not reverted or not reverted with reason 'CallerMustBeOwnerOrHaveAccess'`, async () => {
        await expect(onlyGovernor).to.not.be.revertedWith('CallerMustBeOwnerOrHaveAccess');
      });
    });
    when('not called from allowed or governor', () => {
      let onlyGovernorAllowedTx: Promise<TransactionResponse>;
      given(async () => {
        const notAllowed = await wallet.generateRandom();
        onlyGovernorAllowedTx = (DCAFeeManager as any).connect(notAllowed)[funcAndSignature](...realParams!);
      });
      then('tx is reverted with reason', async () => {
        await expect(onlyGovernorAllowedTx).to.be.revertedWith('CallerMustBeOwnerOrHaveAccess');
      });
    });
  }
});
