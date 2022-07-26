// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity >=0.8.7 <0.9.0;

import '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import '@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol';
import '../interfaces/IDCAHubSwapper.sol';

abstract contract DCAHubSwapper is IDCAHubSwapperSwapHandler {
  enum SwapPlan {
    NONE,
    SWAP_FOR_CALLER
  }
  struct SwapData {
    SwapPlan plan;
    bytes data;
  }

  error TransactionIsTooOld();

  using SafeERC20 for IERC20;

  address constant NO_EXECUTOR = 0x000000000000000000000000000000000000dEaD;
  address internal _swapExecutor = NO_EXECUTOR;

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
    _swapInfo = _hub.swap(
      _tokens,
      _pairsToSwap,
      _recipient,
      address(this),
      new uint256[](_tokens.length),
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
    // Clear the swap executor (we are not using the zero address so that it's cheaper to modify)
    _swapExecutor = NO_EXECUTOR;
  }

  // solhint-disable-next-line func-name-mixedcase
  function DCAHubSwapCall(
    address,
    IDCAHub.TokenInSwap[] calldata _tokens,
    uint256[] calldata,
    bytes calldata _data
  ) external {
    SwapData memory _swapData = abi.decode(_data, (SwapData));
    if (_swapData.plan == SwapPlan.SWAP_FOR_CALLER) {
      _handleSwapForCallerCallback(_tokens);
    } else {
      revert UnexpectedSwapPlan();
    }
  }

  function _handleSwapForCallerCallback(IDCAHub.TokenInSwap[] calldata _tokens) internal {
    for (uint256 i; i < _tokens.length; i++) {
      IDCAHub.TokenInSwap memory _token = _tokens[i];
      if (_token.toProvide > 0) {
        IERC20(_token.token).safeTransferFrom(_swapExecutor, msg.sender, _token.toProvide);
      }
    }
  }

  modifier checkDeadline(uint256 deadline) {
    if (_blockTimestamp() > deadline) revert TransactionIsTooOld();
    _;
  }

  /// @dev Method that exists purely to be overridden for tests
  /// @return The current block timestamp
  function _blockTimestamp() internal view virtual returns (uint256) {
    return block.timestamp;
  }
}
