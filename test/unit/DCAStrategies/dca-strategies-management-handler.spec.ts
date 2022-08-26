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
    when('name is too long', () => {
      const NAME_TOO_LONG = ethers.utils.hexlify(ethers.utils.randomBytes(33));
      then('tx reverted with message', async () => {
        await expect(DCAStrategiesManagementHandlerMock.createStrategy(NAME_TOO_LONG, SHARES, OWNER)).to.be.revertedWith('NameTooLong()');
      });
    });
    when('strategy is created', () => {
      let tx: TransactionResponse;
      let strategy: IDCAStrategiesManagementHandler.StrategyStruct;
      let tokenShares: IDCAStrategies.ShareOfTokenStruct[];
      given(async () => {
        tx = await DCAStrategiesManagementHandlerMock.createStrategy(NAME, SHARES, OWNER);
        strategy = await DCAStrategiesManagementHandlerMock.getStrategy(1);
        tokenShares = strategy.tokens;
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
        SHARES.forEach((s, i) => {
          expect(tokenShares[i].share).to.be.equal(s.share);
          expect(tokenShares[i].token).to.be.equal(s.token);
        });
      });
      then('event is emitted', async () => {
        let _strategyId: BigNumber = await readArgFromEventOrFail(tx, 'StrategyCreated', 'strategyId');
        let _strategyName: string = await readArgFromEventOrFail(tx, 'StrategyCreated', 'strategyName');
        let _tokens: IDCAStrategies.ShareOfTokenStruct[] = await readArgFromEventOrFail(tx, 'StrategyCreated', 'tokens');
        let _owner: string = await readArgFromEventOrFail(tx, 'StrategyCreated', 'owner');
        expect(_strategyId).to.be.equal(1);
        expect(_strategyName).to.be.equal(strategy.name);
        expect(_owner).to.be.equal(strategy.owner);
        _tokens.forEach((s: any, i: any) => {
          expect(tokenShares[i].share).to.be.equal(s.share);
          expect(tokenShares[i].token).to.be.equal(s.token);
        });
      });
    });
  });
});
