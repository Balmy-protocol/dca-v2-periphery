import chai, { expect } from 'chai';
import { ethers } from 'hardhat';
import { behaviours, constants, wallet } from '@test-utils';
import { contract, given, then, when } from '@test-utils/bdd';
import { snapshot } from '@test-utils/evm';
import { DCAKeep3rJob, DCAKeep3rJob__factory, IKeep3r, ISwapper } from '@typechained';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { TransactionResponse } from '@ethersproject/providers';
import { FakeContract, smock } from '@defi-wonderland/smock';
import { BigNumber, BigNumberish, BytesLike, Wallet } from 'ethers';
import { _TypedDataEncoder } from 'ethers/lib/utils';
import { fromRpcSig } from 'ethereumjs-util';

chai.use(smock.matchers);

contract('DCAKeep3rJob', () => {
  let superAdmin: SignerWithAddress, canSign: SignerWithAddress, random: SignerWithAddress;
  let DCAKeep3rJob: DCAKeep3rJob;
  let DCAKeep3rJobFactory: DCAKeep3rJob__factory;
  let keep3r: FakeContract<IKeep3r>;
  let swapper: FakeContract<ISwapper>;
  let superAdminRole: string, canSignRole: string;
  let chainId: BigNumber;
  let snapshotId: string;

  before('Setup accounts and contracts', async () => {
    [, superAdmin, canSign, random] = await ethers.getSigners();
    keep3r = await smock.fake('IKeep3r');
    swapper = await smock.fake('ISwapper');
    DCAKeep3rJobFactory = await ethers.getContractFactory('DCAKeep3rJob');
    DCAKeep3rJob = await DCAKeep3rJobFactory.deploy(keep3r.address, swapper.address, superAdmin.address, [canSign.address]);
    chainId = BigNumber.from((await ethers.provider.getNetwork()).chainId);
    superAdminRole = await DCAKeep3rJob.SUPER_ADMIN_ROLE();
    canSignRole = await DCAKeep3rJob.CAN_SIGN_ROLE();
    snapshotId = await snapshot.take();
  });

  beforeEach('Deploy and configure', async () => {
    await snapshot.revert(snapshotId);
    keep3r.isKeeper.reset();
    keep3r.worked.reset();
    swapper.swap.reset();
  });

  describe('constructor', () => {
    when('keep3r is zero address', () => {
      then('tx is reverted with reason error', async () => {
        await behaviours.deployShouldRevertWithMessage({
          contract: DCAKeep3rJobFactory,
          args: [constants.ZERO_ADDRESS, swapper.address, superAdmin.address, [canSign.address]],
          message: 'ZeroAddress',
        });
      });
    });
    when('swapper is zero address', () => {
      then('tx is reverted with reason error', async () => {
        await behaviours.deployShouldRevertWithMessage({
          contract: DCAKeep3rJobFactory,
          args: [keep3r.address, constants.ZERO_ADDRESS, superAdmin.address, [canSign.address]],
          message: 'ZeroAddress',
        });
      });
    });
    when('super admin is zero address', () => {
      then('tx is reverted with reason error', async () => {
        await behaviours.deployShouldRevertWithMessage({
          contract: DCAKeep3rJobFactory,
          args: [keep3r.address, swapper.address, constants.ZERO_ADDRESS, [canSign.address]],
          message: 'ZeroAddress',
        });
      });
    });
    when('contract is initiated', () => {
      then('super admin is set correctly', async () => {
        const hasRole = await DCAKeep3rJob.hasRole(superAdminRole, superAdmin.address);
        expect(hasRole).to.be.true;
      });
      then('initial signers are set correctly', async () => {
        const hasRole = await DCAKeep3rJob.hasRole(canSignRole, canSign.address);
        expect(hasRole).to.be.true;
      });
      then('super admin role is set as admin for super admin role', async () => {
        const admin = await DCAKeep3rJob.getRoleAdmin(superAdminRole);
        expect(admin).to.equal(superAdminRole);
      });
      then('super admin role is set as admin for can sign role role', async () => {
        const admin = await DCAKeep3rJob.getRoleAdmin(canSignRole);
        expect(admin).to.equal(superAdminRole);
      });
      then('keep3r is set correctly', async () => {
        const keep3rAddress = await DCAKeep3rJob.keep3r();
        expect(keep3rAddress).to.equal(keep3r.address);
      });
      then('swapper is set correctly', async () => {
        const { swapper: swapperAddress } = await DCAKeep3rJob.swapperAndNonce();
        expect(swapperAddress).to.equal(swapper.address);
      });
      then('nonce starts at 0', async () => {
        const { nonce } = await DCAKeep3rJob.swapperAndNonce();
        expect(nonce).to.equal(constants.ZERO);
      });
      then('domain separator is the expected', async () => {
        expect(await DCAKeep3rJob.DOMAIN_SEPARATOR()).to.equal(
          await domainSeparator('Mean Finance - DCA Keep3r Job', '1', chainId, DCAKeep3rJob.address)
        );
      });
    });
  });
  describe('setSwapper', () => {
    when('zero address is sent', () => {
      then('reverts with message', async () => {
        await behaviours.txShouldRevertWithMessage({
          contract: DCAKeep3rJob.connect(superAdmin),
          func: 'setSwapper',
          args: [constants.ZERO_ADDRESS],
          message: 'ZeroAddress',
        });
      });
    });
    when('a valid address is sent', () => {
      const NEW_SWAPPER = constants.NOT_ZERO_ADDRESS;
      let tx: TransactionResponse;
      given(async () => {
        tx = await DCAKeep3rJob.connect(superAdmin).setSwapper(NEW_SWAPPER);
      });
      then('it is set correctly', async () => {
        const { swapper } = await DCAKeep3rJob.swapperAndNonce();
        expect(swapper).to.equal(NEW_SWAPPER);
      });
      then('nonce is not modified', async () => {
        const { nonce } = await DCAKeep3rJob.swapperAndNonce();
        expect(nonce).to.equal(constants.ZERO);
      });
      then('event is emitted', async () => {
        await expect(tx).to.emit(DCAKeep3rJob, 'NewSwapperSet').withArgs(NEW_SWAPPER);
      });
    });
    behaviours.shouldBeExecutableOnlyByRole({
      contract: () => DCAKeep3rJob,
      funcAndSignature: 'setSwapper',
      params: () => [constants.NOT_ZERO_ADDRESS],
      role: () => superAdminRole,
      addressWithRole: () => superAdmin,
    });
  });
  describe('work', () => {
    const TOKEN_IN = '0x0000000000000000000000000000000000000001';
    const AMOUNT_IN = 123456;
    const TOKEN_OUT = '0x0000000000000000000000000000000000000002';
    let callData: string;
    given(async () => {
      const tx = await swapper.populateTransaction.swap(TOKEN_IN, AMOUNT_IN, TOKEN_OUT);
      callData = tx.data!;
    });

    workFailsTest({
      when: 'caller is not a keep3r',
      signer: () => canSign,
      callerIsNotAKeeper: true,
      txFailsWith: 'NotAKeeper',
    });
    workFailsTest({
      when: 'chain id is invalid',
      signer: () => canSign,
      chainId: 69,
      txFailsWith: 'SignerCannotSignWork',
    });
    workFailsTest({
      when: 'swapper is invalid',
      signer: () => canSign,
      swapper: constants.ZERO_ADDRESS,
      txFailsWith: 'SignerCannotSignWork',
    });
    workFailsTest({
      when: 'call is invalid',
      signer: () => canSign,
      data: '0x',
      txFailsWith: 'SignerCannotSignWork',
    });
    workFailsTest({
      when: 'nonce is invalid',
      signer: () => canSign,
      nonce: 10,
      txFailsWith: 'SignerCannotSignWork',
    });
    workFailsTest({
      when: 'signer is not allowed to sign',
      signer: () => random,
      txFailsWith: 'SignerCannotSignWork',
    });

    when('work is called correctly', () => {
      let keeper: Wallet;
      given(async () => {
        const { v, r, s } = await getSignature({
          signer: canSign,
          swapper: swapper.address,
          data: callData,
          nonce: 0,
          chainId,
        });
        keep3r.isKeeper.returns(true);
        keeper = await wallet.generateRandom();
        await DCAKeep3rJob.connect(keeper).work(callData, v, r, s);
      });
      then('keeper check was executed corrctly', () => {
        expect(keep3r.isKeeper).to.have.been.calledOnceWith(keeper.address);
      });
      then('nonce is increased', async () => {
        const { nonce } = await DCAKeep3rJob.swapperAndNonce();
        expect(nonce).to.equal(1);
      });
      then('swapper is called correctly', async () => {
        expect(swapper.swap).to.have.been.calledOnceWith(TOKEN_IN, AMOUNT_IN, TOKEN_OUT);
      });
      then('worked is called correctly', () => {
        expect(keep3r.worked).to.have.been.calledOnceWith(keeper.address);
      });
    });

    function workFailsTest({
      when: title,
      signer,
      txFailsWith,
      callerIsNotAKeeper,
      ...call
    }: {
      when: string;
      signer: () => SignerWithAddress;
      callerIsNotAKeeper?: boolean;
      txFailsWith: string;
    } & Partial<Omit<OperationData, 'signer'>>) {
      when(title, () => {
        given(() => keep3r.isKeeper.returns(!callerIsNotAKeeper));
        then('reverts with message', async () => {
          const { v, r, s } = await getSignature({
            signer: signer(),
            swapper: swapper.address,
            data: call.data ?? callData,
            nonce: 0,
            chainId,
            ...call,
          });
          await behaviours.txShouldRevertWithMessage({
            contract: DCAKeep3rJob,
            func: 'work',
            args: [callData, v, r, s],
            message: txFailsWith,
          });
        });
      });
    }

    const Work = [
      { name: 'swapper', type: 'address' },
      { name: 'data', type: 'bytes' },
      { name: 'nonce', type: 'uint256' },
    ];

    async function getSignature(options: OperationData) {
      const { domain, types, value } = buildWorkData(options);
      const signature = await options.signer._signTypedData(domain, types, value);
      return fromRpcSig(signature);
    }

    function buildWorkData(options: OperationData) {
      return {
        primaryType: 'Work',
        types: { Work },
        domain: { name: 'Mean Finance - DCA Keep3r Job', version: '1', chainId: options.chainId, verifyingContract: DCAKeep3rJob.address },
        value: { swapper: options.swapper, data: options.data, nonce: options.nonce },
      };
    }

    type OperationData = {
      signer: SignerWithAddress;
      swapper: string;
      data: BytesLike;
      nonce: BigNumberish;
      chainId: BigNumberish;
    };
  });

  const EIP712Domain = [
    { name: 'name', type: 'string' },
    { name: 'version', type: 'string' },
    { name: 'chainId', type: 'uint256' },
    { name: 'verifyingContract', type: 'address' },
  ];

  async function domainSeparator(name: string, version: string, chainId: BigNumber, verifyingContract: string) {
    return _TypedDataEncoder.hashStruct('EIP712Domain', { EIP712Domain }, { name, version, chainId, verifyingContract });
  }
});
