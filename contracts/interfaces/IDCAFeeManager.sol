// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity >=0.8.7;

import '@mean-finance/dca-v2-core/contracts/interfaces/IDCAHub.sol';
import '../utils/SwapAdapter.sol';
import '../utils/types/SwapContext.sol';
import '../utils/types/TransferOutBalance.sol';

/**
 * @title DCA Fee Manager
 * @notice This contract will manage all platform fees. Since fees come in different tokens, this manager
 *         will be in charge of taking them and converting them to different tokens, for example ETH/MATIC
 *         or stablecoins. Allowed users will to withdraw fees as generated, or DCA them into tokens
 *         of their choosing
 */
interface IDCAFeeManager {
  /// @notice The parameters to execute the call
  struct RunSwapsAndTransferManyParams {
    // The accounts that should be approved for spending
    AllowanceTarget[] allowanceTargets;
    // The different swappers involved in the swap
    address[] swappers;
    // The different swapps to execute
    bytes[] swaps;
    // Context necessary for the swap execution
    SwapContext[] swapContext;
    // Tokens to transfer after swaps have been executed
    TransferOutBalance[] transferOutBalance;
  }

  /// @notice An allowance to provide for the swaps to work
  struct AllowanceTarget {
    // The token that should be approved
    IERC20 token;
    // The spender
    address allowanceTarget;
  }

  /// @notice Represents how much is available for withdraw, for a specific token
  struct AvailableBalance {
    address token;
    uint256 platformBalance;
    uint256 feeManagerBalance;
  }

  /// @notice Thrown when one of the parameters is a zero address
  error ZeroAddress();

  /**
   * @notice Executes multiple swaps
   * @dev Can only be executed by admins
   * @param parameters The parameters for the swap
   */
  function runSwapsAndTransferMany(RunSwapsAndTransferManyParams calldata parameters) external payable;

  /**
   * @notice Withdraws tokens from the platform balance, and sends them to the given recipient
   * @dev Can only be executed by admins
   * @param hub The address of the DCA Hub
   * @param amountToWithdraw The tokens to withdraw, and their amounts
   * @param recipient The address of the recipient
   */
  function withdrawFromPlatformBalance(
    IDCAHub hub,
    IDCAHub.AmountOfToken[] calldata amountToWithdraw,
    address recipient
  ) external;

  /**
   * @notice Withdraws tokens from the contract's balance, and sends them to the given recipient
   * @dev Can only be executed by admins
   * @param amountToWithdraw The tokens to withdraw, and their amounts
   * @param recipient The address of the recipient
   */
  function withdrawFromBalance(IDCAHub.AmountOfToken[] calldata amountToWithdraw, address recipient) external;

  /**
   * @notice Revokes ERC20 allowances for the given spenders
   * @dev Can only be executed by admins
   * @param revokeActions The spenders and tokens to revoke
   */
  function revokeAllowances(SwapAdapter.RevokeAction[] calldata revokeActions) external;

  /**
   * @notice Returns how much is available for withdraw, for the given tokens
   * @dev This is meant for off-chan purposes
   * @param hub The address of the DCA Hub
   * @param tokens The tokens to check the balance for
   * @return How much is available for withdraw, for the given tokens
   */
  function availableBalances(IDCAHub hub, address[] calldata tokens) external view returns (AvailableBalance[] memory);
}
