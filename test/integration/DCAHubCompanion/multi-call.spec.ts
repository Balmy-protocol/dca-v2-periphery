import { expect } from 'chai';
import { ethers } from 'hardhat';
import { TransactionResponse } from '@ethersproject/providers';
import { constants, wallet } from '@test-utils';
import { contract, given, then, when } from '@test-utils/bdd';
import evm, { snapshot } from '@test-utils/evm';
import { DCAHubCompanion, DCAHubSwapper, IERC20 } from '@typechained';
import { DCAHub, DCAPermissionsManager } from '@mean-finance/dca-v2-core/typechained';
import { TransformerRegistry } from '@mean-finance/transformers/typechained';
import { SwapperRegistry } from '@mean-finance/swappers/typechained';
import { TransformerOracle } from '@mean-finance/oracles/typechained';
import { abi as DCA_HUB_ABI } from '@mean-finance/dca-v2-core/artifacts/contracts/DCAHub/DCAHub.sol/DCAHub.json';
import { abi as IERC20_ABI } from '@openzeppelin/contracts/build/contracts/IERC20.json';
import { BigNumber, BigNumberish, utils, Wallet } from 'ethers';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { SwapInterval } from '@test-utils/interval-utils';
import forkBlockNumber from '@integration/fork-block-numbers';
import { fromRpcSig } from 'ethereumjs-util';
import { deploy } from '@integration/utils';

const WETH_ADDRESS = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2';
const USDC_ADDRESS = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48';
const WBTC_ADDRESS = '0x2260fac5e5542a773aa44fbcfedf7c193bc2c599';
const WETH_WHALE_ADDRESS = '0xf04a5cc80b1e94c69b48f5ee68a08cd2f09a7c3e';
const USDC_WHALE_ADDRESS = '0xcffad3200574698b78f32232aa9d63eabd290703';
const WBTC_WHALE_ADDRESS = '0x9ff58f4ffb29fa2266ab25e75e2a8b3503311656';

