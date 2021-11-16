// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity >=0.8.7 <0.9.0;

import './IDCAHubCompanion.sol';
import './utils/IGovernable.sol';

interface IDCAKeep3rJob is IGovernable {
  /// @notice Thrown when one of the parameters is a zero address
  error ZeroAddress();

  /// @notice Emitted when a new companion is set
  /// @param newCompanion The new companion
  event NewCompanionSet(IDCAHubCompanion newCompanion);

  /// @notice Emitted when signing permission is modified for an address
  /// @param affected The affected address
  /// @param canSign Whether the affected address can now sign work or not
  event ModifiedAddressPermission(address affected, bool canSign);

  /// @notice Returns the companion address
  /// @return The companion address
  function companion() external returns (IDCAHubCompanion);

  /// @notice Returns whether the given address can sign work or not
  /// @return If it can sign work or not
  function canAddressSignWork(address _address) external returns (bool);

  /// @notice Sets a new companion address
  /// @dev Will revert with ZeroAddress if the zero address is passed
  /// @param _companion The new companion address
  function setCompanion(IDCAHubCompanion _companion) external;

  /// @notice Sets whether the given address can sign work or not
  /// @dev Will revert with ZeroAddress if the zero address is passed
  /// @param _address The address to modify permissions
  /// @param _canSign Whether the given address will be able to sign work or not
  function setIfAddressCanSign(address _address, bool _canSign) external;
}
