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
   * @notice Withdraws all wToken balance from the platform balance and the given positions,
   *         unwraps it in exchange for the protocol token, and sends it to the given recipient
   * @dev Can only be executed by the owner or allowed users
   * @param positionIds The ids of the positions that we want to withdraw wToken from. These positions
                        have swapped other tokens in exchange for wToken
   * @param recipient The address of the recipient, that will receive all the protocol token balance
   */
  function withdrawProtocolToken(uint256[] calldata positionIds, address payable recipient) external;

  /**
   * @notice Withdraws tokens from the platform balance, and sends them to the given recipient
   * @dev Can only be executed by the owner or allowed users
   * @param amountToWithdraw The tokens to withdraw, and their amounts
   * @param recipient The address of the recipient
   */
  function withdrawFromPlatformBalance(IDCAHub.AmountOfToken[] calldata amountToWithdraw, address recipient) external;

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
   * @param positionSets The positions to withdraw from
   * @param recipient The address of the recipient
   */
  function withdrawFromPositions(IDCAHub.PositionSet[] calldata positionSets, address recipient) external;

  /**
   * @notice Takes a certain amount of the given tokens, and sets up DCA swaps for each of them. 
             The given amounts can be distributed across different target tokens
   * @dev Can only be executed by the owner or allowed users
   * @param amounts Specific tokens and amounts to take from this contract and send to the hub
   * @param distribution How to distribute the source tokens across different target tokens
   */
  function fillPositions(AmountToFill[] calldata amounts, TargetTokenShare[] calldata distribution) external;

  /**
   * @notice Gives or takes access to permissioned actions from users
   * @dev Only the contract owner can execute this action
   * @param access The users to affect, and how to affect them
   */
  function setAccess(UserAccess[] calldata access) external;
}