contract('Multicall', () => {
  let WETH: IERC20, USDC: IERC20, WBTC: IERC20;
  let positionOwner: SignerWithAddress, swapper: SignerWithAddress, recipient: SignerWithAddress;
  let DCAHubCompanion: DCAHubCompanion;
  let DCAPermissionManager: DCAPermissionsManager;
  let DCAHub: DCAHub;
  let DCAHubSwapper: DCAHubSwapper;
  let transformerRegistry: TransformerRegistry;
  let chainId: BigNumber;
  let snapshotId: string;

  const RATE = BigNumber.from(100000000);
  const AMOUNT_OF_SWAPS = 10;

  before(async () => {
    await evm.reset({
      network: 'ethereum',
      blockNumber: forkBlockNumber['multicall'],
    });
    [positionOwner, swapper, recipient] = await ethers.getSigners();

    const { msig: admin } = await deploy('DCAHubCompanion');

    DCAHub = await ethers.getContract('DCAHub');
    DCAHubCompanion = await ethers.getContract('DCAHubCompanion');
    DCAHubSwapper = await ethers.getContract('DCAHubSwapper');
    DCAPermissionManager = await ethers.getContract('PermissionsManager');
    transformerRegistry = await ethers.getContract('TransformerRegistry');

    // const swapperRegistry = await ethers.getContract<SwapperRegistry>('SwapperRegistry');
    // const transformerOracle = await ethers.getContract<TransformerOracle>('TransformerOracle');
    // const protocolTokenTransformer = await ethers.getContract('ProtocolTokenWrapperTransformer');

    WETH = await ethers.getContractAt(IERC20_ABI, WETH_ADDRESS);
    USDC = await ethers.getContractAt(IERC20_ABI, USDC_ADDRESS);
    WBTC = await ethers.getContractAt(IERC20_ABI, WBTC_ADDRESS);

    // Allow tokens and swapper
    await DCAHub.connect(admin).setAllowedTokens([WETH_ADDRESS, USDC_ADDRESS, WBTC_ADDRESS], [true, true, true]);
    await DCAHubSwapper.connect(admin).grantRole(await DCAHubSwapper.SWAP_EXECUTION_ROLE(), swapper.address);

    // Send tokens from whales, to our users
    await distributeTokensToUsers();

    // await swapperRegistry.connect(admin).allowSwappers([
    //   transformerRegistry.address,
    //   '0xdef1c0ded9bec7f1a1670819833240f027b25eff', // 0x Dex
    // ]);
    // await transformerRegistry
    //   .connect(admin)
    //   .registerTransformers([{ transformer: protocolTokenTransformer.address, dependents: [WETH.address] }]);
    // await transformerOracle.connect(admin).avoidMappingToUnderlying([WETH.address]);

    chainId = BigNumber.from((await ethers.provider.getNetwork()).chainId);
    snapshotId = await snapshot.take();
  });

  beforeEach(async () => {
    await snapshot.revert(snapshotId);
  });

  describe('execution & swap', () => {
    describe('swap and deposit', () => {});

    describe('swap and increase', () => {});

    describe('withdraw and swap', () => {});

    describe('reduce and swap', () => {});

    describe('terminate and swap', () => {});
  });

  describe('non-swap multi calls', () => {
    when('withdrawing swapped balance and creating a new position with it', () => {
      let positionId: BigNumber, newPositionId: BigNumber;
      let swappedBalance: BigNumber;
      let hubToBalance: BigNumber;
      given(async () => {
        ({ positionId, swappedBalance, hubToBalance } = await depositAndSwap({ from: USDC, to: WETH }));
        newPositionId = positionId.add(1);
        const permissionData = await givePermissionToCompanionData({ signer: positionOwner, positionId, permissions: [Permission.WITHDRAW] });
        const withdrawData = await withdrawSwappedData({ positionId, recipient: DCAHubCompanion });
        const depositData = await depositAllInCompanionData({ from: WETH, to: USDC });
        await DCAHubCompanion.multicall([permissionData, withdrawData, depositData]);
      });
      then(`hub's WETH balance stays the same`, async () => {
        await expectBalanceToBe(WETH, DCAHub, hubToBalance);
      });
      then('original position has nothing left to withdraw', async () => {
        const { swapped } = await DCAHub.userPosition(positionId);
        expect(swapped).to.equal(0);
      });
      then('new position is created', async () => {
        await expectPositionToHaveBeenCreated({ positionId: newPositionId, from: WETH, to: USDC, remaining: swappedBalance });
      });
      then(`owner is correctly assigned`, async () => {
        expect(await DCAPermissionManager.ownerOf(newPositionId)).to.equal(positionOwner.address);
      });
      thenCompanionRemainsWithoutAnyBalance();
    });

    when('trying to withdraw swapped and unswapped balance in one tx', () => {
      let positionId: BigNumber;
      let swappedBalance: BigNumber, unswappedBalance: BigNumber;
      let hubFromBalance: BigNumber, hubToBalance: BigNumber;
      given(async () => {
        ({ positionId, swappedBalance, unswappedBalance, hubFromBalance, hubToBalance } = await depositAndSwap({
          from: USDC,
          to: WETH,
        }));
        const permissionData = await givePermissionToCompanionData({
          signer: positionOwner,
          positionId,
          permissions: [Permission.REDUCE, Permission.WITHDRAW],
        });
        const reduceData = await reduceAllPositionData({ positionId, recipient });
        const withdrawData = await withdrawSwappedData({ positionId, recipient });
        await DCAHubCompanion.multicall([permissionData, reduceData, withdrawData]);
      });
      then(`hub's USDC balance is reduced`, async () => {
        await expectBalanceToBe(USDC, DCAHub, hubFromBalance.sub(unswappedBalance));
      });
      then(`hub's WETH balance is reduced`, async () => {
        await expectBalanceToBe(WETH, DCAHub, hubToBalance.sub(swappedBalance));
      });
      then(`recipients's USDC increases`, async () => {
        await expectBalanceToBe(USDC, recipient, unswappedBalance);
      });
      then(`recipients's WETH increases`, async () => {
        await expectBalanceToBe(WETH, recipient, swappedBalance);
      });
      thenCompanionRemainsWithoutAnyBalance();
    });

    when('creating many positions in one tx', () => {
      const TOTAL = RATE.mul(AMOUNT_OF_SWAPS);
      const QUARTER = TOTAL.div(4);
      given(async () => {
        await USDC.connect(positionOwner).approve(DCAHubCompanion.address, constants.MAX_UINT_256);
        const takeData = await takeFromCallerData({ token: USDC, amount: TOTAL });
        const depositData1 = await depositFromCompanionData({ from: USDC, to: WETH, amount: QUARTER });
        const depositData2 = await depositFromCompanionData({ from: USDC, to: WBTC, amount: QUARTER });
        const depositData3 = await depositAllInCompanionData({ from: USDC, to: WETH });
        await DCAHubCompanion.multicall([takeData, depositData1, depositData2, depositData3]);
      });
      then(`hub's USDC balance to be correct`, async () => {
        await expectBalanceToBe(USDC, DCAHub, TOTAL);
      });
      then('new positions are created', async () => {
        await expectPositionToHaveBeenCreated({ positionId: 1, from: USDC, to: WETH, remaining: QUARTER });
        await expectPositionToHaveBeenCreated({ positionId: 2, from: USDC, to: WBTC, remaining: QUARTER });
        await expectPositionToHaveBeenCreated({ positionId: 3, from: USDC, to: WETH, remaining: TOTAL.sub(QUARTER).sub(QUARTER) });
      });
      thenCompanionRemainsWithoutAnyBalance();
    });

    when('withdrawing to many recipients', () => {
      let positionId: BigNumber;
      let swappedBalance: BigNumber, hubToBalance: BigNumber;
      let otherRecipient: Wallet;
      given(async () => {
        otherRecipient = await wallet.generateRandom();
        ({ positionId, swappedBalance, hubToBalance } = await depositAndSwap({
          from: USDC,
          to: WETH,
        }));
        const permissionData = await givePermissionToCompanionData({
          signer: positionOwner,
          positionId,
          permissions: [Permission.WITHDRAW],
        });
        const withdrawToCompanionData = await withdrawSwappedData({ positionId, recipient: DCAHubCompanion });
        const sendHalfData = await sendToRecipient({ token: WETH, amount: swappedBalance.div(2), recipient });
        const sendOtherHalfData = await sendAllInCompanionToRecipient({ token: WETH, recipient: otherRecipient });
        await DCAHubCompanion.multicall([permissionData, withdrawToCompanionData, sendHalfData, sendOtherHalfData]);
      });
      then(`hub's WETH balance is reduced`, async () => {
        await expectBalanceToBe(WETH, DCAHub, hubToBalance.sub(swappedBalance));
      });
      then(`first recipients's WETH increases`, async () => {
        await expectBalanceToBe(WETH, recipient, swappedBalance.div(2));
      });
      then(`second recipients's WETH increases`, async () => {
        await expectBalanceToBe(WETH, otherRecipient, swappedBalance.sub(swappedBalance.div(2)));
      });
      thenCompanionRemainsWithoutAnyBalance();
    });
  });

  // describe('protocol token as "from"', () => {
  //   when('increasing a position with protocol token', () => {
  //     const AMOUNT_TO_INCREASE = RATE.mul(AMOUNT_OF_SWAPS);
  //     let positionId: BigNumber;
  //     let hubWTokenBalanceAfterDeposit: BigNumber;
  //     given(async () => {
  //       positionId = await depositWithWTokenAsFrom();
  //       hubWTokenBalanceAfterDeposit = await WETH.balanceOf(DCAHub.address);

  //       const permissionData = await addPermissionToCompanionData(positionOwner, positionId, Permission.INCREASE);
  //       const { data: increaseData } = await DCAHubCompanion.populateTransaction.increasePositionUsingProtocolToken(
  //         positionId,
  //         AMOUNT_TO_INCREASE,
  //         AMOUNT_OF_SWAPS
  //       );
  //       await DCAHubCompanion.multicall([permissionData, increaseData!], { value: AMOUNT_TO_INCREASE });
  //     });
  //     then('position is increased', async () => {
  //       const userPosition = await DCAHub.userPosition(positionId);
  //       expect(userPosition.from).to.equal(WETH_ADDRESS);
  //       expect(userPosition.rate).to.equal(RATE.mul(2));
  //       expect(userPosition.swapsLeft).to.equal(AMOUNT_OF_SWAPS);
  //     });
  //     then(`hub's wToken balance is increased`, async () => {
  //       const balance = await WETH.balanceOf(DCAHub.address);
  //       expect(balance).to.equal(hubWTokenBalanceAfterDeposit.add(AMOUNT_TO_INCREASE));
  //     });
  //     thenCompanionRemainsWithoutAnyBalance();
  //   });
  //   when('reducing a position with protocol token', () => {
  //     const AMOUNT_TO_REDUCE = RATE.mul(AMOUNT_OF_SWAPS).div(2);
  //     let positionId: BigNumber;
  //     let hubWTokenBalanceAfterDeposit: BigNumber;
  //     given(async () => {
  //       positionId = await depositWithWTokenAsFrom();
  //       hubWTokenBalanceAfterDeposit = await WETH.balanceOf(DCAHub.address);

  //       const permissionData = await addPermissionToCompanionData(positionOwner, positionId, Permission.REDUCE);
  //       const { data: reduceData } = await DCAHubCompanion.populateTransaction.reducePositionUsingProtocolToken(
  //         positionId,
  //         AMOUNT_TO_REDUCE,
  //         AMOUNT_OF_SWAPS,
  //         recipient.address
  //       );
  //       await DCAHubCompanion.multicall([permissionData, reduceData!]);
  //     });
  //     then('position is reduced', async () => {
  //       const userPosition = await DCAHub.userPosition(positionId);
  //       expect(userPosition.from).to.equal(WETH_ADDRESS);
  //       expect(userPosition.rate).to.equal(RATE.div(2));
  //       expect(userPosition.swapsLeft).to.equal(AMOUNT_OF_SWAPS);
  //     });
  //     then(`hub's wToken balance is reduced`, async () => {
  //       const balance = await WETH.balanceOf(DCAHub.address);
  //       expect(balance).to.equal(hubWTokenBalanceAfterDeposit.sub(AMOUNT_TO_REDUCE));
  //     });
  //     then(`recipients's protocol balance increases`, async () => {
  //       const balance = await ethers.provider.getBalance(recipient.address);
  //       expect(balance).to.equal(initialRecipientProtocolBalance.add(AMOUNT_TO_REDUCE));
  //     });
  //     thenCompanionRemainsWithoutAnyBalance();
  //   });

  //   when(`terminating a position with protocol token as 'from'`, () => {
  //     const AMOUNT_RETURNED = RATE.mul(AMOUNT_OF_SWAPS);
  //     let positionId: BigNumber;
  //     let hubWTokenBalanceAfterDeposit: BigNumber;
  //     given(async () => {
  //       positionId = await depositWithWTokenAsFrom();
  //       hubWTokenBalanceAfterDeposit = await WETH.balanceOf(DCAHub.address);
  //       const permissionData = await addPermissionToCompanionData(positionOwner, positionId, Permission.TERMINATE);
  //       const { data: terminateData } = await DCAHubCompanion.populateTransaction.terminateUsingProtocolTokenAsFrom(
  //         positionId,
  //         recipient.address,
  //         recipient.address
  //       );
  //       await DCAHubCompanion.multicall([permissionData, terminateData!]);
  //     });
  //     then('position is terminated', async () => {
  //       const userPosition = await DCAHub.userPosition(positionId);
  //       expect(userPosition.swapInterval).to.equal(0);
  //     });
  //     then(`hub's wToken balance is reduced`, async () => {
  //       const balance = await WETH.balanceOf(DCAHub.address);
  //       expect(balance).to.equal(hubWTokenBalanceAfterDeposit.sub(AMOUNT_RETURNED));
  //     });
  //     then(`recipients's protocol balance increases`, async () => {
  //       const balance = await ethers.provider.getBalance(recipient.address);
  //       expect(balance).to.equal(initialRecipientProtocolBalance.add(AMOUNT_RETURNED));
  //     });
  //     thenCompanionRemainsWithoutAnyBalance();
  //   });
  // });

  // describe('protocol token as "to"', () => {
  //   when('withdrawing from a position', () => {
  //     let positionId: BigNumber;
  //     let swappedBalance: BigNumber;
  //     let hubWTokenBalanceAfterSwap: BigNumber;
  //     given(async () => {
  //       ({ positionId, swappedBalance } = await depositWithWTokenAsToAndSwap());
  //       hubWTokenBalanceAfterSwap = await WETH.balanceOf(DCAHub.address);
  //       const permissionData = await addPermissionToCompanionData(positionOwner, positionId, Permission.WITHDRAW);
  //       const { data: withdrawData } = await DCAHubCompanion.populateTransaction.withdrawSwappedUsingProtocolToken(
  //         positionId,
  //         recipient.address
  //       );
  //       await DCAHubCompanion.multicall([permissionData, withdrawData!]);
  //     });
  //     then('position has no more swapped balance', async () => {
  //       const userPosition = await DCAHub.userPosition(positionId);
  //       expect(userPosition.swapped).to.equal(0);
  //     });
  //     then(`hub's wToken balance is reduced`, async () => {
  //       const balance = await WETH.balanceOf(DCAHub.address);
  //       expect(balance).to.equal(hubWTokenBalanceAfterSwap.sub(swappedBalance));
  //     });
  //     then(`recipients's protocol balance increases`, async () => {
  //       const balance = await ethers.provider.getBalance(recipient.address);
  //       expect(balance).to.equal(initialRecipientProtocolBalance.add(swappedBalance));
  //     });
  //     thenCompanionRemainsWithoutAnyBalance();
  //   });

  //   when('withdrawing many from a position', () => {
  //     let positionId: BigNumber;
  //     let swappedBalance: BigNumber;
  //     let hubWTokenBalanceAfterSwap: BigNumber;
  //     given(async () => {
  //       ({ positionId, swappedBalance } = await depositWithWTokenAsToAndSwap());
  //       hubWTokenBalanceAfterSwap = await WETH.balanceOf(DCAHub.address);
  //       const permissionData = await addPermissionToCompanionData(positionOwner, positionId, Permission.WITHDRAW);
  //       const { data: withdrawData } = await DCAHubCompanion.populateTransaction.withdrawSwappedManyUsingProtocolToken(
  //         [positionId],
  //         recipient.address
  //       );
  //       await DCAHubCompanion.multicall([permissionData, withdrawData!]);
  //     });
  //     then('position has no more swapped balance', async () => {
  //       const userPosition = await DCAHub.userPosition(positionId);
  //       expect(userPosition.swapped).to.equal(0);
  //     });
  //     then(`hub's wToken balance is reduced`, async () => {
  //       const balance = await WETH.balanceOf(DCAHub.address);
  //       expect(balance).to.equal(hubWTokenBalanceAfterSwap.sub(swappedBalance));
  //     });
  //     then(`recipients's protocol balance increases`, async () => {
  //       const balance = await ethers.provider.getBalance(recipient.address);
  //       expect(balance).to.equal(initialRecipientProtocolBalance.add(swappedBalance));
  //     });
  //     thenCompanionRemainsWithoutAnyBalance();
  //   });

  //   when(`terminating a position with protocol token as 'to'`, () => {
  //     let positionId: BigNumber;
  //     let swappedBalance: BigNumber;
  //     let hubWTokenBalanceAfterSwap: BigNumber;
  //     given(async () => {
  //       ({ positionId, swappedBalance } = await depositWithWTokenAsToAndSwap());
  //       hubWTokenBalanceAfterSwap = await WETH.balanceOf(DCAHub.address);
  //       const permissionData = await addPermissionToCompanionData(positionOwner, positionId, Permission.TERMINATE);
  //       const { data: terminateData } = await DCAHubCompanion.populateTransaction.terminateUsingProtocolTokenAsTo(
  //         positionId,
  //         recipient.address,
  //         recipient.address
  //       );
  //       await DCAHubCompanion.multicall([permissionData, terminateData!]);
  //     });
  //     then('position is terminated', async () => {
  //       const userPosition = await DCAHub.userPosition(positionId);
  //       expect(userPosition.swapInterval).to.equal(0);
  //     });
  //     then(`hub's wToken balance is reduced`, async () => {
  //       const balance = await WETH.balanceOf(DCAHub.address);
  //       expect(balance).to.equal(hubWTokenBalanceAfterSwap.sub(swappedBalance));
  //     });
  //     then(`recipients's protocol balance increases`, async () => {
  //       const balance = await ethers.provider.getBalance(recipient.address);
  //       expect(balance).to.equal(initialRecipientProtocolBalance.add(swappedBalance));
  //     });
  //     thenCompanionRemainsWithoutAnyBalance();
  //   });
  // });

  when('trying to use an invalid permit through multicall', () => {
    let tx: Promise<TransactionResponse>;
    let permissionData: string;

    given(async () => {
      const positionId = await depositWithWTokenAsFrom();
      permissionData = await givePermissionToCompanionData({ signer: recipient, positionId, permissions: [Permission.REDUCE] });
      tx = DCAHubCompanion.multicall([permissionData]);
    });
    then('reverts with message', async () => {
      await expect(tx).to.be.reverted;
    });
  });

  function thenCompanionRemainsWithoutAnyBalance() {
    then('companion continues without wToken balance', async () => {
      await expectToHaveNoBalance(WETH, DCAHubCompanion);
    });
    then('companion continues without USDC balance', async () => {
      await expectToHaveNoBalance(USDC, DCAHubCompanion);
    });
    then('companion continues without WBTC balance', async () => {
      await expectToHaveNoBalance(WBTC, DCAHubCompanion);
    });
    then('companion continues without native balance', async () => {
      await expectToHaveNoNativeBalance(DCAHubCompanion);
    });
  }

  async function expectToHaveNoBalance(token: IERC20, hasAddress: HasAddress) {
    expectBalanceToBe(token, hasAddress, 0);
  }

  async function expectToHaveNoNativeBalance(hasAddress: HasAddress) {
    expectNativeBalanceToBe(hasAddress, 0);
  }

  async function expectBalanceToBe(token: IERC20, hasAddress: HasAddress, expectedBalance: BigNumberish) {
    const balance = await token.balanceOf(hasAddress.address);
    expect(balance).to.equal(expectedBalance);
  }

  async function expectNativeBalanceToBe(hasAddress: HasAddress, expectedBalance: BigNumberish) {
    const balance = await ethers.provider.getBalance(hasAddress.address);
    expect(balance).to.equal(expectedBalance);
  }

  async function expectPositionToHaveBeenCreated({
    positionId,
    ...expected
  }: {
    positionId: BigNumberish;
    from: IERC20;
    to: IERC20;
    remaining: BigNumberish;
  }) {
    const { from, to, swapsExecuted, remaining } = await DCAHub.userPosition(positionId);
    expect(from.toLowerCase()).to.eql(expected.from.address.toLowerCase());
    expect(to.toLowerCase()).to.equal(expected.to.address.toLowerCase());
    expect(swapsExecuted).to.equal(0);
    expect(remaining).to.equal(expected.remaining);
  }

  async function distributeTokensToUsers() {
    const wethWhale = await wallet.impersonate(WETH_WHALE_ADDRESS);
    const usdcWhale = await wallet.impersonate(USDC_WHALE_ADDRESS);
    const wbtcWhale = await wallet.impersonate(WBTC_WHALE_ADDRESS);
    await ethers.provider.send('hardhat_setBalance', [WBTC_WHALE_ADDRESS, '0xffffffffffffffff']);
    await ethers.provider.send('hardhat_setBalance', [WETH_WHALE_ADDRESS, '0xffffffffffffffff']);
    await ethers.provider.send('hardhat_setBalance', [USDC_WHALE_ADDRESS, '0xffffffffffffffff']);
    await WETH.connect(wethWhale).transfer(positionOwner.address, utils.parseEther('1'));
    await USDC.connect(usdcWhale).transfer(positionOwner.address, utils.parseUnits('100000', 6));
    await WBTC.connect(wbtcWhale).transfer(positionOwner.address, utils.parseUnits('1', 6));
    await WETH.connect(wethWhale).transfer(swapper.address, utils.parseEther('1'));
    await USDC.connect(usdcWhale).transfer(swapper.address, utils.parseUnits('100000', 6));
    await WBTC.connect(wbtcWhale).transfer(swapper.address, utils.parseUnits('1', 6));
  }

  async function depositWithWTokenAsFrom() {
    await WETH.connect(positionOwner).approve(DCAHub.address, RATE.mul(AMOUNT_OF_SWAPS));
    const tx = await DCAHub.connect(positionOwner)['deposit(address,address,uint256,uint32,uint32,address,(address,uint8[])[])'](
      WETH.address,
      USDC.address,
      RATE.mul(AMOUNT_OF_SWAPS),
      AMOUNT_OF_SWAPS,
      SwapInterval.ONE_DAY.seconds,
      positionOwner.address,
      []
    );
    const event = await getHubEvent(tx, 'Deposited');
    return event.args.positionId;
  }

  async function depositAndSwap({ from, to }: { from: IERC20; to: IERC20 }) {
    await from.connect(positionOwner).approve(DCAHub.address, constants.MAX_UINT_256);
    const tx = await DCAHub.connect(positionOwner)['deposit(address,address,uint256,uint32,uint32,address,(address,uint8[])[])'](
      from.address,
      to.address,
      RATE.mul(AMOUNT_OF_SWAPS),
      AMOUNT_OF_SWAPS,
      SwapInterval.ONE_DAY.seconds,
      positionOwner.address,
      []
    );
    const event = await getHubEvent(tx, 'Deposited');
    const positionId = event.args.positionId;

    await to.connect(swapper).approve(DCAHubSwapper.address, constants.MAX_UINT_256);
    await DCAHubSwapper.connect(swapper).swapForCaller({
      hub: DCAHub.address,
      tokens: [USDC_ADDRESS, WETH_ADDRESS],
      pairsToSwap: [{ indexTokenA: 0, indexTokenB: 1 }],
      oracleData: [],
      minimumOutput: [0, 0],
      maximumInput: [constants.MAX_UINT_256, constants.MAX_UINT_256],
      recipient: swapper.address,
      deadline: constants.MAX_UINT_256,
    });

    const { swapped } = await DCAHub.userPosition(positionId);
    const hubFromBalance = await from.balanceOf(DCAHub.address);
    const hubToBalance = await to.balanceOf(DCAHub.address);
    return {
      positionId,
      swappedBalance: swapped,
      unswappedBalance: RATE.mul(AMOUNT_OF_SWAPS - 1),
      hubFromBalance,
      hubToBalance,
    };
  }

  function getHubEvent(tx: TransactionResponse, name: string): Promise<utils.LogDescription> {
    return findLogs(tx, new utils.Interface(DCA_HUB_ABI), name);
  }

  async function findLogs(
    tx: TransactionResponse,
    contractInterface: utils.Interface,
    eventTopic: string,
    extraFilter?: (_: utils.LogDescription) => boolean
  ): Promise<utils.LogDescription> {
    const txReceipt = await tx.wait();
    const logs = txReceipt.logs;
    for (let i = 0; i < logs.length; i++) {
      for (let x = 0; x < logs[i].topics.length; x++) {
        if (logs[i].topics[x] === contractInterface.getEventTopic(eventTopic)) {
          const parsedLog = contractInterface.parseLog(logs[i]);
          if (!extraFilter || extraFilter(parsedLog)) {
            return parsedLog;
          }
        }
      }
    }
    return Promise.reject();
  }

  async function givePermissionToCompanionData({
    signer,
    positionId,
    permissions,
  }: {
    signer: SignerWithAddress;
    positionId: BigNumberish;
    permissions: Permission[];
  }) {
    const permissionsStruct = [{ operator: DCAHubCompanion.address, permissions }];
    const { v, r, s } = await getSignature(signer, positionId, permissionsStruct);
    const { data } = await DCAHubCompanion.populateTransaction.permissionPermit(
      DCAPermissionManager.address,
      permissionsStruct,
      positionId,
      constants.MAX_UINT_256,
      v,
      r,
      s
    );
    return data!;
  }

  async function withdrawSwappedData({ positionId, recipient }: { positionId: BigNumberish; recipient: HasAddress }) {
    const { data } = await DCAHubCompanion.populateTransaction.withdrawSwapped(DCAHub.address, positionId, recipient.address);
    return data!;
  }

  async function reduceAllPositionData({ positionId, recipient }: { positionId: BigNumberish; recipient: HasAddress }) {
    const { remaining } = await DCAHub.userPosition(positionId);
    const { data } = await DCAHubCompanion.populateTransaction.reducePosition(DCAHub.address, positionId, remaining, 0, recipient.address);
    return data!;
  }

  async function depositAllInCompanionData({ from, to }: { from: IERC20; to: IERC20 }) {
    const { data } = await DCAHubCompanion.populateTransaction.depositWithBalanceOnContract(
      DCAHub.address,
      from.address,
      to.address,
      1,
      SwapInterval.ONE_DAY.seconds,
      positionOwner.address,
      [],
      []
    );
    return data!;
  }

  async function depositFromCompanionData({ from, to, amount }: { from: IERC20; to: IERC20; amount: BigNumberish }) {
    const { data } = await DCAHubCompanion.populateTransaction.deposit(
      DCAHub.address,
      from.address,
      to.address,
      amount,
      1,
      SwapInterval.ONE_DAY.seconds,
      positionOwner.address,
      [],
      []
    );
    return data!;
  }

  async function takeFromCallerData({ token, amount }: { token: IERC20; amount: BigNumberish }) {
    const { data } = await DCAHubCompanion.populateTransaction.takeFromCaller(token.address, amount);
    return data!;
  }

  async function sendToRecipient({ token, amount, recipient }: { token: IERC20; amount: BigNumberish; recipient: HasAddress }) {
    const { data } = await DCAHubCompanion.populateTransaction.sendToRecipient(token.address, amount, recipient.address);
    return data!;
  }

  async function sendAllInCompanionToRecipient({ token, recipient }: { token: IERC20; recipient: HasAddress }) {
    const { data } = await DCAHubCompanion.populateTransaction.sendBalanceOnContractToRecipient(token.address, recipient.address);
    return data!;
  }

  const PermissionSet = [
    { name: 'operator', type: 'address' },
    { name: 'permissions', type: 'uint8[]' },
  ];

  const PermissionPermit = [
    { name: 'permissions', type: 'PermissionSet[]' },
    { name: 'tokenId', type: 'uint256' },
    { name: 'nonce', type: 'uint256' },
    { name: 'deadline', type: 'uint256' },
  ];

  async function getSignature(signer: SignerWithAddress, tokenId: BigNumberish, permissions: { operator: string; permissions: Permission[] }[]) {
    const { domain, types, value } = buildPermitData(tokenId, permissions);
    const signature = await signer._signTypedData(domain, types, value);
    return fromRpcSig(signature);
  }

  function buildPermitData(tokenId: BigNumberish, permissions: { operator: string; permissions: Permission[] }[]) {
    return {
      primaryType: 'PermissionPermit',
      types: { PermissionSet, PermissionPermit },
      domain: { name: 'Mean Finance - DCA Position', version: '2', chainId, verifyingContract: DCAPermissionManager.address },
      value: { tokenId, permissions, nonce: 0, deadline: constants.MAX_UINT_256 },
    };
  }

  enum Permission {
    INCREASE,
    REDUCE,
    WITHDRAW,
    TERMINATE,
  }

  type HasAddress = { address: string };
});
