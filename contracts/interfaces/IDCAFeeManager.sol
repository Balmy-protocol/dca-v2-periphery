// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity >=0.8.7 <0.9.0;

import '@mean-finance/dca-v2-core/contracts/interfaces/IDCAHub.sol';
import './IWrappedProtocolToken.sol';
import './utils/IGovernable.sol';

/**
 * @title DCA Fee Manager
 * @notice This contract will manage all platform fees. Since fees come in different tokens, this manager
 *         will be in charge of taking them and converting them to different tokens, for example ETH/MATIC
 *         or stablecoins. Allowed users will to withdraw fees as generated, or DCA them into tokens
 *         of their choosing
 */
interface IDCAFeeManager is IGovernable {
  /// @notice Represents a share of a target token
  struct TargetTokenShare {
    address token;
    uint16 shares;
  }

  /// @notice Represents a user and the new access that should be assigned to them
  struct UserAccess {
    address user;
    bool access;
  }

  /// @notice Represents how much to deposit to a position, for a specific token
  struct AmountToFill {
    address token;
    uint32 amountOfSwaps;
    uint256 amount;
  }

  /// @notice Represents how much is available for withdraw, for a specific token
  struct AvailableBalance {
    address token;
    uint256 platformBalance;
    uint256 feeManagerBalance;
    PositionBalance[] positions;
  }

  /// @notice Represents information about a specific position
  struct PositionBalance {
    uint256 positionId;
    IERC20Metadata from;
    IERC20Metadata to;
    uint256 swapped;
    uint256 remaining;
  }

  /// @notice Thrown when a user tries to execute a permissioned action without the access to do so
  error CallerMustBeOwnerOrHaveAccess();

  /**
   * @notice Emitted when access is modified for some users
   * @param access The modified users and their new access
   */
  event NewAccess(UserAccess[] access);

  /**
   * @notice The contract's owner and other allowed users can specify the target tokens that the fees
   *         should be converted to. They can also specify the percentage assigned to each token
   * @dev This value is constant and cannot be modified
   * @return The numeric value that represents a 100% asignment for the fee conversion distribution
   */
  // solhint-disable-next-line func-name-mixedcase
  function MAX_TOKEN_TOTAL_SHARE() external view returns (uint16);

  /**
   * @notice Returns the swap interval used for DCA swaps
   * @dev This value is constant and cannot be modified
   * @return The swap interval used for DCA swaps
   */
  // solhint-disable-next-line func-name-mixedcase
  function SWAP_INTERVAL() external view returns (uint32);

  /**
   * @notice Returns address for the DCA Hub
   * @dev This value cannot be modified after deployment
   * @return The address for the DCA Hub
   */
  function hub() external view returns (IDCAHub);

  /**
   * @notice Returns address for the wToken
   * @dev This value cannot be modified after deployment
   * @return The address for the wToken
   */
  function wToken() external view returns (IWrappedProtocolToken);

  /**
   * @notice Returns whether the given user has access to fill positions or execute withdraws
   * @param user The user to check access for
   * @return Whether the given user has access
   */
  function hasAccess(address user) external view returns (bool);

  /**
   * @notice Returns the position id for a given (from, to) pair
   * @dev Key for (tokenA, tokenB) is different from the key for(tokenB, tokenA)
   * @param pairKey The key of the pair (from, to)
   * @return The position id for the given pair
   */
  function positions(bytes32 pairKey) external view returns (uint256); // key(from, to) => position id

  /**
   * @notice Unwraps all wToken, in exchange for the protocol token
   * @dev Can only be executed by the owner or allowed users
   * @param amount The amount to unwrap
   */
  function unwrapWToken(uint256 amount) external;

  /**
   * @notice Withdraws tokens from the platform balance, and sends them to the given recipient
   * @dev Can only be executed by the owner or allowed users
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
   * @dev Can only be executed by the owner or allowed users
   * @param amountToWithdraw The tokens to withdraw, and their amounts
   * @param recipient The address of the recipient
   */
  function withdrawFromBalance(IDCAHub.AmountOfToken[] calldata amountToWithdraw, address recipient) external;

  /**
   * @notice Withdraws tokens from the given positions, and sends them to the given recipient
   * @dev Can only be executed by the owner or allowed users
   * @param hub The address of the DCA Hub
   * @param positionSets The positions to withdraw from
   * @param recipient The address of the recipient
   */
  function withdrawFromPositions(
    IDCAHub hub,
    IDCAHub.PositionSet[] calldata positionSets,
    address recipient
  ) external;

  /**
   * @notice Withdraws protocol tokens and sends them to the given recipient
   * @dev Can only be executed by the owner or allowed users
   * @param amount The amount to withdraw
   * @param recipient The address of the recipient
   */
  function withdrawProtocolToken(uint256 amount, address payable recipient) external;

  /**
   * @notice Takes a certain amount of the given tokens, and sets up DCA swaps for each of them.
   *         The given amounts can be distributed across different target tokens
   * @dev Can only be executed by the owner or allowed users
   * @param hub The address of the DCA Hub
   * @param amounts Specific tokens and amounts to take from this contract and send to the hub
   * @param distribution How to distribute the source tokens across different target tokens
   */
  function fillPositions(
    IDCAHub hub,
    AmountToFill[] calldata amounts,
    TargetTokenShare[] calldata distribution
  ) external;

  /**
   * @notice Takes list of position ids and terminates them. All swapped and unswapped balance is
   *         sent to the given recipient. This is meant to be used only if for some reason swaps are
   *         no longer executed
   * @dev Can only be executed by the owner or allowed users
   * @param hub The address of the DCA Hub
   * @param positionIds The positions to terminate
   * @param recipient The address that will receive all swapped and unswapped tokens
   */
  function terminatePositions(
    IDCAHub hub,
    uint256[] calldata positionIds,
    address recipient
  ) external;

  /**
   * @notice Gives or takes access to permissioned actions from users
   * @dev Only the contract owner can execute this action
   * @param access The users to affect, and how to affect them
   */
  function setAccess(UserAccess[] calldata access) external;

  /**
   * @notice Returns how much is available for withdraw, for the given tokens
   * @dev This is meant for off-chan purposes
   * @param hub The address of the DCA Hub
   * @param tokens The tokens to check the balance for
   * @return How much is available for withdraw, for the given tokens
   */
  function availableBalances(IDCAHub hub, address[] calldata tokens) external view returns (AvailableBalance[] memory);
}
