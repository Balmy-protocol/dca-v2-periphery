import chai, { expect } from 'chai';
import { ethers } from 'hardhat';
import {
  DCAStrategiesPositionsHandlerMock__factory,
  DCAStrategiesPositionsHandlerMock,
  IERC20,
  IDCAHub,
  IDCAStrategiesPositionsHandler,
  IDCAHubPositionHandler,
  IDCAStrategies,
} from '@typechained';
import { FakeContract, smock } from '@defi-wonderland/smock';
import { constants } from '@test-utils';
import { given, then, when, contract } from '@test-utils/bdd';
import { snapshot } from '@test-utils/evm';
import { TransactionResponse } from '@ethersproject/abstract-provider';
import { BigNumber, BigNumberish } from '@ethersproject/bignumber';
import { readArgFromEventOrFail } from '@test-utils/event-utils';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';

chai.use(smock.matchers);

contract.only('DCAStrategiesPositionsHandler', () => {
  let snapshotId: string;
  let DCAStrategiesPositionsHandlerMock: DCAStrategiesPositionsHandlerMock;
  let user: SignerWithAddress, random: SignerWithAddress, governor: SignerWithAddress;
  let factory: DCAStrategiesPositionsHandlerMock__factory;
  let tokenA: FakeContract<IERC20>,
    tokenB: FakeContract<IERC20>,
    tokenC: FakeContract<IERC20>,
    tokenD: FakeContract<IERC20>,
    tokenE: FakeContract<IERC20>,
    tokenF: FakeContract<IERC20>,
    tokenG: FakeContract<IERC20>;
  let hub: FakeContract<IDCAHub>;
  let SHARE_TOKEN_B;
  let SHARE_TOKEN_C;
  let SHARES: any[];

  before('Setup accounts and contracts', async () => {
    [user, random, governor] = await ethers.getSigners();
    factory = await ethers.getContractFactory('DCAStrategiesPositionsHandlerMock');
    DCAStrategiesPositionsHandlerMock = await factory.deploy();
    [tokenA, tokenB, tokenC, tokenD, tokenE, tokenF, tokenG] = sortTokenAddresses([
      await smock.fake('IERC20'),
      await smock.fake('IERC20'),
      await smock.fake('IERC20'),
      await smock.fake('IERC20'),
      await smock.fake('IERC20'),
      await smock.fake('IERC20'),
      await smock.fake('IERC20'),
    ]);
    hub = await smock.fake('IDCAHub');
    SHARE_TOKEN_B = { token: tokenB.address, share: BigNumber.from(50e2) };
    SHARE_TOKEN_C = { token: tokenC.address, share: BigNumber.from(50e2) };
    SHARES = [SHARE_TOKEN_B, SHARE_TOKEN_C];
    snapshotId = await snapshot.take();
  });

  beforeEach(async () => {
    await snapshot.revert(snapshotId);
    tokenA.transferFrom.reset();
    tokenA.transfer.reset();
    tokenA.allowance.reset();
    tokenA.approve.reset();
    tokenF.transferFrom.reset();
    tokenF.transfer.reset();
    hub.userPosition.reset();
    hub.withdrawSwapped.reset();
    hub.increasePosition.reset();
    hub.reducePosition.reset();
    hub['deposit(address,address,uint256,uint32,uint32,address,(address,uint8[])[])'].reset();
    hub.terminate.reset();
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
    let expectedPositionsIds = [BigNumber.from(1), BigNumber.from(2)];

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
      let userPosition: IDCAStrategiesPositionsHandler.PositionStruct;
      given(async () => {
        await DCAStrategiesPositionsHandlerMock.setTokenShares(1, SHARES);

        tokenA.transferFrom.returns(true);
        tokenA.allowance.returns(0);
        hub['deposit(address,address,uint256,uint32,uint32,address,(address,uint8[])[])'].returnsAtCall(0, 1);
        hub['deposit(address,address,uint256,uint32,uint32,address,(address,uint8[])[])'].returnsAtCall(1, 2);

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

        userPosition = await DCAStrategiesPositionsHandlerMock.userPosition(1);
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
      then('user position is saved correctly', async () => {
        expect(userPosition.hub).to.be.equal(hub.address);
        expect(userPosition.strategyId).to.be.equal(1);
        expect(userPosition.strategyVersion).to.be.equal(1);

        expect(userPosition.positions.length).to.be.equal(expectedPositionsIds.length);
        userPosition.positions.forEach((p, i) => {
          expect(p).to.be.equal(expectedPositionsIds[i]);
        });
      });
      then('event is emitted', async () => {
        await expect(tx)
          .to.emit(DCAStrategiesPositionsHandlerMock, 'Deposited')
          .withArgs(user.address, user.address, 1, tokenA.address, 1, 1, swapInterval, [], expectedPositionsIds);
      });
    });
  });

  describe('withdrawSwapped', () => {
    let tx: TransactionResponse;
    let positions = [1, 2, 3];

    when('caller does not have permissions', () => {
      given(async () => {
        await DCAStrategiesPositionsHandlerMock.setPermissions(false);
      });
      then('tx reverts with message', async () => {
        await expect(DCAStrategiesPositionsHandlerMock.withdrawSwapped(1, random.address)).to.be.revertedWith('NoPermissions()');
      });
    });
    when('withdrawSwapped is called', () => {
      let amounts = [BigNumber.from(50), BigNumber.from(500), BigNumber.from(5000)];
      let tokens: string[];
      let toReturn: IDCAHubPositionHandler.UserPositionStruct = {
        from: constants.NOT_ZERO_ADDRESS,
        to: constants.NOT_ZERO_ADDRESS,
        swapInterval: 0,
        swapsExecuted: 0,
        swapped: 0,
        swapsLeft: 0,
        remaining: 0,
        rate: 0,
      };
      given(async () => {
        tokens = [tokenA.address, tokenB.address, tokenC.address];
        tokens.forEach((t, i) => {
          hub.userPosition.returnsAtCall(i, { ...toReturn, to: t });
        });
        amounts.forEach((a, i) => {
          hub.withdrawSwapped.returnsAtCall(i, a);
        });
        await DCAStrategiesPositionsHandlerMock.setPermissions(true);
        await DCAStrategiesPositionsHandlerMock.setUserPositions(1, {
          strategyId: 1,
          strategyVersion: 1,
          hub: hub.address,
          positions: positions,
        });
        tx = await DCAStrategiesPositionsHandlerMock.withdrawSwapped(1, user.address);
      });
      then('withdrawSwapped in hub is called correctly', async () => {
        expect(hub.withdrawSwapped).to.have.been.calledThrice;
        positions.forEach((p, i) => {
          expect(hub.withdrawSwapped.atCall(i)).to.have.been.calledOnceWith(BigNumber.from(p), user.address);
        });
      });
      then('event is emitted', async () => {
        const withdrawer = await readArgFromEventOrFail(tx, 'Withdrew', 'withdrawer');
        const recipient = await readArgFromEventOrFail(tx, 'Withdrew', 'recipient');
        const positionId = await readArgFromEventOrFail(tx, 'Withdrew', 'positionId');
        const tokenAmounts: BigNumber[] = await readArgFromEventOrFail(tx, 'Withdrew', 'tokenAmounts');

        expect(withdrawer).to.be.equal(user.address);
        expect(recipient).to.be.equal(user.address);
        expect(positionId).to.be.equal(1);
        expect(tokenAmounts.length).to.be.equal(tokens.length);
        expect(tokenAmounts.length).to.be.equal(amounts.length);
        tokenAmounts.forEach((ta, i) => {
          expect(ta).to.be.equal(amounts[i]);
        });
      });
    });
  });

  describe('increasePosition', () => {
    let tx: TransactionResponse;
    let positions = [1, 2];
    let toIncrease = ethers.utils.parseUnits('301');
    let newSwaps = 1;
    when('caller does not have permissions', () => {
      given(async () => {
        await DCAStrategiesPositionsHandlerMock.setPermissions(false);
      });
      then('tx reverts with message', async () => {
        await expect(DCAStrategiesPositionsHandlerMock.increasePosition(1, tokenA.address, toIncrease, 0)).to.be.revertedWith('NoPermissions()');
      });
    });
    when('increasePosition is called', () => {
      given(async () => {
        await DCAStrategiesPositionsHandlerMock.setPermissions(true);
        await DCAStrategiesPositionsHandlerMock.setTokenShares(1, SHARES);
        tokenA.transferFrom.returns(true);
        await DCAStrategiesPositionsHandlerMock.setUserPositions(1, {
          strategyId: 1,
          strategyVersion: 1,
          hub: hub.address,
          positions: positions,
        });
      });
      when('amount is greater than zero', () => {
        given(async () => {
          tx = await DCAStrategiesPositionsHandlerMock.connect(user).increasePosition(1, tokenA.address, toIncrease, newSwaps);
        });
        then('transferFrom() is called correctly', async () => {
          expect(tokenA.transferFrom).to.have.been.calledOnceWith(user.address, DCAStrategiesPositionsHandlerMock.address, toIncrease);
        });
        then('_approveHub() is called correctly', async () => {
          let approveHubCalls = await DCAStrategiesPositionsHandlerMock.getApproveHubCalls();
          expect(approveHubCalls.length).to.be.equal(1);
          expect(approveHubCalls[0].token).to.be.equal(tokenA.address);
          expect(approveHubCalls[0].hub).to.be.equal(hub.address);
          expect(approveHubCalls[0].amount).to.be.equal(toIncrease);
        });
        then('increasePosition in hub is called correctly', async () => {
          expect(hub.increasePosition).to.have.been.calledTwice;
          expect(hub.increasePosition.atCall(0)).to.have.been.calledOnceWith(BigNumber.from(1), toIncrease.div(2), newSwaps);
          expect(hub.increasePosition.atCall(1)).to.have.been.calledOnceWith(BigNumber.from(2), toIncrease.sub(toIncrease.div(2)), newSwaps);
        });
        then('event is emitted', async () => {
          await expect(tx).to.emit(DCAStrategiesPositionsHandlerMock, 'Increased').withArgs(user.address, 1, toIncrease, newSwaps);
        });
      });
      when('amount is zero', () => {
        given(async () => {
          tx = await DCAStrategiesPositionsHandlerMock.connect(user).increasePosition(1, tokenA.address, 0, newSwaps);
        });
        then('transferFrom() is not called', async () => {
          expect(tokenA.transferFrom).to.have.been.not.called;
        });
        then('_approveHub() is not called', async () => {
          let approveHubCalls = await DCAStrategiesPositionsHandlerMock.getApproveHubCalls();
          expect(approveHubCalls.length).to.be.equal(0);
        });
        then('increasePosition in hub is called correctly', async () => {
          expect(hub.increasePosition).to.have.been.calledTwice;
          expect(hub.increasePosition.atCall(0)).to.have.been.calledOnceWith(BigNumber.from(1), 0, newSwaps);
          expect(hub.increasePosition.atCall(1)).to.have.been.calledOnceWith(BigNumber.from(2), 0, newSwaps);
        });
        then('event is emitted', async () => {
          await expect(tx).to.emit(DCAStrategiesPositionsHandlerMock, 'Increased').withArgs(user.address, 1, 0, newSwaps);
        });
      });
    });
  });

  describe('reducePosition', () => {
    let tx: TransactionResponse;
    let positions = [1, 2];
    let toReduce = ethers.utils.parseUnits('301');
    let newSwaps = 1;
    when('caller does not have permissions', () => {
      given(async () => {
        await DCAStrategiesPositionsHandlerMock.setPermissions(false);
      });
      then('tx reverts with message', async () => {
        await expect(DCAStrategiesPositionsHandlerMock.reducePosition(1, toReduce, newSwaps, constants.NOT_ZERO_ADDRESS)).to.be.revertedWith(
          'NoPermissions()'
        );
      });
    });
    when('reducePosition is called', () => {
      given(async () => {
        await DCAStrategiesPositionsHandlerMock.setPermissions(true);
        await DCAStrategiesPositionsHandlerMock.setTokenShares(1, SHARES);
        await DCAStrategiesPositionsHandlerMock.setUserPositions(1, {
          strategyId: 1,
          strategyVersion: 1,
          hub: hub.address,
          positions: positions,
        });
        tx = await DCAStrategiesPositionsHandlerMock.connect(user).reducePosition(1, toReduce, newSwaps, user.address);
      });
      then('reducePosition in hub is called correctly', async () => {
        expect(hub.reducePosition).to.have.been.calledTwice;
        expect(hub.reducePosition.atCall(0)).to.have.been.calledOnceWith(BigNumber.from(1), toReduce.div(2), newSwaps, user.address);
        expect(hub.reducePosition.atCall(1)).to.have.been.calledOnceWith(
          BigNumber.from(2),
          toReduce.sub(toReduce.div(2)),
          newSwaps,
          user.address
        );
      });
      then('event is emitted', async () => {
        await expect(tx).to.emit(DCAStrategiesPositionsHandlerMock, 'Reduced').withArgs(user.address, 1, toReduce, newSwaps, user.address);
      });
    });
  });

  describe('terminate', () => {
    let tx: TransactionResponse;
    let positions = [1, 2];
    let unswapped = ethers.utils.parseUnits('100');
    let swapped = ethers.utils.parseUnits('50');
    when('caller does not have permissions', () => {
      given(async () => {
        await DCAStrategiesPositionsHandlerMock.setPermissions(false);
      });
      then('tx reverts with message', async () => {
        await expect(DCAStrategiesPositionsHandlerMock.terminate(1, user.address, user.address)).to.be.revertedWith('NoPermissions()');
      });
    });
    when('terminate is called', () => {
      given(async () => {
        await DCAStrategiesPositionsHandlerMock.setPermissions(true);
        await DCAStrategiesPositionsHandlerMock.setTokenShares(1, SHARES);
        hub.terminate.returns([unswapped, swapped]);
        await DCAStrategiesPositionsHandlerMock.setUserPositions(1, {
          strategyId: 1,
          strategyVersion: 1,
          hub: hub.address,
          positions: positions,
        });
        tx = await DCAStrategiesPositionsHandlerMock.connect(user).terminate(1, user.address, user.address);
      });
      then('terminate in hub is called correctly', async () => {
        expect(hub.terminate).to.have.been.calledTwice;
        expect(hub.terminate.atCall(0)).to.have.been.calledOnceWith(BigNumber.from(1), user.address, user.address);
        expect(hub.terminate.atCall(1)).to.have.been.calledOnceWith(BigNumber.from(2), user.address, user.address);
      });
      then('event is emitted', async () => {
        const sender: string = await readArgFromEventOrFail(tx, 'Terminated', 'user');
        const recipientUnswapped: string = await readArgFromEventOrFail(tx, 'Terminated', 'recipientUnswapped');
        const recipientSwapped: string = await readArgFromEventOrFail(tx, 'Terminated', 'recipientSwapped');
        const positionId: BigNumber = await readArgFromEventOrFail(tx, 'Terminated', 'positionId');
        const returnedUnswapped: string = await readArgFromEventOrFail(tx, 'Terminated', 'returnedUnswapped');
        const returnedSwapped: BigNumber[] = await readArgFromEventOrFail(tx, 'Terminated', 'returnedSwapped');

        expect(sender).to.be.equal(user.address);
        expect(recipientUnswapped).to.be.equal(user.address);
        expect(recipientSwapped).to.be.equal(user.address);
        expect(positionId).to.be.equal(1);
        expect(returnedUnswapped).to.be.equal(unswapped.mul(2));
        expect(returnedSwapped.length).to.be.equal(positions.length);
        expect(returnedSwapped.length).to.be.equal(SHARES.length);
        returnedSwapped.forEach((ta, i) => {
          expect(ta).to.be.equal(swapped);
        });
      });
    });
  });

  describe('syncPositionToNewVersion', () => {
    let tx: TransactionResponse;
    let totalAmount = ethers.utils.parseEther('50');
    let delta = ethers.utils.parseEther('15');
    let amountOfSwaps = BigNumber.from(5);
    let newAmountOfSwaps = BigNumber.from(7);
    let newPositions: BigNumber[];
    let swapInterval = BigNumber.from(5);
    let oldShares: IDCAStrategies.ShareOfTokenStruct[];
    let newShares: IDCAStrategies.ShareOfTokenStruct[];
    let expectedNewPositionsIds: BigNumber[] = [BigNumber.from(1), BigNumber.from(2), BigNumber.from(3), BigNumber.from(5), BigNumber.from(6)];

    when('caller does not have permissions', () => {
      given(async () => {
        await DCAStrategiesPositionsHandlerMock.setPermissions(false);
      });
      then('tx reverts with message', async () => {
        await expect(
          DCAStrategiesPositionsHandlerMock.syncPositionToNewVersion(1, 3, user.address, user.address, amountOfSwaps, newAmountOfSwaps)
        ).to.be.revertedWith('NoPermissions()');
      });
    });
    when('syncPositionToNewVersion is called', () => {
      given(async () => {
        const positions = [1, 2, 3, 4];
        const OLD_SHARE_A = { token: tokenA.address, share: BigNumber.from(33e2) }; // nothing
        const OLD_SHARE_B = { token: tokenB.address, share: BigNumber.from(20e2) }; // increase
        const OLD_SHARE_C = { token: tokenC.address, share: BigNumber.from(34e2) }; // reduce
        const OLD_SHARE_G = { token: tokenG.address, share: BigNumber.from(13e2) }; // terminate
        oldShares = [OLD_SHARE_A, OLD_SHARE_B, OLD_SHARE_C, OLD_SHARE_G];

        const NEW_SHARE_A = { token: tokenA.address, share: BigNumber.from(33e2) }; // nothing
        const NEW_SHARE_B = { token: tokenB.address, share: BigNumber.from(35e2) }; // increase
        const NEW_SHARE_C = { token: tokenC.address, share: BigNumber.from(10e2) }; // reduce
        const NEW_SHARE_D = { token: tokenD.address, share: BigNumber.from(7e2) }; // deposit
        const NEW_SHARE_E = { token: tokenE.address, share: BigNumber.from(15e2) }; // deposit
        newShares = [NEW_SHARE_A, NEW_SHARE_B, NEW_SHARE_C, NEW_SHARE_D, NEW_SHARE_E];

        hub.userPosition.whenCalledWith(1).returns(createUserPosition(tokenF.address, amountOfSwaps, totalAmount, swapInterval, oldShares[0]));
        hub.userPosition.whenCalledWith(2).returns(createUserPosition(tokenF.address, amountOfSwaps, totalAmount, swapInterval, oldShares[1]));
        hub.userPosition.whenCalledWith(3).returns(createUserPosition(tokenF.address, amountOfSwaps, totalAmount, swapInterval, oldShares[2]));
        hub.userPosition.whenCalledWith(4).returns(createUserPosition(tokenF.address, amountOfSwaps, totalAmount, swapInterval, oldShares[3]));

        hub.terminate
          .whenCalledWith(1, DCAStrategiesPositionsHandlerMock.address, user.address)
          .returns([calculateAmount(totalAmount, oldShares[0].share), 0]);
        hub.terminate
          .whenCalledWith(2, DCAStrategiesPositionsHandlerMock.address, user.address)
          .returns([calculateAmount(totalAmount, oldShares[1].share), 0]);
        hub.terminate
          .whenCalledWith(3, DCAStrategiesPositionsHandlerMock.address, user.address)
          .returns([calculateAmount(totalAmount, oldShares[2].share), 0]);
        hub.terminate
          .whenCalledWith(4, DCAStrategiesPositionsHandlerMock.address, user.address)
          .returns([calculateAmount(totalAmount, oldShares[3].share), 0]);

        hub.reducePosition.returns(true);
        hub.increasePosition.returns(true);

        hub['deposit(address,address,uint256,uint32,uint32,address,(address,uint8[])[])'].returnsAtCall(0, 5); // at call 0 return id 5
        hub['deposit(address,address,uint256,uint32,uint32,address,(address,uint8[])[])'].returnsAtCall(1, 6); // at call 1 return id 6

        tokenF.transfer.returns(true);
        tokenF.transferFrom.returns(true);

        await DCAStrategiesPositionsHandlerMock.setPermissions(true);
        await DCAStrategiesPositionsHandlerMock.setTokenShares(3, newShares);
        await DCAStrategiesPositionsHandlerMock.setUserPositions(1, {
          strategyId: 1,
          strategyVersion: 1,
          hub: hub.address,
          positions: positions,
        });
      });
      when('is called (trying to reduce position)', () => {
        given(async () => {
          tx = await callSync(totalAmount.sub(delta), newAmountOfSwaps);

          newPositions = (await DCAStrategiesPositionsHandlerMock.userPosition(1)).positions;
        });
        then('transfer() is called correctly', async () => {
          expect(tokenF.transfer).to.have.been.calledWith(user.address, delta);
        });
        then('increase, reduce, deposit or terminate is called correctly', async () => {
          assertDepositAndTerminateWereCalledCorrectly(totalAmount.sub(delta), newShares[3], newShares[4], newAmountOfSwaps);
          expect(hub.reducePosition).to.have.been.calledTwice;
          expect(hub.increasePosition).to.have.been.calledOnce;
          expect(hub.reducePosition.atCall(0)).to.have.been.calledWith(
            1,
            calculateAmount(totalAmount, oldShares[0].share).sub(calculateAmount(totalAmount.sub(delta), newShares[0].share)),
            newAmountOfSwaps,
            DCAStrategiesPositionsHandlerMock.address
          );
          expect(hub.reducePosition.atCall(1)).to.have.been.calledWith(
            3,
            calculateAmount(totalAmount, oldShares[2].share).sub(calculateAmount(totalAmount.sub(delta), newShares[2].share)),
            newAmountOfSwaps,
            DCAStrategiesPositionsHandlerMock.address
          );
          expect(hub.increasePosition.atCall(0)).to.have.been.calledWith(
            2,
            calculateAmount(totalAmount.sub(delta), newShares[1].share).sub(calculateAmount(totalAmount, oldShares[1].share)),
            newAmountOfSwaps
          );
        });
        then('positions array is saved correctly', async () => {
          checkPositions(newPositions, newShares);
        });
        then('event is emitted', async () => {
          await expect(tx)
            .to.emit(DCAStrategiesPositionsHandlerMock, 'Synced')
            .withArgs(user.address, 1, 3, user.address, user.address, totalAmount.sub(delta), newAmountOfSwaps);
        });
      });
      when('is called (trying to increase position)', () => {
        given(async () => {
          tx = await callSync(totalAmount.add(delta), newAmountOfSwaps);

          newPositions = (await DCAStrategiesPositionsHandlerMock.userPosition(1)).positions;
        });
        then('transferFrom() is called correctly', async () => {
          expect(tokenF.transferFrom).to.have.been.calledWith(user.address, DCAStrategiesPositionsHandlerMock.address, delta);
        });
        then('increase, reduce, deposit or terminate is called correctly', async () => {
          assertDepositAndTerminateWereCalledCorrectly(totalAmount.add(delta), newShares[3], newShares[4], newAmountOfSwaps);
          expect(hub.increasePosition).to.have.been.calledTwice;
          expect(hub.reducePosition).to.have.been.calledOnce;
          expect(hub.increasePosition.atCall(0)).to.have.been.calledWith(
            1,
            calculateAmount(totalAmount.add(delta), newShares[0].share).sub(calculateAmount(totalAmount, oldShares[0].share)),
            newAmountOfSwaps
          );
          expect(hub.increasePosition.atCall(1)).to.have.been.calledWith(
            2,
            calculateAmount(totalAmount.add(delta), newShares[1].share).sub(calculateAmount(totalAmount, oldShares[1].share)),
            newAmountOfSwaps
          );
          expect(hub.reducePosition.atCall(0)).to.have.been.calledWith(
            3,
            calculateAmount(totalAmount, oldShares[2].share).sub(calculateAmount(totalAmount.add(delta), newShares[2].share)),
            newAmountOfSwaps,
            DCAStrategiesPositionsHandlerMock.address
          );
        });
        then('positions array is saved correctly', async () => {
          checkPositions(newPositions, newShares);
        });
        then('event is emitted', async () => {
          await expect(tx)
            .to.emit(DCAStrategiesPositionsHandlerMock, 'Synced')
            .withArgs(user.address, 1, 3, user.address, user.address, totalAmount.add(delta), newAmountOfSwaps);
        });
      });
      when('is called (without increasing or reducing)', () => {
        given(async () => {
          tx = await callSync(totalAmount, amountOfSwaps);

          newPositions = (await DCAStrategiesPositionsHandlerMock.userPosition(1)).positions;
        });
        then('neither transfer() or transferFrom() is called', async () => {
          expect(tokenF.transferFrom).to.not.have.been.called;
          expect(tokenF.transfer).to.not.have.been.called;
        });
        then('increase, reduce, deposit or terminate is called correctly', async () => {
          assertDepositAndTerminateWereCalledCorrectly(totalAmount, newShares[3], newShares[4], amountOfSwaps);
          expect(hub.reducePosition).to.have.been.calledOnce;
          expect(hub.increasePosition).to.have.been.calledOnce;
          expect(hub.reducePosition.atCall(0)).to.have.been.calledWith(
            3,
            calculateAmount(totalAmount, oldShares[2].share).sub(calculateAmount(totalAmount, newShares[2].share)),
            amountOfSwaps,
            DCAStrategiesPositionsHandlerMock.address
          );
          expect(hub.increasePosition.atCall(0)).to.have.been.calledWith(
            2,
            calculateAmount(totalAmount, newShares[1].share).sub(calculateAmount(totalAmount, oldShares[1].share)),
            amountOfSwaps
          );
        });
        then('positions array is saved correctly', async () => {
          checkPositions(newPositions, newShares);
        });
        then('event is emitted', async () => {
          await expect(tx)
            .to.emit(DCAStrategiesPositionsHandlerMock, 'Synced')
            .withArgs(user.address, 1, 3, user.address, user.address, totalAmount, amountOfSwaps);
        });
      });
    });

    async function callSync(totalAmount: BigNumber, newAmountOfSwaps: BigNumber) {
      tx = await DCAStrategiesPositionsHandlerMock.connect(user).syncPositionToNewVersion(
        1,
        3,
        user.address,
        user.address,
        totalAmount,
        newAmountOfSwaps
      );

      return tx;
    }

    function assertDepositAndTerminateWereCalledCorrectly(
      totalAmount: BigNumber,
      thirdNewShare: IDCAStrategies.ShareOfTokenStruct,
      fourthNewShare: IDCAStrategies.ShareOfTokenStruct,
      newAmountOfSwaps: BigNumber
    ) {
      expect(hub['deposit(address,address,uint256,uint32,uint32,address,(address,uint8[])[])']).to.have.been.calledTwice;
      expect(hub.terminate).to.have.been.calledOnce;
      expect(hub['deposit(address,address,uint256,uint32,uint32,address,(address,uint8[])[])'].atCall(0)).to.have.been.calledWith(
        tokenF.address,
        thirdNewShare.token,
        calculateAmount(totalAmount, thirdNewShare.share),
        newAmountOfSwaps,
        swapInterval,
        DCAStrategiesPositionsHandlerMock.address,
        []
      );
      expect(hub['deposit(address,address,uint256,uint32,uint32,address,(address,uint8[])[])'].atCall(1)).to.have.been.calledWith(
        tokenF.address,
        fourthNewShare.token,
        calculateAmount(totalAmount, fourthNewShare.share),
        newAmountOfSwaps,
        swapInterval,
        DCAStrategiesPositionsHandlerMock.address,
        []
      );
      expect(hub.terminate.atCall(0)).to.have.been.calledWith(4, DCAStrategiesPositionsHandlerMock.address, user.address);
    }

    function checkPositions(newPositions: BigNumber[], newShares: IDCAStrategies.ShareOfTokenStruct[]) {
      expect(newPositions.length).to.be.equal(newShares.length);
      expect(newPositions.length).to.be.equal(expectedNewPositionsIds.length);
      newPositions.forEach((i, index) => {
        expect(i).to.not.be.equal(BigNumber.from(0));
        expect(i).to.be.equal(expectedNewPositionsIds[index]);
      });
    }
  });

  function createUserPosition(
    from: string,
    amountOfSwaps: BigNumber,
    totalAmount: BigNumber,
    swapInterval: BigNumber,
    tokenShare: IDCAStrategies.ShareOfTokenStruct
  ) {
    let toReturn: IDCAHubPositionHandler.UserPositionStruct = {
      from: from,
      to: tokenShare.token,
      swapInterval: swapInterval,
      swapsExecuted: 0,
      swapped: 0,
      swapsLeft: amountOfSwaps,
      remaining: calculateAmount(totalAmount, tokenShare.share),
      rate: 0,
    };
    return toReturn;
  }

  function calculateAmount(total: BigNumber, share: BigNumber | BigNumberish) {
    return total.mul(BigNumber.from(share)).div(100e2);
  }

  function sortTokenAddresses(array: FakeContract<IERC20>[]) {
    function hexToNumber(hexaNumber: string) {
      return parseInt(hexaNumber, 16);
    }

    function compare(a: FakeContract<IERC20>, b: FakeContract<IERC20>) {
      if (hexToNumber(a.address) < hexToNumber(b.address)) return -1;
      if (hexToNumber(a.address) > hexToNumber(b.address)) return 1;
      if (hexToNumber(a.address) == hexToNumber(b.address)) console.error('found duplicate when sorting');
      return 0;
    }

    let f = array.sort(compare);
    return f;
  }
});
