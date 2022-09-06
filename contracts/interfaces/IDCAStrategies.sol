// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity >=0.8.7 <0.9.0;

import '@openzeppelin/contracts/token/ERC721/IERC721.sol';
import '@mean-finance/dca-v2-core/contracts/interfaces/IDCAHub.sol';
import '@mean-finance/nft-descriptors/solidity/interfaces/IDCAHubPositionDescriptor.sol';

interface IDCAStrategiesManagementHandler {
  /**
   * @notice Emitted when a new strategy is created
   * @param strategyId The id of the new strategy
   * @param strategyName The name of the strategy
   * @param tokens An array with all token shares
   * @param owner The owner of the strategy
   */
  event StrategyCreated(uint80 strategyId, bytes32 strategyName, IDCAStrategies.ShareOfToken[] tokens, address owner);

  /**
   * @notice Emitted when strategy tokens are updated
   * @param strategyId The id of the strategy
   * @param tokens An array with all token shares
   */
  event StrategyTokensUpdated(uint80 strategyId, IDCAStrategies.ShareOfToken[] tokens);

  /**
   * @notice Emitted when strategy name is updated
   * @param strategyId The id of the strategy
   * @param newStrategyName The new strategy name
   */
  event StrategyNameUpdated(uint80 strategyId, bytes32 newStrategyName);

  /**
   * @notice Emitted when the transfer ownership process is initiated
   * @param strategyId The id of the strategy
   * @param newOwner The new owner (pending until accepted)
   */
  event TransferOwnershipInitiated(uint80 strategyId, address newOwner);

  /**
   * @notice Emitted when the transfer ownership process is accepted
   * @param strategyId The id of the strategy
   * @param newOwner The new owner
   */
  event TransferOwnershipAccepted(uint80 strategyId, address newOwner);

  /**
   * @notice Emitted when the transfer ownership process is cancelled by the current owner
   * @param strategyId The id of the strategy
   */
  event TransferOwnershipCancelled(uint80 strategyId);

  /// @notice Thrown when a provided array is empty or has only one item
  error InvalidLength();

  /// @notice Thrown when a provided max token shares amount is zero
  error InvalidMaxTokenShares();

  /// @notice Thrown when a provided array is larger than the allowed amount
  error TokenSharesExceedAmount();

  /// @notice Thrown when a share is 0%
  error ShareIsEmpty();

  /// @notice Thrown when action is performed by other than the strategy owner
  error OnlyStratOwner();

  /// @notice Thrown when action is performed by other than the pending owner
  error OnlyPendingOwner();

  /// @notice Thrown when a provided strategy name already exist
  error NameAlreadyExists();

  /// @notice Thrown when a provided array of token shares is misconfigured
  error InvalidTokenShares();

  struct Strategy {
    address owner;
    bytes32 name;
    uint16 currentVersion;
    IDCAStrategies.ShareOfToken[] tokens;
  }

  /**
   * @notice Returns the number of maximum amount of tokens when creating or updating a strategy
   * @return The number of max token shares
   */
  // solhint-disable-next-line func-name-mixedcase
  function MAX_TOKEN_SHARES() external view returns (uint8);

  /**
   * @notice Returns the address of the pending owner, receiving a strategy id as parameter (zero address is no pending owner)
   * @return The address of the pending owner
   */
  function strategiesPendingOwners(uint80) external view returns (address);

  /**
   * @notice Returns a complete Strategy struct
   * @param strategyId The id of the requested strategy
   * @return Strategy struct
   */
  function getStrategy(uint80 strategyId) external view returns (Strategy memory);

  /**
   * @notice Returns the count of all existing strategies
   * @return Strategy counter
   */
  function strategyCounter() external view returns (uint80);

  /**
   * @notice Returns a the id of a strategy based on a given name
   * @param strategyName name of the requested strategy
   * @return strategyId of the strategy
   */
  function strategyIdByName(bytes32 strategyName) external view returns (uint80 strategyId);

  /**
   * @notice Creates a new strategy based on parameters sent
   * @param strategyName name of the strategy
   * @param tokens an array with token shares
   * @param owner address of the strategy owner
   * @return strategyId of the strategy just created
   */
  function createStrategy(
    bytes32 strategyName,
    IDCAStrategies.ShareOfToken[] memory tokens,
    address owner
  ) external returns (uint80 strategyId);

  /**
   * @notice Updates tokens of a strategy. Will revert if sender is not owner or requirements are not met
   * @param strategyId id of the strategy to update
   * @param tokens an array with the new token shares
   */
  function updateStrategyTokens(uint80 strategyId, IDCAStrategies.ShareOfToken[] memory tokens) external;

