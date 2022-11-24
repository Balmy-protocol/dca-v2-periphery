// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity >=0.8.7 <0.9.0;

import '@openzeppelin/contracts/access/AccessControl.sol';
import '@openzeppelin/contracts/utils/Address.sol';
import '@openzeppelin/contracts/utils/cryptography/ECDSA.sol';
import '@openzeppelin/contracts/utils/cryptography/draft-EIP712.sol';
import '../interfaces/IDCAKeep3rJob.sol';

contract DCAKeep3rJob is AccessControl, EIP712, IDCAKeep3rJob {
  using Address for address;

  bytes32 public constant SUPER_ADMIN_ROLE = keccak256('SUPER_ADMIN_ROLE');
  bytes32 public constant CAN_SIGN_ROLE = keccak256('CAN_SIGN_ROLE');
  bytes32 public constant WORK_TYPEHASH = keccak256('Work(address swapper,bytes data,uint256 nonce)');

  /// @inheritdoc IDCAKeep3rJob
  IKeep3r public immutable keep3r;
  /// @inheritdoc IDCAKeep3rJob
  SwapperAndNonce public swapperAndNonce; // Note: data grouped in struct to reduce SLOADs

  constructor(
    IKeep3r _keep3r,
    address _swapper,
    address _superAdmin,
    address[] memory _initialCanSign
  ) EIP712('Mean Finance - DCA Keep3r Job', '1') {
    if (address(_keep3r) == address(0)) revert ZeroAddress();
    if (_swapper == address(0)) revert ZeroAddress();
    if (_superAdmin == address(0)) revert ZeroAddress();

    keep3r = _keep3r;
    swapperAndNonce.swapper = _swapper;

    // We are setting the super admin role as its own admin so we can transfer it
    _setRoleAdmin(SUPER_ADMIN_ROLE, SUPER_ADMIN_ROLE);
    _setRoleAdmin(CAN_SIGN_ROLE, SUPER_ADMIN_ROLE);
    _setupRole(SUPER_ADMIN_ROLE, _superAdmin);

    for (uint256 i = 0; i < _initialCanSign.length;) {
      _setupRole(CAN_SIGN_ROLE, _initialCanSign[i]);
      unchecked {
        i++;
      }
    }
  }
}
