import chai, { expect } from 'chai';
import { ethers } from 'hardhat';
import { DCAStrategiesPositionsHandlerMock__factory, DCAStrategiesPositionsHandlerMock, IERC20, IDCAHub } from '@typechained';
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
  let tokenA: FakeContract<IERC20>, tokenB: FakeContract<IERC20>, tokenC: FakeContract<IERC20>;
  let hub: FakeContract<IDCAHub>;
  let SHARE_TOKEN_B;
  let SHARE_TOKEN_C;
  let SHARES: any[];

  before('Setup accounts and contracts', async () => {
    [user, random, governor] = await ethers.getSigners();
    factory = await ethers.getContractFactory('DCAStrategiesPositionsHandlerMock');
    DCAStrategiesPositionsHandlerMock = await factory.deploy();
    tokenA = await smock.fake('IERC20');
    tokenB = await smock.fake('IERC20');
    tokenC = await smock.fake('IERC20');
    hub = await smock.fake('IDCAHub');
    SHARE_TOKEN_B = { token: tokenB.address, share: BigNumber.from(50e2) };
    SHARE_TOKEN_C = { token: tokenC.address, share: BigNumber.from(50e2) };
    SHARES = [SHARE_TOKEN_B, SHARE_TOKEN_C];
    snapshotId = await snapshot.take();
  });

  beforeEach(async () => {
    await snapshot.revert(snapshotId);
    tokenA.transferFrom.reset();
    tokenA.allowance.reset();
    tokenA.approve.reset();
    hub['deposit(address,address,uint256,uint32,uint32,address,(address,uint8[])[])'].reset();
  });

  describe('_approveHub', () => {
    let amount: number;
    given(async () => {
      amount = 1000000;
    });
    when('current allowance is enough', () => {
      given(async () => {
        tokenA.allowance.returns(amount);
        await DCAStrategiesPositionsHandlerMock.approveHub(tokenA.address, hub.address, amount);
      });
      then('allowance is checked correctly', () => {
        expect(tokenA.allowance).to.have.been.calledOnceWith(DCAStrategiesPositionsHandlerMock.address, hub.address);
      });
      then('approve is not called', async () => {
        expect(tokenA.approve).to.not.have.been.called;
      });
    });
    when('current allowance is not enough but its not zero', () => {
      given(async () => {
        tokenA.allowance.returns(amount - 1);
        await DCAStrategiesPositionsHandlerMock.approveHub(tokenA.address, hub.address, amount);
      });
      then('allowance is checked correctly', () => {
        expect(tokenA.allowance).to.have.been.calledOnceWith(DCAStrategiesPositionsHandlerMock.address, hub.address);
      });
      then('approve is called twice', async () => {
        expect(tokenA.approve).to.have.been.calledTwice;
        expect(tokenA.approve).to.have.been.calledWith(hub.address, 0);
        expect(tokenA.approve).to.have.been.calledWith(hub.address, constants.MAX_UINT_256);
      });
    });
    when('current allowance is zero', () => {
      given(async () => {
        tokenA.allowance.returns(0);
        await DCAStrategiesPositionsHandlerMock.approveHub(tokenA.address, hub.address, amount);
      });
      then('allowance is checked correctly', () => {
        expect(tokenA.allowance).to.have.been.calledOnceWith(DCAStrategiesPositionsHandlerMock.address, hub.address);
      });
      then('approve is called once', async () => {
        expect(tokenA.approve).to.have.been.calledOnceWith(hub.address, constants.MAX_UINT_256);
      });
    });
  });

  describe('deposit', () => {
    let tx: TransactionResponse;
    let toDeposit = ethers.utils.parseUnits('301');
    let amountOfSwaps = 5;
    let swapInterval = 7 * 24 * 60 * 60; // 1 week
    let permissions: any[] = [];

    when('invalid strategy and version provided', () => {
      then('tx reverts with message', async () => {
        await expect(
          DCAStrategiesPositionsHandlerMock.deposit({
            hub: hub.address,
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
        tokenA.allowance.returns(0);

        tx = await DCAStrategiesPositionsHandlerMock.connect(user).deposit({
          hub: hub.address,
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
      then('_approveHub() is called correctly', async () => {
        let approveHubCalls = await DCAStrategiesPositionsHandlerMock.getApproveHubCalls();
        expect(approveHubCalls.length).to.be.equal(1);
        expect(approveHubCalls[0].token).to.be.equal(tokenA.address);
        expect(approveHubCalls[0].hub).to.be.equal(hub.address);
        expect(approveHubCalls[0].amount).to.be.equal(toDeposit);
      });
      then('deposit() in hub is called correctly', async () => {
        expect(hub['deposit(address,address,uint256,uint32,uint32,address,(address,uint8[])[])']).to.have.been.calledTwice;
        expect(hub['deposit(address,address,uint256,uint32,uint32,address,(address,uint8[])[])'].atCall(0)).to.have.been.calledWith(
          tokenA.address,
          tokenB.address,
          toDeposit.div(2),
          amountOfSwaps,
          swapInterval,
          DCAStrategiesPositionsHandlerMock.address,
          []
        );
        expect(hub['deposit(address,address,uint256,uint32,uint32,address,(address,uint8[])[])'].atCall(1)).to.have.been.calledWith(
          tokenA.address,
          tokenC.address,
          toDeposit.sub(toDeposit.div(2)),
          amountOfSwaps,
          swapInterval,
          DCAStrategiesPositionsHandlerMock.address,
          []
        );
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