  /**
   * @notice Updates the name of a strategy. Will revert if sender is not owner or name is already in use
   * @param strategyId id of the strategy to update
   * @param newStrategyName the new name of the strategy
   */
  function updateStrategyName(uint80 strategyId, bytes32 newStrategyName) external;

  /**
   * @notice Initiate the transfer of the ownership of a strategy
   * @param strategyId id of the strategy
   * @param newOwner the new owner of the strategy (will be pending until accepted)
   */
  function transferStrategyOwnership(uint80 strategyId, address newOwner) external;

  /**
   * @notice Accept the transfer of the ownership of a strategy. Will revert if sender is not the pending owner
   * @param strategyId id of the strategy
   */
  function acceptStrategyOwnership(uint80 strategyId) external;

  /**
   * @notice Cancel the transfer of the ownership of a strategy. Will revert if sender is not the owner
   * @param strategyId id of the strategy
   */
  function cancelStrategyOwnershipTransfer(uint80 strategyId) external;
}

interface IDCAStrategiesPermissionsHandler is IERC721, IERC721BasicEnumerable {
  /**
   * @notice Emitted when permissions for a token are modified
   * @param tokenId The id of the token
   * @param permissions The set of permissions that were updated
   */
  event Modified(uint256 tokenId, IDCAStrategies.PermissionSet[] permissions);

  /**
   * @notice Emitted when the address for a new descritor is set
   * @param descriptor The new descriptor contract
   */
  event NFTDescriptorSet(IDCAHubPositionDescriptor descriptor);

  /// @notice Thrown when a user tries to execute a permit with an expired deadline
  error ExpiredDeadline();

  /// @notice Thrown when a user tries to execute a permit with an invalid signature
  error InvalidSignature();

  /// @notice Thrown when a user tries to perform an action for a token they do not own
  error NotOwner();

  /// @notice A collection of permissions sets for a specific position
  struct PositionPermissions {
    // The id of the token
    uint256 tokenId;
    // The permissions to assign to the position
    IDCAStrategies.PermissionSet[] permissionSets;
  }

  struct TokenPermission {
    // The actual permissions
    uint8 permissions;
    // The block number when it was last updated
    uint248 lastUpdated;
  }

  /**
   * @notice Returns the last time a NFT changed ownership
   * @return Last ownership change timestamp
   */
  function lastOwnershipChange(uint256) external view returns (uint256);

  /**
   * @notice The permit typehash used in the permit signature
   * @return The typehash for the permit
   */
  // solhint-disable-next-line func-name-mixedcase
  function PERMIT_TYPEHASH() external pure returns (bytes32);

  /**
   * @notice The permit typehash used in the permission permit signature
   * @return The typehash for the permission permit
   */
  // solhint-disable-next-line func-name-mixedcase
  function PERMISSION_PERMIT_TYPEHASH() external pure returns (bytes32);

  /**
   * @notice The permit typehash used in the multi permission permit signature
   * @return The typehash for the multi permission permit
   */
  // solhint-disable-next-line func-name-mixedcase
  function MULTI_PERMISSION_PERMIT_TYPEHASH() external pure returns (bytes32);

  /**
   * @notice The permit typehash used in the permission permit signature
   * @return The typehash for the permission set
   */
  // solhint-disable-next-line func-name-mixedcase
  function PERMISSION_SET_TYPEHASH() external pure returns (bytes32);

  /**
   * @notice The permit typehash used in the multi permission permit signature
   * @return The typehash for the position permissions
   */
  // solhint-disable-next-line func-name-mixedcase
  function POSITION_PERMISSIONS_TYPEHASH() external pure returns (bytes32);

  /**
   * @notice The domain separator used in the permit signature
   * @return The domain seperator used in encoding of permit signature
   */
  // solhint-disable-next-line func-name-mixedcase
  function DOMAIN_SEPARATOR() external view returns (bytes32);

  /**
   * @notice Returns the NFT descriptor contract
   * @return The contract for the NFT descriptor
   */
  function nftDescriptor() external returns (IDCAHubPositionDescriptor);

  /**
   * @notice Returns the next nonce to use for a given user
   * @param user The address of the user
   * @return nonce The next nonce to use
   */
  function nonces(address user) external returns (uint256 nonce);

