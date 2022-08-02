// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity >=0.8.7 <0.9.0;

import '@openzeppelin/contracts/access/AccessControl.sol';
import '@mean-finance/swappers/solidity/contracts/SwapAdapter.sol';
import '@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol';
import '../interfaces/IDCAHubSwapper.sol';
import './utils/DeadlineValidation.sol';

abstract contract DCAHubSwapperSwapHandler is DeadlineValidation, AccessControl, SwapAdapter, IDCAHubSwapperSwapHandler {
  enum SwapPlan {
    // Used only for tests
    NONE,
    // Takes the necessary tokens from the caller
    SWAP_FOR_CALLER,
    // Executes swaps against DEXes
    SWAP_WITH_DEXES
  }
  struct SwapData {
    SwapPlan plan;
    bytes data;
  }
  /// @notice Data used for the callback
  struct SwapWithDexesCallbackData {
    // The different swappers involved in the swap
    address[] swappers;
    // The different swaps to execute
    SwapExecution[] executions;
    // The address that will receive the unspent tokens
    address leftoverRecipient;
    // This flag is just a way to make transactions cheaper. If Mean Finance is executing the swap, then it's the same for us
    // if the leftover tokens go to the hub, or to another address. But, it's cheaper in terms of gas to send them to the hub
    bool sendToProvideLeftoverToHub;
  }

  using SafeERC20 for IERC20;
  using Address for address;

  bytes32 public constant ADMIN_ROLE = keccak256('ADMIN_ROLE');
  bytes32 public constant SWAP_EXECUTION_ROLE = keccak256('SWAP_EXECUTION_ROLE');

  /// @notice Represents the lack of an executor. We are not using the zero address so that it's cheaper to modify
  address internal constant _NO_EXECUTOR = 0x000000000000000000000000000000000000dEaD;
  /// @notice The caller who initiated a swap execution
  address internal _swapExecutor = _NO_EXECUTOR;

  constructor(
    address _swapperRegistry,
    address _admin,
    address[] memory _initialSwapExecutors
  ) SwapAdapter(_swapperRegistry) {
    if (_admin == address(0)) revert ZeroAddress();
    _setupRole(ADMIN_ROLE, _admin);
    _setRoleAdmin(SWAP_EXECUTION_ROLE, ADMIN_ROLE);
    for (uint256 i; i < _initialSwapExecutors.length; i++) {
      _setupRole(SWAP_EXECUTION_ROLE, _initialSwapExecutors[i]);
    }
  }

  /// @inheritdoc IDCAHubSwapperSwapHandler
  function swapForCaller(
    IDCAHub _hub,
    address[] calldata _tokens,
    IDCAHub.PairIndexes[] calldata _pairsToSwap,
    uint256[] calldata _minimumOutput,
    uint256[] calldata _maximumInput,
    address _recipient,
    uint256 _deadline
  ) external payable checkDeadline(_deadline) onlyRole(SWAP_EXECUTION_ROLE) returns (IDCAHub.SwapInfo memory _swapInfo) {
    // Set the swap's executor
    _swapExecutor = msg.sender;

    // Execute swap
    uint256[] memory _borrow = new uint256[](_tokens.length);
    _swapInfo = _hub.swap(
      _tokens,
      _pairsToSwap,
      _recipient,
      address(this),
      _borrow,
      abi.encode(SwapData({plan: SwapPlan.SWAP_FOR_CALLER, data: ''}))
    );

    // Check that limits were met
    for (uint256 i; i < _swapInfo.tokens.length; i++) {
      IDCAHub.TokenInSwap memory _tokenInSwap = _swapInfo.tokens[i];
      if (_tokenInSwap.reward < _minimumOutput[i]) {
        revert RewardNotEnough();
      } else if (_tokenInSwap.toProvide > _maximumInput[i]) {
        revert ToProvideIsTooMuch();
      }
    }

    // Clear the swap executor
    _swapExecutor = _NO_EXECUTOR;
  }

  /// @inheritdoc IDCAHubSwapperSwapHandler
  function swapWithDexes(SwapWithDexesParams calldata _parameters)
    external
    payable
    onlyRole(SWAP_EXECUTION_ROLE)
    returns (IDCAHub.SwapInfo memory)
  {
    return _swapWithDexes(_parameters, false);
  }

  /// @inheritdoc IDCAHubSwapperSwapHandler
  function swapWithDexesForMean(SwapWithDexesParams calldata _parameters)
    external
    payable
    onlyRole(SWAP_EXECUTION_ROLE)
    returns (IDCAHub.SwapInfo memory)
  {
    return _swapWithDexes(_parameters, true);
  }

  function _swapWithDexes(SwapWithDexesParams calldata _parameters, bool _sendToProvideLeftoverToHub)
    internal
    checkDeadline(_parameters.deadline)
    returns (IDCAHub.SwapInfo memory)
  {
    // Approve whatever is necessary
    for (uint256 i; i < _parameters.allowanceTargets.length; i++) {
      Allowance memory _allowance = _parameters.allowanceTargets[i];
      _maxApproveSpenderIfNeeded(_allowance.token, _allowance.allowanceTarget, false, _allowance.minAllowance);
    }

    // Prepare data for callback
    SwapWithDexesCallbackData memory _callbackData = SwapWithDexesCallbackData({
      swappers: _parameters.swappers,
      executions: _parameters.executions,
      leftoverRecipient: _parameters.leftoverRecipient,
      sendToProvideLeftoverToHub: _sendToProvideLeftoverToHub
    });

    // Execute swap
    return
      _parameters.hub.swap(
        _parameters.tokens,
        _parameters.pairsToSwap,
        address(this),
        address(this),
        new uint256[](_parameters.tokens.length),
        abi.encode(SwapData({plan: SwapPlan.SWAP_WITH_DEXES, data: abi.encode(_callbackData)}))
      );
  }

  // solhint-disable-next-line func-name-mixedcase
  function DCAHubSwapCall(
    address,
    IDCAHub.TokenInSwap[] calldata _tokens,
    uint256[] calldata,
    bytes calldata _data
  ) external {
    SwapData memory _swapData = abi.decode(_data, (SwapData));
    if (_swapData.plan == SwapPlan.SWAP_WITH_DEXES) {
      _handleSwapWithDexesCallback(_tokens, _swapData.data);
    } else if (_swapData.plan == SwapPlan.SWAP_FOR_CALLER) {
      _handleSwapForCallerCallback(_tokens);
    } else {
      revert UnexpectedSwapPlan();
    }
  }

  function _handleSwapWithDexesCallback(IDCAHub.TokenInSwap[] calldata _tokens, bytes memory _data) internal {
    SwapWithDexesCallbackData memory _callbackData = abi.decode(_data, (SwapWithDexesCallbackData));

    // Validate that all swappers are allowlisted
    for (uint256 i; i < _callbackData.swappers.length; i++) {
      _assertSwapperIsAllowlisted(_callbackData.swappers[i]);
    }

    // Execute swaps
    for (uint256 i; i < _callbackData.executions.length; i++) {
      SwapExecution memory _execution = _callbackData.executions[i];
      _callbackData.swappers[_execution.swapperIndex].functionCall(_execution.swapData, 'Call to swapper failed');
    }

    // Send remaining tokens to either hub, or leftover recipient
    for (uint256 i; i < _tokens.length; i++) {
      IERC20 _token = IERC20(_tokens[i].token);
      uint256 _balance = _token.balanceOf(address(this));
      if (_balance > 0) {
        uint256 _toProvide = _tokens[i].toProvide;
        if (_toProvide > 0) {
          if (_callbackData.sendToProvideLeftoverToHub) {
            // Send everything to hub (we assume the hub is msg.sender)
            _token.safeTransfer(msg.sender, _balance);
          } else {
            // Send necessary to hub (we assume the hub is msg.sender)
            _token.safeTransfer(msg.sender, _toProvide);
            if (_balance > _toProvide) {
              // If there is some left, send to leftover recipient
              _token.safeTransfer(_callbackData.leftoverRecipient, _balance - _toProvide);
            }
          }
        } else {
          // Send reward to the leftover recipient
          _token.safeTransfer(_callbackData.leftoverRecipient, _balance);
        }
      }
    }
  }

  function _handleSwapForCallerCallback(IDCAHub.TokenInSwap[] calldata _tokens) internal {
    // Load to mem to avoid reading storage multiple times
    address _swapExecutorMen = _swapExecutor;
    for (uint256 i; i < _tokens.length; i++) {
      IDCAHub.TokenInSwap memory _token = _tokens[i];
      if (_token.toProvide > 0) {
        // We assume that msg.sender is the DCAHub
        IERC20(_token.token).safeTransferFrom(_swapExecutorMen, msg.sender, _token.toProvide);
      }
    }
  }
}
