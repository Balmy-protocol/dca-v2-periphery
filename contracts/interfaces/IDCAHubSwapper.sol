// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity >=0.8.7 <0.9.0;

import '@mean-finance/dca-v2-core/contracts/interfaces/IDCAHub.sol';
import '@mean-finance/dca-v2-core/contracts/interfaces/IDCAPermissionManager.sol';
import '@mean-finance/dca-v2-core/contracts/interfaces/IDCAHubSwapCallee.sol';
import './IWrappedProtocolToken.sol';
import './utils/ICollectableDust.sol';
import './utils/IGovernable.sol';

interface IDCAHubSwapperParameters is IGovernable {
  /// @notice Thrown when the given parameters are invalid
  error InvalidTokenApprovalParams();

  /// @notice Emitted when tokens with approval issues are set
  /// @param addresses The addresses of the tokens
  /// @param hasIssue Whether they have issues or not
  event TokenWithApprovalIssuesSet(address[] addresses, bool[] hasIssue);

  /// @notice Returns the DCA Hub's address
  /// @dev This value cannot be modified
  /// @return The DCA Hub contract
  function hub() external view returns (IDCAHub);

  /// @notice Returns the address of the wrapped token
  /// @dev This value cannot be modified
  /// @return The wToken contract
  function wToken() external view returns (IWrappedProtocolToken);

  /// @notice Returns whether the given address has issues with approvals, like USDT
  /// @param _tokenAddress The address of the token to check
  /// @return Whether it has issues or not
  function tokenHasApprovalIssue(address _tokenAddress) external view returns (bool);

  /// @notice Sets whether specific addresses have issues with approvals, like USDT
  /// @dev Will revert with `InvalidTokenApprovalParams` if the length of the given arrays differ
  /// @param _addresses The addresses of the tokens
  /// @param _hasIssue Wether they have issues or not
  function setTokensWithApprovalIssues(address[] calldata _addresses, bool[] calldata _hasIssue) external;
}

interface IDCAHubSwapperSwapHandler is IDCAHubSwapCallee {
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

  /// @notice Thrown when a swap is executed with a DEX that is not supported
  error UnsupportedDex();

  /// @notice Thrown when a call to the given DEX fails
  error CallToDexFailed();

  /// @notice Returns whether the given DEX can be used for swaps for not
  /// @param _dex The address of the DEX to check
  /// @return Whether the given DEX can be used for swaps for not
  function isDexSupported(address _dex) external view returns (bool);

  /// @notice Defines whether a specific DEX will be supported for swaps
  /// @dev Will revert with `ZeroAddress` if the zero address if given
  /// @param _dex The address of the DEX
  /// @param _support Whether the Companion should support swaps with the given DEX
  function defineDexSupport(address _dex, bool _support) external;

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

  /// @notice Executes a swap with the given DEX, and sends all unspent tokens to the given recipient
  /// @param _dex The DEX that will be used in the swap
  /// @param _tokensProxy The spender of the tokens (could be different from the dex)
  /// @param _tokens The tokens involved in the swap
  /// @param _pairsToSwap The pairs to swap
  /// @param _callsToDex The bytes to send to the DEX to execute swaps
  /// @param _doDexSwapsIncludeTransferToHub Some DEXes support swap & transfer, which would be cheaper in terms of gas
  /// If this feature is used, then the flag should be true
  /// @param _leftoverRecipient Address that will receive all unspent tokens
  /// @param _deadline Deadline when the swap becomes invalid
  /// @return The information about the executed swap
  function swapWithDex(
    address _dex,
    address _tokensProxy,
    address[] calldata _tokens,
    IDCAHub.PairIndexes[] calldata _pairsToSwap,
    bytes[] calldata _callsToDex,
    bool _doDexSwapsIncludeTransferToHub,
    address _leftoverRecipient,
    uint256 _deadline
  ) external returns (IDCAHub.SwapInfo memory);

  /// @notice Executes a swap with the given DEX and sends all `reward` unspent tokens to the given recipient.
  /// All positive slippage for tokens that need to be returned to the hub is also sent to the hub
  /// @param _dex The DEX that will be used in the swap
  /// @param _tokensProxy The spender of the tokens (could be different from the dex)
  /// @param _tokens The tokens involved in the swap
  /// @param _pairsToSwap The pairs to swap
  /// @param _callsToDex The bytes to send to the DEX to execute swaps
  /// @param _doDexSwapsIncludeTransferToHub Some DEXes support swap & transfer, which would be cheaper in terms of gas
  /// If this feature is used, then the flag should be true
  /// @param _leftoverRecipient Address that will receive `reward` unspent tokens
  /// @param _deadline Deadline when the swap becomes invalid
  /// @return The information about the executed swap
  function swapWithDexAndShareLeftoverWithHub(
    address _dex,
    address _tokensProxy,
    address[] calldata _tokens,
    IDCAHub.PairIndexes[] calldata _pairsToSwap,
    bytes[] calldata _callsToDex,
    bool _doDexSwapsIncludeTransferToHub,
    address _leftoverRecipient,
    uint256 _deadline
  ) external returns (IDCAHub.SwapInfo memory);
}

interface IDCAHubSwapperDustHandler is ICollectableDust {}

interface IDCAHubSwapper is IDCAHubSwapperParameters, IDCAHubSwapperSwapHandler, IDCAHubSwapperDustHandler {}
