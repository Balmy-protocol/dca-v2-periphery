import chai, { expect } from 'chai';
import { ethers } from 'hardhat';
import { contract, given, then, when } from '@test-utils/bdd';
import { snapshot } from '@test-utils/evm';
import {
  DCAFeeManagerMock,
  DCAFeeManagerMock__factory,
  IDCAHub,
  IERC20,
  WrappedPlatformTokenMock,
  WrappedPlatformTokenMock__factory,
} from '@typechained';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { duration } from 'moment';
import { behaviours, wallet } from '@test-utils';
import { readArgFromEventOrFail } from '@test-utils/event-utils';
import { TransactionResponse } from '@ethersproject/providers';
import { IDCAFeeManager } from '@typechained/DCAFeeManager';
import { FakeContract, smock } from '@defi-wonderland/smock';
import { BigNumber, constants, utils } from 'ethers';

chai.use(smock.matchers);

contract('DCAFeeManager', () => {
  const TOKEN_A = '0x0000000000000000000000000000000000000010';
  const TOKEN_B = '0x0000000000000000000000000000000000000011';
  const MAX_SHARES = 10000;
  const SWAP_INTERVAL = duration(1, 'day').asSeconds();
  let wToken: WrappedPlatformTokenMock;
  let DCAHub: FakeContract<IDCAHub>;
  let DCAFeeManager: DCAFeeManagerMock;
  let DCAFeeManagerFactory: DCAFeeManagerMock__factory;
  let erc20Token: FakeContract<IERC20>;
  let random: SignerWithAddress, governor: SignerWithAddress;
  let snapshotId: string;

  before('Setup accounts and contracts', async () => {
    [random, governor] = await ethers.getSigners();
    const wTokenFactory: WrappedPlatformTokenMock__factory = await ethers.getContractFactory(
      'contracts/mocks/WrappedPlatformTokenMock.sol:WrappedPlatformTokenMock'
    );
    DCAHub = await smock.fake('IDCAHub');
    erc20Token = await smock.fake('IERC20');
    wToken = await wTokenFactory.deploy('WETH', 'WETH', 18);
    await setPlatformTokenBalance(wToken, utils.parseEther('100'));
    DCAFeeManagerFactory = await ethers.getContractFactory('contracts/mocks/DCAFeeManager/DCAFeeManager.sol:DCAFeeManagerMock');
    DCAFeeManager = await DCAFeeManagerFactory.deploy(DCAHub.address, wToken.address, governor.address);
    snapshotId = await snapshot.take();
  });

  beforeEach(async () => {
    await snapshot.revert(snapshotId);
    DCAHub.platformBalance.reset();
    DCAHub.withdrawSwappedMany.reset();
    DCAHub['deposit(address,address,uint256,uint32,uint32,address,(address,uint8[])[])'].reset();
    DCAHub.increasePosition.reset();
    erc20Token.allowance.reset();
    erc20Token.approve.reset();
  });

  describe('constructor', () => {
    when('contract is initiated', () => {
      then('hub is set correctly', async () => {
        expect(await DCAFeeManager.hub()).to.equal(DCAHub.address);
      });
      then('max token total share is set correctly', async () => {
        expect(await DCAFeeManager.MAX_TOKEN_TOTAL_SHARE()).to.equal(MAX_SHARES);
      });
      then('swap interval is set to daily', async () => {
        expect(await DCAFeeManager.SWAP_INTERVAL()).to.equal(SWAP_INTERVAL);
      });
      then('wToken is set correctly', async () => {
        expect(await DCAFeeManager.wToken()).to.equal(wToken.address);
      });
    });
  });

  describe('withdrawProtocolToken', () => {
    const RECIPIENT = wallet.generateRandomAddress();
    when('platform balance is zero', () => {
      given(async () => {
        DCAHub.platformBalance.returns(0);
        await DCAFeeManager.connect(governor).withdrawProtocolToken([], RECIPIENT);
      });
      then('no withdraw is made from the platform balance', () => {
        expect(DCAHub.withdrawFromPlatformBalance).to.have.not.have.been.called;
      });
    });
    when('the position ids list is empty', () => {
      given(async () => {
        await DCAFeeManager.connect(governor).withdrawProtocolToken([], RECIPIENT);
      });
      then('no withdraw is executed', () => {
        expect(DCAHub.withdrawSwappedMany).to.have.not.have.been.called;
      });
    });
    when('all sources have balance', () => {
      const PLATFORM_BALANCE = utils.parseEther('1');
      const POSITION_IDS = [1, 2, 3].map(BigNumber.from);
      const TOTAL_BALANCE = utils.parseEther('1');
      given(async () => {
        DCAHub.platformBalance.returns(PLATFORM_BALANCE);
        await wToken.mint(DCAFeeManager.address, TOTAL_BALANCE);
        await DCAFeeManager.connect(governor).withdrawProtocolToken(POSITION_IDS, RECIPIENT);
      });
      then('platform balance is withdrawn', () => {
        expect(DCAHub.withdrawFromPlatformBalance).to.have.have.been.calledOnce;
        const [amountToWithdraw] = DCAHub.withdrawFromPlatformBalance.getCall(0).args as { token: string; amount: BigNumber }[][];
        expect(amountToWithdraw).to.have.lengthOf(1);
        expect(amountToWithdraw[0].token).to.equal(wToken.address);
        expect(amountToWithdraw[0].amount).to.equal(PLATFORM_BALANCE);
      });
      then('swapped balance is withdrawn from positions', () => {
        expect(DCAHub.withdrawSwappedMany).to.have.have.been.calledOnce;
        const [amountToWithdraw] = DCAHub.withdrawSwappedMany.getCall(0).args as { token: string; positionIds: BigNumber[] }[][];
        expect(amountToWithdraw).to.have.lengthOf(1);
        expect(amountToWithdraw[0].token).to.equal(wToken.address);
        expect(amountToWithdraw[0].positionIds).to.eql(POSITION_IDS);
      });
      then('total balance is unwrapped and sent to the recipient', async () => {
        expect(await wToken.balanceOf(DCAFeeManager.address)).to.equal(0);
        expect(await getPlatformBalance(RECIPIENT)).to.equal(TOTAL_BALANCE);
      });
    });
    shouldOnlyBeExecutableByGovernorOrAllowed({
      funcAndSignature: 'withdrawProtocolToken',
      params: [[], RECIPIENT],
    });
  });

  describe('fillPositions', () => {
    const AMOUNT_OF_SWAPS = 10;
    const FULL_AMOUNT = utils.parseEther('1');
    const DISTRIBUTION = [
      { token: TOKEN_A, shares: MAX_SHARES / 2 },
      { token: TOKEN_B, shares: MAX_SHARES / 2 },
    ];
    const POSITION_ID_TOKEN_A = 1;
    const POSITION_ID_TOKEN_B = 2;
    when('allowance is zero', () => {
      given(async () => {
        erc20Token.allowance.returns(0);
        await DCAFeeManager.connect(governor).fillPositions(
          [{ token: erc20Token.address, amount: FULL_AMOUNT, amountOfSwaps: AMOUNT_OF_SWAPS }],
          DISTRIBUTION
        );
      });
      then('full allowance is set', () => {
        expect(erc20Token.approve).to.have.been.calledOnceWith(DCAHub.address, constants.MaxUint256);
      });
    });
    when('there is no position created', () => {
      describe('and deposit fails', () => {
        given(async () => {
          DCAHub['deposit(address,address,uint256,uint32,uint32,address,(address,uint8[])[])'].revertsAtCall(0);
          DCAHub['deposit(address,address,uint256,uint32,uint32,address,(address,uint8[])[])'].returnsAtCall(1, POSITION_ID_TOKEN_B);
          await DCAFeeManager.connect(governor).fillPositions(
            [{ token: erc20Token.address, amount: FULL_AMOUNT, amountOfSwaps: AMOUNT_OF_SWAPS }],
            DISTRIBUTION
          );
        });
        then('full amount is spent on last target token', () => {
          expect(DCAHub['deposit(address,address,uint256,uint32,uint32,address,(address,uint8[])[])']).to.have.been.calledTwice;
          expect(DCAHub['deposit(address,address,uint256,uint32,uint32,address,(address,uint8[])[])']).to.have.been.calledWith(
            erc20Token.address,
            TOKEN_B,
            FULL_AMOUNT,
            AMOUNT_OF_SWAPS,
            SWAP_INTERVAL,
            DCAFeeManager.address,
            []
          );
        });
        then('position is stored for the pair', async () => {
          const key = await DCAFeeManager.getPositionKey(erc20Token.address, TOKEN_B);
          expect(await DCAFeeManager.positions(key)).to.equal(POSITION_ID_TOKEN_B);
        });
      });
      describe('and deposit works', () => {
        given(async () => {
          DCAHub['deposit(address,address,uint256,uint32,uint32,address,(address,uint8[])[])'].returnsAtCall(0, POSITION_ID_TOKEN_A);
          DCAHub['deposit(address,address,uint256,uint32,uint32,address,(address,uint8[])[])'].returnsAtCall(1, POSITION_ID_TOKEN_B);
          await DCAFeeManager.connect(governor).fillPositions(
            [{ token: erc20Token.address, amount: FULL_AMOUNT, amountOfSwaps: AMOUNT_OF_SWAPS }],
            DISTRIBUTION
          );
        });
        then('deposit with token A is made correctly', () => {
          expect(DCAHub['deposit(address,address,uint256,uint32,uint32,address,(address,uint8[])[])']).to.have.been.calledWith(
            erc20Token.address,
            TOKEN_A,
            FULL_AMOUNT.div(2),
            AMOUNT_OF_SWAPS,
            SWAP_INTERVAL,
            DCAFeeManager.address,
            []
          );
        });
        then('deposit with token B is made correctly', () => {
          expect(DCAHub['deposit(address,address,uint256,uint32,uint32,address,(address,uint8[])[])']).to.have.been.calledWith(
            erc20Token.address,
            TOKEN_B,
            FULL_AMOUNT.div(2),
            AMOUNT_OF_SWAPS,
            SWAP_INTERVAL,
            DCAFeeManager.address,
            []
          );
        });
        then('there were only two deposits made', () => {
          expect(DCAHub['deposit(address,address,uint256,uint32,uint32,address,(address,uint8[])[])']).to.have.been.calledTwice;
        });
        then('position is stored for the pair with token A', async () => {
          const key = await DCAFeeManager.getPositionKey(erc20Token.address, TOKEN_A);
          expect(await DCAFeeManager.positions(key)).to.equal(POSITION_ID_TOKEN_A);
        });
        then('position is stored for the pair with token B', async () => {
          const key = await DCAFeeManager.getPositionKey(erc20Token.address, TOKEN_B);
          expect(await DCAFeeManager.positions(key)).to.equal(POSITION_ID_TOKEN_B);
        });
      });
    });

    when('there is a position created', () => {
      given(async () => {
        await DCAFeeManager.setPosition(erc20Token.address, TOKEN_A, POSITION_ID_TOKEN_A);
        await DCAFeeManager.setPosition(erc20Token.address, TOKEN_B, POSITION_ID_TOKEN_B);
      });
      describe('and increase fails', () => {
        given(async () => {
          DCAHub.increasePosition.revertsAtCall(0);
          await DCAFeeManager.connect(governor).fillPositions(
            [{ token: erc20Token.address, amount: FULL_AMOUNT, amountOfSwaps: AMOUNT_OF_SWAPS }],
            DISTRIBUTION
          );
        });
        then('full amount is spent on last target token', () => {
          expect(DCAHub.increasePosition).to.have.been.calledTwice;
          expect(DCAHub.increasePosition).to.have.been.calledWith(POSITION_ID_TOKEN_B, FULL_AMOUNT, AMOUNT_OF_SWAPS);
        });
      });
      describe('and increase works', () => {
        given(async () => {
          await DCAFeeManager.connect(governor).fillPositions(
            [{ token: erc20Token.address, amount: FULL_AMOUNT, amountOfSwaps: AMOUNT_OF_SWAPS }],
            DISTRIBUTION
          );
        });
        then('increase with token A is made correctly', () => {
          expect(DCAHub.increasePosition).to.have.been.calledWith(POSITION_ID_TOKEN_A, FULL_AMOUNT.div(2), AMOUNT_OF_SWAPS);
        });
        then('increase with token B is made correctly', () => {
          expect(DCAHub.increasePosition).to.have.been.calledWith(POSITION_ID_TOKEN_B, FULL_AMOUNT.div(2), AMOUNT_OF_SWAPS);
        });
        then('there were only two increases made', () => {
          expect(DCAHub.increasePosition).to.have.been.calledTwice;
        });
      });
    });

    shouldOnlyBeExecutableByGovernorOrAllowed({
      funcAndSignature: 'fillPositions',
      params: () => [[{ token: erc20Token.address, amount: FULL_AMOUNT, amountOfSwaps: AMOUNT_OF_SWAPS }], DISTRIBUTION],
    });
  });

  describe('setAccess', () => {
    const USER = wallet.generateRandomAddress();
    when('giving access to a user', () => {
      let tx: TransactionResponse;
      given(async () => {
        tx = await DCAFeeManager.connect(governor).setAccess([{ user: USER, access: true }]);
      });
      then('user has access', async () => {
        expect(await DCAFeeManager.hasAccess(USER)).to.be.true;
      });
      then('event is emitted', async () => {
        await expect(tx).to.emit(DCAFeeManager, 'NewAccess');
        // Can't compare array of objects directly, so will read the arg and compare manually
        const access: IDCAFeeManager.UserAccessStruct[] = await readArgFromEventOrFail(tx, 'NewAccess', 'access');
        expect(access).to.have.lengthOf(1);
        expect(access[0].user).to.equal(USER);
        expect(access[0].access).to.equal(true);
      });
    });
    when('taking access from a user', () => {
      let tx: TransactionResponse;
      given(async () => {
        await DCAFeeManager.connect(governor).setAccess([{ user: USER, access: true }]);
        tx = await DCAFeeManager.connect(governor).setAccess([{ user: USER, access: false }]);
      });
      then('user lost access', async () => {
        expect(await DCAFeeManager.hasAccess(USER)).to.be.false;
      });
      then('event is emitted', async () => {
        await expect(tx).to.emit(DCAFeeManager, 'NewAccess');
        // Can't compare array of objects directly, so will read the arg and compare manually
        const access: IDCAFeeManager.UserAccessStruct[] = await readArgFromEventOrFail(tx, 'NewAccess', 'access');
        expect(access).to.have.lengthOf(1);
        expect(access[0].user).to.equal(USER);
        expect(access[0].access).to.equal(false);
      });
    });
    behaviours.shouldBeExecutableOnlyByGovernor({
      contract: () => DCAFeeManager,
      funcAndSignature: 'setAccess',
      params: () => [[{ user: random.address, access: true }]],
      governor: () => governor,
    });
  });

  function shouldOnlyBeExecutableByGovernorOrAllowed({
    funcAndSignature,
    params,
  }: {
    funcAndSignature: string;
    params?: any[] | (() => any[]);
  }) {
    let realParams: any[];
    given(() => {
      realParams = typeof params === 'function' ? params() : params ?? [];
    });
    when('called from allowed', () => {
      let onlyAllowed: Promise<TransactionResponse>;
      given(async () => {
        await DCAFeeManager.connect(governor).setAccess([{ user: random.address, access: true }]);
        onlyAllowed = (DCAFeeManager as any).connect(random)[funcAndSignature](...realParams!);
      });
      then(`tx is not reverted or not reverted with reason 'CallerMustBeOwnerOrHaveAccess'`, async () => {
        await expect(onlyAllowed).to.not.be.revertedWith('CallerMustBeOwnerOrHaveAccess');
      });
    });
    when('called by governor', () => {
      let onlyGovernor: Promise<TransactionResponse>;
      given(async () => {
        onlyGovernor = (DCAFeeManager as any).connect(governor)[funcAndSignature](...realParams!);
      });
      then(`tx is not reverted or not reverted with reason 'CallerMustBeOwnerOrHaveAccess'`, async () => {
        await expect(onlyGovernor).to.not.be.revertedWith('CallerMustBeOwnerOrHaveAccess');
      });
    });
    when('not called from allowed or governor', () => {
      let onlyGovernorAllowedTx: Promise<TransactionResponse>;
      given(async () => {
        const notAllowed = await wallet.generateRandom();
        onlyGovernorAllowedTx = (DCAFeeManager as any).connect(notAllowed)[funcAndSignature](...realParams!);
      });
      then('tx is reverted with reason', async () => {
        await expect(onlyGovernorAllowedTx).to.be.revertedWith('CallerMustBeOwnerOrHaveAccess');
      });
    });
  }

  function getPlatformBalance(address: string) {
    return ethers.provider.getBalance(address);
  }

  async function setPlatformTokenBalance(recipient: { address: string }, amount: BigNumber) {
    await ethers.provider.send('hardhat_setBalance', [recipient.address, ethers.utils.hexValue(amount)]);
    return BigNumber.from(amount);
  }
});
