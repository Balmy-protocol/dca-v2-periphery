import { expect } from 'chai';
import { ethers } from 'hardhat';
import { behaviours, constants } from '@test-utils';
import { contract, given, then, when } from '@test-utils/bdd';
import { snapshot } from '@test-utils/evm';
import { DCAHubSwapperParametersMock, DCAHubSwapperParametersMock__factory } from '@typechained';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { TransactionResponse } from '@ethersproject/providers';

contract('DCAHubSwapperParameters', () => {
  const HUB = '0x0000000000000000000000000000000000000001';
  const WRAPPED_TOKEN = '0x0000000000000000000000000000000000000003';
  let DCAHubSwapperParameters: DCAHubSwapperParametersMock;
  let DCAHubSwapperParametersFactory: DCAHubSwapperParametersMock__factory;
  let governor: SignerWithAddress;
  let snapshotId: string;

  before('Setup accounts and contracts', async () => {
    [governor] = await ethers.getSigners();
    DCAHubSwapperParametersFactory = await ethers.getContractFactory(
      'contracts/mocks/DCAHubSwapper/DCAHubSwapperParameters.sol:DCAHubSwapperParametersMock'
    );
    DCAHubSwapperParameters = await DCAHubSwapperParametersFactory.deploy(HUB, WRAPPED_TOKEN, governor.address);
    snapshotId = await snapshot.take();
  });

  beforeEach('Deploy and configure', async () => {
    await snapshot.revert(snapshotId);
  });

  describe('constructor', () => {
    when('hub is zero address', () => {
      then('deployment is reverted with reason', async () => {
        await behaviours.deployShouldRevertWithMessage({
          contract: DCAHubSwapperParametersFactory,
          args: [constants.ZERO_ADDRESS, WRAPPED_TOKEN, constants.NOT_ZERO_ADDRESS],
          message: 'ZeroAddress',
        });
      });
    });
    when('wrapped token is zero address', () => {
      then('deployment is reverted with reason', async () => {
        await behaviours.deployShouldRevertWithMessage({
          contract: DCAHubSwapperParametersFactory,
          args: [HUB, constants.ZERO_ADDRESS, constants.NOT_ZERO_ADDRESS],
          message: 'ZeroAddress',
        });
      });
    });
    when('contract is initiated', () => {
      then('hub is set correctly', async () => {
        expect(await DCAHubSwapperParameters.hub()).to.equal(HUB);
      });
      then('wrapped token is set correctly', async () => {
        expect(await DCAHubSwapperParameters.wToken()).to.equal(WRAPPED_TOKEN);
      });
    });
  });

  describe('setTokensWithApprovalIssues', () => {
    when('called with invalid parameters', () => {
      then('reverts with message', async () => {
        await behaviours.txShouldRevertWithMessage({
          contract: DCAHubSwapperParameters,
          func: 'setTokensWithApprovalIssues',
          args: [[WRAPPED_TOKEN], []],
          message: 'InvalidTokenApprovalParams',
        });
      });
    });
    when('adding token with issues', () => {
      let tx: TransactionResponse;
      given(async () => {
        tx = await DCAHubSwapperParameters.setTokensWithApprovalIssues([WRAPPED_TOKEN], [true]);
      });
      then('they are set correctly', async () => {
        expect(await DCAHubSwapperParameters.tokenHasApprovalIssue(WRAPPED_TOKEN)).to.be.true;
      });
      then('event is emitted', async () => {
        await expect(tx).to.emit(DCAHubSwapperParameters, 'TokenWithApprovalIssuesSet').withArgs([WRAPPED_TOKEN], [true]);
      });
    });
    when('removing token with issues', () => {
      let tx: TransactionResponse;
      given(async () => {
        await DCAHubSwapperParameters.setTokensWithApprovalIssues([WRAPPED_TOKEN], [true]);
        tx = await DCAHubSwapperParameters.setTokensWithApprovalIssues([WRAPPED_TOKEN], [false]);
      });
      then('they are set correctly', async () => {
        expect(await DCAHubSwapperParameters.tokenHasApprovalIssue(WRAPPED_TOKEN)).to.be.false;
      });
      then('event is emitted', async () => {
        await expect(tx).to.emit(DCAHubSwapperParameters, 'TokenWithApprovalIssuesSet').withArgs([WRAPPED_TOKEN], [false]);
      });
    });
    behaviours.shouldBeExecutableOnlyByGovernor({
      contract: () => DCAHubSwapperParameters,
      funcAndSignature: 'setTokensWithApprovalIssues',
      params: () => [[WRAPPED_TOKEN], [true]],
      governor: () => governor,
    });
  });
});
