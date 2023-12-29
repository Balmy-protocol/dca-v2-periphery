// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity >=0.8.22 <0.9.0;

import '@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol';
import '../interfaces/ILegacyDCAHub.sol';

contract LegacyDCASwapper {
  using SafeERC20 for IERC20;
  address internal _swapExecutor;

  function swapForCaller(
    ILegacyDCAHub _hub,
    address[] calldata _tokens,
    IDCAHub.PairIndexes[] calldata _pairsToSwap,
    address _recipient
  ) external {
    // Set the executor
    _swapExecutor = msg.sender;

    // Execute swap
    _hub.swap(_tokens, _pairsToSwap, _recipient, address(this), new uint256[](_tokens.length), '');

    // Clear the swap executor
    _swapExecutor = address(0);
  }

  // solhint-disable-next-line func-name-mixedcase
  function DCAHubSwapCall(
    address,
    IDCAHub.TokenInSwap[] calldata _tokens,
    uint256[] calldata,
    bytes calldata
  ) external {
    address _swapExecutorMem = _swapExecutor;
    for (uint256 i = 0; i < _tokens.length; ++i) {
      IDCAHub.TokenInSwap memory _token = _tokens[i];
      if (_token.toProvide > 0) {
        // We assume that msg.sender is the DCAHub
        IERC20(_token.token).safeTransferFrom(_swapExecutorMem, msg.sender, _token.toProvide);
      }
    }
  }

  function _handleSwapForCallerCallback(IDCAHub.TokenInSwap[] calldata _tokens) internal {
    // Load to mem to avoid reading storage multiple times
    address _swapExecutorMem = _swapExecutor;
    for (uint256 i = 0; i < _tokens.length; ++i) {
      IDCAHub.TokenInSwap memory _token = _tokens[i];
      if (_token.toProvide > 0) {
        // We assume that msg.sender is the DCAHub
        IERC20(_token.token).safeTransferFrom(_swapExecutorMem, msg.sender, _token.toProvide);
      }
    }
  }
}
