import chai, { expect } from 'chai';
import { ethers } from 'hardhat';
import { contract, given, then, when } from '@test-utils/bdd';
import { snapshot } from '@test-utils/evm';
import { IDCAHub, ModifyPositionWithRateMock, ModifyPositionWithRateMock__factory } from '@typechained';
import { FakeContract, smock } from '@defi-wonderland/smock';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signers';
import constants from '@test-utils/constants';

chai.use(smock.matchers);

contract.only('ModifyPositionWithRate', () => {
  const POSITION_ID = 1;
  const ORIGINAL_RATE = 100000;
  const SWAPS_LEFT = 10;

  let sender: SignerWithAddress;
  let DCAHub: FakeContract<IDCAHub>;
  let modifyPositionWithRate: ModifyPositionWithRateMock;
  let snapshotId: string;

  before('Setup accounts and contracts', async () => {
    [sender] = await ethers.getSigners();
    const modifyPositionWithRateFactory: ModifyPositionWithRateMock__factory = await ethers.getContractFactory(
      'contracts/mocks/libraries/ModifyPositionWithRate.sol:ModifyPositionWithRateMock'
    );
    DCAHub = await smock.fake('IDCAHub');
    DCAHub.userPosition.returns({
      from: constants.NOT_ZERO_ADDRESS,
      to: constants.NOT_ZERO_ADDRESS,
      swapInterval: 10,
      swapsExecuted: 10,
      swapped: 10,
      swapsLeft: SWAPS_LEFT,
      remaining: SWAPS_LEFT * ORIGINAL_RATE,
      rate: ORIGINAL_RATE,
    });
    modifyPositionWithRate = await modifyPositionWithRateFactory.deploy();
    snapshotId = await snapshot.take();
  });

  beforeEach('Deploy and configure', async () => {
    await snapshot.revert(snapshotId);
    DCAHub.increasePosition.reset();
    DCAHub.reducePosition.reset();
  });

  describe('modifyRate', () => {
    when('modifying rate and the new rate is bigger', () => {
      given(() => modifyPositionWithRate.modifyRate(DCAHub.address, POSITION_ID, ORIGINAL_RATE + 10));
      thenPositionIsIncreased({ amount: 10 * SWAPS_LEFT, newSwaps: SWAPS_LEFT });
    });
    when('modifying rate and the new rate is the same as before', () => {
      given(() => modifyPositionWithRate.modifyRate(DCAHub.address, POSITION_ID, ORIGINAL_RATE));
      thenNothingHappens();
    });
    when('modifying rate and the new rate is smaller', () => {
      given(() => modifyPositionWithRate.modifyRate(DCAHub.address, POSITION_ID, ORIGINAL_RATE - 10));
      thenPositionIsReduced({ amount: 10 * SWAPS_LEFT, newSwaps: SWAPS_LEFT });
    });
  });

  describe('modifySwaps', () => {
    when('modifying swaps and new amount of swaps is bigger', () => {
      given(() => modifyPositionWithRate.modifySwaps(DCAHub.address, POSITION_ID, SWAPS_LEFT + 5));
      thenPositionIsIncreased({ amount: 5 * ORIGINAL_RATE, newSwaps: SWAPS_LEFT + 5 });
    });
    when('modifying swaps and new amount of swaps is the same as before', () => {
      given(() => modifyPositionWithRate.modifySwaps(DCAHub.address, POSITION_ID, SWAPS_LEFT));
      thenNothingHappens();
    });
    when('modifying swaps and new amount of swaps is smaller', () => {
      given(() => modifyPositionWithRate.modifySwaps(DCAHub.address, POSITION_ID, SWAPS_LEFT - 5));
      thenPositionIsReduced({ amount: 5 * ORIGINAL_RATE, newSwaps: SWAPS_LEFT - 5 });
    });
  });

  describe('modifyRateAndSwaps', () => {
    when('modifying rate and swaps and both parameters are the same', () => {
      given(() => modifyPositionWithRate.modifyRateAndSwaps(DCAHub.address, POSITION_ID, ORIGINAL_RATE, SWAPS_LEFT));
      thenNothingHappens();
    });
    when('rate and swaps and the number of funds needed increases', () => {
      given(() => modifyPositionWithRate.modifyRateAndSwaps(DCAHub.address, POSITION_ID, ORIGINAL_RATE + 10, SWAPS_LEFT + 2));
      thenPositionIsIncreased({ amount: (ORIGINAL_RATE + 10) * (SWAPS_LEFT + 2) - ORIGINAL_RATE * SWAPS_LEFT, newSwaps: SWAPS_LEFT + 2 });
    });
    when('modifying rate and swaps and the number of funds needed decreases', () => {
      given(() => modifyPositionWithRate.modifyRateAndSwaps(DCAHub.address, POSITION_ID, ORIGINAL_RATE / 2, SWAPS_LEFT + 1));
      thenPositionIsReduced({ amount: ORIGINAL_RATE * SWAPS_LEFT - (ORIGINAL_RATE / 2) * (SWAPS_LEFT + 1), newSwaps: SWAPS_LEFT + 1 });
    });
    when('modifying rate and swaps and the number of funds needes is the same', () => {
      given(() => modifyPositionWithRate.modifyRateAndSwaps(DCAHub.address, POSITION_ID, ORIGINAL_RATE / 2, SWAPS_LEFT * 2));
      thenPositionIsIncreased({ amount: 0, newSwaps: SWAPS_LEFT * 2 });
    });
  });

  function thenPositionIsIncreased({ amount, newSwaps }: { amount: number; newSwaps: number }) {
    then('position is increased', () => {
      expect(DCAHub.increasePosition).to.have.been.calledWith(POSITION_ID, amount, newSwaps);
    });
  }

  function thenPositionIsReduced({ amount, newSwaps }: { amount: number; newSwaps: number }) {
    then('position is reduced', () => {
      expect(DCAHub.reducePosition).to.have.been.calledWith(POSITION_ID, amount, newSwaps, sender.address);
    });
  }

  function thenNothingHappens() {
    then('position is increased', () => {
      expect(DCAHub.increasePosition).to.not.have.been.called;
      expect(DCAHub.reducePosition).to.not.have.been.called;
    });
  }
});
