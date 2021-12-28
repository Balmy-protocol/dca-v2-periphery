// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity >=0.8.7 <0.9.0;

import '@mean-finance/dca-v2-core/contracts/interfaces/IDCAHub.sol';
import '@mean-finance/dca-v2-core/contracts/interfaces/IDCAPermissionManager.sol';
import '@mean-finance/dca-v2-core/contracts/interfaces/IDCAHubSwapCallee.sol';
import './IWrappedProtocolToken.sol';
import './utils/ICollectableDust.sol';
import './utils/IGovernable.sol';
import './ISharedTypes.sol';

interface IDCAHubCompanionParameters is IGovernable {
  /// @notice Returns the DCA Hub's address
  /// @dev This value cannot be modified
  /// @return The DCA Hub contract
  function hub() external view returns (IDCAHub);

  /// @notice Returns the address of the wrapped token
  /// @dev This value cannot be modified
  /// @return The wToken contract
  function wToken() external view returns (IWrappedProtocolToken);

  /// @notice Returns the address used to represent the protocol token (f.e. ETH/MATIC)
  /// @dev This value cannot be modified
  /// @return The protocol token
  // solhint-disable-next-line func-name-mixedcase
  function PROTOCOL_TOKEN() external view returns (address);

  /// @notice Returns the permission manager contract
  /// @return The contract itself
  function permissionManager() external view returns (IDCAPermissionManager);
}

interface IDCAHubCompanionSwapHandler is IDCAHubSwapCallee {
  /// @notice Thrown when the reward is less that the specified minimum
  error RewardNotEnough();

  /// @notice Thrown when the amount to provide is more than the specified maximum
  error ToProvideIsTooMuch();

  /// @notice Thrown when callback is not called by the hub
  error CallbackNotCalledByHub();

  /// @notice Thrown when swap was not initiated by the companion
  error SwapNotInitiatedByCompanion();

  /// @notice Thrown when the callback is executed with an unexpected swap plan
  error UnexpectedSwapPlan();

  /// @notice Thrown when a swap is executed with a DEX that is not supported
  error UnsupportedDex();

  /// @notice Thrown when a call to the given DEX fails
  error CallToDexFailed();

  /// @notice Executes a swap for the caller, by sending them the reward, and taking from them the needed tokens
  /// @dev Will revert:
  /// With RewardNotEnough if the minimum output is not met
  /// With ToProvideIsTooMuch if the hub swap requires more than the given maximum input
  /// @param _tokens The tokens involved in the swap
  /// @param _pairsToSwap The pairs to swap
  /// @param _minimumOutput The minimum amount of tokens to receive as part of the swap
  /// @param _maximumInput The maximum amount of tokens to provide as part of the swap
  /// @param _recipient Address that will receive all the tokens from the swap
  /// @param _deadline Deadline when the swap becomes invalid
  /// @return The information about the executed swap
  function swapForCaller(
    address[] calldata _tokens,
    IDCAHub.PairIndexes[] calldata _pairsToSwap,
    uint256[] calldata _minimumOutput,
    uint256[] calldata _maximumInput,
    address _recipient,
    uint256 _deadline
  ) external payable returns (IDCAHub.SwapInfo memory);

  /// @notice Executes a swap with the given DEX, and sends all unspent tokens to the given recipient
  /// @param _dex The DEX that will be used in the swap
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
    address[] calldata _tokens,
    IDCAHub.PairIndexes[] calldata _pairsToSwap,
    bytes[] calldata _callsToDex,
    bool _doDexSwapsIncludeTransferToHub,
    address _leftoverRecipient,
    uint256 _deadline
  ) external returns (IDCAHub.SwapInfo memory);
}

interface IDCAHubCompanionWTokenPositionHandler {
  /// @notice Emitted when a deposit is made by converting one of the user's tokens for another asset
  /// @param positionId The id of the position that was created
  /// @param originalTokenFrom The original "from" token
  /// @param convertedTokenFrom The "from" token that was actually deposited on the hub
  /// @param originalTokenTo The original "to" token
  /// @param convertedTokenTo The "to" token that was actually part of the position
  event ConvertedDeposit(
    uint256 positionId,
    address originalTokenFrom,
    address convertedTokenFrom,
    address originalTokenTo,
    address convertedTokenTo
  );

  /// @notice Thrown when the user tries to make a deposit where neither or both of the tokens are the protocol token
  error InvalidTokens();

  /// @notice Thrown when a user tries operate on a position that they don't have access to
  error UnauthorizedCaller();

  /// @notice Thrown when the user sends more or less of the protocol token than is actually necessary
  error InvalidAmountOfProtocolTokenReceived();

