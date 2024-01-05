import chai, { expect } from 'chai';
import { ethers } from 'hardhat';
import { behaviours, constants } from '@test-utils';
import { contract, given, then, when } from '@test-utils/bdd';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { snapshot } from '@test-utils/evm';
import { IERC20, ISwapper, ThirdPartyDCAHubSwapper, ThirdPartyDCAHubSwapper__factory, IDCAHubWithAccessControl } from '@typechained';
import { FakeContract, smock } from '@defi-wonderland/smock';
import { BigNumberish } from '@ethersproject/bignumber';
import { BytesLike } from '@ethersproject/bytes';
import { TransactionResponse } from '@ethersproject/abstract-provider';
import { utils } from 'ethers';

chai.use(smock.matchers);

contract('ThirdPartyDCAHubSwapper', () => {
  const ABI_CODER = new utils.AbiCoder();
  let recipient: SignerWithAddress, hub: SignerWithAddress, caller: SignerWithAddress;
  let DCAHubSwapper: ThirdPartyDCAHubSwapper;
  let token: FakeContract<IERC20>, intermediateToken: FakeContract<IERC20>, dcaHub: FakeContract<IDCAHubWithAccessControl>;
  let snapshotId: string;

  before(async () => {
    [recipient, hub, caller] = await ethers.getSigners();
    const DCAHubSwapperFactory: ThirdPartyDCAHubSwapper__factory = await ethers.getContractFactory('ThirdPartyDCAHubSwapper');
    DCAHubSwapper = await DCAHubSwapperFactory.deploy();
    token = await smock.fake('IERC20');
    intermediateToken = await smock.fake('IERC20');
    dcaHub = await smock.fake('contracts/DCAHubSwapper/ThirdPartyDCAHubSwapper.sol:IDCAHubWithAccessControl');
    snapshotId = await snapshot.take();
  });

  beforeEach('Deploy and configure', async () => {
    await snapshot.revert(snapshotId);
    token.transfer.reset();
    token.balanceOf.reset();
    token.approve.reset();
    token.allowance.reset();
    token.transfer.returns(true);
    token.transferFrom.returns(true);
    token.approve.returns(true);
    intermediateToken.transfer.reset();
    intermediateToken.balanceOf.reset();
    intermediateToken.transfer.returns(true);
    dcaHub.hasRole.reset();
    dcaHub.swap.reset();
  });

  describe('executeSwap', () => {
    when('caller doesnt have privilege', () => {
      given(() => {
        dcaHub.hasRole.returns(false);
      });
      then('tx reverts', async () => {
        await behaviours.txShouldRevertWithMessage({
          contract: DCAHubSwapper,
          func: 'executeSwap',
          args: [dcaHub.address, [], [], [], [], []],
          message: 'NotPrivilegedSwapper',
        });
      });
    });
    when('caller has privilege', () => {
      const TOKENS = ['0x0000000000000000000000000000000000000001', '0x0000000000000000000000000000000000000002'];
      const PAIRS = [{ indexTokenA: 0, indexTokenB: 1 }];
      const BORROW = [0, 0];
      const CALLBACK_DATA = '0x01';
      const ORACLE_DATA = '0x02';
      given(async () => {
        dcaHub.hasRole.returns(true);
        await DCAHubSwapper.connect(caller).executeSwap(dcaHub.address, TOKENS, PAIRS, BORROW, CALLBACK_DATA, ORACLE_DATA);
      });
      then('hub is called correctly', async () => {
        expect(dcaHub.swap).to.have.been.calledOnceWith(
          TOKENS,
          PAIRS,
          DCAHubSwapper.address,
          DCAHubSwapper.address,
          BORROW,
          CALLBACK_DATA,
          ORACLE_DATA
        );
        expect(dcaHub.hasRole).to.have.been.calledOnceWith(await DCAHubSwapper.PRIVILEGED_SWAPPER_ROLE(), caller.address);
      });
    });
  });

  describe('DCAHubSwapCall', () => {
    let swapper: FakeContract<ISwapper>;
    let swapExecution: BytesLike;
    given(async () => {
      swapper = await smock.fake('ISwapper');
      const { data } = await swapper.populateTransaction.swap(token.address, 1000, token.address);
      swapExecution = data!;
    });

    describe('deadline', () => {
      when('deadline has expired', () => {
        then('reverts with message', async () => {
          const data = encode({ deadline: 0 });
          await behaviours.txShouldRevertWithMessage({
            contract: DCAHubSwapper,
            func: 'DCAHubSwapCall',
            args: [constants.ZERO_ADDRESS, [], [], data],
            message: 'TransactionTooOld',
          });
        });
      });
    });

    describe('allowances', () => {
      const ACCOUNT = '0x0000000000000000000000000000000000000010';

      allowanceTest({
        when: 'current allowance is enough',
        then: 'approve is not called',
        allowance: 100,
        needed: 5,
        assertion: (token) => expect(token.approve).to.not.have.been.called,
      });

      allowanceTest({
        when: 'need approval and current allowance is zero',
        then: 'approve is called only once',
        allowance: 0,
        needed: 200,
        assertion: (token) => expect(token.approve).to.have.been.calledOnceWith(ACCOUNT, constants.MAX_UINT_256),
      });

      function allowanceTest({
        when: title,
        then: thenTitle,
        allowance,
        needed,
        assertion,
      }: {
        when: string;
        then: string;
        allowance: BigNumberish;
        needed: BigNumberish;
        assertion: (_: FakeContract<IERC20>) => void;
      }) {
        when(title, () => {
          given(async () => {
            token.allowance.returns(allowance);
            const data = encode({ allowanceTargets: [{ token: token.address, spender: ACCOUNT, amount: needed }] });
            await DCAHubSwapper.connect(hub).DCAHubSwapCall(constants.ZERO_ADDRESS, [], [], data);
          });
          then(thenTitle, () => assertion(token));
          then('allowance is checked correctly', () => {
            expect(token.allowance).to.have.been.calledOnceWith(DCAHubSwapper.address, ACCOUNT);
          });
        });
      }
    });

    describe('swaps', () => {
      when('swapper call fails', () => {
        let tx: Promise<TransactionResponse>;
        given(() => {
          swapper.swap.reverts();
          const data = encode({ executions: [{ swapper: swapper.address, data: swapExecution }] });
          tx = DCAHubSwapper.connect(hub).DCAHubSwapCall(constants.ZERO_ADDRESS, [], [], data);
        });
        then('then swap reverts', async () => {
          await expect(tx).to.have.revertedWith('FailedInnerCall');
        });
      });
    });

    describe('leftover tokens', () => {
      leftoverTokensTest({
        when: 'balance is zero',
        then: 'no transfers are executed',
        balance: 0,
        assertion: (token) => expect(token.transfer).to.not.have.been.called,
      });

      leftoverTokensTest({
        when: 'token needs to be provided and hub flag is set',
        then: 'everything is transferred to the hub',
        balance: 12345,
        toProvide: 10000,
        assertion: (token) => expect(token.transfer).to.have.been.calledOnceWith(hub.address, 12345),
      });

      leftoverTokensTest({
        when: 'token is reward (to provide is zero)',
        then: 'everything is transferred to recipient',
        balance: 12345,
        toProvide: 0,
        assertion: (token, recipient) => expect(token.transfer).to.have.been.calledOnceWith(recipient, 12345),
      });

      function leftoverTokensTest({
        when: title,
        then: thenTitle,
        balance,
        toProvide,
        assertion,
      }: {
        when: string;
        then: string;
        balance: BigNumberish;
        toProvide?: BigNumberish;
        assertion: (_: FakeContract<IERC20>, recipient: string) => void;
      }) {
        when(title, () => {
          given(async () => {
            const tokensInSwap = [{ token: token.address, toProvide: toProvide ?? 0, reward: 0, platformFee: 0 }];
            token.balanceOf.returns(balance);
            const data = encode({
              executions: [{ swapper: swapper.address, data: swapExecution }],
            });
            await DCAHubSwapper.connect(hub).DCAHubSwapCall(constants.ZERO_ADDRESS, tokensInSwap, [], data);
          });
          then(thenTitle, () => assertion(token, recipient.address));
          then('balance is called correctly', () => {
            expect(token.balanceOf).to.have.been.calledOnceWith(DCAHubSwapper.address);
          });
          then('swap is executed correctly', () => {
            expect(swapper.swap).to.have.been.calledOnceWith(token.address, 1000, token.address);
          });
        });
      }
    });

    describe('intermediate tokens', () => {
      let data: BytesLike;
      given(() => {
        data = encode({ extraTokens: [intermediateToken.address] });
      });
      when('intermediate token has balance', () => {
        given(async () => {
          intermediateToken.balanceOf.returns(12345);
          await DCAHubSwapper.connect(hub).DCAHubSwapCall(constants.ZERO_ADDRESS, [], [], data);
        });
        then('balance is called correctly', () => {
          expect(intermediateToken.balanceOf).to.have.been.calledOnceWith(DCAHubSwapper.address);
        });
        then('it is transferred', () => {
          expect(intermediateToken.transfer).to.have.been.calledOnceWith(recipient.address, 12345);
        });
      });

      when('intermediate token has no balance', () => {
        given(async () => {
          intermediateToken.balanceOf.returns(0);
          await DCAHubSwapper.connect(hub).DCAHubSwapCall(constants.ZERO_ADDRESS, [], [], data);
        });
        then('balance is called correctly', () => {
          expect(intermediateToken.balanceOf).to.have.been.calledOnceWith(DCAHubSwapper.address);
        });
        then('it is not transferred', () => {
          expect(intermediateToken.transfer).to.not.have.been.called;
        });
      });
    });

    describe('isTest', () => {
      when('executing a test call', () => {
        let tx: Promise<TransactionResponse>;
        given(async () => {
          token.balanceOf.returns(1);
          intermediateToken.balanceOf.returns(2);
          const tokensInSwap = [{ token: token.address, toProvide: 0, reward: 0, platformFee: 0 }];
          const data = encode({ extraTokens: [intermediateToken.address], isTest: true });
          tx = DCAHubSwapper.connect(hub).DCAHubSwapCall(constants.ZERO_ADDRESS, tokensInSwap, [], data);
        });
        then('reports the correct balances', async () => {
          const expectedError = `SwapResults([["${token.address}", 1], ["${intermediateToken.address}", 2]])`;
          await expect(tx).to.have.revertedWith(expectedError);
        });
      });
    });

    type SwapWithDexes = {
      deadline?: BigNumberish;
      allowanceTargets?: { token: string; spender: string; amount: BigNumberish }[];
      executions?: { data: BytesLike; swapper: string }[];
      extraTokens?: string[];
      leftoverRecipient?: { address: string };
      isTest?: boolean;
    };
    function encode(bytes: SwapWithDexes) {
      return ABI_CODER.encode(
        ['tuple(bool, uint256, tuple(address, address, uint256)[], tuple(address, uint256, bytes)[], address[], address)'],
        [
          [
            bytes.isTest ?? false,
            bytes.deadline ?? constants.MAX_UINT_256,
            bytes.allowanceTargets?.map(({ token, spender, amount }) => [token, spender, amount]) ?? [],
            bytes.executions?.map(({ swapper, data }) => [swapper, 0, data]) ?? [],
            bytes.extraTokens ?? [],
            bytes.leftoverRecipient?.address ?? recipient.address,
          ],
        ]
      );
    }
  });
});
