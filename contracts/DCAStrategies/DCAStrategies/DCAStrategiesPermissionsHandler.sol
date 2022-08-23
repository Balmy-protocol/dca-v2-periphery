// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity >=0.8.7 <0.9.0;

import '@openzeppelin/contracts/token/ERC721/ERC721.sol';
import '../../libraries/PermissionMath.sol';
import '../../interfaces/IDCAStrategies.sol';

abstract contract DCAStrategiesPermissionsHandler is IDCAStrategiesPermissionsHandler, ERC721 {
  struct TokenPermission {
    // The actual permissions
    uint8 permissions;
    // The block number when it was last updated
    uint248 lastUpdated;
  }

  using PermissionMath for IDCAStrategies.Permission[];
  using PermissionMath for uint8;

  mapping(uint256 => uint256) public lastOwnershipChange;
  mapping(bytes32 => TokenPermission) public tokenPermissions; // key(id, operator) => TokenPermission
  uint256 internal _burnCounter;
  uint256 internal _mintCounter;

  /// @inheritdoc IDCAStrategiesPermissionsHandler
  // solhint-disable-next-line func-name-mixedcase
  function PERMIT_TYPEHASH() external pure override returns (bytes32) {}

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
  function nonces(address _user) external override returns (uint256 _nonce) {}

  /// @inheritdoc IDCAStrategiesPermissionsHandler
  function hasPermission(
    uint256 _id,
    address _account,
    IDCAStrategies.Permission _permission
  ) external view override returns (bool) {
    if (ownerOf(_id) == _account) {
      return true;
    }
    TokenPermission memory _tokenPermission = tokenPermissions[keccak256(abi.encodePacked(_id, _account))];
    // If there was an ownership change after the permission was last updated, then the address doesn't have the permission
    return _tokenPermission.permissions.hasPermission(_permission) && lastOwnershipChange[_id] < _tokenPermission.lastUpdated;
  }

  /// @inheritdoc IDCAStrategiesPermissionsHandler
  function hasPermissions(
    uint256 _id,
    address _account,
    IDCAStrategies.Permission[] calldata _permissions
  ) external view override returns (bool[] memory _hasPermissions) {}

  /// @inheritdoc IDCAStrategiesPermissionsHandler
  function modify(uint256 _id, IDCAStrategies.PermissionSet[] calldata _permissions) external override {}

  /// @inheritdoc IDCAStrategiesPermissionsHandler
  function permit(
    address _spender,
    uint256 _tokenId,
    uint256 _deadline,
    uint8 _v,
    bytes32 _r,
    bytes32 _s
  ) external override {}

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

  function _setPermissions(uint256 _id, IDCAStrategies.PermissionSet[] calldata _permissions) internal {
    uint248 _blockNumber = uint248(_getBlockNumber());
    for (uint256 i; i < _permissions.length; i++) {
      if (_permissions[i].permissions.length == 0) {
        delete tokenPermissions[keccak256(abi.encodePacked(_id, _permissions[i].operator))];
      } else {
        tokenPermissions[keccak256(abi.encodePacked(_id, _permissions[i].operator))] = TokenPermission({
          permissions: _permissions[i].permissions.toUInt8(),
          lastUpdated: _blockNumber
        });
      }
    }
  }

  // Note: virtual so that it can be overriden in tests
  function _getBlockNumber() internal view virtual returns (uint256) {
    return block.number;
  }
}
