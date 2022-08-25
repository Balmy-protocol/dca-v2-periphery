import { expect } from 'chai';
import { ethers } from 'hardhat';
import {
  DCAStrategiesManagementHandlerMock__factory,
  DCAStrategiesManagementHandlerMock,
  IDCAStrategiesManagementHandler,
  IDCAStrategies,
} from '@typechained';
import { constants, wallet } from '@test-utils';
import { given, then, when, contract } from '@test-utils/bdd';
import { snapshot } from '@test-utils/evm';
import { TransactionResponse } from '@ethersproject/abstract-provider';
import { BigNumber } from '@ethersproject/bignumber';
import { _TypedDataEncoder } from '@ethersproject/hash';
import { readArgFromEventOrFail } from '@test-utils/event-utils';

contract('DCAStrategiesManagementHandler', () => {
  let snapshotId: string;
  let chainId: BigNumber;
  let DCAStrategiesManagementHandlerMock: DCAStrategiesManagementHandlerMock;

  before('Setup accounts and contracts', async () => {
    const factory: DCAStrategiesManagementHandlerMock__factory = await ethers.getContractFactory('DCAStrategiesManagementHandlerMock');
    DCAStrategiesManagementHandlerMock = await factory.deploy();
    snapshotId = await snapshot.take();
    chainId = BigNumber.from((await ethers.provider.getNetwork()).chainId);
  });

  beforeEach(async () => {
    await snapshot.revert(snapshotId);
  });

  describe('constructor', () => {
    when('handler is deployed', () => {
      then('strategy counter is correct', async () => {
        const strategyCounter = await DCAStrategiesManagementHandlerMock.strategyCounter();
        expect(strategyCounter).to.equal(0);
      });
    });
  });

  describe('createStrategy', () => {
    const OWNER = wallet.generateRandomAddress();
    const NAME = 'Optimism Ecosystem - v1';
    const TOKEN_A = wallet.generateRandomAddress();
    const TOKEN_B = wallet.generateRandomAddress();
    const TOKENS = [TOKEN_A, TOKEN_B];
    const SHARES = [BigNumber.from(50), BigNumber.from(50)];

    when('owner is zero address', () => {
      then('tx reverted with message', async () => {
        await expect(
          DCAStrategiesManagementHandlerMock.createStrategy(NAME, { tokens: TOKENS, shares: SHARES }, constants.ZERO_ADDRESS)
        ).to.be.revertedWith('ZeroAddress()');
      });
    });
    when('strategy is created', () => {
      let tx: TransactionResponse;
      let strategy: IDCAStrategiesManagementHandler.StrategyStruct;
      let tokenShares: IDCAStrategies.ShareOfTokenStruct;
      given(async () => {
        tx = await DCAStrategiesManagementHandlerMock.createStrategy(NAME, { tokens: TOKENS, shares: SHARES }, OWNER);
        strategy = await DCAStrategiesManagementHandlerMock.getStrategy(1);
        tokenShares = await DCAStrategiesManagementHandlerMock.getTokenShares(1, 1);
      });
      when('name already exists', () => {
        then('tx reverted with message', async () => {
          await expect(DCAStrategiesManagementHandlerMock.createStrategy(NAME, { tokens: TOKENS, shares: SHARES }, OWNER)).to.be.revertedWith(
            'NameAlreadyExists()'
          );
        });
      });
      then('counter is correct', async () => {
        expect(await DCAStrategiesManagementHandlerMock.strategyCounter()).to.be.equal(1);
      });
      then('owner is correct', async () => {
        expect(strategy.owner).to.be.equal(OWNER);
      });
      then('name is correct', async () => {
        expect(strategy.name).to.be.equal(NAME);
      });
      then('name is saved correctly in reversed mapping', async () => {
        expect(await DCAStrategiesManagementHandlerMock.getStrategyIdByName(NAME)).to.be.equal(1);
      });
      then('version is correct', async () => {
        expect(strategy.version).to.be.equal(1);
      });
      then('tokens are correct', async () => {
        expect(tokenShares.tokens).to.have.all.members(TOKENS);
      });
      then('shares are correct', async () => {
        SHARES.forEach((s, i) => {
          expect(tokenShares.shares[i]).to.be.equal(s);
        });
      });
      then('event is emitted', async () => {
        let _strategyId = await readArgFromEventOrFail(tx, 'StrategyCreated', 'strategyId');
        let _strategy: any = await readArgFromEventOrFail(tx, 'StrategyCreated', 'strategy');
        let _tokens: any = await readArgFromEventOrFail(tx, 'StrategyCreated', 'tokens');
        expect(_strategyId).to.be.equal(1);
        expect(_strategy['owner']).to.be.equal(strategy.owner);
        expect(_strategy['name']).to.be.equal(strategy.name);
        expect(_strategy['version']).to.be.equal(strategy.version);
        expect(_tokens['tokens']).to.have.all.members(tokenShares.tokens);
        _tokens['shares'].forEach((s: any, i: any) => {
          expect(tokenShares.shares[i]).to.be.equal(s);
        });
      });
    });
  });
});
