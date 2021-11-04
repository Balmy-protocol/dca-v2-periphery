import { expect } from 'chai';
import { ethers } from 'hardhat';
import { contract, then, when } from '@test-utils/bdd';
import { snapshot } from '@test-utils/evm';
import { InputBuildingMock, InputBuildingMock__factory } from '@typechained';
import { BigNumber } from '@ethersproject/bignumber';

contract('InputBuilding', () => {
  const TOKEN_A = '0x0000000000000000000000000000000000000001';
  const TOKEN_B = '0x0000000000000000000000000000000000000002';
  const TOKEN_C = '0x0000000000000000000000000000000000000003';
  const TOKEN_D = '0x0000000000000000000000000000000000000004';

  let inputBuilding: InputBuildingMock;
  let snapshotId: string;

  before('Setup accounts and contracts', async () => {
    const InputBuildingFactory: InputBuildingMock__factory = await ethers.getContractFactory(
      'contracts/mocks/libraries/InputBuilding.sol:InputBuildingMock'
    );
    inputBuilding = await InputBuildingFactory.deploy();
    snapshotId = await snapshot.take();
  });

  beforeEach('Deploy and configure', async () => {
    await snapshot.revert(snapshotId);
  });

  describe('Swap Utils', () => {
    describe('buildGetNextSwapInfoInput', () => {
      when('no pairs are given', () => {
        then('the result is empty', async () => {
          const [tokens, pairIndexes] = await inputBuilding.buildGetNextSwapInfoInput([]);
          expect(tokens).to.be.empty;
          expect(pairIndexes).to.be.empty;
        });
      });

      when('one pair has the same token', () => {
        then('the result is returned correctly', async () => {
          const pair = { tokenA: TOKEN_A, tokenB: TOKEN_A };
          const [tokens, pairIndexes] = await inputBuilding.buildGetNextSwapInfoInput([pair]);
          expect(tokens).to.eql([TOKEN_A, TOKEN_A]);
          expect(pairIndexes).to.eql([[0, 1]]);
        });
      });

      when('there are duplicated pairs', () => {
        then('the result is returned correctly', async () => {
          const pair = { tokenA: TOKEN_A, tokenB: TOKEN_B };
          const [tokens, pairIndexes] = await inputBuilding.buildGetNextSwapInfoInput([pair, pair]);
          expect(tokens).to.eql([TOKEN_A, TOKEN_B]);
          expect(pairIndexes).to.eql([
            [0, 1],
            [0, 1],
          ]);
        });
      });

      when('there are duplicated pairs', () => {
        then('the result is returned correctly', async () => {
          const pair1 = { tokenA: TOKEN_A, tokenB: TOKEN_B };
          const pair2 = { tokenA: TOKEN_B, tokenB: TOKEN_A };
          const [tokens, pairIndexes] = await inputBuilding.buildGetNextSwapInfoInput([pair1, pair2]);
          expect(tokens).to.eql([TOKEN_A, TOKEN_B]);
          expect(pairIndexes).to.eql([
            [0, 1],
            [0, 1],
          ]);
        });
      });

      when('one pair is provided', () => {
        then('the result is returned correctly', async () => {
          const pair = { tokenA: TOKEN_B, tokenB: TOKEN_A };
          const [tokens, pairIndexes] = await inputBuilding.buildGetNextSwapInfoInput([pair]);
          expect(tokens).to.eql([TOKEN_A, TOKEN_B]);
          expect(pairIndexes).to.eql([[0, 1]]);
        });
      });

      when('multiple pairs are provided', () => {
        then('the result is returned correctly', async () => {
          const [tokens, pairIndexes] = await inputBuilding.buildGetNextSwapInfoInput([
            { tokenA: TOKEN_C, tokenB: TOKEN_A },
            { tokenA: TOKEN_B, tokenB: TOKEN_A },
            { tokenA: TOKEN_D, tokenB: TOKEN_B },
            { tokenA: TOKEN_D, tokenB: TOKEN_C },
            { tokenA: TOKEN_B, tokenB: TOKEN_C },
          ]);
          expect(tokens).to.eql([TOKEN_A, TOKEN_B, TOKEN_C, TOKEN_D]);
          expect(pairIndexes).to.eql([
            [0, 1],
            [0, 2],
            [1, 2],
            [1, 3],
            [2, 3],
          ]);
        });
      });
    });

    describe('buildSwapInput', () => {
      const ZERO = BigNumber.from(0);
      when('borrowing tokens that are also being swapped', () => {
        const BORROW_TOKEN_A = BigNumber.from(30);
        const BORROW_TOKEN_B = BigNumber.from(40);
        then('the result is returned correctly', async () => {
          const [tokens, pairIndexes, borrow] = await inputBuilding.buildSwapInput(
            [
              { tokenA: TOKEN_C, tokenB: TOKEN_A },
              { tokenA: TOKEN_B, tokenB: TOKEN_A },
            ],
            [
              { token: TOKEN_A, amount: BORROW_TOKEN_A },
              { token: TOKEN_B, amount: BORROW_TOKEN_B },
            ]
          );
          expect(tokens).to.eql([TOKEN_A, TOKEN_B, TOKEN_C]);
          expect(pairIndexes).to.eql([
            [0, 1],
            [0, 2],
          ]);
          expect(borrow).to.eql([BORROW_TOKEN_A, BORROW_TOKEN_B, ZERO]);
        });
      });

      when('borrowing tokens that are not being swapped', () => {
        const BORROW_TOKEN_D = BigNumber.from(40);
        then('the result is returned correctly', async () => {
          const [tokens, pairIndexes, borrow] = await inputBuilding.buildSwapInput(
            [
              { tokenA: TOKEN_C, tokenB: TOKEN_A },
              { tokenA: TOKEN_B, tokenB: TOKEN_A },
            ],
            [{ token: TOKEN_D, amount: BORROW_TOKEN_D }]
          );
          expect(tokens).to.eql([TOKEN_A, TOKEN_B, TOKEN_C, TOKEN_D]);
          expect(pairIndexes).to.eql([
            [0, 1],
            [0, 2],
          ]);
          expect(borrow).to.eql([ZERO, ZERO, ZERO, BORROW_TOKEN_D]);
        });
      });
    });
  });
});
