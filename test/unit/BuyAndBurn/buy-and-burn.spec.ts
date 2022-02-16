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
import { utils } from 'ethers';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signers';

chai.use(smock.matchers);

contract('BuyAndBurn', () => {
  describe('constructor', () => {
    when('hub address is zero', () => {
      then('deployment is reverted with reason');
    });
    when('contract is initiated', () => {
      then('hub is set correctly');
    });
  });

  describe('positions', () => {
    when('there is no position', () => {
      then('returns empty array');
    });
    when('there are positions', () => {
      then('returns correct positions');
    });
  });

  describe('withdrawAndBurn', () => {
    when('position is not on buy and burn', () => {
      then('tx is reverted with reason');
    });
    when('position is on buy and burn', () => {
      then('swapped gets taken away from position');
      then('swapped is sent to DEAD');
    });
  });
});
