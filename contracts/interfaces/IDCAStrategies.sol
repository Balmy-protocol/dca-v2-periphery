// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity >=0.8.7 <0.9.0;

import '@openzeppelin/contracts/token/ERC721/extensions/IERC721Enumerable.sol';
import '@mean-finance/nft-descriptors/solidity/interfaces/IDCAHubPositionDescriptor.sol';

interface IDCAStrategiesBase {
  enum Permission {
    INCREASE,
    REDUCE,
    WITHDRAW,
    TERMINATE,
    SYNC
  }

  struct Position {
    address hub; // 20 bytes
    uint80 strategyId; // 10 bytes
    uint16 strategyVersion; // 2 bytes
    uint256[] positions;
  }

  struct ShareOfToken {
    address token;
    uint80 share; // 0 < share <= 100%
  }

  struct PermissionSet {
    address operator;
    Permission[] permissions;
  }

  struct Strategy {
    address owner;
    string name;
    ShareOfToken[] tokens;
  }
}

interface IDCAStrategiesManagementHandler is IDCAStrategiesBase {
  function getStrategy(uint80 _strategyId) external view returns (Strategy memory);

  function getStrategyIdByName(string memory _strategyName) external view returns (uint80 _strategyId);

  function createStrategy(
    string memory _strategyName,
    ShareOfToken[] memory _tokens,
    address _owner
  ) external returns (uint80 _strategyId);

  function updateStrategyTokens(uint80 _strategyId, ShareOfToken[] memory _tokens) external;

  function updateStrategyName(uint80 _strategyId, string memory _newStrategyName) external;

  function transferStrategyOwnership(uint80 _strategyId, address _newOwner) external;

  function acceptStrategyOwnership(uint80 _strategyId) external;

  function cancelStrategyOwnershipTransfer(uint80 _strategyId, address _newOwner) external;
}

interface IDCAStrategiesPermissionsHandler is IDCAStrategiesBase, IERC721Enumerable {
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
   * @notice Returns the address of the DCA Hub
   * @return The address of the DCA Hub
   */
  function hub() external returns (address);

  /**
   * @notice Returns the next nonce to use for a given user
   * @param _user The address of the user
   * @return _nonce The next nonce to use
   */
  function nonces(address _user) external returns (uint256 _nonce);

  /**
   * @notice Returns whether the given address has the permission for the given token
   * @param _id The id of the token to check
   * @param _account The address of the user to check
   * @param _permission The permission to check
   * @return Whether the user has the permission or not
   */
  function hasPermission(
    uint256 _id,
    address _account,
    Permission _permission
  ) external view returns (bool);

  /**
   * @notice Returns whether the given address has the permissions for the given token
   * @param _id The id of the token to check
   * @param _account The address of the user to check
   * @param _permissions The permissions to check
   * @return _hasPermissions Whether the user has each permission or not
   */
  function hasPermissions(
    uint256 _id,
    address _account,
    Permission[] calldata _permissions
  ) external view returns (bool[] memory _hasPermissions);

  /**
   * @notice Sets the address for the hub
   * @dev Can only be successfully executed once. Once it's set, it can be modified again
   *      Will revert:
   *      - With ZeroAddress if address is zero
   *      - With HubAlreadySet if the hub has already been set
   * @param _hub The address to set for the hub
   */
  function setHub(address _hub) external;

  /**
   * @notice Sets new permissions for the given tokens
   * @dev Will revert with NotOwner if the caller is not the token's owner.
   *      Operators that are not part of the given permission sets do not see their permissions modified.
   *      In order to remove permissions to an operator, provide an empty list of permissions for them
   * @param _id The token's id
   * @param _permissions A list of permission sets
   */
  function modify(uint256 _id, PermissionSet[] calldata _permissions) external;

  /**
   * @notice Approves spending of a specific token ID by spender via signature
   * @param _spender The account that is being approved
   * @param _tokenId The ID of the token that is being approved for spending
   * @param _deadline The deadline timestamp by which the call must be mined for the approve to work
   * @param _v Must produce valid secp256k1 signature from the holder along with `r` and `s`
   * @param _r Must produce valid secp256k1 signature from the holder along with `v` and `s`
   * @param _s Must produce valid secp256k1 signature from the holder along with `r` and `v`
   */
  function permit(
    address _spender,
    uint256 _tokenId,
    uint256 _deadline,
    uint8 _v,
    bytes32 _r,
    bytes32 _s
  ) external;

  /**
   * @notice Sets permissions via signature
   * @dev This method works similarly to `modify`, but instead of being executed by the owner, it can be set my signature
   * @param _permissions The permissions to set
   * @param _tokenId The token's id
   * @param _deadline The deadline timestamp by which the call must be mined for the approve to work
   * @param _v Must produce valid secp256k1 signature from the holder along with `r` and `s`
   * @param _r Must produce valid secp256k1 signature from the holder along with `v` and `s`
   * @param _s Must produce valid secp256k1 signature from the holder along with `r` and `v`
   */
  function permissionPermit(
    PermissionSet[] calldata _permissions,
    uint256 _tokenId,
    uint256 _deadline,
    uint8 _v,
    bytes32 _r,
    bytes32 _s
  ) external;

  /**
   * @notice Sets a new NFT descriptor
   * @dev Will revert with ZeroAddress if address is zero
   * @param _descriptor The new NFT descriptor contract
   */
  function setNFTDescriptor(IDCAHubPositionDescriptor _descriptor) external;
}

interface IDCAStrategiesPositionsHandler is IDCAStrategiesBase {
  function deposit(
    uint80 _strategyId,
    address _from,
    uint256 _amount,
    uint256 _amountOfSwaps,
    uint256 _swapInterval,
    address _owner,
    PermissionSet[] memory _permissions
  ) external returns (uint256);

  function withdrawSwapped(uint256 _positionId, address _recipient) external returns (uint256);

  function increasePosition(
    uint256 _positionId,
    uint256 _amount,
    uint256 _newSwaps
  ) external;

  function reducePosition(
    uint256 _positionId,
    uint256 _amount,
    uint256 _newSwaps,
    address _recipient
  ) external;

  function terminate(
    uint256 _positionId,
    address _recipientUnswapped,
    address _recipientSwapped
  ) external returns (uint256 _unswapped, uint256 _swapped);

  function syncPositionToLatestStrategyVersion(uint256 _positionId) external;

  function increaseAndSyncPositionToLatestStrategyVersion(
    uint256 _positionId,
    uint256 _amount,
    uint256 _newSwaps
  ) external;

  function reduceAndSyncPositionToLatestStrategyVersion(
    uint256 _positionId,
    uint256 _amount,
    uint256 _newSwaps,
    address _recipient
  ) external;
}

interface IDCAStrategies is IDCAStrategiesManagementHandler, IDCAStrategiesPermissionsHandler, IDCAStrategiesPositionsHandler {}
