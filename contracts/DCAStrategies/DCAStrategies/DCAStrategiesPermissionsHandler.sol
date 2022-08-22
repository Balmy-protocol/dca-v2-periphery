// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity >=0.8.7 <0.9.0;

import '@openzeppelin/contracts/token/ERC721/ERC721.sol';
import '@openzeppelin/contracts/utils/cryptography/draft-EIP712.sol';
import '../../interfaces/IDCAStrategies.sol';
import '../../libraries/PermissionMath.sol';
import '../../utils/Governable.sol';

abstract contract DCAStrategiesPermissionsHandler is IDCAStrategiesPermissionsHandler, ERC721, EIP712, Governable {
  struct TokenPermission {
    // The actual permissions
    uint8 permissions;
    // The block number when it was last updated
    uint248 lastUpdated;
  }

  using PermissionMath for IDCAStrategies.Permission[];
  using PermissionMath for uint8;

  /// @inheritdoc IDCAStrategiesPermissionsHandler
  bytes32 public constant PERMIT_TYPEHASH = keccak256('Permit(address spender,uint256 tokenId,uint256 nonce,uint256 deadline)');
  /// @inheritdoc IDCAStrategiesPermissionsHandler
  bytes32 public constant PERMISSION_PERMIT_TYPEHASH =
    keccak256(
      'PermissionPermit(PermissionSet[] permissions,uint256 tokenId,uint256 nonce,uint256 deadline)PermissionSet(address operator,uint8[] permissions)'
    );
  /// @inheritdoc IDCAStrategiesPermissionsHandler
  bytes32 public constant PERMISSION_SET_TYPEHASH = keccak256('PermissionSet(address operator,uint8[] permissions)');
  /// @inheritdoc IDCAStrategiesPermissionsHandler
  // TODO: update this after building the new descriptor
  IDCAHubPositionDescriptor public nftDescriptor;
  /// @inheritdoc IDCAStrategiesPermissionsHandler
  mapping(address => uint256) public nonces;
  mapping(uint256 => uint256) public lastOwnershipChange;
  mapping(uint256 => mapping(address => TokenPermission)) public tokenPermissions;
  uint256 internal _burnCounter;

  constructor(address _governor, IDCAHubPositionDescriptor _descriptor)
    ERC721('Mean Finance - DCA Strategy Position', 'MF-DCA-STRAT-P')
    EIP712('Mean Finance - DCA Strategy Position', '1')
    Governable(_governor)
  {
    if (address(_descriptor) == address(0)) revert ZeroAddress();
    nftDescriptor = _descriptor;
  }

  /// @inheritdoc IDCAStrategiesPermissionsHandler
  // solhint-disable-next-line func-name-mixedcase
  function DOMAIN_SEPARATOR() external view override returns (bytes32) {
    return _domainSeparatorV4();
  }

  // how can I manage this? because there is no hub here
  /// @inheritdoc IERC721BasicEnumerable
  function totalSupply() external view override returns (uint256) {
    // return IDCAHubPositionHandler(hub).totalCreatedPositions() - _burnCounter;
  }

  /// @inheritdoc IDCAStrategiesPermissionsHandler
  function hasPermission(
    uint256 _id,
    address _account,
    IDCAStrategies.Permission _permission
  ) external view override returns (bool) {
    if (ownerOf(_id) == _account) {
      return true;
    }
    TokenPermission memory _tokenPermission = tokenPermissions[_id][_account];
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
      for (uint256 i; i < _permissions.length; i++) {
        _hasPermissions[i] = true;
      }
    } else {
      // If it's not the owner, then check one by one
      TokenPermission memory _tokenPermission = tokenPermissions[_id][_account];
      if (lastOwnershipChange[_id] < _tokenPermission.lastUpdated) {
        for (uint256 i; i < _permissions.length; i++) {
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
  ) external override {
    if (block.timestamp > _deadline) revert ExpiredDeadline();

    address _owner = ownerOf(_tokenId);
    bytes32 _structHash = keccak256(
      abi.encode(PERMISSION_PERMIT_TYPEHASH, keccak256(_encode(_permissions)), _tokenId, nonces[_owner]++, _deadline)
    );
    bytes32 _hash = _hashTypedDataV4(_structHash);

    address _signer = ECDSA.recover(_hash, _v, _r, _s);
    if (_signer != _owner) revert InvalidSignature();

    _modify(_tokenId, _permissions);
  }

  /// @inheritdoc IDCAStrategiesPermissionsHandler
  // TODO: update this after building the new descriptor
  function setNFTDescriptor(IDCAHubPositionDescriptor _descriptor) external override {
    if (address(_descriptor) == address(0)) revert ZeroAddress();
    nftDescriptor = _descriptor;
    emit NFTDescriptorSet(_descriptor);
  }

  // how can I manage this? because there is no hub here
  /// @inheritdoc ERC721
  function tokenURI(uint256 _tokenId) public view override returns (string memory) {
    // return nftDescriptor.tokenURI(hub, _tokenId);
  }

  function _mint(
    uint256 _id,
    address _owner,
    IDCAStrategies.PermissionSet[] calldata _permissions
  ) internal {
    _mint(_owner, _id);
    _setPermissions(_id, _permissions);
  }

  // not sure about the name of this fn
  function __burn(uint256 _id) internal {
    _burn(_id);
    ++_burnCounter;
  }

  function _encode(IDCAStrategies.PermissionSet[] calldata _permissions) internal pure returns (bytes memory _result) {
    for (uint256 i; i < _permissions.length; i++) {
      _result = bytes.concat(_result, keccak256(_encode(_permissions[i])));
    }
  }

  function _encode(IDCAStrategies.PermissionSet calldata _permission) internal pure returns (bytes memory _result) {
    _result = abi.encode(PERMISSION_SET_TYPEHASH, _permission.operator, keccak256(_encode(_permission.permissions)));
  }

  function _encode(IDCAStrategies.Permission[] calldata _permissions) internal pure returns (bytes memory _result) {
    _result = new bytes(_permissions.length * 32);
    for (uint256 i; i < _permissions.length; i++) {
      _result[(i + 1) * 32 - 1] = bytes1(uint8(_permissions[i]));
    }
  }

  function _modify(uint256 _id, IDCAStrategies.PermissionSet[] calldata _permissions) internal {
    _setPermissions(_id, _permissions);
    emit Modified(_id, _permissions);
  }

  function _setPermissions(uint256 _id, IDCAStrategies.PermissionSet[] calldata _permissions) internal {
    uint248 _blockNumber = uint248(_getBlockNumber());
    for (uint256 i; i < _permissions.length; i++) {
      if (_permissions[i].permissions.length == 0) {
        delete tokenPermissions[_id][_permissions[i].operator];
      } else {
        tokenPermissions[_id][_permissions[i].operator] = TokenPermission({
          permissions: _permissions[i].permissions.toUInt8(),
          lastUpdated: _blockNumber
        });
      }
    }
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