  /**
   * @notice Returns whether the given address has the permission for the given token
   * @param id The id of the token to check
   * @param account The address of the user to check
   * @param permission The permission to check
   * @return Whether the user has the permission or not
   */
  function hasPermission(
    uint256 id,
    address account,
    IDCAStrategies.Permission permission
  ) external view returns (bool);

  /**
   * @notice Returns whether the given address has the permissions for the given token
   * @param id The id of the token to check
   * @param account The address of the user to check
   * @param permissions The permissions to check
   * @return hasPermissions Whether the user has each permission or not
   */
  function hasPermissions(
    uint256 id,
    address account,
    IDCAStrategies.Permission[] calldata permissions
  ) external view returns (bool[] memory hasPermissions);

  /**
   * @notice Sets new permissions for the given tokens
   * @dev Will revert with NotOwner if the caller is not the token's owner.
   *      Operators that are not part of the given permission sets do not see their permissions modified.
   *      In order to remove permissions to an operator, provide an empty list of permissions for them
   * @param id The token's id
   * @param permissions A list of permission sets
   */
  function modify(uint256 id, IDCAStrategies.PermissionSet[] calldata permissions) external;

  /**
   * @notice Sets new permissions for the given positions
   * @dev This is basically the same as executing multiple `modify`
   * @param permissions A list of position permissions to set
   */
  function modifyMany(PositionPermissions[] calldata permissions) external;

  /**
   * @notice Approves spending of a specific token ID by spender via signature
   * @param spender The account that is being approved
   * @param tokenId The ID of the token that is being approved for spending
   * @param deadline The deadline timestamp by which the call must be mined for the approve to work
   * @param v Must produce valid secp256k1 signature from the holder along with `r` and `s`
   * @param r Must produce valid secp256k1 signature from the holder along with `v` and `s`
   * @param s Must produce valid secp256k1 signature from the holder along with `r` and `v`
   */
  function permit(
    address spender,
    uint256 tokenId,
    uint256 deadline,
    uint8 v,
    bytes32 r,
    bytes32 s
  ) external;

  /**
   * @notice Sets permissions via signature
   * @dev This method works similarly to `modifyMany`, but instead of being executed by the owner, it can be set by signature
   * @param permissions The permissions to set for the different positions
   * @param deadline The deadline timestamp by which the call must be mined for the approve to work
   * @param v Must produce valid secp256k1 signature from the holder along with `r` and `s`
   * @param r Must produce valid secp256k1 signature from the holder along with `v` and `s`
   * @param s Must produce valid secp256k1 signature from the holder along with `r` and `v`
   */
  function multiPermissionPermit(
    PositionPermissions[] calldata permissions,
    uint256 deadline,
    uint8 v,
    bytes32 r,
    bytes32 s
  ) external;

  /**
   * @notice Sets permissions via signature
   * @dev This method works similarly to `modify`, but instead of being executed by the owner, it can be set my signature
   * @param permissions The permissions to set
   * @param tokenId The token's id
   * @param deadline The deadline timestamp by which the call must be mined for the approve to work
   * @param v Must produce valid secp256k1 signature from the holder along with `r` and `s`
   * @param r Must produce valid secp256k1 signature from the holder along with `v` and `s`
   * @param s Must produce valid secp256k1 signature from the holder along with `r` and `v`
   */
  function permissionPermit(
    IDCAStrategies.PermissionSet[] calldata permissions,
    uint256 tokenId,
    uint256 deadline,
    uint8 v,
    bytes32 r,
    bytes32 s
  ) external;

  /**
   * @notice Sets a new NFT descriptor
   * @dev Will revert with ZeroAddress if address is zero
   * @param descriptor The new NFT descriptor contract
   */
  function setNFTDescriptor(IDCAHubPositionDescriptor descriptor) external;

  /**
   * @notice Returns token permissions based on parameters sent
   * @param id of the NFT token
   * @param operator the address of the contract who can subtract the token
   * @return Token permissions
   */
  function getTokenPermissions(uint256 id, address operator) external view returns (TokenPermission memory);
}

interface IDCAStrategiesPositionsHandler {
  /**
   * @notice Emitted when a position is created
   * @param depositor The address of the user that creates the position
   * @param owner The address of the user that will own the position
   * @param positionId The id of the position that was created
   * @param fromToken The address of the "from" token
   * @param strategyId The id of the strategy selected
   * @param version The version number of the strategy selected
   * @param swapInterval How frequently the position's swaps should be executed
   * @param permissions The permissions defined for the position
   * @param positions An array containing all underlying positions
   */
  event Deposited(
    address indexed depositor,
    address indexed owner,
    uint256 positionId,
    address fromToken,
    uint80 strategyId,
    uint16 version,
    uint32 swapInterval,
    IDCAStrategies.PermissionSet[] permissions,
    uint256[] positions
  );

