import { expect } from 'chai';
import { deployments, ethers, getNamedAccounts } from 'hardhat';
import { TransactionResponse } from '@ethersproject/providers';
import { constants, wallet } from '@test-utils';
import { contract, given, then, when } from '@test-utils/bdd';
import evm, { snapshot } from '@test-utils/evm';
import { PositionMigrator, DCAHubSwapper__factory, IERC20 } from '@typechained';
import { DCAHub, OracleAggregator } from '@mean-finance/dca-v2-core/typechained';
import { abi as DCA_HUB_ABI } from '@mean-finance/dca-v2-core/artifacts/contracts/DCAHub/DCAHub.sol/DCAHub.json';
import { abi as IERC20_ABI } from '@openzeppelin/contracts/build/contracts/IERC20.json';
import { BigNumber, utils } from 'ethers';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { SwapInterval } from '@test-utils/interval-utils';
import forkBlockNumber from '@integration/fork-block-numbers';
import { fromRpcSig } from 'ethereumjs-util';
import { DeterministicFactory, DeterministicFactory__factory } from '@mean-finance/deterministic-factory/typechained';

const WETH_ADDRESS = '0x4200000000000000000000000000000000000006';
const USDC_ADDRESS = '0x7f5c764cbc14f9669b88837ca1490cca17c31607';
const WETH_WHALE_ADDRESS = '0xaa30d6bba6285d0585722e2440ff89e23ef68864';
const USDC_WHALE_ADDRESS = '0xad7b4c162707e0b2b5f6fddbd3f8538a5fba0d60';
const BETA_HUB = '0x24F85583FAa9F8BD0B8Aa7B1D1f4f53F0F450038';
const VULN_HUB = '0x230C63702D1B5034461ab2ca889a30E343D81349';

