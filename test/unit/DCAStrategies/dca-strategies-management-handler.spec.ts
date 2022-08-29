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
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';

contract('DCAStrategiesManagementHandler', () => {
  let snapshotId: string;
  let DCAStrategiesManagementHandlerMock: DCAStrategiesManagementHandlerMock;
  let user: SignerWithAddress, random: SignerWithAddress;
  let factory: DCAStrategiesManagementHandlerMock__factory;
  const MAX_TOKEN_SHARES: number = 5;
  const NAME = ethers.utils.formatBytes32String('Optimism Ecosystem - v1');
  const SHARE_TOKEN_A = { token: wallet.generateRandomAddress(), share: BigNumber.from(50e2) };
  const SHARE_TOKEN_B = { token: wallet.generateRandomAddress(), share: BigNumber.from(50e2) };
  const SHARES = [SHARE_TOKEN_A, SHARE_TOKEN_B];
  const SHARE_EXCEED_AMOUNT = { token: wallet.generateRandomAddress(), share: BigNumber.from(10e2) };
  const SHARES_EXCEED_AMOUNT = Array(10).fill(SHARE_EXCEED_AMOUNT);
  const EMPTY_SHARE = { token: wallet.generateRandomAddress(), share: BigNumber.from(0) };
  const EMPTY_SHARES = [SHARE_TOKEN_A, EMPTY_SHARE];
  const INVALID_SHARE = { token: wallet.generateRandomAddress(), share: BigNumber.from(30e2) };
  const INVALID_SHARES = [SHARE_TOKEN_A, INVALID_SHARE];

  before('Setup accounts and contracts', async () => {
    factory = await ethers.getContractFactory('DCAStrategiesManagementHandlerMock');
    DCAStrategiesManagementHandlerMock = await factory.deploy(MAX_TOKEN_SHARES);
    snapshotId = await snapshot.take();
    [user, random] = await ethers.getSigners();
  });

  beforeEach(async () => {
    await snapshot.revert(snapshotId);
  });

  describe('constructor', () => {
    when('when max token shares is zero', () => {
      then('tx reverted with message', async () => {
        await expect(factory.deploy(0)).to.be.revertedWith('InvalidMaxTokenShares()');
      });
    });
    when('handler is deployed', () => {
      then('strategy counter is correct', async () => {
        const strategyCounter = await DCAStrategiesManagementHandlerMock.strategyCounter();
        expect(strategyCounter).to.equal(0);
      });
      then('max token shares is correct', async () => {
        const maxTokenShares = await DCAStrategiesManagementHandlerMock.MAX_TOKEN_SHARES();
        expect(maxTokenShares).to.equal(MAX_TOKEN_SHARES);
      });
    });
  });

  describe('createStrategy', () => {
    when('owner is zero address', () => {
      then('tx reverted with message', async () => {
        await expect(DCAStrategiesManagementHandlerMock.createStrategy(NAME, SHARES, constants.ZERO_ADDRESS)).to.be.revertedWith(
          'ZeroAddress()'
        );
      });
    });
    tokenShareSanityTest({
      title: 'token shares array length is zero',
      method: 'createStrategy',
      params: () => [NAME, [], user.address],
      errorName: 'InvalidLength()',
    });
    tokenShareSanityTest({
      title: 'token share is 0%',
      method: 'createStrategy',
      params: () => [NAME, EMPTY_SHARES, user.address],
      errorName: 'ShareIsEmpty()',
    });
    tokenShareSanityTest({
      title: 'token shares are not equal 100%',
      method: 'createStrategy',
      params: () => [NAME, INVALID_SHARES, user.address],
      errorName: 'InvalidTokenShares()',
    });
    tokenShareSanityTest({
      title: 'token shares exceed max amount',
      method: 'createStrategy',
      params: () => [NAME, SHARES_EXCEED_AMOUNT, user.address],
      errorName: 'TokenSharesExceedAmount()',
    });
    when('strategy is created', () => {
      let tx: TransactionResponse;
      let strategy: IDCAStrategiesManagementHandler.StrategyStruct;

      given(async () => {
        tx = await DCAStrategiesManagementHandlerMock.createStrategy(NAME, SHARES, user.address);
        strategy = await DCAStrategiesManagementHandlerMock.getStrategy(1);
      });
      when('name already exists', () => {
        then('tx reverted with message', async () => {
          await expect(DCAStrategiesManagementHandlerMock.createStrategy(NAME, SHARES, user.address)).to.be.revertedWith('NameAlreadyExists()');
        });
      });
      then('counter is correct', async () => {
        expect(await DCAStrategiesManagementHandlerMock.strategyCounter()).to.be.equal(1);
      });
      then('owner is correct', async () => {
        expect(strategy.owner).to.be.equal(user.address);
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

  describe('updateStrategyTokens', () => {
    const SHARE_TOKEN_A_2 = { token: constants.NOT_ZERO_ADDRESS, share: BigNumber.from(30e2) };
    const SHARE_TOKEN_B_2 = { token: constants.NOT_ZERO_ADDRESS, share: BigNumber.from(40e2) };
    const SHARE_TOKEN_C_2 = { token: generateRandomAddress(), share: BigNumber.from(30e2) };
    const SHARES_2 = [SHARE_TOKEN_A_2, SHARE_TOKEN_B_2, SHARE_TOKEN_C_2];

    given(async () => {
      await DCAStrategiesManagementHandlerMock.createStrategy(NAME, SHARES, user.address);
    });
    when('sender is not the owner', () => {
      then('tx reverted with message', async () => {
        await expect(DCAStrategiesManagementHandlerMock.connect(random).updateStrategyTokens(1, SHARES_2)).to.be.revertedWith(
          'OnlyStratOwner()'
        );
      });
    });
    tokenShareSanityTest({
      title: 'token shares array length is zero',
      method: 'updateStrategyTokens',
      params: () => [1, []],
      errorName: 'InvalidLength()',
    });
    tokenShareSanityTest({
      title: 'token share is 0%',
      method: 'updateStrategyTokens',
      params: () => [1, EMPTY_SHARES],
      errorName: 'ShareIsEmpty()',
    });
    tokenShareSanityTest({
      title: 'token shares are not equal 100%',
      method: 'updateStrategyTokens',
      params: () => [1, INVALID_SHARES],
      errorName: 'InvalidTokenShares()',
    });
    tokenShareSanityTest({
      title: 'token shares exceed max amount',
      method: 'updateStrategyTokens',
      params: () => [1, SHARES_EXCEED_AMOUNT],
      errorName: 'TokenSharesExceedAmount()',
    });
    when('strategy is updated', () => {
      let tx: TransactionResponse;
      let strategy: IDCAStrategiesManagementHandler.StrategyStruct;

      given(async () => {
        tx = await DCAStrategiesManagementHandlerMock.connect(user).updateStrategyTokens(1, SHARES_2);
        strategy = await DCAStrategiesManagementHandlerMock.getStrategy(1);
      });
      then('owner not changed', async () => {
        expect(strategy.owner).to.be.equal(user.address);
      });
      then('name not changed', async () => {
        expect(strategy.name).to.be.equal(NAME);
      });
      then('tokens are updated', async () => {
        compareTokens(SHARES_2, strategy.tokens);
      });
      then('version number is updated', async () => {
        expect(strategy.currentVersion).to.be.equal(2);
      });
      then('event is emitted', async () => {
        let strategyId: BigNumber = await readArgFromEventOrFail(tx, 'StrategyTokensUpdated', 'strategyId');
        let tokens: IDCAStrategies.ShareOfTokenStruct[] = await readArgFromEventOrFail(tx, 'StrategyTokensUpdated', 'tokens');
        expect(strategyId).to.be.equal(1);
        compareTokens(SHARES_2, tokens);
      });
    });
  });

  describe('updateStrategyName', () => {
    let tx: TransactionResponse;
    let strategy: IDCAStrategiesManagementHandler.StrategyStruct;
    const NEW_NAME = ethers.utils.randomBytes(32);

    given(async () => {
      await DCAStrategiesManagementHandlerMock.createStrategy(NAME, SHARES, user.address);
    });
    when('sender is not the owner', () => {
      then('tx reverted with message', async () => {
        await expect(DCAStrategiesManagementHandlerMock.connect(random).updateStrategyName(1, NEW_NAME)).to.be.revertedWith('OnlyStratOwner()');
      });
    });
    when('name already exists', () => {
      then('tx reverted with message', async () => {
        await expect(DCAStrategiesManagementHandlerMock.updateStrategyName(1, NAME)).to.be.revertedWith('NameAlreadyExists()');
      });
    });
    when('strategy is updated', () => {
      given(async () => {
        tx = await DCAStrategiesManagementHandlerMock.updateStrategyName(1, NEW_NAME);
        strategy = await DCAStrategiesManagementHandlerMock.getStrategy(1);
      });
      then('name is correct', async () => {
        expect(strategy.name).to.be.equal(ethers.utils.hexlify(NEW_NAME));
      });
      then('name is saved correctly in reversed mapping', async () => {
        expect(await DCAStrategiesManagementHandlerMock.strategyIdByName(NEW_NAME)).to.be.equal(1);
      });
      then('event is emitted', async () => {
        await expect(tx).to.emit(DCAStrategiesManagementHandlerMock, 'StrategyNameUpdated').withArgs(1, ethers.utils.hexlify(NEW_NAME));
      });
    });
  });

  describe('transferStrategyOwnership', () => {
    let tx: TransactionResponse;
    given(async () => {
      await DCAStrategiesManagementHandlerMock.createStrategy(NAME, SHARES, user.address);
    });
    when('sender is not the owner', () => {
      then('tx reverted with message', async () => {
        await expect(DCAStrategiesManagementHandlerMock.connect(random).transferStrategyOwnership(1, random.address)).to.be.revertedWith(
          'OnlyStratOwner()'
        );
      });
    });
    when('ownership transfer is started', () => {
      given(async () => {
        tx = await DCAStrategiesManagementHandlerMock.connect(user).transferStrategyOwnership(1, random.address);
      });
      then('pending owner is correct', async () => {
        expect(await DCAStrategiesManagementHandlerMock.strategiesPendingOwners(1)).to.be.equal(random.address);
      });
      then('event is emitted', async () => {
        await expect(tx).to.emit(DCAStrategiesManagementHandlerMock, 'TransferOwnershipInitiated').withArgs(1, random.address);
      });
    });
  });

  describe('acceptStrategyOwnershipTransfer', () => {
    let tx: TransactionResponse;
    given(async () => {
      await DCAStrategiesManagementHandlerMock.createStrategy(NAME, SHARES, user.address);
      await DCAStrategiesManagementHandlerMock.connect(user).transferStrategyOwnership(1, random.address);
    });
    when('sender is not the pending owner', () => {
      then('tx reverted with message', async () => {
        await expect(DCAStrategiesManagementHandlerMock.connect(user).acceptStrategyOwnership(1)).to.be.revertedWith('OnlyPendingOwner()');
      });
    });
    when('ownership transfer is accepted', () => {
      given(async () => {
        tx = await DCAStrategiesManagementHandlerMock.connect(random).acceptStrategyOwnership(1);
      });
      then('new owner is correct', async () => {
        expect((await DCAStrategiesManagementHandlerMock.getStrategy(1)).owner).to.be.equal(random.address);
      });
      then('pending owner is correct', async () => {
        expect(await DCAStrategiesManagementHandlerMock.strategiesPendingOwners(1)).to.be.equal(constants.ZERO_ADDRESS);
      });
      then('event is emitted', async () => {
        await expect(tx).to.emit(DCAStrategiesManagementHandlerMock, 'TransferOwnershipAccepted').withArgs(1, random.address);
      });
    });
  });

  describe('cancelStrategyOwnership', () => {
    let tx: TransactionResponse;
    given(async () => {
      await DCAStrategiesManagementHandlerMock.createStrategy(NAME, SHARES, user.address);
      await DCAStrategiesManagementHandlerMock.connect(user).transferStrategyOwnership(1, random.address);
    });
    when('sender is not the owner', () => {
      then('tx reverted with message', async () => {
        await expect(DCAStrategiesManagementHandlerMock.connect(random).cancelStrategyOwnershipTransfer(1)).to.be.revertedWith(
          'OnlyStratOwner()'
        );
      });
    });
    when('ownership transfer is cancelled', () => {
      given(async () => {
        tx = await DCAStrategiesManagementHandlerMock.connect(user).cancelStrategyOwnershipTransfer(1);
      });
      then('pending owner is correct', async () => {
        expect(await DCAStrategiesManagementHandlerMock.strategiesPendingOwners(1)).to.be.equal(constants.ZERO_ADDRESS);
      });
      then('event is emitted', async () => {
        await expect(tx).to.emit(DCAStrategiesManagementHandlerMock, 'TransferOwnershipCancelled').withArgs(1);
      });
    });
  });

  function tokenShareSanityTest({ title, method, params, errorName }: { title: string; method: any; params: () => any[]; errorName: string }) {
    when(title, () => {
      then('tx reverted with message', async () => {
        const invalidParams = params();
        // @ts-ignore
        await expect(DCAStrategiesManagementHandlerMock.connect(user)[method](...invalidParams)).to.be.revertedWith(errorName);
      });
    });
  }

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
});
