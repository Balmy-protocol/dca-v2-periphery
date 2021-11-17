// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity >=0.8.7 <0.9.0;

import './IDCAHubCompanion.sol';
import './utils/IGovernable.sol';

interface IDCAKeep3rJob is IGovernable {
  /// @notice A call to execute work
  struct WorkCall {
    // The actual call to the companion contract
    bytes companionCall;
    uint256 nonce;
    uint256 chainId;
    uint256 deadline;
  }

  /// @notice Thrown when one of the parameters is a zero address
  error ZeroAddress();

  /// @notice Thrown when a user tries to execute work but the signature is invalid
  error SignerCannotSignWork();

  /// @notice Thrown when a user tries to execute work with an invalid nonce
  error InvalidNonce();

  /// @notice Thrown when a user tries to execute work with an expired deadline
  error DeadlineExpired();

  /// @notice Thrown when a user tries to execute work with an invalid chain id
  error InvalidChainId();

  /// @notice Thrown when a user tries to execute work but the call to the companion fails
  error CompanionCallFailed();

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

  /// @notice Returns the nonce to use when calling `work`
  /// @return The nonce to use
  function nonce() external returns (uint256);

  /// @notice Sets a new companion address
  /// @dev Will revert with ZeroAddress if the zero address is passed
  /// @param _companion The new companion address
  function setCompanion(IDCAHubCompanion _companion) external;

  /// @notice Sets whether the given address can sign work or not
  /// @dev Will revert with ZeroAddress if the zero address is passed
  /// @param _address The address to modify permissions
  /// @param _canSign Whether the given address will be able to sign work or not
  function setIfAddressCanSign(address _address, bool _canSign) external;

  /// @notice Takes an encoded call to execute against the companion contract, and executes it
  /// @dev Will revert with:
  /// SignerCannotSignWork if the address who signed the message cannot sign work
  /// InvalidNonce if the nonce is invalid
  /// DeadlineExpired if the deadline has expired
  /// InvalidChainId if the chain id is invalid
  /// CompanionCallFailed if the call to the companion failed
  /// @param _bytes An encoded `WorkCall`
  /// @param _signature A signature of `_bytes`
  function work(bytes calldata _bytes, bytes calldata _signature) external;
}
