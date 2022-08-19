// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity >=0.8.7 <0.9.0;

import '@openzeppelin/contracts/token/ERC721/ERC721.sol';
import '../../interfaces/IDCAStrategies.sol';

abstract contract DCAStrategiesPermissionsHandler is IDCAStrategiesPermissionsHandler, ERC721 {
  // solhint-disable-next-line func-name-mixedcase
  function PERMIT_TYPEHASH() external pure override returns (bytes32) {}

  // solhint-disable-next-line func-name-mixedcase
  function PERMISSION_PERMIT_TYPEHASH() external pure override returns (bytes32) {}

  // solhint-disable-next-line func-name-mixedcase
  function PERMISSION_SET_TYPEHASH() external pure override returns (bytes32) {}

  // solhint-disable-next-line func-name-mixedcase
  function DOMAIN_SEPARATOR() external view override returns (bytes32) {}

  function totalSupply() external view override returns (uint256) {}

  // TODO: update this after building the new descriptor
  function nftDescriptor() external override returns (IDCAHubPositionDescriptor) {}

  function nonces(address _user) external override returns (uint256 _nonce) {}

  function hasPermission(
    uint256 _id,
    address _account,
    Permission _permission
  ) external view override returns (bool) {}

  function hasPermissions(
    uint256 _id,
    address _account,
    Permission[] calldata _permissions
  ) external view override returns (bool[] memory _hasPermissions) {}

  function modify(uint256 _id, PermissionSet[] calldata _permissions) external override {}

  function permit(
    address _spender,
    uint256 _tokenId,
    uint256 _deadline,
    uint8 _v,
    bytes32 _r,
    bytes32 _s
  ) external override {}

  function permissionPermit(
    PermissionSet[] calldata _permissions,
    uint256 _tokenId,
    uint256 _deadline,
    uint8 _v,
    bytes32 _r,
    bytes32 _s
  ) external override {}

  // TODO: update this after building the new descriptor
  function setNFTDescriptor(IDCAHubPositionDescriptor _descriptor) external override {}
}
