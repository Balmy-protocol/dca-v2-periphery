import { expect } from 'chai';
import { ethers } from 'hardhat';
import { contract, given, then, when } from '@test-utils/bdd';
import evm, { snapshot } from '@test-utils/evm';
import { IDCAHub, SecondsUntilNextSwapMock, SecondsUntilNextSwapMock__factory } from '@typechained';
import { SwapInterval } from '@test-utils/interval-utils';
import { FakeContract, smock } from '@defi-wonderland/smock';
import { BigNumber, BigNumberish } from '@ethersproject/bignumber';
import { constants } from '@test-utils';

contract('SecondsUntilNextSwap', () => {
  let DCAHub: FakeContract<IDCAHub>;
  let secondsUntilNextSwap: SecondsUntilNextSwapMock;
  let snapshotId: string;

  before('Setup accounts and contracts', async () => {
    const secondsUntilNextSwapFactory: SecondsUntilNextSwapMock__factory = await ethers.getContractFactory(
      'contracts/mocks/libraries/SecondsUntilNextSwap.sol:SecondsUntilNextSwapMock'
    );
    DCAHub = await smock.fake('IDCAHub');
    secondsUntilNextSwap = await secondsUntilNextSwapFactory.deploy();
    snapshotId = await snapshot.take();
  });

  beforeEach('Deploy and configure', async () => {
    await snapshot.revert(snapshotId);
  });

  describe('secondsUntilNextSwap', () => {
    const CURRENT_TIMESTAMP = 3271892030;
    const TOKEN_A = '0x0000000000000000000000000000000000000001';
    const TOKEN_B = '0x0000000000000000000000000000000000000002';

    when('seconds are calculated', () => {
      given(async () => {
        await secondsUntilNextSwap['secondsUntilNextSwap(address,address,address,bool)'](DCAHub.address, TOKEN_B, TOKEN_A, true);
      });
      then('the correct token order is sent to the hub', () => {
        expect(DCAHub.activeSwapIntervals).to.have.been.calledWith(TOKEN_A, TOKEN_B);
      });
    });

    describe('privileged', () => {
      secondsUntilNextSwapTest({
        when: 'there are no active intervals',
        intervals: [],
        privileged: true,
        expected: constants.MAX_UINT_256, // then there is nothing to wait for
      });

      secondsUntilNextSwapTest({
        when: 'there are active intervals, they cannot be swapped yet and there is nothing to swap',
        intervals: [{ interval: SwapInterval.ONE_HOUR, relativeLastSwappedAt: -1 }],
        privileged: true,
        expected: constants.MAX_UINT_256, // then there is nothing to wait for
      });

      secondsUntilNextSwapTest({
        when: 'there are active intervals, they can be swapped, but there is nothing to swap',
        intervals: [{ interval: SwapInterval.ONE_HOUR, relativeLastSwappedAt: -SwapInterval.ONE_HOUR.seconds }],
        privileged: true,
        expected: constants.MAX_UINT_256, // then there is nothing to wait for
      });

      secondsUntilNextSwapTest({
        when: 'there are active intervals, they cannot be swapped yet, but there is something to swap',
        intervals: [{ interval: SwapInterval.ONE_HOUR, relativeLastSwappedAt: -21, amountToSwapAToB: 1 }],
        privileged: true,
        expected: nextAvailableAt(-21, SwapInterval.ONE_HOUR).sub(CURRENT_TIMESTAMP), // then wait until it can be swapped
      });

      secondsUntilNextSwapTest({
        when: 'there are active intervals, they can be swapped, and there is something to swap',
        intervals: [{ interval: SwapInterval.ONE_HOUR, relativeLastSwappedAt: -SwapInterval.ONE_HOUR.seconds, amountToSwapAToB: 1 }],
        privileged: true,
        expected: 0, // then it can be swapped right now
      });

      secondsUntilNextSwapTest({
        when: 'a smaller interval can be swapped, but there is nothing to swap',
        intervals: [
          { interval: SwapInterval.ONE_MINUTE, relativeLastSwappedAt: -SwapInterval.ONE_MINUTE.seconds },
          { interval: SwapInterval.ONE_HOUR, relativeLastSwappedAt: -50, amountToSwapAToB: 1 },
        ],
        privileged: true,
        expected: nextAvailableAt(-21, SwapInterval.ONE_HOUR).sub(CURRENT_TIMESTAMP), // then wait for bigger interval
      });

      secondsUntilNextSwapTest({
        when: 'all intervals can be swapped, and one has something to swap',
        intervals: [
          { interval: SwapInterval.ONE_MINUTE, relativeLastSwappedAt: -SwapInterval.ONE_MINUTE.seconds },
          { interval: SwapInterval.ONE_HOUR, relativeLastSwappedAt: -SwapInterval.ONE_HOUR.seconds, amountToSwapAToB: 1 },
        ],
        privileged: true,
        expected: 0, // then it can be swapped right now
      });

      secondsUntilNextSwapTest({
        when: 'a smaller interval cannot be swapped, but a bigger can',
        intervals: [
          { interval: SwapInterval.ONE_MINUTE, relativeLastSwappedAt: -10 },
          { interval: SwapInterval.ONE_HOUR, relativeLastSwappedAt: -SwapInterval.ONE_HOUR.seconds, amountToSwapAToB: 1 },
        ],
        privileged: true,
        expected: nextAvailableAt(-10, SwapInterval.ONE_MINUTE).sub(CURRENT_TIMESTAMP), // then wait for smaller interval
      });

      secondsUntilNextSwapTest({
        when: 'both intervals cannot be swapped, and the bigger one has something to swap',
        intervals: [
          { interval: SwapInterval.ONE_MINUTE, relativeLastSwappedAt: -10 },
          { interval: SwapInterval.ONE_HOUR, relativeLastSwappedAt: -20, amountToSwapAToB: 1 },
        ],
        privileged: true,
        expected: nextAvailableAt(-20, SwapInterval.ONE_HOUR).sub(CURRENT_TIMESTAMP), // then wait for bigger interval
      });

      secondsUntilNextSwapTest({
        when: 'both intervals have nothing to swap',
        intervals: [
          { interval: SwapInterval.ONE_MINUTE, relativeLastSwappedAt: -SwapInterval.ONE_MINUTE.seconds },
          { interval: SwapInterval.ONE_HOUR, relativeLastSwappedAt: -SwapInterval.ONE_HOUR.seconds },
        ],
        privileged: true,
        expected: constants.MAX_UINT_256, // then there is nothing to wait for
      });
    });

    describe('unprivileged', () => {
      secondsUntilNextSwapTest({
        when: 'there are no active intervals',
        intervals: [],
        privileged: false,
        expected: constants.MAX_UINT_256, // then there is nothing to wait for
      });

      secondsUntilNextSwapTest({
        when: 'there are active intervals, they cannot be swapped yet and there is nothing to swap',
        intervals: [{ interval: SwapInterval.ONE_HOUR, relativeLastSwappedAt: -1 }],
        privileged: false,
        expected: constants.MAX_UINT_256, // then there is nothing to wait for
      });

      secondsUntilNextSwapTest({
        when: 'there are active intervals, they can be swapped, but there is nothing to swap',
        intervals: [{ interval: SwapInterval.ONE_HOUR, relativeLastSwappedAt: -SwapInterval.ONE_HOUR.seconds }],
        privileged: false,
        expected: constants.MAX_UINT_256, // then there is nothing to wait for
      });

      secondsUntilNextSwapTest({
        when: 'there are active intervals, they cannot be swapped yet, but there is something to swap',
        intervals: [{ interval: SwapInterval.ONE_HOUR, relativeLastSwappedAt: -21, amountToSwapAToB: 1 }],
        privileged: false,
        expected: unprivilegedNextAvailableAt(-21, SwapInterval.ONE_HOUR).sub(CURRENT_TIMESTAMP), // then wait until it can be swapped
      });

      secondsUntilNextSwapTest({
        when: 'there are active intervals, they can be swapped, and there is something to swap',
        intervals: [{ interval: SwapInterval.ONE_HOUR, relativeLastSwappedAt: -SwapInterval.ONE_HOUR.seconds, amountToSwapAToB: 1 }],
        privileged: false,
        expected: 0, // then it can be swapped right now
      });

      secondsUntilNextSwapTest({
        when: 'a smaller interval can be swapped, but there is nothing to swap',
        intervals: [
          { interval: SwapInterval.ONE_MINUTE, relativeLastSwappedAt: -SwapInterval.ONE_MINUTE.seconds },
          { interval: SwapInterval.ONE_HOUR, relativeLastSwappedAt: -50, amountToSwapAToB: 1 },
        ],
        privileged: false,
        expected: unprivilegedNextAvailableAt(-21, SwapInterval.ONE_HOUR).sub(CURRENT_TIMESTAMP), // then wait for bigger interval
      });

      secondsUntilNextSwapTest({
        when: 'all intervals can be swapped, and one has something to swap',
        intervals: [
          { interval: SwapInterval.ONE_MINUTE, relativeLastSwappedAt: -SwapInterval.ONE_MINUTE.seconds },
          { interval: SwapInterval.ONE_HOUR, relativeLastSwappedAt: -SwapInterval.ONE_HOUR.seconds, amountToSwapAToB: 1 },
        ],
        privileged: false,
        expected: 0, // then it can be swapped right now
      });

      secondsUntilNextSwapTest({
        when: 'a smaller interval cannot be swapped, but a bigger can',
        intervals: [
          { interval: SwapInterval.ONE_MINUTE, relativeLastSwappedAt: -10 },
          { interval: SwapInterval.ONE_HOUR, relativeLastSwappedAt: -SwapInterval.ONE_HOUR.seconds, amountToSwapAToB: 1 },
        ],
        privileged: false,
        expected: unprivilegedNextAvailableAt(-10, SwapInterval.ONE_MINUTE).sub(CURRENT_TIMESTAMP), // then wait for smaller interval
      });

      secondsUntilNextSwapTest({
        when: 'both intervals cannot be swapped, and the bigger one has something to swap',
        intervals: [
          { interval: SwapInterval.ONE_MINUTE, relativeLastSwappedAt: -10 },
          { interval: SwapInterval.ONE_HOUR, relativeLastSwappedAt: -20, amountToSwapAToB: 1 },
        ],
        privileged: false,
        expected: unprivilegedNextAvailableAt(-20, SwapInterval.ONE_HOUR).sub(CURRENT_TIMESTAMP), // then wait for bigger interval
      });

      secondsUntilNextSwapTest({
        when: 'both intervals have nothing to swap',
        intervals: [
          { interval: SwapInterval.ONE_MINUTE, relativeLastSwappedAt: -SwapInterval.ONE_MINUTE.seconds },
          { interval: SwapInterval.ONE_HOUR, relativeLastSwappedAt: -SwapInterval.ONE_HOUR.seconds },
        ],
        privileged: false,
        expected: constants.MAX_UINT_256, // then there is nothing to wait for
      });
    });

    function nextAvailableAt(relativeLastSwappedAt: number, swapInterval: SwapInterval) {
      return BigNumber.from(CURRENT_TIMESTAMP).add(relativeLastSwappedAt).div(swapInterval.seconds).add(1).mul(swapInterval.seconds);
    }

    function unprivilegedNextAvailableAt(relativeLastSwappedAt: number, swapInterval: SwapInterval) {
      const extra = BigNumber.from(swapInterval.seconds).div(3);
      return nextAvailableAt(relativeLastSwappedAt, swapInterval).add(extra);
    }

    async function secondsUntilNextSwapTest({
      when: title,
      privileged,
      intervals,
      expected,
    }: {
      when: string;
      privileged: boolean;
      intervals: { interval: SwapInterval; relativeLastSwappedAt: number; amountToSwapAToB?: number; amountToSwapBToA?: number }[];
      expected: BigNumberish;
    }) {
      when(title, () => {
        let result: BigNumber;
        given(async () => {
          await evm.advanceToTimeAndBlock(CURRENT_TIMESTAMP);
          const byte = SwapInterval.intervalsToByte(...intervals.map(({ interval }) => interval));
          DCAHub.activeSwapIntervals.returns(byte);
          DCAHub.swapData.returns(({ swapIntervalMask }: { swapIntervalMask: string }) => {
            const interval = intervals.find(({ interval }) => interval.mask === swapIntervalMask)!;
            return [
              0, // performedSwaps
              interval.amountToSwapAToB ?? 0, // nextAmountToSwapAToB
              CURRENT_TIMESTAMP + interval.relativeLastSwappedAt, // lastSwappedAt
              interval.amountToSwapAToB ?? 0, // nextAmountToSwapBToA
            ];
          });
          result = await secondsUntilNextSwap['secondsUntilNextSwap(address,address,address,bool)'](
            DCAHub.address,
            TOKEN_A,
            TOKEN_B,
            privileged
          );
        });
        then('result is as expected', async () => {
          expect(result).to.equal(expected);
        });
      });
    }
  });
});
