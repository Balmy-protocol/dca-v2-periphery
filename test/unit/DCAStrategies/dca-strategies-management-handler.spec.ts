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
import { readArgFromEventOrFail } from '@test-utils/event-utils';

contract('DCAStrategiesManagementHandler', () => {
  let snapshotId: string;
  let DCAStrategiesManagementHandlerMock: DCAStrategiesManagementHandlerMock;

  before('Setup accounts and contracts', async () => {
    const factory: DCAStrategiesManagementHandlerMock__factory = await ethers.getContractFactory('DCAStrategiesManagementHandlerMock');
    DCAStrategiesManagementHandlerMock = await factory.deploy();
    snapshotId = await snapshot.take();
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
    const NAME = ethers.utils.formatBytes32String('Optimism Ecosystem - v1');
    const SHARE_TOKEN_A = { token: wallet.generateRandomAddress(), share: BigNumber.from(50) };
    const SHARE_TOKEN_B = { token: wallet.generateRandomAddress(), share: BigNumber.from(50) };
    const SHARES = [SHARE_TOKEN_A, SHARE_TOKEN_B];

    when('owner is zero address', () => {
      then('tx reverted with message', async () => {
        await expect(DCAStrategiesManagementHandlerMock.createStrategy(NAME, SHARES, constants.ZERO_ADDRESS)).to.be.revertedWith(
          'ZeroAddress()'
        );
      });
    });
    when('strategy is created', () => {
      let tx: TransactionResponse;
      let strategy: IDCAStrategiesManagementHandler.StrategyStruct;
      given(async () => {
        tx = await DCAStrategiesManagementHandlerMock.createStrategy(NAME, SHARES, OWNER);
        strategy = await DCAStrategiesManagementHandlerMock.getStrategy(1);
      });
      when('name already exists', () => {
        then('tx reverted with message', async () => {
          await expect(DCAStrategiesManagementHandlerMock.createStrategy(NAME, SHARES, OWNER)).to.be.revertedWith('NameAlreadyExists()');
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
        expect(await DCAStrategiesManagementHandlerMock.strategyIdByName(NAME)).to.be.equal(1);
      });
      then('version is correct', async () => {
        expect(strategy.currentVersion).to.be.equal(1);
      });
      then('shares are correct', async () => {
        expect(SHARES.length).to.be.equal(strategy.tokens.length);
        SHARES.forEach((s, i) => {
          expect(strategy.tokens[i].share).to.be.equal(s.share);
          expect(strategy.tokens[i].token).to.be.equal(s.token);
        });
      });
      then('event is emitted', async () => {
        let strategyId: BigNumber = await readArgFromEventOrFail(tx, 'StrategyCreated', 'strategyId');
        let strategyName: string = await readArgFromEventOrFail(tx, 'StrategyCreated', 'strategyName');
        let tokens: IDCAStrategies.ShareOfTokenStruct[] = await readArgFromEventOrFail(tx, 'StrategyCreated', 'tokens');
        let owner: string = await readArgFromEventOrFail(tx, 'StrategyCreated', 'owner');
        expect(strategyId).to.be.equal(1);
        expect(strategyName).to.be.equal(strategy.name);
        expect(owner).to.be.equal(strategy.owner);
        expect(SHARES.length).to.be.equal(strategy.tokens.length);
        SHARES.forEach((s: any, i: any) => {
          expect(tokens[i].share).to.be.equal(s.share);
          expect(tokens[i].token).to.be.equal(s.token);
        });
      });
    });
  });
});
