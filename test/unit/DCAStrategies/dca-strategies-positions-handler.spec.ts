import chai, { expect } from 'chai';
import { ethers } from 'hardhat';
import { DCAStrategiesPositionsHandlerMock__factory, DCAStrategiesPositionsHandlerMock, IERC20 } from '@typechained';
import { FakeContract, smock } from '@defi-wonderland/smock';
import { constants } from '@test-utils';
import { given, then, when, contract } from '@test-utils/bdd';
import { snapshot } from '@test-utils/evm';
import { TransactionResponse } from '@ethersproject/abstract-provider';
import { BigNumber } from '@ethersproject/bignumber';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';

chai.use(smock.matchers);

contract('DCAStrategiesPositionsHandler', () => {
  let snapshotId: string;
  let DCAStrategiesPositionsHandlerMock: DCAStrategiesPositionsHandlerMock;
  let user: SignerWithAddress, random: SignerWithAddress, governor: SignerWithAddress;
  let factory: DCAStrategiesPositionsHandlerMock__factory;
  let tokenA: FakeContract<IERC20>, tokenB: FakeContract<IERC20>;
  let SHARE_TOKEN_A;
  let SHARE_TOKEN_B;
  let SHARES: any[];

  before('Setup accounts and contracts', async () => {
    [user, random, governor] = await ethers.getSigners();
    factory = await ethers.getContractFactory('DCAStrategiesPositionsHandlerMock');
    DCAStrategiesPositionsHandlerMock = await factory.deploy();
    tokenA = await smock.fake('IERC20');
    tokenB = await smock.fake('IERC20');
    SHARE_TOKEN_A = { token: tokenA.address, share: BigNumber.from(50e2) };
    SHARE_TOKEN_B = { token: tokenB.address, share: BigNumber.from(50e2) };
    SHARES = [SHARE_TOKEN_A, SHARE_TOKEN_B];
    snapshotId = await snapshot.take();
  });

  beforeEach(async () => {
    await snapshot.revert(snapshotId);
  });

  describe('deposit', () => {
    let tx: TransactionResponse;
    let toDeposit = ethers.utils.parseUnits('300');
    let amountOfSwaps = 5;
    let swapInterval = 7 * 24 * 60 * 60; // 1 week
    let permissions: any[] = [];

    when('invalid strategy and version provided', () => {
      then('tx reverts with message', async () => {
        await expect(
          DCAStrategiesPositionsHandlerMock.deposit({
            hub: constants.NOT_ZERO_ADDRESS,
            strategyId: 99,
            version: 99,
            from: tokenA.address,
            amount: toDeposit,
            amountOfSwaps: amountOfSwaps,
            swapInterval: swapInterval,
            owner: user.address,
            permissions: permissions,
          })
        ).to.be.revertedWith('InvalidStrategy()');
      });
    });
    when('deposit is called', () => {
      given(async () => {
        await DCAStrategiesPositionsHandlerMock.setTokenShares(SHARES);

        tokenA.transferFrom.returns(true);

        tx = await DCAStrategiesPositionsHandlerMock.connect(user).deposit({
          hub: constants.NOT_ZERO_ADDRESS,
          strategyId: 1,
          version: 1,
          from: tokenA.address,
          amount: toDeposit,
          amountOfSwaps: amountOfSwaps,
          swapInterval: swapInterval,
          owner: user.address,
          permissions: permissions,
        });
      });
      then('transferFrom() is called correctly', async () => {
        expect(tokenA.transferFrom).to.have.been.calledOnceWith(user.address, DCAStrategiesPositionsHandlerMock.address, toDeposit);
      });
      then('_create() is called correctly', async () => {
        let createCalls = await DCAStrategiesPositionsHandlerMock.getCreateCalls();
        expect(createCalls[0].owner).to.be.equal(user.address);
        expect(createCalls[0].permissionSets.length).to.be.equal(permissions.length);
        expect(createCalls[0].permissionSets).to.have.all.members(permissions);
      });
      then('event is emitted', async () => {
        await expect(tx)
          .to.emit(DCAStrategiesPositionsHandlerMock, 'Deposited')
          .withArgs(user.address, user.address, 1, tokenA.address, 1, 1, swapInterval, []);
      });
    });
  });
});
