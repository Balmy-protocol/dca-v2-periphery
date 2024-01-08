// SPDX-License-Identifier: UNLICENSED

pragma solidity >=0.8.22;

/// @notice Simply used for tests with Smock
interface ISwapper {
  function swap(
    address tokenIn,
    uint256 amountIn,
    address tokenOut
  ) external;
}
