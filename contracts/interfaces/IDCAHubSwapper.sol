// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity >=0.8.7 <0.9.0;

import '@mean-finance/dca-v2-core/contracts/interfaces/IDCAHub.sol';
import '@mean-finance/dca-v2-core/contracts/interfaces/IDCAHubSwapCallee.sol';
import '@mean-finance/swappers/solidity/contracts/extensions/Shared.sol';

interface IDCAHubSwapper is IDCAHubSwapCallee {
  /// @notice Parameters to execute a swap with dexes
  struct SwapWithDexesParams {
    // The address of the DCAHub
    IDCAHub hub;
    // The tokens involved in the swap
    address[] tokens;
    // The pairs to swap
    IDCAHub.PairIndexes[] pairsToSwap;
    // The accounts that should be approved for spending
    Allowance[] allowanceTargets;
    // The different swappers involved in the swap
    address[] swappers;
    // The different swaps to execute
    SwapExecution[] executions;
    // Address that will receive all unspent tokens
    address leftoverRecipient;
    // Deadline when the swap becomes invalid
    uint256 deadline;
  }

  /// @notice The data necessary for a swap to be executed
  struct SwapExecution {
    // The index of the swapper in the swapper array
    uint8 swapperIndex;
    // The swap's execution
    bytes swapData;
  }

  /// @notice Thrown when the reward is less that the specified minimum
  error RewardNotEnough();

  /// @notice Thrown when the amount to provide is more than the specified maximum
  error ToProvideIsTooMuch();

  /// @notice Thrown when the callback is executed with an unexpected swap plan
  error UnexpectedSwapPlan();

  /**
   * @notice Executes a swap for the caller, by sending them the reward, and taking from them the needed tokens
   * @dev Will revert:
   *      - With RewardNotEnough if the minimum output is not met
   *      - With ToProvideIsTooMuch if the hub swap requires more than the given maximum input
   * @param hub The address of the DCAHub
   * @param tokens The tokens involved in the swap
   * @param pairsToSwap The pairs to swap
   * @param minimumOutput The minimum amount of tokens to receive as part of the swap
   * @param maximumInput The maximum amount of tokens to provide as part of the swap
   * @param recipient Address that will receive all the tokens from the swap
   * @param deadline Deadline when the swap becomes invalid
   * @return The information about the executed swap
   */
  function swapForCaller(
    IDCAHub hub,
    address[] calldata tokens,
    IDCAHub.PairIndexes[] calldata pairsToSwap,
    uint256[] calldata minimumOutput,
    uint256[] calldata maximumInput,
    address recipient,
    uint256 deadline
  ) external payable returns (IDCAHub.SwapInfo memory);

  /**
   * @notice Executes a swap with the given swappers, and sends all unspent tokens to the given recipient
   * @return The information about the executed swap
   */
  function swapWithDexes(SwapWithDexesParams calldata parameters) external payable returns (IDCAHub.SwapInfo memory);

  /**
   * @notice Meant to be used by Mean Finance keepers, as an cheaper way to execute swaps. This function executes a
   *         swap with the given swappers, but sends some of the unspent tokens back to the hub. This means that they
   *         will be considered part of the protocol's balance. Unspent tokens that were given as reward will be
   *         sent to the provided recipient
   * @return The information about the executed swap
   */
  function swapWithDexesForMean(SwapWithDexesParams calldata parameters) external payable returns (IDCAHub.SwapInfo memory);
}
