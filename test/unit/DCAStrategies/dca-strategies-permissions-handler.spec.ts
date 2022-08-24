import { expect } from 'chai';
import { ethers } from 'hardhat';
import { DCAStrategiesPermissionsHandlerMock__factory, DCAStrategiesPermissionsHandlerMock } from '@typechained';
import { constants, wallet, behaviours } from '@test-utils';
import { given, then, when, contract } from '@test-utils/bdd';
import { snapshot } from '@test-utils/evm';
import { Permission } from 'utils/types';
import { TransactionResponse } from '@ethersproject/abstract-provider';
import { Wallet } from '@ethersproject/wallet';
import { BigNumber } from '@ethersproject/bignumber';
import { _TypedDataEncoder } from '@ethersproject/hash';
import { readArgFromEventOrFail } from '@test-utils/event-utils';
import { fromRpcSig } from 'ethereumjs-util';
import { BigNumberish } from 'ethers';

contract('DCAStrategiesPermissionsHandler', () => {
  const NFT_NAME = 'Mean Finance - DCA Strategy Position';
  const NFT_SYMBOL = 'MF-DCA-P';
  let DCAStrategiesPermissionsHandlerMock: DCAStrategiesPermissionsHandlerMock;
  let snapshotId: string;
  let chainId: BigNumber;

  before('Setup accounts and contracts', async () => {
    const factory: DCAStrategiesPermissionsHandlerMock__factory = await ethers.getContractFactory('DCAStrategiesPermissionsHandlerMock');
    DCAStrategiesPermissionsHandlerMock = await factory.deploy(NFT_NAME, NFT_SYMBOL);
    snapshotId = await snapshot.take();
    chainId = BigNumber.from((await ethers.provider.getNetwork()).chainId);
  });

  beforeEach(async () => {
    await snapshot.revert(snapshotId);
  });

  describe('constructor', () => {
    when('handler is deployed', () => {
      then('name is correct', async () => {
        const name = await DCAStrategiesPermissionsHandlerMock.name();
        expect(name).to.equal(NFT_NAME);
      });
      then('symbol is correct', async () => {
        const symbol = await DCAStrategiesPermissionsHandlerMock.symbol();
        expect(symbol).to.equal(NFT_SYMBOL);
      });
      then('burn counter starts at 0', async () => {
        expect(await DCAStrategiesPermissionsHandlerMock.burnCounter()).to.equal(0);
      });
      then('mint counter starts at 0', async () => {
        expect(await DCAStrategiesPermissionsHandlerMock.mintCounter()).to.equal(0);
      });
    });
  });

  describe('hasPermissions', () => {
    const TOKEN_ID = 1;
    when('checking permisisons for the owner', () => {
      const OWNER = constants.NOT_ZERO_ADDRESS;
      given(async () => {
        await DCAStrategiesPermissionsHandlerMock.mint(OWNER, []);
      });
      then('they have all permissions', async () => {
        const result = await DCAStrategiesPermissionsHandlerMock.hasPermissions(TOKEN_ID, OWNER, [
          Permission.INCREASE,
          Permission.REDUCE,
          Permission.WITHDRAW,
          Permission.TERMINATE,
          Permission.SYNC,
        ]);
        expect(result).to.eql(Array(5).fill(true));
      });
    });

    hasPermissionsTest({
      when: 'operator has no permissions',
      set: [],
      expected: [
        { permission: Permission.INCREASE, result: false },
        { permission: Permission.REDUCE, result: false },
        { permission: Permission.WITHDRAW, result: false },
        { permission: Permission.TERMINATE, result: false },
        { permission: Permission.SYNC, result: false },
      ],
    });

    hasPermissionsTest({
      when: 'operator has some permissions',
      set: [Permission.REDUCE, Permission.WITHDRAW],
      expected: [
        { permission: Permission.INCREASE, result: false },
        { permission: Permission.REDUCE, result: true },
        { permission: Permission.WITHDRAW, result: true },
        { permission: Permission.TERMINATE, result: false },
        { permission: Permission.SYNC, result: false },
      ],
    });

    hasPermissionsTest({
      when: 'operator has all permissions',
      set: [Permission.INCREASE, Permission.REDUCE, Permission.WITHDRAW, Permission.TERMINATE, Permission.SYNC],
      expected: [
        { permission: Permission.INCREASE, result: true },
        { permission: Permission.REDUCE, result: true },
        { permission: Permission.WITHDRAW, result: true },
        { permission: Permission.TERMINATE, result: true },
        { permission: Permission.SYNC, result: true },
      ],
    });

    function hasPermissionsTest({
      when: title,
      set,
      expected,
    }: {
      when: string;
      set: Permission[];
      expected: { permission: Permission; result: boolean }[];
    }) {
      const OWNER = wallet.generateRandomAddress();
      const OPERATOR = constants.NOT_ZERO_ADDRESS;
      when(title, () => {
        given(async () => {
          await DCAStrategiesPermissionsHandlerMock.mint(OWNER, [{ operator: OPERATOR, permissions: set }]);
        });
        then('result is returned correctly', async () => {
          const toCheck = expected.map(({ permission }) => permission);
          const result = await DCAStrategiesPermissionsHandlerMock.hasPermissions(TOKEN_ID, OPERATOR, toCheck);
          expect(result).to.eql(expected.map(({ result }) => result));
        });
      });
    }
  });

  describe('mint', () => {
    let tokenId: number = 1;

    when('owner is zero address', () => {
      then('reverts with message', async () => {
        await behaviours.txShouldRevertWithMessage({
          contract: DCAStrategiesPermissionsHandlerMock,
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
      const PERMISSIONS_TO_SET: number[] = [Permission.WITHDRAW];

      given(async () => {
        initialMintCounter = await DCAStrategiesPermissionsHandlerMock.mintCounter();
        tx = await DCAStrategiesPermissionsHandlerMock.mint(OWNER, [{ operator: OPERATOR, permissions: PERMISSIONS_TO_SET }]);
      });

      then('mint counter gets increased', async () => {
        expect(await DCAStrategiesPermissionsHandlerMock.mintCounter()).to.equal(initialMintCounter.add(1));
      });

      then('permissions are assigned properly', async () => {
        const calls = await DCAStrategiesPermissionsHandlerMock.getSetPermissionCall();
        expect(calls).to.have.lengthOf(1);
        expect(calls[0].tokenId).to.equal(1);
        expect(calls[0].permissionSets).to.have.lengthOf(1);
        expect(calls[0].permissionSets[0].operator).to.equal(OPERATOR);
        expect(calls[0].permissionSets[0].permissions).to.eql(PERMISSIONS_TO_SET);
      });

      then('nft is created and assigned to owner', async () => {
        const tokenOwner = await DCAStrategiesPermissionsHandlerMock.ownerOf(tokenId);
        const balance = await DCAStrategiesPermissionsHandlerMock.balanceOf(OWNER);
        expect(tokenOwner).to.equal(OWNER);
        expect(balance).to.equal(1);
      });
    });
  });

  describe('set permissions', () => {
    let tokenId: number = 1;
    const OPERATOR = constants.NOT_ZERO_ADDRESS;
    let owner: Wallet;
    const BLOCK_NUMBER: number = 256;
    given(async () => {
      owner = await wallet.generateRandom();
      await DCAStrategiesPermissionsHandlerMock.setBlockNumber(BLOCK_NUMBER);
      await DCAStrategiesPermissionsHandlerMock.mint(owner.address, [{ operator: OPERATOR, permissions: [] }]);
      await DCAStrategiesPermissionsHandlerMock.setPermissions(tokenId, [
        { operator: OPERATOR, permissions: [Permission.INCREASE, Permission.REDUCE] },
      ]);
    });

    when('permissions are set', () => {
      then('new permissions are correct', async () => {
        expect(await DCAStrategiesPermissionsHandlerMock.hasPermission(tokenId, OPERATOR, Permission.INCREASE)).to.be.true;
        expect(await DCAStrategiesPermissionsHandlerMock.hasPermission(tokenId, OPERATOR, Permission.REDUCE)).to.be.true;
        expect(await DCAStrategiesPermissionsHandlerMock.hasPermission(tokenId, OPERATOR, Permission.TERMINATE)).to.be.false;
        expect(await DCAStrategiesPermissionsHandlerMock.hasPermission(tokenId, OPERATOR, Permission.WITHDRAW)).to.be.false;
        expect(await DCAStrategiesPermissionsHandlerMock.hasPermission(tokenId, OPERATOR, Permission.SYNC)).to.be.false;
      });
      then('lastUpdated is correct', async () => {
        expect(BLOCK_NUMBER).equal((await DCAStrategiesPermissionsHandlerMock.getTokenPermissions(tokenId, OPERATOR)).lastUpdated);
      });
      when('permissions are removed', () => {
        given(async () => {
          await DCAStrategiesPermissionsHandlerMock.setPermissions(tokenId, [{ operator: OPERATOR, permissions: [] }]);
        });
        then('permissions are correct', async () => {
          expect(await DCAStrategiesPermissionsHandlerMock.hasPermission(tokenId, OPERATOR, Permission.INCREASE)).to.be.false;
          expect(await DCAStrategiesPermissionsHandlerMock.hasPermission(tokenId, OPERATOR, Permission.REDUCE)).to.be.false;
          expect(await DCAStrategiesPermissionsHandlerMock.hasPermission(tokenId, OPERATOR, Permission.TERMINATE)).to.be.false;
          expect(await DCAStrategiesPermissionsHandlerMock.hasPermission(tokenId, OPERATOR, Permission.WITHDRAW)).to.be.false;
          expect(await DCAStrategiesPermissionsHandlerMock.hasPermission(tokenId, OPERATOR, Permission.SYNC)).to.be.false;
        });
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
      tokenId = (await DCAStrategiesPermissionsHandlerMock.mintCounter()).toNumber() + 1;
      owner = await wallet.generateRandom();
      await DCAStrategiesPermissionsHandlerMock.setBlockNumber(BLOCK_NUMBER); // We set a block number so that mint + transfer is done on the same block
      await DCAStrategiesPermissionsHandlerMock.mint(owner.address, [{ operator: OPERATOR, permissions: [Permission.WITHDRAW] }]);
      await DCAStrategiesPermissionsHandlerMock.connect(owner).transferFrom(owner.address, NEW_OWNER, tokenId);
    });

    when('a token is transfered', () => {
      then('reported owner has changed', async () => {
        const newOwner = await DCAStrategiesPermissionsHandlerMock.ownerOf(tokenId);
        expect(newOwner).to.equal(NEW_OWNER);
      });

      // then('previous operators lost permissions', async () => {
      // const hasPermission = await DCAStrategiesPermissionsHandlerMock.hasPermission(tokenId, OPERATOR, Permission.WITHDRAW);
      // expect(hasPermission).to.be.false;
      // });
      // then('block number is recorded', async () => {
      // expect(await DCAStrategiesPermissionsHandlerMock.lastOwnershipChange(TOKEN_ID)).to.equal(BLOCK_NUMBER);
      // });
    });
  });

  describe('burn', () => {
    let tokenId: number = 1;
    const OPERATOR = constants.NOT_ZERO_ADDRESS;
    const OWNER = wallet.generateRandomAddress();

    given(async () => {
      await DCAStrategiesPermissionsHandlerMock.mint(OWNER, [{ operator: OPERATOR, permissions: [Permission.WITHDRAW] }]);
    });

    when('burn is executed', () => {
      let initialBurnCounter: BigNumber;
      given(async () => {
        initialBurnCounter = await DCAStrategiesPermissionsHandlerMock.burnCounter();
        await DCAStrategiesPermissionsHandlerMock.burn(tokenId);
      });
      then('burn counter gets increased', async () => {
        expect(await DCAStrategiesPermissionsHandlerMock.burnCounter()).to.equal(initialBurnCounter.add(1));
      });
      then('nft is burned', async () => {
        const balance = await DCAStrategiesPermissionsHandlerMock.balanceOf(OWNER);
        expect(balance).to.equal(0);
      });
      then('clean up is performed', async () => {
        expect(await DCAStrategiesPermissionsHandlerMock.lastOwnershipChange(tokenId)).to.equal(0);
      });
      then('asking for permission reverts', async () => {
        await behaviours.txShouldRevertWithMessage({
          contract: DCAStrategiesPermissionsHandlerMock,
          func: 'hasPermission',
          args: [tokenId, OPERATOR, Permission.WITHDRAW],
          message: 'ERC721: invalid token ID',
        });
      });
    });
  });

  describe('modify', () => {
    const TOKEN_ID = 1;
    const [OPERATOR_1, OPERATOR_2] = ['0x0000000000000000000000000000000000000001', '0x0000000000000000000000000000000000000002'];

    when('caller is not the owner', () => {
      given(async () => {
        const owner = await wallet.generateRandom();
        await DCAStrategiesPermissionsHandlerMock.mint(owner.address, []);
      });
      then('reverts with message', async () => {
        await behaviours.txShouldRevertWithMessage({
          contract: DCAStrategiesPermissionsHandlerMock.connect(await wallet.generateRandom()),
          func: 'modify',
          args: [TOKEN_ID, []],
          message: 'NotOwner',
        });
      });
    });

    modifyTest({
      when: 'permissions are added for a new operators',
      initial: [{ operator: OPERATOR_1, permissions: [Permission.TERMINATE] }],
      modify: [{ operator: OPERATOR_2, permissions: [Permission.REDUCE] }],
      expected: [
        { operator: OPERATOR_1, permissions: [Permission.TERMINATE] },
        { operator: OPERATOR_2, permissions: [Permission.REDUCE] },
      ],
    });

    modifyTest({
      when: 'permissions are modified for existing operators',
      initial: [{ operator: OPERATOR_1, permissions: [Permission.WITHDRAW] }],
      modify: [
        { operator: OPERATOR_1, permissions: [Permission.INCREASE] },
        { operator: OPERATOR_2, permissions: [Permission.REDUCE] },
      ],
      expected: [
        { operator: OPERATOR_1, permissions: [Permission.INCREASE] },
        { operator: OPERATOR_2, permissions: [Permission.REDUCE] },
      ],
    });

    modifyTest({
      when: 'permissions are removed for existing operators',
      initial: [{ operator: OPERATOR_1, permissions: [Permission.WITHDRAW] }],
      modify: [{ operator: OPERATOR_1, permissions: [] }],
      expected: [{ operator: OPERATOR_1, permissions: [] }],
    });

    type Permissions = { operator: string; permissions: Permission[] }[];
    function modifyTest({
      when: title,
      initial,
      modify,
      expected,
    }: {
      when: string;
      initial: Permissions;
      modify: Permissions;
      expected: Permissions;
    }) {
      const BLOCK_NUMBER = 500;
      when(title, () => {
        let tx: TransactionResponse;
        given(async () => {
          const owner = await wallet.generateRandom();
          await DCAStrategiesPermissionsHandlerMock.mint(owner.address, initial);
          await DCAStrategiesPermissionsHandlerMock.setBlockNumber(BLOCK_NUMBER);
          tx = await DCAStrategiesPermissionsHandlerMock.connect(owner).modify(TOKEN_ID, modify);
        });
        then('permissions are updated correctly', async () => {
          for (const { operator, permissions } of expected) {
            for (const permission of [Permission.INCREASE, Permission.REDUCE, Permission.TERMINATE, Permission.WITHDRAW, Permission.SYNC]) {
              expect(await DCAStrategiesPermissionsHandlerMock.hasPermission(TOKEN_ID, operator, permission)).to.equal(
                permissions.includes(permission)
              );
            }
          }
        });
        then('token permission are updated', async () => {
          for (const { operator, permissions: expectedPermissions } of modify) {
            const { permissions, lastUpdated } = await DCAStrategiesPermissionsHandlerMock.getTokenPermissions(TOKEN_ID, operator);
            if (expectedPermissions.length == 0) {
              expect(lastUpdated).to.equal(0);
            } else {
              expect(lastUpdated).to.equal(BLOCK_NUMBER);
            }
            expect(permissions).to.equal(toUint8(expectedPermissions));
          }
        });
        then('event is emitted', async () => {
          const id = await readArgFromEventOrFail(tx, 'Modified', 'tokenId');
          const permissions: any = await readArgFromEventOrFail(tx, 'Modified', 'permissions');
          expect(id).to.equal(TOKEN_ID);
          expect(permissions.length).to.equal(modify.length);
          for (let i = 0; i < modify.length; i++) {
            expect(permissions[i].operator).to.equal(modify[i].operator);
            expect(permissions[i].permissions).to.eql(modify[i].permissions);
          }
        });
      });
      function toUint8(permissions: Permission[]) {
        return permissions.reduce((accum, curr) => accum + Math.pow(2, curr), 0);
      }
    }
  });

  describe('permit', () => {
    const TOKEN_ID = 1;
    const SPENDER = wallet.generateRandomAddress();
    let owner: Wallet, stranger: Wallet;

    given(async () => {
      owner = await wallet.generateRandom();
      stranger = await wallet.generateRandom();
      await DCAStrategiesPermissionsHandlerMock.mint(owner.address, []);
    });

    when(`owner tries to execute a permit`, () => {
      let response: TransactionResponse;

      given(async () => {
        response = await signAndPermit({ signer: owner, spender: SPENDER });
      });

      then('spender is registered as approved', async () => {
        expect(await DCAStrategiesPermissionsHandlerMock.getApproved(TOKEN_ID)).to.be.equal(SPENDER);
      });

      then('nonces is increased', async () => {
        expect(await DCAStrategiesPermissionsHandlerMock.nonces(owner.address)).to.be.equal(1);
      });

      then('event is emitted', async () => {
        await expect(response).to.emit(DCAStrategiesPermissionsHandlerMock, 'Approval').withArgs(owner.address, SPENDER, TOKEN_ID);
      });
    });

    permitFailsTest({
      when: 'some stranger tries to permit',
      exec: () => signAndPermit({ signer: stranger }),
      txFailsWith: 'InvalidSignature',
    });

    permitFailsTest({
      when: 'permit is expired',
      exec: () => signAndPermit({ signer: owner, deadline: BigNumber.from(0) }),
      txFailsWith: 'ExpiredDeadline',
    });

    permitFailsTest({
      when: 'chainId is different',
      exec: () => signAndPermit({ signer: owner, chainId: BigNumber.from(20) }),
      txFailsWith: 'InvalidSignature',
    });

    permitFailsTest({
      when: 'signer signed something differently',
      exec: async () => {
        const data = withDefaults({ signer: owner, deadline: constants.MAX_UINT_256 });
        const signature = await getSignature(data);
        return permit({ ...data, deadline: constants.MAX_UINT_256.sub(1) }, signature);
      },
      txFailsWith: 'InvalidSignature',
    });

    permitFailsTest({
      when: 'signature is reused',
      exec: async () => {
        const data = withDefaults({ signer: owner });
        const signature = await getSignature(data);
        await permit(data, signature);
        return permit(data, signature);
      },
      txFailsWith: 'InvalidSignature',
    });

    function permitFailsTest({
      when: title,
      exec,
      txFailsWith: errorMessage,
    }: {
      when: string;
      exec: () => Promise<TransactionResponse>;
      txFailsWith: string;
    }) {
      when(title, () => {
        let tx: Promise<TransactionResponse>;
        given(() => {
          tx = exec();
        });
        then('tx reverts with message', async () => {
          await behaviours.checkTxRevertedWithMessage({ tx, message: errorMessage });
        });
      });
    }

    async function signAndPermit(options: Pick<OperationData, 'signer'> & Partial<OperationData>) {
      const data = withDefaults(options);
      const signature = await getSignature(data);
      return permit(data, signature);
    }

    async function permit(data: OperationData, { v, r, s }: { v: number; r: Buffer; s: Buffer }) {
      return DCAStrategiesPermissionsHandlerMock.permit(data.spender, TOKEN_ID, data.deadline, v, r, s);
    }

    function withDefaults(options: Pick<OperationData, 'signer'> & Partial<OperationData>): OperationData {
      return {
        nonce: BigNumber.from(0),
        deadline: constants.MAX_UINT_256,
        spender: SPENDER,
        chainId,
        ...options,
      };
    }

    const Permit = [
      { name: 'spender', type: 'address' },
      { name: 'tokenId', type: 'uint256' },
      { name: 'nonce', type: 'uint256' },
      { name: 'deadline', type: 'uint256' },
    ];

    async function getSignature(options: OperationData) {
      const { domain, types, value } = buildPermitData(options);
      const signature = await options.signer._signTypedData(domain, types, value);
      return fromRpcSig(signature);
    }

    function buildPermitData(options: OperationData) {
      return {
        primaryType: 'Permit',
        types: { Permit },
        domain: { name: NFT_NAME, version: '1', chainId: options.chainId, verifyingContract: DCAStrategiesPermissionsHandlerMock.address },
        value: { tokenId: TOKEN_ID, ...options },
      };
    }

    type OperationData = {
      signer: Wallet;
      spender: string;
      nonce: BigNumber;
      deadline: BigNumber;
      chainId: BigNumber;
    };
  });

  describe('permissionPermit', () => {
    const TOKEN_ID = 1;
    const OPERATOR = wallet.generateRandomAddress();
    let owner: Wallet, stranger: Wallet;

    given(async () => {
      owner = await wallet.generateRandom();
      stranger = await wallet.generateRandom();
      await DCAStrategiesPermissionsHandlerMock.mint(owner.address, []);
    });

    function permitTest({ when: title, permissions }: { when: string; permissions: Permission[] }) {
      when(title, () => {
        let tx: TransactionResponse;

        given(async () => {
          tx = await signAndPermit({ signer: owner, permissions: [{ operator: OPERATOR, permissions }] });
        });

        then('operator gains permissions', async () => {
          for (const permission of permissions) {
            expect(await DCAStrategiesPermissionsHandlerMock.hasPermission(TOKEN_ID, OPERATOR, permission)).to.be.true;
          }
        });

        then('nonces is increased', async () => {
          expect(await DCAStrategiesPermissionsHandlerMock.nonces(owner.address)).to.be.equal(1);
        });

        then('event is emitted', async () => {
          const id = await readArgFromEventOrFail(tx, 'Modified', 'tokenId');
          const emittedPermissions: any = await readArgFromEventOrFail(tx, 'Modified', 'permissions');
          expect(id).to.equal(TOKEN_ID);
          expect(emittedPermissions.length).to.equal(1);
          expect(emittedPermissions[0].operator).to.equal(OPERATOR);
          expect(emittedPermissions[0].permissions).to.eql(permissions);
        });
      });
    }

    permitTest({
      when: `setting only one permission`,
      permissions: [Permission.INCREASE],
    });

    permitTest({
      when: `setting two permissions`,
      permissions: [Permission.REDUCE, Permission.TERMINATE],
    });

    permitTest({
      when: `setting three permissions`,
      permissions: [Permission.REDUCE, Permission.WITHDRAW, Permission.INCREASE],
    });

    permitTest({
      when: `setting four permissions`,
      permissions: [Permission.REDUCE, Permission.WITHDRAW, Permission.INCREASE, Permission.TERMINATE],
    });

    permitTest({
      when: `setting all permissions`,
      permissions: [Permission.INCREASE, Permission.REDUCE, Permission.WITHDRAW, Permission.TERMINATE, Permission.SYNC],
    });

    permitFailsTest({
      when: 'some stranger tries to permit',
      exec: () => signAndPermit({ signer: stranger }),
      txFailsWith: 'InvalidSignature',
    });

    permitFailsTest({
      when: 'permit is expired',
      exec: () => signAndPermit({ signer: owner, deadline: BigNumber.from(0) }),
      txFailsWith: 'ExpiredDeadline',
    });

    permitFailsTest({
      when: 'chainId is different',
      exec: () => signAndPermit({ signer: owner, chainId: BigNumber.from(20) }),
      txFailsWith: 'InvalidSignature',
    });

    permitFailsTest({
      when: 'signer signed something differently',
      exec: async () => {
        const data = withDefaults({ signer: owner, deadline: constants.MAX_UINT_256 });
        const signature = await getSignature(data);
        return permissionPermit({ ...data, deadline: constants.MAX_UINT_256.sub(1) }, signature);
      },
      txFailsWith: 'InvalidSignature',
    });

    permitFailsTest({
      when: 'signature is reused',
      exec: async () => {
        const data = withDefaults({ signer: owner });
        const signature = await getSignature(data);
        await permissionPermit(data, signature);
        return permissionPermit(data, signature);
      },
      txFailsWith: 'InvalidSignature',
    });

    function permitFailsTest({
      when: title,
      exec,
      txFailsWith: errorMessage,
    }: {
      when: string;
      exec: () => Promise<TransactionResponse>;
      txFailsWith: string;
    }) {
      when(title, () => {
        let tx: Promise<TransactionResponse>;
        given(() => {
          tx = exec();
        });
        then('tx reverts with message', async () => {
          await behaviours.checkTxRevertedWithMessage({ tx, message: errorMessage });
        });
      });
    }

    async function signAndPermit(options: Pick<OperationData, 'signer'> & Partial<OperationData>) {
      const data = withDefaults(options);
      const signature = await getSignature(data);
      return permissionPermit(data, signature);
    }

    async function permissionPermit(data: OperationData, { v, r, s }: { v: number; r: Buffer; s: Buffer }) {
      return DCAStrategiesPermissionsHandlerMock.permissionPermit(data.permissions, TOKEN_ID, data.deadline, v, r, s);
    }

    function withDefaults(options: Pick<OperationData, 'signer'> & Partial<OperationData>): OperationData {
      return {
        nonce: BigNumber.from(0),
        deadline: constants.MAX_UINT_256,
        permissions: [],
        chainId,
        ...options,
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

    async function getSignature(options: OperationData) {
      const { domain, types, value } = buildPermitData(options);
      const signature = await options.signer._signTypedData(domain, types, value);
      return fromRpcSig(signature);
    }

    function buildPermitData(options: OperationData) {
      return {
        primaryType: 'PermissionPermit',
        types: { PermissionSet, PermissionPermit },
        domain: { name: NFT_NAME, version: '1', chainId: options.chainId, verifyingContract: DCAStrategiesPermissionsHandlerMock.address },
        value: { tokenId: TOKEN_ID, ...options },
      };
    }

    type OperationData = {
      signer: Wallet;
      permissions: { operator: string; permissions: Permission[] }[];
      nonce: BigNumber;
      deadline: BigNumber;
      chainId: BigNumber;
    };
  });
});
