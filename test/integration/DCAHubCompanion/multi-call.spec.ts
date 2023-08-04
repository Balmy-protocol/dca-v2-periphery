import { expect } from 'chai';
import { ethers } from 'hardhat';
import { TransactionResponse } from '@ethersproject/providers';
import { constants, wallet } from '@test-utils';
import { contract, given, then, when } from '@test-utils/bdd';
import evm, { snapshot } from '@test-utils/evm';
import { DCAHubCompanion, CallerOnlyDCAHubSwapper, IERC20 } from '@typechained';
import { DCAHub, DCAPermissionsManager } from '@mean-finance/dca-v2-core';
import { TransformerRegistry } from '@mean-finance/transformers';
import { TransformerOracle, StatefulChainlinkOracle } from '@mean-finance/oracles';
import { abi as DCA_HUB_ABI } from '@mean-finance/dca-v2-core/artifacts/contracts/DCAHub/DCAHub.sol/DCAHub.json';
import { abi as IERC20_ABI } from '@openzeppelin/contracts/build/contracts/IERC20.json';
import { BigNumber, BigNumberish, BytesLike, utils, Wallet } from 'ethers';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { SwapInterval } from '@test-utils/interval-utils';
import { fromRpcSig } from 'ethereumjs-util';
import { deploy } from '@integration/utils';
import { buildSDK, isSameAddress } from '@mean-finance/sdk';
import { JsonRpcSigner } from '@ethersproject/providers';

const WETH_ADDRESS = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2';
const USDC_ADDRESS = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48';
const WBTC_ADDRESS = '0x2260fac5e5542a773aa44fbcfedf7c193bc2c599';
const WETH_WHALE_ADDRESS = '0xf04a5cc80b1e94c69b48f5ee68a08cd2f09a7c3e';
const USDC_WHALE_ADDRESS = '0xcffad3200574698b78f32232aa9d63eabd290703';
const WBTC_WHALE_ADDRESS = '0x9ff58f4ffb29fa2266ab25e75e2a8b3503311656';
const USDC_1000 = utils.parseUnits('1000', 6);
const ETH_1 = utils.parseEther('1');
const NONCE = 12345678;

