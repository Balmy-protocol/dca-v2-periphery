// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity >=0.8.7 <0.9.0;

import '@openzeppelin/contracts/token/ERC721/ERC721.sol';
import '@openzeppelin/contracts/utils/cryptography/draft-EIP712.sol';
import '../../libraries/PermissionMath.sol';
import '../../interfaces/IDCAStrategies.sol';

abstract contract DCAStrategiesPermissionsHandler is IDCAStrategiesPermissionsHandler, ERC721, EIP712 {
  using PermissionMath for IDCAStrategies.Permission[];
  using PermissionMath for uint8;

  mapping(uint256 => uint256) public lastOwnershipChange;
  mapping(bytes32 => TokenPermission) internal _tokenPermissions; // key(id, operator) => TokenPermission
  uint256 internal _burnCounter;
  uint256 internal _mintCounter;
  /// @inheritdoc IDCAStrategiesPermissionsHandler
  mapping(address => uint256) public nonces;
  /// @inheritdoc IDCAStrategiesPermissionsHandler
  bytes32 public constant PERMIT_TYPEHASH = keccak256('Permit(address spender,uint256 tokenId,uint256 nonce,uint256 deadline)');

  /// @inheritdoc IDCAStrategiesPermissionsHandler
  // solhint-disable-next-line func-name-mixedcase
  function PERMISSION_PERMIT_TYPEHASH() external pure override returns (bytes32) {}

  /// @inheritdoc IDCAStrategiesPermissionsHandler
  // solhint-disable-next-line func-name-mixedcase
  function PERMISSION_SET_TYPEHASH() external pure override returns (bytes32) {}

  /// @inheritdoc IDCAStrategiesPermissionsHandler
  // solhint-disable-next-line func-name-mixedcase
  function DOMAIN_SEPARATOR() external view override returns (bytes32) {}

  /// @inheritdoc IERC721BasicEnumerable
  function totalSupply() external view override returns (uint256) {}

  /// @inheritdoc IDCAStrategiesPermissionsHandler
  // TODO: update this after building the new descriptor
  function nftDescriptor() external override returns (IDCAHubPositionDescriptor) {}

  /// @inheritdoc IDCAStrategiesPermissionsHandler
  function hasPermission(
    uint256 _id,
    address _account,
    IDCAStrategies.Permission _permission
  ) external view override returns (bool) {
    if (ownerOf(_id) == _account) {
      return true;
    }
    TokenPermission memory _tokenPermission = getTokenPermissions(_id, _account);
    // If there was an ownership change after the permission was last updated, then the address doesn't have the permission
    return _tokenPermission.permissions.hasPermission(_permission) && lastOwnershipChange[_id] < _tokenPermission.lastUpdated;
  }

  /// @inheritdoc IDCAStrategiesPermissionsHandler
  function hasPermissions(
    uint256 _id,
    address _account,
    IDCAStrategies.Permission[] calldata _permissions
  ) external view override returns (bool[] memory _hasPermissions) {
    _hasPermissions = new bool[](_permissions.length);
    if (ownerOf(_id) == _account) {
      // If the address is the owner, then they have all permissions
      for (uint256 i = 0; i < _permissions.length; i++) {
        _hasPermissions[i] = true;
      }
    } else {
      // If it's not the owner, then check one by one
      TokenPermission memory _tokenPermission = getTokenPermissions(_id, _account);
      if (lastOwnershipChange[_id] < _tokenPermission.lastUpdated) {
        for (uint256 i = 0; i < _permissions.length; i++) {
          if (_tokenPermission.permissions.hasPermission(_permissions[i])) {
            _hasPermissions[i] = true;
          }
        }
      }
    }
  }

  /// @inheritdoc IDCAStrategiesPermissionsHandler
  function modify(uint256 _id, IDCAStrategies.PermissionSet[] calldata _permissions) external override {
    if (msg.sender != ownerOf(_id)) revert NotOwner();
    _modify(_id, _permissions);
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
  function permissionPermit(
    IDCAStrategies.PermissionSet[] calldata _permissions,
    uint256 _tokenId,
    uint256 _deadline,
    uint8 _v,
    bytes32 _r,
    bytes32 _s
  ) external override {}

  /// @inheritdoc IDCAStrategiesPermissionsHandler
  // TODO: update this after building the new descriptor
  function setNFTDescriptor(IDCAHubPositionDescriptor _descriptor) external override {}

  function _mint(address _owner, IDCAStrategies.PermissionSet[] calldata _permissions) internal returns (uint256 _mintId) {
    _mintId = ++_mintCounter;
    _mint(_owner, _mintId);
    _setPermissions(_mintId, _permissions);
  }

  function _burn(uint256 _id) internal override {
    super._burn(_id);
    ++_burnCounter;
  }

  function _modify(uint256 _id, IDCAStrategies.PermissionSet[] calldata _permissions) internal {
    _setPermissions(_id, _permissions);
    emit Modified(_id, _permissions);
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

  function getTokenPermissions(uint256 _id, address _operator) public view override returns (TokenPermission memory) {
    return _tokenPermissions[_getPermissionKey(_id, _operator)];
  }

  // Note: virtual so that it can be overriden in tests
  function _getBlockNumber() internal view virtual returns (uint256) {
    return block.number;
  }
}
