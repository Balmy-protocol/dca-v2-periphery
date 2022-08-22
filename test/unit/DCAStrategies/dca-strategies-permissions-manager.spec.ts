import { expect } from 'chai';
import { ethers } from 'hardhat';
import { DCAPermissionsManagerMock__factory, DCAPermissionsManagerMock } from '@typechained';
import { constants, wallet, behaviours } from '@test-utils';
import { given, then, when, contract } from '@test-utils/bdd';
import { snapshot } from '@test-utils/evm';
import { Permission } from 'utils/types';
import { TransactionResponse } from '@ethersproject/abstract-provider';
// import { getInstancesOfEvent, readArgFromEventOrFail } from '@test-utils/event-utils';
import { Wallet } from '@ethersproject/wallet';
import { BigNumber } from '@ethersproject/bignumber';
import { _TypedDataEncoder } from '@ethersproject/hash';
import { fromRpcSig } from 'ethereumjs-util';
import { BigNumberish } from 'ethers';

contract('DCAPermissionsManager', () => {
  const NFT_NAME = 'Mean Finance - DCA Strategy Position';
  const NFT_SYMBOL = 'MF-DCA-P';
  let DCAPermissionsManagerFactory: DCAPermissionsManagerMock__factory;
  let DCAPermissionsManager: DCAPermissionsManagerMock;
  let snapshotId: string;
  let chainId: BigNumber;

  before('Setup accounts and contracts', async () => {
    DCAPermissionsManagerFactory = await ethers.getContractFactory(
      'contracts/mocks/DCAStrategies/DCAPermissionsManagerMock.sol:DCAPermissionsManagerMock'
    );
    DCAPermissionsManager = await DCAPermissionsManagerFactory.deploy(NFT_NAME, NFT_SYMBOL);
    snapshotId = await snapshot.take();
    chainId = BigNumber.from((await ethers.provider.getNetwork()).chainId);
  });

  beforeEach(async () => {
    await snapshot.revert(snapshotId);
  });

  describe('constructor', () => {
    when('manager is deployed', () => {
      then('name is correct', async () => {
        const name = await DCAPermissionsManager.name();
        expect(name).to.equal(NFT_NAME);
      });
      then('symbol is correct', async () => {
        const symbol = await DCAPermissionsManager.symbol();
        expect(symbol).to.equal(NFT_SYMBOL);
      });
      then('burn counter starts at 0', async () => {
        expect(await DCAPermissionsManager.burnCounter()).to.equal(0);
      });
      then('mint counter starts at 0', async () => {
        expect(await DCAPermissionsManager.mintCounter()).to.equal(0);
      });
    });
  });

  describe('block number', () => {
    const BLOCK_NUMBER = 555888222;

    given(async () => {
      await DCAPermissionsManager.setBlockNumber(BLOCK_NUMBER);
    });

    when('getting block number', () => {
      then('block number is correct', async () => {
        expect(await DCAPermissionsManager.getBlockNumber()).to.equal(BLOCK_NUMBER);
      });
    });
  });

  describe('mint', () => {
    let tokenId: number;
    given(async () => {
      tokenId = (await DCAPermissionsManager.mintCounter()).toNumber() + 1;
    });
    when('owner is zero address', () => {
      then('reverts with message', async () => {
        await behaviours.txShouldRevertWithMessage({
          contract: DCAPermissionsManager,
          func: 'mint',
          args: [constants.ZERO_ADDRESS, []],
          message: 'ERC721: mint to the zero address',
        });
      });
    });
    when('mint is executed', () => {
      const OWNER = wallet.generateRandomAddress();
      const OPERATOR = constants.NOT_ZERO_ADDRESS;
      let tx: TransactionResponse;
      let initialMintCounter: BigNumber;

      given(async () => {
        initialMintCounter = await DCAPermissionsManager.mintCounter();
        tx = await DCAPermissionsManager.mint(OWNER, [{ operator: OPERATOR, permissions: [Permission.WITHDRAW] }]);
      });

      then('mint counter gets increased', async () => {
        expect(await DCAPermissionsManager.mintCounter()).to.equal(initialMintCounter.add(1));
      });

      //   then('owner has all permisisons', async () => {
      //     expect(await DCAPermissionsManager.hasPermission(TOKEN_ID, OWNER, Permission.INCREASE)).to.be.true;
      //     expect(await DCAPermissionsManager.hasPermission(TOKEN_ID, OWNER, Permission.REDUCE)).to.be.true;
      //     expect(await DCAPermissionsManager.hasPermission(TOKEN_ID, OWNER, Permission.TERMINATE)).to.be.true;
      //     expect(await DCAPermissionsManager.hasPermission(TOKEN_ID, OWNER, Permission.WITHDRAW)).to.be.true;
      //   });

      //   then('permissions are assigned properly', async () => {
      //     expect(await DCAPermissionsManager.hasPermission(TOKEN_ID, OPERATOR, Permission.WITHDRAW)).to.be.true;
      //   });

      //   then('no extra permissions are assigned', async () => {
      //     for (const permission of [Permission.INCREASE, Permission.REDUCE, Permission.TERMINATE]) {
      //       expect(await DCAPermissionsManager.hasPermission(TOKEN_ID, OPERATOR, permission)).to.be.false;
      //     }
      //   });

      then('nft is created and assigned to owner', async () => {
        const tokenOwner = await DCAPermissionsManager.ownerOf(tokenId);
        const balance = await DCAPermissionsManager.balanceOf(OWNER);
        expect(tokenOwner).to.equal(OWNER);
        expect(balance).to.equal(tokenId);
      });
    });
  });

  describe('transfer', () => {
    let tokenId: number;
    const OPERATOR = constants.NOT_ZERO_ADDRESS;
    const NEW_OWNER = wallet.generateRandomAddress();
    const BLOCK_NUMBER = 10;
    let owner: Wallet;

    given(async () => {
      tokenId = (await DCAPermissionsManager.mintCounter()).toNumber() + 1;
      owner = await wallet.generateRandom();
      await DCAPermissionsManager.setBlockNumber(BLOCK_NUMBER); // We set a block number so that mint + transfer is done on the same block
      await DCAPermissionsManager.mint(owner.address, [{ operator: OPERATOR, permissions: [Permission.WITHDRAW] }]);
      await DCAPermissionsManager.connect(owner).transferFrom(owner.address, NEW_OWNER, tokenId);
    });

    when('a token is transfered', () => {
      then('reported owner has changed', async () => {
        const newOwner = await DCAPermissionsManager.ownerOf(tokenId);
        expect(newOwner).to.equal(NEW_OWNER);
      });
      //   then('previous operators lost permissions', async () => {
      //     const hasPermission = await DCAPermissionsManager.hasPermission(tokenId, OPERATOR, Permission.WITHDRAW);
      //     expect(hasPermission).to.be.false;
      //   });
      //   then('block number is recorded', async () => {
      //     expect(await DCAPermissionsManager.lastOwnershipChange(TOKEN_ID)).to.equal(BLOCK_NUMBER);
      //   });
    });
  });

  describe('burn', () => {
    let tokenId: number;
    const OPERATOR = constants.NOT_ZERO_ADDRESS;
    const OWNER = wallet.generateRandomAddress();

    given(async () => {
      tokenId = (await DCAPermissionsManager.mintCounter()).toNumber() + 1;
      await DCAPermissionsManager.mint(OWNER, [{ operator: OPERATOR, permissions: [Permission.WITHDRAW] }]);
    });

    when('burn is executed', () => {
      let initialBurnCounter: BigNumber;
      given(async () => {
        initialBurnCounter = await DCAPermissionsManager.burnCounter();
        await DCAPermissionsManager.burn(tokenId);
      });
      then('burn counter gets increased', async () => {
        expect(await DCAPermissionsManager.burnCounter()).to.equal(initialBurnCounter.add(1));
      });
      then('nft is burned', async () => {
        const balance = await DCAPermissionsManager.balanceOf(OWNER);
        expect(balance).to.equal(0);
      });
      //   then('clean up is performed', async () => {
      //     expect(await DCAPermissionsManager.lastOwnershipChange(TOKEN_ID)).to.equal(0);
      //   });
      //   then('asking for permission reverts', async () => {
      //     await behaviours.txShouldRevertWithMessage({
      //       contract: DCAPermissionsManager,
      //       func: 'hasPermission',
      //       args: [tokenId, OPERATOR, Permission.WITHDRAW],
      //       message: 'ERC721: invalid token ID',
      //     });
      //   });
    });
  });
});