contract('Multicall', () => {
  let WETH: IERC20, USDC: IERC20, WBTC: IERC20;
  let recipientInitialETHBalance: BigNumber;
  let positionOwner: SignerWithAddress, swapper: SignerWithAddress, recipient: SignerWithAddress, admin: JsonRpcSigner;
  let DCAHubCompanion: DCAHubCompanion;
  let DCAPermissionManager: DCAPermissionsManager;
  let DCAHub: DCAHub;
  let companionSwapper: string;
  let DCAHubSwapper: CallerOnlyDCAHubSwapper;
  let transformerRegistry: TransformerRegistry;
  let permit2Address: string;
  let chainId: BigNumber;
  let snapshotId: string;

  const AMOUNT_OF_SWAPS = 10;

  before(async () => {
    await evm.reset({ network: 'ethereum' });
    [positionOwner, swapper, recipient] = await ethers.getSigners();

    ({ msig: admin } = await deploy('DCAHubCompanion'));

    DCAHub = await ethers.getContract('DCAHub');
    DCAHubCompanion = await ethers.getContract('DCAHubCompanion');
    DCAHubSwapper = await ethers.getContract('CallerOnlyDCAHubSwapper');
    DCAPermissionManager = await ethers.getContract('PermissionsManager');
    transformerRegistry = await ethers.getContract('TransformerRegistry');

    const transformerOracle = await ethers.getContract<TransformerOracle>('TransformerOracle');
    const protocolTokenTransformer = await ethers.getContract('ProtocolTokenWrapperTransformer');
    const chainlinkOracle = await ethers.getContract<StatefulChainlinkOracle>('StatefulChainlinkOracle');
    companionSwapper = await DCAHubCompanion.swapper();

    WETH = await ethers.getContractAt(IERC20_ABI, WETH_ADDRESS);
    USDC = await ethers.getContractAt(IERC20_ABI, USDC_ADDRESS);
    WBTC = await ethers.getContractAt(IERC20_ABI, WBTC_ADDRESS);

    // Allow tokens and swapper
    await DCAHub.connect(admin).setAllowedTokens([WETH_ADDRESS, USDC_ADDRESS, WBTC_ADDRESS], [true, true, true]);
    await DCAHubSwapper.connect(admin).grantRole(await DCAHubSwapper.SWAP_EXECUTION_ROLE(), swapper.address);
    await chainlinkOracle
      .connect(admin)
      .addMappings(
        [WETH.address, WBTC.address],
        [await protocolTokenTransformer.PROTOCOL_TOKEN(), '0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB']
      );

    // Send tokens from whales, to our users
    await distributeTokensToUsers();

    // Approve Permit2
    permit2Address = await DCAHubCompanion.PERMIT2();
    await USDC.connect(positionOwner).approve(permit2Address, constants.MAX_UINT_256);

    await transformerRegistry
      .connect(admin)
      .registerTransformers([{ transformer: protocolTokenTransformer.address, dependents: [WETH.address] }]);
    await transformerOracle.connect(admin).avoidMappingToUnderlying([WETH.address]);

    chainId = BigNumber.from((await ethers.provider.getNetwork()).chainId);
    recipientInitialETHBalance = await ethers.provider.getBalance(recipient.address);
    snapshotId = await snapshot.take();
  });

  beforeEach(async () => {
    await snapshot.revert(snapshotId);
  });

  describe('swap multi calls', () => {
    describe('swap and deposit', () => {
      swapAndDepositTest({
        from: 'ETH',
        swap: ({ amountIn }) => transformETHToWETH(amountIn),
      });
      swapAndDepositTest({
        from: 'USDC',
        swap: ({ amountIn }) => swapInDex({ from: USDC, to: WETH, amountIn }),
      });
      function swapAndDepositTest({ from, swap }: { from: 'USDC' | 'ETH'; swap: Swap }) {
        const AMOUNT_IN = USDC_1000;
        when(`swapping ${from} to WETH and depositing`, () => {
          let minExpected: BigNumber;
          given(async () => {
            const takeData = await permitTakeFromCallerDataIfUSDC({ from, amount: USDC_1000 });
            const { swapExecutionData, expectedAmountOut } = await runSwapData({ amountIn: AMOUNT_IN, swap });
            const depositData = await depositAllInCompanionData({ from: WETH, to: WBTC });
            await DCAHubCompanion.multicall(filterMulticalls([takeData, swapExecutionData, depositData]), {
              value: from === 'ETH' ? AMOUNT_IN : 0,
            });
            minExpected = expectedAmountOut;
          });
          then('hub has expected amount of WETH balance', async () => {
            const balance = await WETH.balanceOf(DCAHub.address);
            expect(balance.gte(minExpected)).to.be.true;
          });
          then('new position is created', async () => {
            await expectPositionToHaveBeenCreated({ positionId: 1, from: WETH, to: WBTC, minRemaining: minExpected });
          });
          thenCompanionRemainsWithoutAnyBalance();
        });
      }
    });

    describe('swap and increase', () => {
      swapAndIncreaseTest({
        from: 'ETH',
        swap: ({ amountIn }) => transformETHToWETH(amountIn),
      });
      swapAndIncreaseTest({
        from: 'USDC',
        swap: ({ amountIn }) => swapInDex({ from: USDC, to: WETH, amountIn }),
      });
      function swapAndIncreaseTest({ from, swap }: { from: 'USDC' | 'ETH'; swap: Swap }) {
        const AMOUNT_IN = USDC_1000;
        when(`swapping ${from} to WETH and increasing a position`, () => {
          let positionId: BigNumber, minExpectedBalance: BigNumber;
          given(async () => {
            const { positionId: createdPositionId, unswappedBalance } = await depositAndSwap({ from: WETH, to: USDC, amount: ETH_1 });
            const takeData = await permitTakeFromCallerDataIfUSDC({ from, amount: USDC_1000 });
            const { swapExecutionData, expectedAmountOut } = await runSwapData({ amountIn: AMOUNT_IN, swap });
            const permissionData = await givePermissionToCompanionData({
              signer: positionOwner,
              positionId: createdPositionId,
              permissions: [Permission.INCREASE],
            });
            const increaseData = await increaseAllInCompanionData({ positionId: createdPositionId });
            await DCAHubCompanion.multicall(filterMulticalls([takeData, swapExecutionData, permissionData, increaseData]), {
              value: from === 'ETH' ? AMOUNT_IN : 0,
            });
            minExpectedBalance = unswappedBalance.add(expectedAmountOut);
            positionId = createdPositionId;
          });
          then('hub has expected amount of WETH balance', async () => {
            const balance = await WETH.balanceOf(DCAHub.address);
            expect(balance.gte(minExpectedBalance)).to.be.true;
          });
          then('position was increased', async () => {
            const { remaining } = await DCAHub.userPosition(positionId);
            expect(remaining.gte(minExpectedBalance)).to.be.true;
          });
          thenCompanionRemainsWithoutAnyBalance();
        });
      }
    });

    describe('withdraw and swap', () => {
      withdrawAndSwapTest({
        to: 'ETH',
        swap: ({ amountIn }) => transformWETHToETH(amountIn),
      });
      withdrawAndSwapTest({
        to: 'USDC',
        swap: ({ amountIn }) => swapInDex({ from: WETH, to: USDC, amountIn }),
      });
      function withdrawAndSwapTest({ to, swap }: { to: 'USDC' | 'ETH'; swap: Swap }) {
        when(`withdrawing and swapping from WETH to ${to}`, () => {
          let minExpected: BigNumber;
          given(async () => {
            const { positionId, swappedBalance } = await depositAndSwap({ from: USDC, to: WETH, amount: USDC_1000 });
            const permissionData = await givePermissionToCompanionData({
              signer: positionOwner,
              positionId,
              permissions: [Permission.WITHDRAW],
            });
            const withdrawData = await withdrawSwappedData({ positionId, recipient: companionSwapper });
            const { swapExecutionData, expectedAmountOut } = await runSwapData({ amountIn: swappedBalance, swap });
            const sendData = await sendAllInCompanionToRecipientData({ token: await getAddress(to), recipient });
            await DCAHubCompanion.multicall([permissionData, withdrawData, swapExecutionData, sendData]);
            minExpected = expectedAmountOut;
          });
          if (to === 'USDC') {
            then('recipient has expected amount of USDC balance', async () => {
              const balance = await USDC.balanceOf(recipient.address);
              expect(balance.gte(minExpected)).to.be.true;
            });
          } else {
            then('recipient has expected amount of ETH balance', async () => {
              const balance = await ethers.provider.getBalance(recipient.address);
              expect(balance.gte(recipientInitialETHBalance.add(minExpected))).to.be.true;
            });
          }
          thenCompanionRemainsWithoutAnyBalance();
        });
      }
    });

    describe('reduce and swap', () => {
      reduceAndSwapTest({
        to: 'ETH',
        swap: ({ amountIn }) => transformWETHToETH(amountIn),
      });
      reduceAndSwapTest({
        to: 'USDC',
        swap: ({ amountIn }) => swapInDex({ from: WETH, to: USDC, amountIn }),
      });
      function reduceAndSwapTest({ to, swap }: { to: 'USDC' | 'ETH'; swap: Swap }) {
        when(`reducing position and swapping from WETH to ${to}`, () => {
          let minExpected: BigNumber;
          given(async () => {
            const { positionId, unswappedBalance } = await depositAndSwap({ from: WETH, to: USDC, amount: ETH_1 });
            const permissionData = await givePermissionToCompanionData({ signer: positionOwner, positionId, permissions: [Permission.REDUCE] });
            const reduceData = await reduceAllPositionData({ positionId, recipient: companionSwapper });
            const { swapExecutionData, expectedAmountOut } = await runSwapData({ amountIn: unswappedBalance, swap });
            const sendData = await sendAllInCompanionToRecipientData({ token: await getAddress(to), recipient });
            await DCAHubCompanion.multicall([permissionData, reduceData, swapExecutionData, sendData]);
            minExpected = expectedAmountOut;
          });
          if (to === 'USDC') {
            then('recipient has expected amount of USDC balance', async () => {
              const balance = await USDC.balanceOf(recipient.address);
              expect(balance.gte(minExpected)).to.be.true;
            });
          } else {
            then('recipient has expected amount of ETH balance', async () => {
              const balance = await ethers.provider.getBalance(recipient.address);
              expect(balance.gte(recipientInitialETHBalance.add(minExpected))).to.be.true;
            });
          }
          thenCompanionRemainsWithoutAnyBalance();
        });
      }
    });

    describe('terminate and swap', () => {
      when('terminating a position and swapping WETH to ETH, and USDC to wBTC', () => {
        let expectedAmountOutETH: BigNumber, expectedAmountOutBTC: BigNumber;
        given(async () => {
          const { positionId, swappedBalance, unswappedBalance } = await depositAndSwap({ from: WETH, to: USDC, amount: ETH_1 });
          const permissionData = await givePermissionToCompanionData({ signer: positionOwner, positionId, permissions: [Permission.TERMINATE] });
          const _terminateData = await terminateData({ positionId, recipient: companionSwapper });
          const { swapExecutionData: executionDataETH, expectedAmountOut: _expectedAmountOutETH } = await runSwapData({
            amountIn: unswappedBalance,
            swap: ({ amountIn }) => transformWETHToETH(amountIn),
          });
          const { swapExecutionData: executionDataWBTC, expectedAmountOut: _expectedAmountOutBTC } = await runSwapData({
            amountIn: swappedBalance,
            swap: ({ amountIn }) => swapInDex({ from: USDC, to: WBTC, amountIn }),
          });
          const sendETHData = await sendAllInCompanionToRecipientData({ token: await DCAHubCompanion.PROTOCOL_TOKEN(), recipient });
          const sendWBTCData = await sendAllERC20InCompanionToRecipientData({ token: WBTC, recipient });
          await DCAHubCompanion.multicall([permissionData, _terminateData, executionDataETH, sendETHData, executionDataWBTC, sendWBTCData]);
          expectedAmountOutETH = _expectedAmountOutETH;
          expectedAmountOutBTC = _expectedAmountOutBTC;
        });
        then('recipient has expected amount of wBTC balance', async () => {
          const balance = await WBTC.balanceOf(recipient.address);
          expect(balance.gte(expectedAmountOutBTC)).to.be.true;
        });
        then('recipient has expected amount of ETH balance', async () => {
          const balance = await ethers.provider.getBalance(recipient.address);
          expect(balance.gte(recipientInitialETHBalance.add(expectedAmountOutETH))).to.be.true;
        });
        thenCompanionRemainsWithoutAnyBalance();
      });
    });

    async function permitTakeFromCallerDataIfUSDC({ from, amount }: { from: 'USDC' | 'ETH'; amount: BigNumberish }) {
      if (from === 'USDC') {
        const signature = await positionOwner._signTypedData(
          {
            name: 'Permit2',
            chainId,
            verifyingContract: permit2Address,
          },
          {
            PermitTransferFrom: [
              { type: 'TokenPermissions', name: 'permitted' },
              { type: 'address', name: 'spender' },
              { type: 'uint256', name: 'nonce' },
              { type: 'uint256', name: 'deadline' },
            ],
            TokenPermissions: [
              { type: 'address', name: 'token' },
              { type: 'uint256', name: 'amount' },
            ],
          },
          {
            permitted: { token: USDC.address, amount },
            spender: DCAHubCompanion.address,
            nonce: NONCE,
            deadline: constants.MAX_UINT_256,
          }
        );
        const takeData = await permitTakeFromCallerData({ token: USDC, amount, nonce: NONCE, deadline: constants.MAX_UINT_256, signature });
        return takeData;
      }
    }

    function filterMulticalls(multicalls: (undefined | BytesLike)[]): BytesLike[] {
      return multicalls.filter((call): call is BytesLike => !!call);
    }

    async function getAddress(token: 'USDC' | 'ETH') {
      return token === 'USDC' ? USDC.address : await DCAHubCompanion.PROTOCOL_TOKEN();
    }
  });

  describe('non-swap multi calls', () => {
    when('withdrawing swapped balance and creating a new position with it', () => {
      let positionId: BigNumber, newPositionId: BigNumber;
      let swappedBalance: BigNumber;
      let hubToBalance: BigNumber;
      given(async () => {
        ({ positionId, swappedBalance, hubToBalance } = await depositAndSwap({ from: USDC, to: WETH, amount: USDC_1000 }));
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
          amount: USDC_1000,
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
      const TOTAL = USDC_1000;
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
          amount: utils.parseUnits('1000', 6),
        }));
        const permissionData = await givePermissionToCompanionData({
          signer: positionOwner,
          positionId,
          permissions: [Permission.WITHDRAW],
        });
        const withdrawToCompanionData = await withdrawSwappedData({ positionId, recipient: DCAHubCompanion });
        const sendHalfData = await sendToRecipientData({ token: WETH, amount: swappedBalance.div(2), recipient });
        const sendOtherHalfData = await sendAllERC20InCompanionToRecipientData({ token: WETH, recipient: otherRecipient });
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

  when('trying to use an invalid permit through multicall', () => {
    let tx: Promise<TransactionResponse>;
    let permissionData: string;

    given(async () => {
      const { positionId } = await depositAndSwap({ from: WETH, to: USDC, amount: ETH_1 });
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
    await expectBalanceToBe(token, hasAddress, 0);
  }

  async function expectToHaveNoNativeBalance(hasAddress: HasAddress) {
    await expectNativeBalanceToBe(hasAddress, 0);
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
    remaining?: BigNumberish;
    minRemaining?: BigNumberish;
  }) {
    const { from, to, swapsExecuted, remaining } = await DCAHub.userPosition(positionId);
    expect(from.toLowerCase()).to.eql(expected.from.address.toLowerCase());
    expect(to.toLowerCase()).to.equal(expected.to.address.toLowerCase());
    expect(swapsExecuted).to.equal(0);
    if (expected.remaining) {
      expect(remaining).to.equal(expected.remaining);
    }
    if (expected.minRemaining) {
      expect(remaining.gte(expected.minRemaining)).to.be.true;
    }
  }

  async function distributeTokensToUsers() {
    const wethWhale = await wallet.impersonate(WETH_WHALE_ADDRESS);
    const usdcWhale = await wallet.impersonate(USDC_WHALE_ADDRESS);
    const wbtcWhale = await wallet.impersonate(WBTC_WHALE_ADDRESS);
    await ethers.provider.send('hardhat_setBalance', [WBTC_WHALE_ADDRESS, '0xffffffffffffffff']);
    await ethers.provider.send('hardhat_setBalance', [WETH_WHALE_ADDRESS, '0xffffffffffffffff']);
    await ethers.provider.send('hardhat_setBalance', [USDC_WHALE_ADDRESS, '0xffffffffffffffff']);
    await WETH.connect(wethWhale).transfer(positionOwner.address, ETH_1);
    await USDC.connect(usdcWhale).transfer(positionOwner.address, utils.parseUnits('100000', 6));
    await WBTC.connect(wbtcWhale).transfer(positionOwner.address, utils.parseUnits('1', 6));
    await WETH.connect(wethWhale).transfer(swapper.address, ETH_1);
    await USDC.connect(usdcWhale).transfer(swapper.address, utils.parseUnits('100000', 6));
    await WBTC.connect(wbtcWhale).transfer(swapper.address, utils.parseUnits('1', 6));
  }

  async function depositAndSwap({ from, to, amount }: { from: IERC20; to: IERC20; amount: BigNumber }) {
    await from.connect(positionOwner).approve(DCAHub.address, constants.MAX_UINT_256);
    const tx = await DCAHub.connect(positionOwner)['deposit(address,address,uint256,uint32,uint32,address,(address,uint8[])[])'](
      from.address,
      to.address,
      amount,
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

    const { swapped, remaining } = await DCAHub.userPosition(positionId);
    const hubFromBalance = await from.balanceOf(DCAHub.address);
    const hubToBalance = await to.balanceOf(DCAHub.address);
    return {
      positionId,
      swappedBalance: swapped,
      unswappedBalance: remaining,
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

  type Swap = (_: { amountIn: BigNumber }) => Promise<{
    tokenIn: string;
    tokenOut: string;
    swapper: string;
    allowanceTarget: string;
    swapData: string;
    expectedAmountOut: BigNumber;
    value?: BigNumber;
  }>;
  async function runSwapData({ amountIn, swap }: { amountIn: BigNumber; swap: Swap }) {
    const { tokenIn, tokenOut, swapper, swapData, expectedAmountOut, allowanceTarget, value } = await swap({ amountIn });
    const allowanceTargets = isSameAddress(allowanceTarget, constants.ZERO_ADDRESS) ? [] : [{ token: tokenIn, target: allowanceTarget }];
    const tokenOutDistribution = isSameAddress(tokenOut, await DCAHubCompanion.PROTOCOL_TOKEN()) ? constants.ZERO_ADDRESS : tokenOut;

    const arbitraryCall = buildSDK().permit2Service.arbitrary.buildArbitraryCallWithoutPermit({
      allowanceTargets,
      calls: [{ to: swapper, data: swapData, value: value?.toBigInt() ?? 0 }],
      distribution: { [tokenOutDistribution]: [{ recipient: DCAHubCompanion.address, shareBps: 0 }] },
      txValidFor: '1y',
    });
    const { data } = await DCAHubCompanion.populateTransaction.runSwap(
      constants.ZERO_ADDRESS, // No need to set it because we are already transferring the funds to the swapper
      value?.toBigInt() ?? 0,
      arbitraryCall.data,
      tokenOut,
      expectedAmountOut
    );
    return { swapExecutionData: data!, expectedAmountOut };
  }

  async function withdrawSwappedData({ positionId, recipient }: { positionId: BigNumberish; recipient: HasAddress | string }) {
    const { data } = await DCAHubCompanion.populateTransaction.withdrawSwapped(
      DCAHub.address,
      positionId,
      typeof recipient === 'string' ? recipient : recipient.address
    );
    return data!;
  }

  async function reduceAllPositionData({ positionId, recipient }: { positionId: BigNumberish; recipient: HasAddress | string }) {
    const { remaining } = await DCAHub.userPosition(positionId);
    const { data } = await DCAHubCompanion.populateTransaction.reducePosition(
      DCAHub.address,
      positionId,
      remaining,
      0,
      typeof recipient === 'string' ? recipient : recipient.address
    );
    return data!;
  }

  async function terminateData({ positionId, recipient }: { positionId: BigNumberish; recipient: string }) {
    const { data } = await DCAHubCompanion.populateTransaction.terminate(DCAHub.address, positionId, recipient, recipient);
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

  async function increaseAllInCompanionData({ positionId }: { positionId: BigNumber }) {
    const { data } = await DCAHubCompanion.populateTransaction.increasePositionWithBalanceOnContract(DCAHub.address, positionId, 1);
    return data!;
  }

  async function takeFromCallerData({ token, amount }: { token: IERC20; amount: BigNumberish }) {
    const { data } = await DCAHubCompanion.populateTransaction.takeFromCaller(token.address, amount, DCAHubCompanion.address);
    return data!;
  }

  async function permitTakeFromCallerData({
    token,
    amount,
    nonce,
    deadline,
    signature,
  }: {
    token: IERC20;
    amount: BigNumberish;
    nonce: BigNumberish;
    deadline: BigNumberish;
    signature: string;
  }) {
    const { data } = await DCAHubCompanion.populateTransaction.permitTakeFromCaller(
      token.address,
      amount,
      nonce,
      deadline,
      signature,
      companionSwapper
    );
    return data!;
  }

  async function sendToRecipientData({ token, amount, recipient }: { token: IERC20; amount: BigNumberish; recipient: HasAddress }) {
    const { data } = await DCAHubCompanion.populateTransaction.sendToRecipient(token.address, amount, recipient.address);
    return data!;
  }

  function sendAllERC20InCompanionToRecipientData({ token, recipient }: { token: IERC20; recipient: HasAddress }) {
    return sendAllInCompanionToRecipientData({ token: token.address, recipient });
  }

  async function sendAllInCompanionToRecipientData({ token, recipient }: { token: string; recipient: HasAddress }) {
    const { data } = await DCAHubCompanion.populateTransaction.sendBalanceOnContractToRecipient(token, recipient.address);
    return data!;
  }

  async function transformWETHToETH(amount: BigNumber) {
    const nativeToken = await DCAHubCompanion.PROTOCOL_TOKEN();
    const { data } = await transformerRegistry.populateTransaction.transformToUnderlying(
      WETH.address,
      amount,
      DCAHubCompanion.address,
      [{ underlying: nativeToken, amount }],
      constants.MAX_UINT_256
    );
    return {
      swapData: data!,
      swapper: transformerRegistry.address,
      expectedAmountOut: amount,
      allowanceTarget: transformerRegistry.address,
      tokenIn: WETH.address,
      tokenOut: nativeToken,
    };
  }

  async function transformETHToWETH(amount: BigNumber) {
    const nativeToken = await DCAHubCompanion.PROTOCOL_TOKEN();
    const { data } = await transformerRegistry.populateTransaction.transformToDependent(
      WETH.address,
      [{ underlying: nativeToken, amount }],
      DCAHubCompanion.address,
      amount,
      constants.MAX_UINT_256
    );
    return {
      swapData: data!,
      swapper: transformerRegistry.address,
      expectedAmountOut: amount,
      allowanceTarget: constants.ZERO_ADDRESS,
      tokenIn: nativeToken,
      tokenOut: WETH.address,
      value: amount,
    };
  }

  async function swapInDex({ from, to, amountIn }: { from: IERC20; to: IERC20; amountIn: BigNumber }) {
    const { quoteService } = buildSDK();
    const {
      tx,
      minBuyAmount,
      source: { allowanceTarget },
    } = await quoteService.getBestQuote({
      request: {
        chainId: 1,
        sellToken: from.address,
        buyToken: to.address,
        order: { type: 'sell', sellAmount: amountIn.toString() },
        slippagePercentage: 5, // 5%
        takerAddress: companionSwapper,
        filters: { includeSources: ['1inch', 'paraswap', 'open-ocean', 'li-fi'] },
      },
      config: {
        timeout: '3s',
        choose: { by: 'most-swapped', using: 'max sell/min buy amounts' },
      },
    });
    return {
      swapData: tx.data,
      swapper: tx.to,
      expectedAmountOut: BigNumber.from(minBuyAmount.amount),
      allowanceTarget,
      tokenIn: from.address,
      tokenOut: to.address,
    };
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
