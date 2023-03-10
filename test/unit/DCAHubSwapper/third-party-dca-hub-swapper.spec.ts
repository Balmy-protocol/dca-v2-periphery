import chai, { expect } from 'chai';
import { ethers } from 'hardhat';
import { behaviours, constants } from '@test-utils';
import { contract, given, then, when } from '@test-utils/bdd';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { snapshot } from '@test-utils/evm';
import { IERC20, ISwapper, ThirdPartyDCAHubSwapper, ThirdPartyDCAHubSwapper__factory } from '@typechained';
import { FakeContract, smock } from '@defi-wonderland/smock';
import { BigNumberish } from '@ethersproject/bignumber';
import { BytesLike } from '@ethersproject/bytes';
import { TransactionResponse } from '@ethersproject/abstract-provider';
import { utils } from 'ethers';

chai.use(smock.matchers);

contract('ThirdPartyDCAHubSwapper', () => {
  const ABI_CODER = new utils.AbiCoder();
  let recipient: SignerWithAddress, hub: SignerWithAddress;
  let DCAHubSwapper: ThirdPartyDCAHubSwapper;
  let token: FakeContract<IERC20>, intermediateToken: FakeContract<IERC20>;
  let snapshotId: string;

  before(async () => {
    [recipient, hub] = await ethers.getSigners();
    const DCAHubSwapperFactory: ThirdPartyDCAHubSwapper__factory = await ethers.getContractFactory('ThirdPartyDCAHubSwapper');
    DCAHubSwapper = await DCAHubSwapperFactory.deploy();
    token = await smock.fake('IERC20');
    intermediateToken = await smock.fake('IERC20');
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
    intermediateToken.transfer.reset();
    intermediateToken.balanceOf.reset();
    intermediateToken.transfer.returns(true);
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
        when: 'need approval but current allowance more than zero',
        then: 'approve is called twice',
        allowance: 100,
        needed: 200,
        assertion: (token) => {
          expect(token.approve).to.have.been.calledTwice;
          expect(token.approve).to.have.been.calledWith(ACCOUNT, 0);
          expect(token.approve).to.have.been.calledWith(ACCOUNT, constants.MAX_UINT_256);
        },
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
          await expect(tx).to.have.revertedWith('Call to swapper failed');
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
        sendToHubFlag: true,
        balance: 12345,
        toProvide: 10000,
        assertion: (token) => expect(token.transfer).to.have.been.calledOnceWith(hub.address, 12345),
      });

      leftoverTokensTest({
        when: 'token needs to be provided but there is no leftover',
        then: 'available balance is sent to the hub only',
        sendToHubFlag: false,
        balance: 12345,
        toProvide: 12345,
        assertion: (token) => expect(token.transfer).to.have.been.calledOnceWith(hub.address, 12345),
      });

      leftoverTokensTest({
        when: 'token needs to be provided and there is some leftover',
        then: 'leftover is sent to the recipient',
        sendToHubFlag: false,
        balance: 12345,
        toProvide: 10000,
        assertion: (token, recipient) => {
          expect(token.transfer).to.have.been.calledTwice;
          expect(token.transfer).to.have.been.calledWith(hub.address, 10000);
          expect(token.transfer).to.have.been.calledWith(recipient, 2345);
        },
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
        sendToHubFlag,
        assertion,
      }: {
        when: string;
        then: string;
        balance: BigNumberish;
        toProvide?: BigNumberish;
        sendToHubFlag?: boolean;
        assertion: (_: FakeContract<IERC20>, recipient: string) => void;
      }) {
        when(title, () => {
          given(async () => {
            const tokensInSwap = [{ token: token.address, toProvide: toProvide ?? 0, reward: 0, platformFee: 0 }];
            token.balanceOf.returns(balance);
            const data = encode({
              executions: [{ swapper: swapper.address, data: swapExecution }],
              sendToProvideLeftoverToHub: sendToHubFlag ?? true,
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

    type SwapWithDexes = {
      deadline?: BigNumberish;
      allowanceTargets?: { token: string; spender: string; amount: BigNumberish }[];
      executions?: { data: BytesLike; swapper: string }[];
      extraTokens?: string[];
      leftoverRecipient?: { address: string };
      sendToProvideLeftoverToHub?: boolean;
    };
    function encode(bytes: SwapWithDexes) {
      return ABI_CODER.encode(
        ['tuple(uint256, tuple(address, address, uint256)[], tuple(address, uint256, bytes)[], address[], address, bool)'],
        [
          [
            bytes.deadline ?? constants.MAX_UINT_256,
            bytes.allowanceTargets?.map(({ token, spender, amount }) => [token, spender, amount]) ?? [],
            bytes.executions?.map(({ swapper, data }) => [swapper, 0, data]) ?? [],
            bytes.extraTokens ?? [],
            bytes.leftoverRecipient?.address ?? recipient.address,
            bytes.sendToProvideLeftoverToHub ?? false,
          ],
        ]
      );
    }
  });
});
