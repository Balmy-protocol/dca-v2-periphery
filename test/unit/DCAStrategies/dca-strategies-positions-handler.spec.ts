import { expect } from 'chai';
import { ethers } from 'hardhat';
import { DCAStrategiesPositionsHandlerMock__factory, DCAStrategiesPositionsHandlerMock, IERC20 } from '@typechained';
import { FakeContract, smock } from '@defi-wonderland/smock';
import { constants } from '@test-utils';
import { given, then, when, contract } from '@test-utils/bdd';
import { snapshot } from '@test-utils/evm';
import { TransactionResponse } from '@ethersproject/abstract-provider';
import { BigNumber } from '@ethersproject/bignumber';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';

contract('DCAStrategiesPositionsHandler', () => {
  let snapshotId: string;
  let DCAStrategiesPositionsHandlerMock: DCAStrategiesPositionsHandlerMock;
  let user: SignerWithAddress, random: SignerWithAddress, governor: SignerWithAddress;
  let factory: DCAStrategiesPositionsHandlerMock__factory;
  let tokenA: FakeContract<IERC20>, tokenB: FakeContract<IERC20>;
  let SHARE_TOKEN_A;
  let SHARE_TOKEN_B;
  let SHARES: any[];
  const NAME = ethers.utils.formatBytes32String('Optimism Ecosystem - v1');
  const MAX_TOKEN_SHARES: number = 5;

  before('Setup accounts and contracts', async () => {
    [user, random, governor] = await ethers.getSigners();
    factory = await ethers.getContractFactory('DCAStrategiesPositionsHandlerMock');
    DCAStrategiesPositionsHandlerMock = await factory.deploy(governor.address, constants.NOT_ZERO_ADDRESS, MAX_TOKEN_SHARES);
    snapshotId = await snapshot.take();
    tokenA = await smock.fake('IERC20');
    tokenB = await smock.fake('IERC20');
    SHARE_TOKEN_A = { token: tokenA.address, share: BigNumber.from(50e2) };
    SHARE_TOKEN_B = { token: tokenB.address, share: BigNumber.from(50e2) };
    SHARES = [SHARE_TOKEN_A, SHARE_TOKEN_B];
  });

  beforeEach(async () => {
    await snapshot.revert(snapshotId);
  });

  describe('deposit', () => {
    let tx: TransactionResponse;
    let toDeposit: BigNumber = ethers.utils.parseUnits('300');
    let amountOfSwaps: number = 5;
    let swapInterval: number = 7 * 24 * 60 * 60; // 1 week

    given(async () => {
      await DCAStrategiesPositionsHandlerMock.createStrategy(NAME, SHARES, random.address);

      tokenA.transferFrom.returns(true);

      tx = await DCAStrategiesPositionsHandlerMock.connect(user).deposit({
        hub: constants.NOT_ZERO_ADDRESS,
        strategyId: 1,
        from: tokenA.address,
        amount: toDeposit,
        amountOfSwaps: amountOfSwaps,
        swapInterval: swapInterval,
        owner: user.address,
        permissions: [],
      });
    });
    when('deposit is called', () => {
      then('NFT position is minted to the owner', async () => {
        expect(await DCAStrategiesPositionsHandlerMock.balanceOf(user.address)).to.be.equal(1);
      });
      then('event is emitted', async () => {
        await expect(tx)
          .to.emit(DCAStrategiesPositionsHandlerMock, 'Deposited')
          .withArgs(user.address, user.address, 1, tokenA.address, 1, 1, swapInterval, []);
      });
    });
  });
});