  /**
   * @notice Emitted when a user withdraws all swapped tokens from a position
   * @param withdrawer The address of the user that executed the withdraw
   * @param recipient The address of the user that will receive the withdrawn tokens
   * @param positionId The id of the position that was affected
   * @param tokenAmounts The amounts withdrawn and respective tokens
   */
  event Withdrew(address indexed withdrawer, address indexed recipient, uint256 positionId, TokenAmounts[] tokenAmounts);

  /**
   * @notice Emitted when a user increase amount or swaps quantity in a position
   * @param user The address of the user that executed the increase
   * @param positionId The id of the position that was affected
   * @param amount The amount increased
   * @param newSwaps The amount of new swaps
   */
  event Increased(address indexed user, uint256 positionId, uint256 amount, uint32 newSwaps);

  /**
   * @notice Emitted when a user reduces amount or swaps quantity in a position
   * @param user The address of the user that executed the reduce
   * @param positionId The id of the position that was affected
   * @param amount The amount reduced
   * @param newSwaps The amount of new swaps
   * @param recipient The receiver of funds
   */
  event Reduced(address indexed user, uint256 positionId, uint256 amount, uint32 newSwaps, address recipient);

  /**
   * @notice Emitted when a position is terminated
   * @param user The address of the user that terminated the position
   * @param recipientUnswapped The address of the user that will receive the unswapped tokens
   * @param recipientSwapped The address of the user that will receive the swapped tokens
   * @param positionId The id of the position that was terminated
   * @param returnedUnswapped How many "from" tokens were returned to the caller
   * @param returnedSwapped An array contaning how many "to" tokens were returned to the caller
   */
  event Terminated(
    address indexed user,
    address indexed recipientUnswapped,
    address indexed recipientSwapped,
    uint256 positionId,
    uint256 returnedUnswapped,
    TokenAmounts[] returnedSwapped
  );

  /// @notice Thrown when a pair of strategy id and version are non-existing
  error InvalidStrategy();

  /// @notice Thrown when an action is performed by a user without necessary permissions
  error NoPermissions();

  struct DepositParams {
    IDCAHub hub;
    uint80 strategyId;
    uint16 version;
    address from;
    uint256 amount;
    uint32 amountOfSwaps;
    uint32 swapInterval;
    address owner;
    IDCAStrategies.PermissionSet[] permissions;
  }

  struct TokenAmounts {
    address token;
    uint256 amount;
  }

  struct Position {
    IDCAHub hub; // 20 bytes
    uint80 strategyId; // 10 bytes
    uint16 strategyVersion; // 2 bytes
    uint256[] positions;
  }

  /**
   * @notice Returns a user position
   * @param positionId The id of the position
   * @return position The position itself
   */
  function userPosition(uint256 positionId) external view returns (Position memory position);

  function deposit(DepositParams calldata parameters) external returns (uint256);

  function withdrawSwapped(uint256 positionId, address recipient) external returns (TokenAmounts[] memory tokenAmounts);

  function increasePosition(
    uint256 positionId,
    address fromToken,
    uint256 amount,
    uint32 newSwaps
  ) external;

  function reducePosition(
    uint256 positionId,
    uint256 amount,
    uint32 newSwaps,
    address recipient
  ) external;

  function terminate(
    uint256 positionId,
    address recipientUnswapped,
    address recipientSwapped
  ) external returns (uint256 unswapped, TokenAmounts[] memory swapped);

  function syncPositionToLatestStrategyVersion(uint256 positionId) external;

  function increaseAndSyncPositionToLatestStrategyVersion(
    uint256 positionId,
    uint256 amount,
    uint32 newSwaps
  ) external;

  function reduceAndSyncPositionToLatestStrategyVersion(
    uint256 positionId,
    uint256 amount,
    uint32 newSwaps,
    address recipient
  ) external;
}

interface IDCAStrategies is IDCAStrategiesManagementHandler, IDCAStrategiesPermissionsHandler, IDCAStrategiesPositionsHandler {
  /// @notice Thrown when a user provides a zero address when they shouldn't
  error ZeroAddress();

  enum Permission {
    INCREASE,
    REDUCE,
    WITHDRAW,
    TERMINATE,
    SYNC
  }

  struct ShareOfToken {
    address token;
    uint16 share; // 0 < share < 100%
  }

  struct PermissionSet {
    address operator;
    Permission[] permissions;
  }
}
