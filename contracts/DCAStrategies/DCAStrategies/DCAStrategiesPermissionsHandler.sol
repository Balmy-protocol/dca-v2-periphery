// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity >=0.8.7 <0.9.0;

import '@openzeppelin/contracts/token/ERC721/ERC721.sol';
import '@openzeppelin/contracts/utils/cryptography/draft-EIP712.sol';
import '../../libraries/PermissionMath.sol';
import '../../interfaces/IDCAStrategies.sol';
import '../../utils/Governable.sol';

abstract contract DCAStrategiesPermissionsHandler is IDCAStrategiesPermissionsHandler, ERC721, EIP712, Governable {
  using PermissionMath for IDCAStrategies.Permission[];
  using PermissionMath for uint8;

  /// @inheritdoc IDCAStrategiesPermissionsHandler
  mapping(uint256 => uint256) public lastOwnershipChange;
  /// @inheritdoc IDCAStrategiesPermissionsHandler
  mapping(address => uint256) public nonces;
  /// @inheritdoc IDCAStrategiesPermissionsHandler
  IDCAHubPositionDescriptor public nftDescriptor;
  /// @inheritdoc IDCAStrategiesPermissionsHandler
  bytes32 public constant PERMIT_TYPEHASH = keccak256('Permit(address spender,uint256 tokenId,uint256 nonce,uint256 deadline)');
  /// @inheritdoc IDCAStrategiesPermissionsHandler
  bytes32 public constant MULTI_PERMISSION_PERMIT_TYPEHASH =
    keccak256(
      'MultiPermissionPermit(PositionPermissions[] positions,uint256 nonce,uint256 deadline)PermissionSet(address operator,uint8[] permissions)PositionPermissions(uint256 tokenId,PermissionSet[] permissionSets)'
    );
  /// @inheritdoc IDCAStrategiesPermissionsHandler
  bytes32 public constant PERMISSION_SET_TYPEHASH = keccak256('PermissionSet(address operator,uint8[] permissions)');
  /// @inheritdoc IDCAStrategiesPermissionsHandler
  bytes32 public constant POSITION_PERMISSIONS_TYPEHASH =
    keccak256('PositionPermissions(uint256 tokenId,PermissionSet[] permissionSets)PermissionSet(address operator,uint8[] permissions)');
  mapping(bytes32 => TokenPermission) internal _tokenPermissions; // key(id, operator) => TokenPermission
  uint256 internal _burnCounter;
  uint256 internal _mintCounter;

  constructor(IDCAHubPositionDescriptor _descriptor) {
    if (address(_descriptor) == address(0)) revert IDCAStrategies.ZeroAddress();
    nftDescriptor = _descriptor;
  }

  /// @inheritdoc IDCAStrategiesPermissionsHandler
  // solhint-disable-next-line func-name-mixedcase
  function DOMAIN_SEPARATOR() external view override returns (bytes32) {
    return _domainSeparatorV4();
  }

  /// @inheritdoc IERC721BasicEnumerable
  function totalSupply() external view override returns (uint256) {
    return _mintCounter - _burnCounter;
  }

  /// @inheritdoc IDCAStrategiesPermissionsHandler
  function hasPermission(
    uint256 _id,
    address _account,
    IDCAStrategies.Permission _permission
  ) public view override returns (bool) {
    if (ownerOf(_id) == _account) {
      return true;
    }
    TokenPermission memory _tokenPermission = getTokenPermissions(_id, _account);
    // If there was an ownership change after the permission was last updated, then the address doesn't have the permission
    return _tokenPermission.permissions.hasPermission(_permission) && lastOwnershipChange[_id] < _tokenPermission.lastUpdated;
  }

  /// @inheritdoc IDCAStrategiesPermissionsHandler
  function modifyMany(PositionPermissions[] calldata _permissions) external {
    for (uint256 i = 0; i < _permissions.length; ) {
      PositionPermissions memory _permission = _permissions[i];
      if (msg.sender != ownerOf(_permission.tokenId)) revert NotOwner();

      _modify(_permission.tokenId, _permissions[i].permissionSets);
      unchecked {
        i++;
      }
    }
  }

  /// @inheritdoc IDCAStrategiesPermissionsHandler
  function permit(
    address _spender,
    uint256 _tokenId,
    uint256 _deadline,
    uint8 _v,
    bytes32 _r,
    bytes32 _s
  ) external override {
    if (block.timestamp > _deadline) revert ExpiredDeadline();

    address _owner = ownerOf(_tokenId);
    bytes32 _structHash = keccak256(abi.encode(PERMIT_TYPEHASH, _spender, _tokenId, nonces[_owner]++, _deadline));
    bytes32 _hash = _hashTypedDataV4(_structHash);

    address _signer = ECDSA.recover(_hash, _v, _r, _s);
    if (_signer != _owner) revert InvalidSignature();

    _approve(_spender, _tokenId);
  }

  /// @inheritdoc IDCAStrategiesPermissionsHandler
  function multiPermissionPermit(
    IDCAStrategies.PositionPermissions[] calldata _permissions,
    uint256 _deadline,
    uint8 _v,
    bytes32 _r,
    bytes32 _s
  ) external {
    if (block.timestamp > _deadline) revert ExpiredDeadline();

    address _owner = ownerOf(_permissions[0].tokenId);
    bytes32 _structHash = keccak256(abi.encode(MULTI_PERMISSION_PERMIT_TYPEHASH, keccak256(_encode(_permissions)), nonces[_owner]++, _deadline));
    bytes32 _hash = _hashTypedDataV4(_structHash);

    address _signer = ECDSA.recover(_hash, _v, _r, _s);
    if (_signer != _owner) revert InvalidSignature();

    for (uint256 i = 0; i < _permissions.length; ) {
      uint256 _tokenId = _permissions[i].tokenId;
      if (i > 0) {
        address _positionOwner = ownerOf(_tokenId);
        if (_signer != _positionOwner) revert NotOwner();
      }
      _modify(_tokenId, _permissions[i].permissionSets);
      unchecked {
        i++;
      }
    }
  }

  /// @inheritdoc IDCAStrategiesPermissionsHandler
  // TODO: update this after building the new descriptor
  function setNFTDescriptor(IDCAHubPositionDescriptor _descriptor) external onlyGovernor {
    if (address(_descriptor) == address(0)) revert IDCAStrategies.ZeroAddress();
    nftDescriptor = _descriptor;
    emit NFTDescriptorSet(_descriptor);
  }

  /// @inheritdoc ERC721
  // TODO: update this after building the new descriptor
  function tokenURI(uint256 _tokenId) public view override returns (string memory) {
    // return nftDescriptor.tokenURI(hub, _tokenId);
  }

  /// @inheritdoc IDCAStrategiesPermissionsHandler
  function getTokenPermissions(uint256 _id, address _operator) public view override returns (TokenPermission memory) {
    return _tokenPermissions[_getPermissionKey(_id, _operator)];
  }

  function _mint(address _owner, IDCAStrategies.PermissionSet[] calldata _permissions) internal returns (uint256 _mintId) {
    _mintId = ++_mintCounter;
    _mint(_owner, _mintId);
    _setPermissions(_mintId, _permissions);
  }

  function _burn(uint256 _id) internal override {
    super._burn(_id);
    ++_burnCounter;
  }

  // Note: virtual so that it can be overriden in tests
  function _modify(uint256 _id, IDCAStrategies.PermissionSet[] calldata _permissions) internal virtual {
    _setPermissions(_id, _permissions);
    emit Modified(_id, _permissions);
  }

  function _encode(IDCAStrategies.PermissionSet[] calldata _permissions) internal pure returns (bytes memory _result) {
    for (uint256 i = 0; i < _permissions.length; ) {
      _result = bytes.concat(_result, keccak256(_encode(_permissions[i])));
      unchecked {
        i++;
      }
    }
  }

  function _encode(IDCAStrategies.PermissionSet calldata _permission) internal pure returns (bytes memory _result) {
    _result = abi.encode(PERMISSION_SET_TYPEHASH, _permission.operator, keccak256(_encode(_permission.permissions)));
  }

  function _encode(IDCAStrategies.Permission[] calldata _permissions) internal pure returns (bytes memory _result) {
    _result = new bytes(_permissions.length * 32);
    for (uint256 i = 0; i < _permissions.length; ) {
      _result[(i + 1) * 32 - 1] = bytes1(uint8(_permissions[i]));
      unchecked {
        i++;
      }
    }
  }

  function _encode(PositionPermissions[] calldata _permissions) internal pure returns (bytes memory _result) {
    for (uint256 i = 0; i < _permissions.length; ) {
      _result = bytes.concat(_result, keccak256(_encode(_permissions[i])));
      unchecked {
        i++;
      }
    }
  }

  function _encode(PositionPermissions calldata _permission) internal pure returns (bytes memory _result) {
    _result = abi.encode(POSITION_PERMISSIONS_TYPEHASH, _permission.tokenId, keccak256(_encode(_permission.permissionSets)));
  }

  // Note: virtual so that it can be overriden in tests
  function _setPermissions(uint256 _id, IDCAStrategies.PermissionSet[] calldata _permissions) internal virtual {
    uint248 _blockNumber = uint248(_getBlockNumber());
    for (uint256 i; i < _permissions.length; i++) {
      IDCAStrategies.PermissionSet memory _permissionSet = _permissions[i];

      if (_permissionSet.permissions.length == 0) {
        delete _tokenPermissions[_getPermissionKey(_id, _permissionSet.operator)];
      } else {
        _tokenPermissions[_getPermissionKey(_id, _permissionSet.operator)] = TokenPermission({
          permissions: _permissionSet.permissions.toUInt8(),
          lastUpdated: _blockNumber
        });
      }
    }
  }

  function _getPermissionKey(uint256 _id, address _operator) internal pure returns (bytes32) {
    return keccak256(abi.encodePacked(_id, _operator));
  }

  function _beforeTokenTransfer(
    address _from,
    address _to,
    uint256 _id
  ) internal override {
    if (_to == address(0)) {
      // When token is being burned, we can delete this entry on the mapping
      delete lastOwnershipChange[_id];
    } else if (_from != address(0)) {
      // If the token is being minted, then no need to write this
      lastOwnershipChange[_id] = _getBlockNumber();
    }
  }

  // Note: virtual so that it can be overriden in tests
  function _getBlockNumber() internal view virtual returns (uint256) {
    return block.number;
  }
}
