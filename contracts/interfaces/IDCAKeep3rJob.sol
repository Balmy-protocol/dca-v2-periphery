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

  /// @notice Returns the companion address
  /// @return The companion address
  function companion() external returns (IDCAHubCompanion);

  /// @notice Sets a new companion address
  /// @dev Will revert with ZeroAddress if the zero address is passed
  /// @param _companion The new companion address
  function setCompanion(IDCAHubCompanion _companion) external;
}
