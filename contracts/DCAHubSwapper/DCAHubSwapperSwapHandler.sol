// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity >=0.8.7 <0.9.0;

import '@mean-finance/swappers/solidity/contracts/SwapAdapter.sol';
import '@mean-finance/swappers/solidity/contracts/extensions/Shared.sol';
import '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import '@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol';
import './utils/DeadlineValidation.sol';
import './DCAHubSwapperParameters.sol';

abstract contract DCAHubSwapperSwapHandler is DeadlineValidation, DCAHubSwapperParameters, SwapAdapter, IDCAHubSwapperSwapHandler {
  enum SwapPlan {
    // Used only for tests
    NONE,
    // Takes the necessary tokens from the caller
    SWAP_FOR_CALLER,
    // Executes swaps against DEXes
    SWAP_WITH_DEXES,
    // TODO: delete
    SWAP_WITH_DEX
  }
  struct SwapData {
    SwapPlan plan;
    bytes data;
  }
  /// @notice Data used for the callback
  struct SwapWithDexCallbackData {
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

  /// @inheritdoc IDCAHubSwapperSwapHandler
  mapping(address => bool) public isDexSupported;

  /// @notice Represents the lack of an executor. We are not using the zero address so that it's cheaper to modify
  address internal constant _NO_EXECUTOR = 0x000000000000000000000000000000000000dEaD;
  /// @notice The caller who initiated a swap execution
  address internal _swapExecutor = _NO_EXECUTOR;

  constructor(address _swapperRegistry) SwapAdapter(_swapperRegistry) {}

  /// @inheritdoc IDCAHubSwapperSwapHandler
  function swapForCaller(
    IDCAHub _hub,
    address[] calldata _tokens,
    IDCAHub.PairIndexes[] calldata _pairsToSwap,
    uint256[] calldata _minimumOutput,
    uint256[] calldata _maximumInput,
    address _recipient,
    uint256 _deadline
  ) external payable checkDeadline(_deadline) returns (IDCAHub.SwapInfo memory _swapInfo) {
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
  function swapWithDex(
    address _dex,
    address _tokensProxy,
    address[] calldata _tokens,
    IDCAHub.PairIndexes[] calldata _pairsToSwap,
    bytes[] calldata _callsToDex,
    bool _doDexSwapsIncludeTransferToHub,
    address _leftoverRecipient,
    uint256 _deadline
  ) external returns (IDCAHub.SwapInfo memory) {
    CallbackDataDex memory _callbackData = CallbackDataDex({
      dex: _dex,
      tokensProxy: _tokensProxy,
      leftoverRecipient: _leftoverRecipient,
      doDexSwapsIncludeTransferToHub: _doDexSwapsIncludeTransferToHub,
      callsToDex: _callsToDex,
      sendToProvideLeftoverToHub: false
    });
    return _swapWithDex(_tokens, _pairsToSwap, _callbackData, _deadline);
  }

  /// @inheritdoc IDCAHubSwapperSwapHandler
  function swapWithDexAndShareLeftoverWithHub(
    address _dex,
    address _tokensProxy,
    address[] calldata _tokens,
    IDCAHub.PairIndexes[] calldata _pairsToSwap,
    bytes[] calldata _callsToDex,
    bool _doDexSwapsIncludeTransferToHub,
    address _leftoverRecipient,
    uint256 _deadline
  ) external returns (IDCAHub.SwapInfo memory) {
    CallbackDataDex memory _callbackData = CallbackDataDex({
      dex: _dex,
      tokensProxy: _tokensProxy,
      leftoverRecipient: _leftoverRecipient,
      doDexSwapsIncludeTransferToHub: _doDexSwapsIncludeTransferToHub,
      callsToDex: _callsToDex,
      sendToProvideLeftoverToHub: true
    });
    return _swapWithDex(_tokens, _pairsToSwap, _callbackData, _deadline);
  }

  function _swapWithDex(
    address[] calldata _tokens,
    IDCAHub.PairIndexes[] calldata _pairsToSwap,
    CallbackDataDex memory _callbackData,
    uint256 _deadline
  ) internal checkDeadline(_deadline) returns (IDCAHub.SwapInfo memory _swapInfo) {
    if (!isDexSupported[_callbackData.dex]) revert UnsupportedDex();
    uint256[] memory _borrow = new uint256[](_tokens.length);
    _swapInfo = hub.swap(
      _tokens,
      _pairsToSwap,
      address(this),
      address(this),
      _borrow,
      abi.encode(SwapData({plan: SwapPlan.SWAP_WITH_DEX, data: abi.encode(_callbackData)}))
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
    } else if (_swapData.plan == SwapPlan.SWAP_WITH_DEX) {
      _handleSwapWithDexCallback(_tokens, _swapData.data);
    } else {
      revert UnexpectedSwapPlan();
    }
  }

  /// @inheritdoc IDCAHubSwapperSwapHandler
  function defineDexSupport(address _dex, bool _support) external onlyGovernor {
    if (_dex == address(0)) revert ZeroAddress();
    isDexSupported[_dex] = _support;
  }

  function _handleSwapWithDexesCallback(IDCAHub.TokenInSwap[] calldata _tokens, bytes memory _data) internal {
    SwapWithDexCallbackData memory _callbackData = abi.decode(_data, (SwapWithDexCallbackData));

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

  struct CallbackDataDex {
    // DEX's address
    address dex;
    // Who should we approve the tokens to (as an example: Paraswap makes you approve one addres and send data to other)
    address tokensProxy;
    // This flag is just a way to make transactions cheaper. If Mean Finance is executing the swap, then it's the same for us
    // if the leftover tokens go to the hub, or to another address. But, it's cheaper in terms of gas to send them to the hub
    bool sendToProvideLeftoverToHub;
    // This flag will let us know if the dex will send the tokens to the hub by itself, or they will be returned to the companion
    bool doDexSwapsIncludeTransferToHub;
    // Address where to send any leftover tokens
    address leftoverRecipient;
    // Different calls to make to the dex
    bytes[] callsToDex;
  }

  function _handleSwapWithDexCallback(IDCAHub.TokenInSwap[] calldata _tokens, bytes memory _data) internal {
    CallbackDataDex memory _callbackData = abi.decode(_data, (CallbackDataDex));
    // Approve DEX
    for (uint256 i; i < _tokens.length; i++) {
      IDCAHub.TokenInSwap memory _tokenInSwap = _tokens[i];
      if (_tokenInSwap.reward > 0) {
        IERC20 _token = IERC20(_tokenInSwap.token);
        bool _tokenHasIssue = tokenHasApprovalIssue[_tokenInSwap.token];
        if (!_tokenHasIssue) {
          // If the token we are going to approve doesn't have the approval issue we see in USDT, we will approve 1 extra.
          // We are doing that so that the allowance isn't fully spent, and the next approve is cheaper.
          _token.approve(_callbackData.tokensProxy, _tokenInSwap.reward + 1);
        } else {
          // Note: I hope USDT burns in hell
          uint256 _allowance = _token.allowance(address(this), _callbackData.tokensProxy);
          if (_allowance < _tokenInSwap.reward) {
            if (_allowance > 0) {
              _token.approve(_callbackData.tokensProxy, 0);
            }
            _token.approve(_callbackData.tokensProxy, _tokenInSwap.reward);
          }
        }
      }
    }
    // Execute swaps
    for (uint256 i; i < _callbackData.callsToDex.length; i++) {
      _callDex(_callbackData.dex, _callbackData.callsToDex[i]);
    }
    // Send remaining tokens to either hub, or leftover recipient
    for (uint256 i; i < _tokens.length; i++) {
      IERC20 _erc20 = IERC20(_tokens[i].token);
      uint256 _balance = _erc20.balanceOf(address(this));
      if (_balance > 0) {
        uint256 _toProvide = _tokens[i].toProvide;
        if (_toProvide > 0) {
          if (_callbackData.doDexSwapsIncludeTransferToHub) {
            // Since the DEX executed a swap & transfer, we assume that the amount to provide was already sent to the hub.
            // We now need to figure out where we send the rest
            address _recipient = _callbackData.sendToProvideLeftoverToHub ? address(hub) : _callbackData.leftoverRecipient;
            _erc20.safeTransfer(_recipient, _balance);
          } else {
            // Since the DEX was not a swap & transfer, we assume that the amount to provide was sent back to the companion.
            // We now need to figure out if we sent the whole thing to the hub, or if we split it
            if (_callbackData.sendToProvideLeftoverToHub || _balance == _toProvide) {
              // Send everything
              _erc20.safeTransfer(address(hub), _balance);
            } else {
              // Send necessary to hub, and the rest to the leftover recipient
              _erc20.safeTransfer(address(hub), _toProvide);
              _erc20.safeTransfer(_callbackData.leftoverRecipient, _balance - _toProvide);
            }
          }
        } else {
          // Since the hub doesn't expect any amount of this token, send everything to the leftover recipient
          _erc20.safeTransfer(_callbackData.leftoverRecipient, _balance);
        }
      }
    }
  }

  function _callDex(address _dex, bytes memory _data) internal virtual {
    // solhint-disable-next-line avoid-low-level-calls
    (bool success, ) = _dex.call{value: 0}(_data);
    if (!success) revert CallToDexFailed();
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
