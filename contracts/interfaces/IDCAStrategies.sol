// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity >=0.8.7 <0.9.0;

import '@openzeppelin/contracts/token/ERC721/IERC721.sol';
import '@mean-finance/dca-v2-core/contracts/interfaces/IDCAHub.sol';
import '@mean-finance/nft-descriptors/solidity/interfaces/IDCAHubPositionDescriptor.sol';

interface IDCAStrategiesManagementHandler {
  struct Strategy {
    address owner;
    string name;
    IDCAStrategies.ShareOfToken[] tokens;
  }

  function getStrategy(uint80 strategyId) external view returns (Strategy memory);

  function getStrategyIdByName(string memory strategyName) external view returns (uint80 strategyId);

  function createStrategy(
    string memory strategyName,
    IDCAStrategies.ShareOfToken[] memory tokens,
    address owner
  ) external returns (uint80 strategyId);

  function updateStrategyTokens(uint80 strategyId, IDCAStrategies.ShareOfToken[] memory tokens) external;

  function updateStrategyName(uint80 strategyId, string memory newStrategyName) external;

  function transferStrategyOwnership(uint80 strategyId, address newOwner) external;

  function acceptStrategyOwnership(uint80 strategyId) external;

  function cancelStrategyOwnershipTransfer(uint80 strategyId) external;
}

interface IDCAStrategiesPermissionsHandler is IERC721, IERC721BasicEnumerable {
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
   * @notice The permit typehash used in the permission permit signature
   * @return The typehash for the permission set
   */
  // solhint-disable-next-line func-name-mixedcase
  function PERMISSION_SET_TYPEHASH() external pure returns (bytes32);

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
}

interface IDCAStrategiesPositionsHandler {
  struct DepositParams {
    IDCAHub hub;
    uint80 strategyId;
    address from;
    uint256 amount;
    uint32 amountOfSwaps;
    uint32 swapInterval;
    address owner;
    IDCAStrategies.PermissionSet[] permissions;
  }

  struct Position {
    IDCAHub hub; // 20 bytes
    uint80 strategyId; // 10 bytes
    uint16 strategyVersion; // 2 bytes
    uint256[] positions;
  }

  function deposit(DepositParams calldata parameters) external returns (uint256);

  function withdrawSwapped(uint256 positionId, address recipient) external returns (uint256);

  function increasePosition(
    uint256 positionId,
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
  ) external returns (uint256 unswapped, uint256 swapped);

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
  enum Permission {
    INCREASE,
    REDUCE,
    WITHDRAW,
    TERMINATE,
    SYNC
  }

  struct ShareOfToken {
    address token;
    uint80 share; // 0 < share < 100%
  }

  struct PermissionSet {
    address operator;
    Permission[] permissions;
  }
}