contract('PositionMigrator', () => {
  let WETH: IERC20, USDC: IERC20;
  let positionOwner: SignerWithAddress, swapper: SignerWithAddress;
  let vulnDCAHub: DCAHub, betaDCAHub: DCAHub, DCAHub: DCAHub;
  let migrator: PositionMigrator;
  let snapshotId: string;
  let chainId: BigNumber;

  const RATE = BigNumber.from(100000000);
  const AMOUNT_OF_SWAPS = 10;

  before(async () => {
    await evm.reset({
      network: 'optimism',
      blockNumber: forkBlockNumber['position-migrator'],
      skipHardhatDeployFork: true,
    });
    [positionOwner, swapper] = await ethers.getSigners();

    const namedAccounts = await getNamedAccounts();
    const governorAddress = namedAccounts.governor;
    const governor = await wallet.impersonate(governorAddress);
    await ethers.provider.send('hardhat_setBalance', [governorAddress, '0xffffffffffffffff']);

    const deterministicFactory = await ethers.getContractAt<DeterministicFactory>(
      DeterministicFactory__factory.abi,
      '0xbb681d77506df5CA21D2214ab3923b4C056aa3e2'
    );

    await deterministicFactory.connect(governor).grantRole(await deterministicFactory.DEPLOYER_ROLE(), namedAccounts.deployer);

    await deployments.run(['DCAHub', 'PositionMigrator'], {
      resetMemory: true,
      deletePreviousDeployments: false,
      writeDeploymentsToFiles: false,
    });

    DCAHub = await ethers.getContract('DCAHub');
    migrator = await ethers.getContract('PositionMigrator');
    betaDCAHub = await ethers.getContractAt(DCA_HUB_ABI, BETA_HUB);
    vulnDCAHub = await ethers.getContractAt(DCA_HUB_ABI, VULN_HUB);

    // Unpause
    await vulnDCAHub.connect(governor).unpause();
    await betaDCAHub.connect(governor).unpause();

    // Allow one minute interval
    await betaDCAHub.connect(governor).addSwapIntervalsToAllowedList([SwapInterval.ONE_MINUTE.seconds]);
    await vulnDCAHub.connect(governor).addSwapIntervalsToAllowedList([SwapInterval.ONE_MINUTE.seconds]);
    await DCAHub.connect(governor).addSwapIntervalsToAllowedList([SwapInterval.ONE_MINUTE.seconds]);

    // Allow tokens
    await DCAHub.connect(governor).setAllowedTokens([WETH_ADDRESS, USDC_ADDRESS], [true, true]);

    // Set Uniswap oracle so we don't have issues while moving timestamp (Chainlink has maxDelay = 1 day)
    const oracleAggregator = await ethers.getContract<OracleAggregator>('OracleAggregator');
    await oracleAggregator.connect(governor).setOracleForPair(WETH_ADDRESS, USDC_ADDRESS, 2);

    WETH = await ethers.getContractAt(IERC20_ABI, WETH_ADDRESS);
    USDC = await ethers.getContractAt(IERC20_ABI, USDC_ADDRESS);

    // Send tokens from whales, to our users
    await distributeTokensToUsers();

    chainId = BigNumber.from((await ethers.provider.getNetwork()).chainId);
    snapshotId = await snapshot.take();
  });

  beforeEach(async () => {
    await snapshot.revert(snapshotId);
  });

  migratePositionTest({
    title: 'migrating from beta version',
    sourceHub: () => betaDCAHub,
    targetHub: () => DCAHub,
  });

  migratePositionTest({
    title: 'migrating from vulnerable version',
    sourceHub: () => vulnDCAHub,
    targetHub: () => DCAHub,
  });

  function migratePositionTest({ title, sourceHub, targetHub }: { title: string; sourceHub: () => DCAHub; targetHub: () => DCAHub }) {
    when(title, () => {
      let sourcePositionId: BigNumber, targetPositionId: BigNumber;
      let swappedBalance: BigNumber, unswappedBalance: BigNumber;
      let tx: TransactionResponse;
      given(async () => {
        ({ positionId: sourcePositionId, swappedBalance, unswappedBalance } = await depositInHubAndSwap(sourceHub()));
        const signature = await generateSignature(sourceHub(), positionOwner, sourcePositionId);
        tx = await migrator.migrate(sourceHub().address, sourcePositionId, signature, targetHub().address);
        const event = await getHubEvent(tx, 'Deposited');
        targetPositionId = event.args.positionId;
      });
      then('position is terminated', async () => {
        const userPosition = await sourceHub().userPosition(sourcePositionId);
        expect(userPosition.swapInterval).to.equal(0);
      });
      then('owner gets the swapped balance', async () => {
        const balance = await WETH.balanceOf(positionOwner.address);
        expect(balance).to.equal(swappedBalance);
      });
      then('new position is created on target hub', async () => {
        const { from, to, swapInterval, swapsExecuted, swapped, swapsLeft, remaining, rate } = await targetHub().userPosition(targetPositionId);
        expect(from.toLowerCase()).to.equal(USDC.address.toLowerCase());
        expect(to.toLowerCase()).to.equal(WETH.address.toLowerCase());
        expect(swapInterval).to.equal(SwapInterval.ONE_MINUTE.seconds);
        expect(swapsExecuted).to.equal(0);
        expect(swapped).to.equal(0);
        expect(swapsLeft).to.equal(AMOUNT_OF_SWAPS - 1);
        expect(remaining).to.equal(unswappedBalance);
        expect(rate).to.equal(RATE);
      });
      then('event is emitted', async () => {
        await expect(tx).to.emit(migrator, 'Migrated').withArgs(sourceHub().address, sourcePositionId, targetHub().address, targetPositionId);
      });
    });
  }

  async function distributeTokensToUsers() {
    const wethWhale = await wallet.impersonate(WETH_WHALE_ADDRESS);
    const usdcWhale = await wallet.impersonate(USDC_WHALE_ADDRESS);
    await ethers.provider.send('hardhat_setBalance', [WETH_WHALE_ADDRESS, '0xffffffffffffffff']);
    await ethers.provider.send('hardhat_setBalance', [USDC_WHALE_ADDRESS, '0xffffffffffffffff']);
    await WETH.connect(wethWhale).transfer(swapper.address, BigNumber.from(10).pow(19));
    await USDC.connect(usdcWhale).transfer(positionOwner.address, BigNumber.from(10).pow(12));
  }

  async function depositInHubAndSwap(hub: DCAHub) {
    await USDC.connect(positionOwner).approve(hub.address, constants.MAX_UINT_256);
    const tx = await hub
      .connect(positionOwner)
      ['deposit(address,address,uint256,uint32,uint32,address,(address,uint8[])[])'](
        USDC.address,
        WETH.address,
        RATE.mul(AMOUNT_OF_SWAPS),
        AMOUNT_OF_SWAPS,
        SwapInterval.ONE_MINUTE.seconds,
        positionOwner.address,
        []
      );
    const event = await getHubEvent(tx, 'Deposited');
    const positionId = event.args.positionId;

    const DCAHubSwapperFactory: DCAHubSwapper__factory = await ethers.getContractFactory(
      'contracts/DCAHubSwapper/DCAHubSwapper.sol:DCAHubSwapper'
    );
    const DCAHubSwapper = await DCAHubSwapperFactory.deploy(constants.NOT_ZERO_ADDRESS, constants.NOT_ZERO_ADDRESS, [], [swapper.address]);
    await WETH.connect(swapper).approve(DCAHubSwapper.address, constants.MAX_UINT_256);
    await DCAHubSwapper.connect(swapper).swapForCaller(
      hub.address,
      [WETH_ADDRESS, USDC_ADDRESS],
      [{ indexTokenA: 0, indexTokenB: 1 }],
      [0, 0],
      [constants.MAX_UINT_256, constants.MAX_UINT_256],
      swapper.address,
      constants.MAX_UINT_256
    );

    const { swapped } = await hub.userPosition(positionId);
    return { positionId, swappedBalance: swapped, unswappedBalance: RATE.mul(AMOUNT_OF_SWAPS - 1) };
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

  async function generateSignature(sourceHub: DCAHub, signer: SignerWithAddress, tokenId: BigNumber) {
    const permissions = [{ operator: migrator.address, permissions: [Permission.TERMINATE] }];
    const { v, r, s } = await getSignature(sourceHub, signer, tokenId, permissions);
    return {
      permissions,
      deadline: constants.MAX_UINT_256,
      v,
      r,
      s,
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

  async function getSignature(
    sourceHub: DCAHub,
    signer: SignerWithAddress,
    tokenId: BigNumber,
    permissions: { operator: string; permissions: Permission[] }[]
  ) {
    const verifyingContract = await sourceHub.permissionManager();
    const { domain, types, value } = buildPermitData(verifyingContract, tokenId, permissions);
    const signature = await signer._signTypedData(domain, types, value);
    return fromRpcSig(signature);
  }

  function buildPermitData(verifyingContract: string, tokenId: BigNumber, permissions: { operator: string; permissions: Permission[] }[]) {
    return {
      primaryType: 'PermissionPermit',
      types: { PermissionSet, PermissionPermit },
      domain: { name: 'Mean Finance DCA', version: '1', chainId, verifyingContract },
      value: { tokenId, permissions, nonce: 0, deadline: constants.MAX_UINT_256 },
    };
  }

  enum Permission {
    INCREASE,
    REDUCE,
    WITHDRAW,
    TERMINATE,
  }
});
