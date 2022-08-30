import chai, { expect } from 'chai';
import { ethers } from 'hardhat';
import { constants } from '@test-utils';
import { contract, given, then, when } from '@test-utils/bdd';
import { snapshot } from '@test-utils/evm';
import {
  DCAHubCompanionHubProxyHandlerMock,
  DCAHubCompanionHubProxyHandlerMock__factory,
  IDCAHub,
  IDCAPermissionManager,
  IERC20,
} from '@typechained';
import { FakeContract, smock } from '@defi-wonderland/smock';
import { TransactionResponse } from '@ethersproject/abstract-provider';
import { utils } from 'ethers';

chai.use(smock.matchers);

contract('DCAHubCompanionHubProxyHandler', () => {
  let DCAPermissionManager: FakeContract<IDCAPermissionManager>;
  let DCAHub: FakeContract<IDCAHub>;
  let erc20Token: FakeContract<IERC20>;
  let DCAHubCompanionHubProxyHandler: DCAHubCompanionHubProxyHandlerMock;
  let snapshotId: string;

  before('Setup accounts and contracts', async () => {
    const DCAHubCompanionHubProxyHandlerFactory: DCAHubCompanionHubProxyHandlerMock__factory = await ethers.getContractFactory(
      'contracts/mocks/DCAHubCompanion/DCAHubCompanionHubProxyHandler.sol:DCAHubCompanionHubProxyHandlerMock'
    );
    DCAPermissionManager = await smock.fake('IDCAPermissionManager');
    DCAHub = await smock.fake('IDCAHub');
    DCAHub.permissionManager.returns(DCAPermissionManager.address);
    erc20Token = await smock.fake('IERC20');
    DCAHubCompanionHubProxyHandler = await DCAHubCompanionHubProxyHandlerFactory.deploy();
    snapshotId = await snapshot.take();
  });

  beforeEach(async () => {
    await snapshot.revert(snapshotId);
    erc20Token.transferFrom.returns(true);
    DCAHub.userPosition.returns({
      from: erc20Token.address,
      to: constants.NOT_ZERO_ADDRESS,
      swapInterval: 10,
      swapsExecuted: 10,
      swapped: 10,
      swapsLeft: 10,
      remaining: 10,
      rate: 10,
    });
  });
  afterEach(() => {
    erc20Token.approve.reset();
    erc20Token.transferFrom.reset();
    DCAPermissionManager.hasPermission.reset();
    DCAHub['deposit(address,address,uint256,uint32,uint32,address,(address,uint8[])[],bytes)'].reset();
    DCAHub.withdrawSwapped.reset();
    DCAHub.withdrawSwappedMany.reset();
    DCAHub.increasePosition.reset();
    DCAHub.reducePosition.reset();
    DCAHub.terminate.reset();
  });

  enum Permission {
    INCREASE,
    REDUCE,
    WITHDRAW,
    TERMINATE,
  }

  const PERMISSIONS = [{ operator: constants.NOT_ZERO_ADDRESS, permissions: [Permission.INCREASE] }];
  describe('permissionPermit', () => {
    const R = utils.formatBytes32String('r');
    const S = utils.formatBytes32String('s');

    when('method is executed', () => {
      given(async () => {
        await DCAHubCompanionHubProxyHandler.permissionPermit(DCAPermissionManager.address, PERMISSIONS, 10, 20, 30, R, S);
      });
      then('hub is called', () => {
        expect(DCAPermissionManager.permissionPermit).to.have.been.calledOnce;
        const [permissions, tokenId, deadline, v, r, s] = DCAPermissionManager.permissionPermit.getCall(0).args;
        expect((permissions as any).length).to.equal(PERMISSIONS.length);
        expect((permissions as any)[0].operator).to.equal(PERMISSIONS[0].operator);
        expect((permissions as any)[0].permissions).to.eql(PERMISSIONS[0].permissions);
        expect(tokenId).to.equal(10);
        expect(deadline).to.equal(20);
        expect(v).to.equal(30);
        expect(r).to.equal(R);
        expect(s).to.equal(S);
      });
    });
  });

  describe('deposit', () => {
    const TO = '0x0000000000000000000000000000000000000002';
    const AMOUNT = 10000;
    const AMOUNT_OF_SWAPS = 40;
    const SWAP_INTERVAL = 10000;
    const OWNER = '0x0000000000000000000000000000000000000003';
    const MISC = ethers.utils.randomBytes(10);

    when('depositing and allowance is not enough', () => {
      given(async () => {
        erc20Token.allowance.returns(AMOUNT - 1);
        await DCAHubCompanionHubProxyHandler.deposit(
          DCAHub.address,
          erc20Token.address,
          TO,
          AMOUNT,
          AMOUNT_OF_SWAPS,
          SWAP_INTERVAL,
          OWNER,
          [],
          MISC
        );
      });
      then('allowance is checked correctly', () => {
        expect(erc20Token.allowance).to.have.been.calledWith(DCAHubCompanionHubProxyHandler.address, DCAHub.address);
      });
      then('token is reset', () => {
        expect(erc20Token.approve).to.have.been.calledTwice;
        expect(erc20Token.approve).to.have.been.calledWith(DCAHub.address, 0);
        expect(erc20Token.approve).to.have.been.calledWith(DCAHub.address, constants.MAX_UINT_256);
      });
      then('hub is called', () => {
        expect(DCAHub['deposit(address,address,uint256,uint32,uint32,address,(address,uint8[])[],bytes)']).to.have.been.calledOnceWith(
          erc20Token.address,
          TO,
          AMOUNT,
          AMOUNT_OF_SWAPS,
          SWAP_INTERVAL,
          OWNER,
          [],
          ethers.utils.hexlify(MISC)
        );
      });
    });
    when('depositing and allowance is enough', () => {
      given(async () => {
        erc20Token.allowance.returns(AMOUNT);
        await DCAHubCompanionHubProxyHandler.deposit(
          DCAHub.address,
          erc20Token.address,
          TO,
          AMOUNT,
          AMOUNT_OF_SWAPS,
          SWAP_INTERVAL,
          OWNER,
          [],
          MISC
        );
      });
      then('allowance is checked correctly', () => {
        expect(erc20Token.allowance).to.have.been.calledWith(DCAHubCompanionHubProxyHandler.address, DCAHub.address);
      });
      then('token is not approved', () => {
        expect(erc20Token.approve).to.not.have.been.called;
      });
    });
    when('depositing and allowance is 0', () => {
      given(async () => {
        erc20Token.allowance.returns(0);
        await DCAHubCompanionHubProxyHandler.deposit(
          DCAHub.address,
          erc20Token.address,
          TO,
          AMOUNT,
          AMOUNT_OF_SWAPS,
          SWAP_INTERVAL,
          OWNER,
          [],
          MISC
        );
      });
      then('allowance is checked correctly', () => {
        expect(erc20Token.allowance).to.have.been.calledWith(DCAHubCompanionHubProxyHandler.address, DCAHub.address);
      });
      then('token is approved for max', () => {
        expect(erc20Token.approve).to.have.been.calledWith(DCAHub.address, constants.MAX_UINT_256);
      });
    });
  });

  describe('depositWithBalanceOnContract', () => {
    const TO = '0x0000000000000000000000000000000000000002';
    const AMOUNT = 10000;
    const AMOUNT_OF_SWAPS = 40;
    const SWAP_INTERVAL = 10000;
    const OWNER = '0x0000000000000000000000000000000000000003';
    const MISC = ethers.utils.hexlify(ethers.utils.randomBytes(10));

    when('depositing with all balance', () => {
      given(async () => {
        erc20Token.balanceOf.returns(AMOUNT);
        await DCAHubCompanionHubProxyHandler.depositWithBalanceOnContract(
          DCAHub.address,
          erc20Token.address,
          TO,
          AMOUNT_OF_SWAPS,
          SWAP_INTERVAL,
          OWNER,
          [],
          MISC
        );
      });
      then('balance is checked correctly', () => {
        expect(erc20Token.balanceOf).to.have.been.calledOnceWith(DCAHubCompanionHubProxyHandler.address);
      });
      then('deposit is called with the correct balance', async () => {
        const calls = await DCAHubCompanionHubProxyHandler.depositCalls();
        expect(calls).to.have.lengthOf(1);
        expect(calls[0].from).to.equal(erc20Token.address);
        expect(calls[0].to).to.equal(TO);
        expect(calls[0].amount).to.equal(AMOUNT);
        expect(calls[0].amountOfSwaps).to.equal(AMOUNT_OF_SWAPS);
        expect(calls[0].owner).to.equal(OWNER);
        expect(calls[0].permissions).to.eql([]);
        expect(calls[0].miscellaneous).to.eql(MISC);
      });
    });
  });

  proxyTest({
    method: 'withdrawSwapped',
    hubMethod: 'withdrawSwapped',
    permission: Permission.WITHDRAW,
    params: [10, constants.NOT_ZERO_ADDRESS],
  });

  proxyTest({
    method: 'withdrawSwappedMany',
    hubMethod: 'withdrawSwappedMany',
    permission: Permission.WITHDRAW,
    params: [[{ token: constants.NOT_ZERO_ADDRESS, positionIds: [1] }], constants.NOT_ZERO_ADDRESS],
    compare: (result, [positions, recipient]) =>
      result.positions.length === positions.length &&
      result.positions[0].token === positions[0].token &&
      result.positions[0].positionIds.length === positions[0].positionIds.length &&
      result.positions[0].positionIds[0].toNumber() === positions[0].positionIds[0] &&
      result.recipient === recipient,
  });

  proxyTest({
    method: 'increasePosition',
    hubMethod: 'increasePosition',
    permission: Permission.INCREASE,
    params: [10, 20, 30],
  });

  describe('increasePosition', () => {
    const POSITION_ID = 10;
    const AMOUNT = 20;
    const AMOUNT_OF_SWAPS = 30;
    given(() => {
      DCAPermissionManager.hasPermission.returns(true);
    });

    when('increasing and allowance is not enough', () => {
      given(async () => {
        erc20Token.allowance.returns(AMOUNT - 1);
        await DCAHubCompanionHubProxyHandler.increasePosition(DCAHub.address, POSITION_ID, AMOUNT, AMOUNT_OF_SWAPS);
      });
      then('allowance is checked correctly', () => {
        expect(erc20Token.allowance).to.have.been.calledWith(DCAHubCompanionHubProxyHandler.address, DCAHub.address);
      });
      then('allowance is resetted', () => {
        expect(erc20Token.approve).to.have.been.calledTwice;
        expect(erc20Token.approve).to.have.been.calledWith(DCAHub.address, 0);
        expect(erc20Token.approve).to.have.been.calledWith(DCAHub.address, constants.MAX_UINT_256);
      });
    });
    when('increasing and allowance is enough', () => {
      given(async () => {
        erc20Token.allowance.returns(AMOUNT);
        await DCAHubCompanionHubProxyHandler.increasePosition(DCAHub.address, POSITION_ID, AMOUNT, AMOUNT_OF_SWAPS);
      });
      then('allowance is checked correctly', () => {
        expect(erc20Token.allowance).to.have.been.calledWith(DCAHubCompanionHubProxyHandler.address, DCAHub.address);
      });
      then('token is not approved', () => {
        expect(erc20Token.approve).to.not.have.been.called;
      });
    });
    when('increasing and allowance is 0', () => {
      given(async () => {
        erc20Token.allowance.returns(0);
        await DCAHubCompanionHubProxyHandler.increasePosition(DCAHub.address, POSITION_ID, AMOUNT, AMOUNT_OF_SWAPS);
      });
      then('allowance is checked correctly', () => {
        expect(erc20Token.allowance).to.have.been.calledWith(DCAHubCompanionHubProxyHandler.address, DCAHub.address);
      });
      then('token is approved', () => {
        expect(erc20Token.approve).to.have.been.calledWith(DCAHub.address, constants.MAX_UINT_256);
      });
    });
  });

  describe('increasePositionWithBalanceOnContract', () => {
    const POSITION_ID = 10;
    const AMOUNT = 20;
    const AMOUNT_OF_SWAPS = 30;
    when('increasing with all balance', () => {
      given(async () => {
        DCAPermissionManager.hasPermission.returns(true);
        erc20Token.balanceOf.returns(AMOUNT);
        erc20Token.allowance.returns(AMOUNT - 1);
        await DCAHubCompanionHubProxyHandler.increasePositionWithBalanceOnContract(DCAHub.address, POSITION_ID, AMOUNT_OF_SWAPS);
      });
      then('allowance is checked correctly', () => {
        expect(erc20Token.allowance).to.have.been.calledWith(DCAHubCompanionHubProxyHandler.address, DCAHub.address);
      });
      then('allowance is resetted', () => {
        expect(erc20Token.approve).to.have.been.calledTwice;
        expect(erc20Token.approve).to.have.been.calledWith(DCAHub.address, 0);
        expect(erc20Token.approve).to.have.been.calledWith(DCAHub.address, constants.MAX_UINT_256);
      });
      then('hub is called correctly', () => {
        expect(DCAHub.increasePosition).to.have.been.calledOnceWith(POSITION_ID, AMOUNT, AMOUNT_OF_SWAPS);
      });
    });
    when('caller does not have permission', () => {
      given(() => {
        DCAPermissionManager.hasPermission.returns(false);
      });
      then('operation is reverted', async () => {
        const result: Promise<TransactionResponse> = DCAHubCompanionHubProxyHandler.increasePositionWithBalanceOnContract(
          DCAHub.address,
          POSITION_ID,
          AMOUNT_OF_SWAPS
        );
        await expect(result).to.be.revertedWith('UnauthorizedCaller');
      });
    });
  });

  proxyTest({
    method: 'reducePosition',
    hubMethod: 'reducePosition',
    permission: Permission.REDUCE,
    params: [10, 20, 30, constants.NOT_ZERO_ADDRESS],
  });

  proxyTest({
    method: 'terminate',
    hubMethod: 'terminate',
    permission: Permission.TERMINATE,
    params: [10, constants.NOT_ZERO_ADDRESS, constants.NOT_ZERO_ADDRESS],
  });

  type DropFirstParam<T extends unknown[]> = T extends [any, ...infer U] ? U : never;
  function proxyTest<
    ProxyMethod extends keyof DCAHubCompanionHubProxyHandlerMock['functions'] & string,
    HubMethod extends keyof FakeContract<IDCAHub>
  >({
    method,
    permission,
    params,
    hubMethod,
    compare,
  }: {
    method: ProxyMethod;
    permission: Permission;
    params: DropFirstParam<Parameters<DCAHubCompanionHubProxyHandlerMock['functions'][ProxyMethod]>>;
    hubMethod: HubMethod;
    compare?: (result: any, expected: DropFirstParam<Parameters<DCAHubCompanionHubProxyHandlerMock['functions'][ProxyMethod]>>) => boolean;
  }) {
    describe(method, () => {
      when('method is executed', () => {
        given(async () => {
          DCAPermissionManager.hasPermission.returns(
            ({ permission: permissionAsked }: { permission: Permission }) => permissionAsked === permission
          );
          await (DCAHubCompanionHubProxyHandler[method] as any)(DCAHub.address, ...params);
        });
        then('hub is called', () => {
          if (compare) {
            expect(DCAHub[hubMethod]).to.have.been.calledOnce;
            const args: unknown[] = (DCAHub[hubMethod] as any).getCall(0).args;
            expect(compare(args, params)).to.be.true;
          } else {
            expect(DCAHub[hubMethod]).to.have.been.calledOnceWith(...params);
          }
        });
      });
      when('caller does not have permission', () => {
        given(() => {
          DCAPermissionManager.hasPermission.returns(() => false);
        });
        then('operation is reverted', async () => {
          const result: Promise<TransactionResponse> = (DCAHubCompanionHubProxyHandler[method] as any)(DCAHub.address, ...params);
          await expect(result).to.be.revertedWith('UnauthorizedCaller');
        });
      });
    });
  }
});
