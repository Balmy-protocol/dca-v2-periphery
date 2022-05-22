import chai, { expect } from 'chai';
import { ethers } from 'hardhat';
import { contract, given, then, when } from '@test-utils/bdd';
import { snapshot } from '@test-utils/evm';
import { DCAFeeManager, DCAFeeManager__factory, IDCAHub, WrappedPlatformTokenMock, WrappedPlatformTokenMock__factory } from '@typechained';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { duration } from 'moment';
import { behaviours, wallet } from '@test-utils';
import { readArgFromEventOrFail } from '@test-utils/event-utils';
import { TransactionResponse } from '@ethersproject/providers';
import { IDCAFeeManager } from '@typechained/DCAFeeManager';
import { FakeContract, smock } from '@defi-wonderland/smock';
import { BigNumber, utils } from 'ethers';

chai.use(smock.matchers);

contract('DCAFeeManager', () => {
  const TOKEN_A = '0x0000000000000000000000000000000000000010';
  const TOKEN_B = '0x0000000000000000000000000000000000000011';
  const TOKEN_C = '0x0000000000000000000000000000000000000012';
  const MAX_SHARES = 10000;
  let wToken: WrappedPlatformTokenMock;
  let DCAHub: FakeContract<IDCAHub>;
  let DCAFeeManager: DCAFeeManager;
  let DCAFeeManagerFactory: DCAFeeManager__factory;
  let random: SignerWithAddress, governor: SignerWithAddress;
  let snapshotId: string;

  before('Setup accounts and contracts', async () => {
    [random, governor] = await ethers.getSigners();
    const wTokenFactory: WrappedPlatformTokenMock__factory = await ethers.getContractFactory(
      'contracts/mocks/WrappedPlatformTokenMock.sol:WrappedPlatformTokenMock'
    );
    DCAHub = await smock.fake('IDCAHub');
    wToken = await wTokenFactory.deploy('WETH', 'WETH', 18);
    await setPlatformTokenBalance(wToken, utils.parseEther('100'));
    DCAFeeManagerFactory = await ethers.getContractFactory('contracts/DCAFeeManager/DCAFeeManager.sol:DCAFeeManager');
    DCAFeeManager = await DCAFeeManagerFactory.deploy(DCAHub.address, wToken.address, governor.address);
    snapshotId = await snapshot.take();
  });

  beforeEach(async () => {
    await snapshot.revert(snapshotId);
    DCAHub.platformBalance.reset();
    DCAHub.withdrawSwappedMany.reset();
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
        expect(await DCAFeeManager.SWAP_INTERVAL()).to.equal(duration(1, 'day').asSeconds());
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