  /// @notice Creates a new position by converting the protocol's base token to its wrapped version
  /// @dev This function will also give all permissions to this contract, so that it can then withdraw/terminate and
  /// convert back to protocol's token. Will revert with InvalidTokens unless only one of the tokens is the protocol token
  /// @param _from The address of the "from" token
  /// @param _to The address of the "to" token
  /// @param _amount How many "from" tokens will be swapped in total
  /// @param _amountOfSwaps How many swaps to execute for this position
  /// @param _swapInterval How frequently the position's swaps should be executed
  /// @param _owner The address of the owner of the position being created
  /// @return The id of the created position
  function depositUsingProtocolToken(
    address _from,
    address _to,
    uint256 _amount,
    uint32 _amountOfSwaps,
    uint32 _swapInterval,
    address _owner,
    IDCAPermissionManager.PermissionSet[] calldata _permissions
  ) external payable returns (uint256);

  /// @notice Withdraws all swapped tokens from a position to a recipient
  /// @param _positionId The position's id
  /// @param _recipient The address to withdraw swapped tokens to
  /// @return _swapped How much was withdrawn
  function withdrawSwappedUsingProtocolToken(uint256 _positionId, address payable _recipient) external returns (uint256 _swapped);

  /// @notice Withdraws all swapped tokens from multiple positions
  /// @param _positionIds A list positions whose 'to' token is the wToken
  /// @param _recipient The address to withdraw swapped tokens to
  /// @return _swapped How much was withdrawn in total
  function withdrawSwappedManyUsingProtocolToken(uint256[] calldata _positionIds, address payable _recipient)
    external
    returns (uint256 _swapped);

  /// @notice Takes the unswapped balance, adds the new deposited funds and modifies the position so that
  /// it is executed in _newSwaps swaps
  /// @param _positionId The position's id
  /// @param _amount Amount of funds to add to the position
  /// @param _newSwaps The new amount of swaps
  function increasePositionUsingProtocolToken(
    uint256 _positionId,
    uint256 _amount,
    uint32 _newSwaps
  ) external payable;

  /// @notice Withdraws the specified amount from the unswapped balance and modifies the position so that
  /// it is executed in _newSwaps swaps
  /// @param _positionId The position's id
  /// @param _amount Amount of funds to withdraw from the position
  /// @param _newSwaps The new amount of swaps
  /// @param _recipient The address to send tokens to
  function reducePositionUsingProtocolToken(
    uint256 _positionId,
    uint256 _amount,
    uint32 _newSwaps,
    address payable _recipient
  ) external;

  /// @notice Terminates the position and sends all unswapped and swapped balance to the specified recipients
  /// @param _positionId The position's id
  /// @param _recipientUnswapped The address to withdraw unswapped tokens to
  /// @param _recipientSwapped The address to withdraw swapped tokens to
  /// @return _unswapped The unswapped balance sent to `_recipientUnswapped`
  /// @return _swapped The swapped balance sent to `_recipientSwapped`
  function terminateUsingProtocolTokenAsFrom(
    uint256 _positionId,
    address payable _recipientUnswapped,
    address _recipientSwapped
  ) external returns (uint256 _unswapped, uint256 _swapped);

  /// @notice Terminates the position and sends all unswapped and swapped balance to the specified recipients
  /// @param _positionId The position's id
  /// @param _recipientUnswapped The address to withdraw unswapped tokens to
  /// @param _recipientSwapped The address to withdraw swapped tokens to
  /// @return _unswapped The unswapped balance sent to `_recipientUnswapped`
  /// @return _swapped The swapped balance sent to `_recipientSwapped`
  function terminateUsingProtocolTokenAsTo(
    uint256 _positionId,
    address _recipientUnswapped,
    address payable _recipientSwapped
  ) external returns (uint256 _unswapped, uint256 _swapped);

  /// @notice Increases the allowance of wToken to the max, for the DCAHub
  /// @dev Anyone can call this method
  function approveWTokenForHub() external;
}

interface IDCAHubCompanionDustHandler is ICollectableDust {}

interface IDCAHubCompanionLibrariesHandler {
  /// @notice Takes a list of pairs and returns how it would look like to execute a swap for all of them
  /// @dev Please note that this function is very expensive. Ideally, it would be used for off-chain purposes
  /// @param _pairs The pairs to be involved in the swap
  /// @return How executing a swap for all the given pairs would look like
  function getNextSwapInfo(Pair[] calldata _pairs) external view returns (IDCAHub.SwapInfo memory);

  /// @notice Returns how many seconds left until the next swap is available for a list of pairs
  /// @dev Tokens in pairs may be passed in either tokenA/tokenB or tokenB/tokenA order
  /// @param _pairs Pairs to check
  /// @return The amount of seconds until next swap for each of the pairs
  function secondsUntilNextSwap(Pair[] calldata _pairs) external view returns (uint256[] memory);
}

interface IDCAHubCompanion is
  IDCAHubCompanionParameters,
  IDCAHubCompanionSwapHandler,
  IDCAHubCompanionWTokenPositionHandler,
  IDCAHubCompanionDustHandler,
  IDCAHubCompanionLibrariesHandler
{
  /// @notice Thrown when one of the parameters is a zero address
  error ZeroAddress();
}
