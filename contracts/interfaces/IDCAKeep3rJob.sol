// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity >=0.8.7 <0.9.0;

import './IDCAHubCompanion.sol';
import './utils/IGovernable.sol';

interface IDCAKeep3rJob is IGovernable {
  /// @notice Thrown when one of the parameters is a zero address
  error ZeroAddress();

  /// @notice Returns the companion address
  /// @dev Cannot be modified
  /// @return The companion address
  function companion() external returns (IDCAHubCompanion);
}
