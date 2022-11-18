// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity >=0.8.7 <0.9.0;

import 'keep3r-v2/solidity/interfaces/IKeep3r.sol';

interface IDCAKeep3rJob {
  /// @notice A struct that contains the swapper and nonce to use
  struct SwapperAndNonce {
    address swapper;
    uint96 nonce;
  }

  /// @notice Thrown when one of the parameters is a zero address
  error ZeroAddress();

  /// @notice Thrown when a user tries to execute work but the signature is invalid
  error SignerCannotSignWork();

  /// @notice Thrown when a non keep3r address tries to execute work
  error NotAKeeper();

  /**
   * @notice Emitted when a new swapper is set
   * @param newSwapper The new swapper
   */
  event NewSwapperSet(address newSwapper);

  /**
   * @notice Returns the swapper address
   * @return swapper The swapper's address
   * @return nonce The next nonce to use
   */
  function swapperAndNonce() external returns (address swapper, uint96 nonce);

  /**
   * @notice Returns the Keep3r address
   * @return The Keep3r address address
   */
  function keep3r() external returns (IKeep3r);
}
