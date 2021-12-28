import chai, { expect } from 'chai';
import { ethers } from 'hardhat';
import { constants } from '@test-utils';
import { contract, given, then, when } from '@test-utils/bdd';
import { snapshot } from '@test-utils/evm';
import {
  DCAHubCompanionMulticallHandlerMock,
  DCAHubCompanionMulticallHandlerMock__factory,
  IDCAHub,
  IDCAPermissionManager,
  IERC20,
} from '@typechained';
import { FakeContract, smock } from '@defi-wonderland/smock';
import { TransactionResponse } from '@ethersproject/abstract-provider';

chai.use(smock.matchers);

contract('DCAHubCompanionMulticallHandler', () => {
  let DCAPermissionManager: FakeContract<IDCAPermissionManager>;
  let DCAHub: FakeContract<IDCAHub>;
  let erc20Token: FakeContract<IERC20>;
  let DCAHubCompanionMulticallHandler: DCAHubCompanionMulticallHandlerMock;
  let snapshotId: string;

  before('Setup accounts and contracts', async () => {
    const DCAHubCompanionMulticallHandlerFactory: DCAHubCompanionMulticallHandlerMock__factory = await ethers.getContractFactory(
      'contracts/mocks/DCAHubCompanion/DCAHubCompanionMulticallHandler.sol:DCAHubCompanionMulticallHandlerMock'
    );
    DCAPermissionManager = await smock.fake('IDCAPermissionManager');
    DCAHub = await smock.fake('IDCAHub');
    erc20Token = await smock.fake('IERC20');
    DCAHubCompanionMulticallHandler = await DCAHubCompanionMulticallHandlerFactory.deploy(DCAHub.address, DCAPermissionManager.address);
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
    DCAPermissionManager.hasPermission.reset();
    DCAHub.deposit.reset();
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

  proxyTest({
    method: 'withdrawSwappedProxy',
    hubMethod: 'withdrawSwapped',
    permission: Permission.WITHDRAW,
    params: [10, constants.NOT_ZERO_ADDRESS],
  });

  proxyTest({
    method: 'withdrawSwappedManyProxy',
    hubMethod: 'withdrawSwappedMany',
    permission: Permission.WITHDRAW,
    params: [[{ token: constants.NOT_ZERO_ADDRESS, positionIds: [1] }], constants.NOT_ZERO_ADDRESS],
    compare: (result, [positions, recipient]) =>
      result._positions.length === positions.length &&
      result._positions[0].token === positions[0].token &&
      result._positions[0].positionIds.length === positions[0].positionIds.length &&
      result._positions[0].positionIds[0].toNumber() === positions[0].positionIds[0] &&
      result._recipient === recipient,
  });

  proxyTest({
    method: 'increasePositionProxy',
    hubMethod: 'increasePosition',
    permission: Permission.INCREASE,
    params: [10, 20, 30],
  });

  proxyTest({
    method: 'reducePositionProxy',
    hubMethod: 'reducePosition',
    permission: Permission.REDUCE,
    params: [10, 20, 30, constants.NOT_ZERO_ADDRESS],
  });

  proxyTest({
    method: 'terminateProxy',
    hubMethod: 'terminate',
    permission: Permission.TERMINATE,
    params: [10, constants.NOT_ZERO_ADDRESS, constants.NOT_ZERO_ADDRESS],
  });

  function proxyTest<
    ProxyMethod extends keyof DCAHubCompanionMulticallHandlerMock['functions'] & string,
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
    params: Parameters<DCAHubCompanionMulticallHandlerMock['functions'][ProxyMethod]>;
    hubMethod: HubMethod;
    compare?: (result: any, expected: Parameters<DCAHubCompanionMulticallHandlerMock['functions'][ProxyMethod]>) => boolean;
  }) {
    describe(method, () => {
      when('method is executed', () => {
        given(async () => {
          DCAPermissionManager.hasPermission.returns(({ _permission }: { _permission: Permission }) => permission === _permission);
          await (DCAHubCompanionMulticallHandler[method] as any)(...params);
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
          const result: Promise<TransactionResponse> = (DCAHubCompanionMulticallHandler[method] as any)(...params);
          await expect(result).to.be.revertedWith('UnauthorizedCaller');
        });
      });
    });
  }
});
