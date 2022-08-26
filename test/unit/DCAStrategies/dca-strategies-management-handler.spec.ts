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
import { Wallet } from 'ethers';

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

  function generateRandomAddress() {
    return ethers.utils.getAddress(ethers.utils.hexlify(ethers.utils.randomBytes(20)));
  }

  function compareTokens(arrayA: IDCAStrategies.ShareOfTokenStruct[], arrayB: IDCAStrategies.ShareOfTokenStruct[]) {
    expect(arrayA.length).to.be.equal(arrayB.length);
    arrayA.forEach((s, i) => {
      expect(s.share).to.be.equal(arrayB[i].share);
      expect(s.token).to.be.equal(arrayB[i].token);
    });
  }

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
        compareTokens(SHARES, strategy.tokens);
      });
      then('event is emitted', async () => {
        let strategyId: BigNumber = await readArgFromEventOrFail(tx, 'StrategyCreated', 'strategyId');
        let strategyName: string = await readArgFromEventOrFail(tx, 'StrategyCreated', 'strategyName');
        let tokens: IDCAStrategies.ShareOfTokenStruct[] = await readArgFromEventOrFail(tx, 'StrategyCreated', 'tokens');
        let owner: string = await readArgFromEventOrFail(tx, 'StrategyCreated', 'owner');
        expect(strategyId).to.be.equal(1);
        expect(strategyName).to.be.equal(strategy.name);
        expect(owner).to.be.equal(strategy.owner);
        compareTokens(SHARES, tokens);
      });
    });
  });

  describe('createStrategy', () => {
    let owner: Wallet;
    const NAME = ethers.utils.formatBytes32String('Optimism Ecosystem - v1');

    const SHARE_TOKEN_A_1 = { token: generateRandomAddress(), share: BigNumber.from(50) };
    const SHARE_TOKEN_B_1 = { token: generateRandomAddress(), share: BigNumber.from(50) };
    const SHARES_1 = [SHARE_TOKEN_A_1, SHARE_TOKEN_B_1];

    const SHARE_TOKEN_A_2 = { token: constants.NOT_ZERO_ADDRESS, share: BigNumber.from(30) };
    const SHARE_TOKEN_B_2 = { token: constants.NOT_ZERO_ADDRESS, share: BigNumber.from(40) };
    const SHARE_TOKEN_C_2 = { token: generateRandomAddress(), share: BigNumber.from(30) };
    const SHARES_2 = [SHARE_TOKEN_A_2, SHARE_TOKEN_B_2, SHARE_TOKEN_C_2];

    given(async () => {
      owner = await wallet.generateRandom();
    });
    when('sender is not the owner', () => {
      given(async () => {
        await DCAStrategiesManagementHandlerMock.createStrategy(NAME, SHARES_1, owner.address);
      });
      then('tx reverted with message', async () => {
        await expect(DCAStrategiesManagementHandlerMock.updateStrategyTokens(1, SHARES_2)).to.be.revertedWith('OnlyStratOwner()');
      });
    });
    when('strategy is updated', () => {
      let tx: TransactionResponse;
      let strategy: IDCAStrategiesManagementHandler.StrategyStruct;

      given(async () => {
        await DCAStrategiesManagementHandlerMock.connect(owner).createStrategy(NAME, SHARES_1, owner.address);
        tx = await DCAStrategiesManagementHandlerMock.connect(owner).updateStrategyTokens(1, SHARES_2);
        strategy = await DCAStrategiesManagementHandlerMock.getStrategy(1);
      });
      then('tokens are updated', async () => {
        compareTokens(SHARES_2, strategy.tokens);
      });
      then('version number is updated', async () => {
        expect(strategy.currentVersion).to.be.equal(2);
      });
      then('event is emitted', async () => {
        let strategyId: BigNumber = await readArgFromEventOrFail(tx, 'StrategyUpdated', 'strategyId');
        let tokens: IDCAStrategies.ShareOfTokenStruct[] = await readArgFromEventOrFail(tx, 'StrategyUpdated', 'tokens');
        expect(strategyId).to.be.equal(1);
        compareTokens(SHARES_2, tokens);
      });
    });
  });
});
