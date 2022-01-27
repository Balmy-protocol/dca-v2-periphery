// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import '@openzeppelin/contracts/utils/Address.sol';

/**
 * @dev This Multicall contract was modified from the one built by OZ. It supports both payable and non payable
 * functions. However, payable functions cannot read `msg.value`, since it will always be zero. We are doing
 * this so that we are less vulnerable to exploits.
 */
abstract contract Multicall {
  /**
   * @dev Receives and executes a batch of function calls on this contract.
   */
  function multicall(bytes[] calldata data) external payable returns (bytes[] memory results) {
    results = new bytes[](data.length);
    for (uint256 i; i < data.length; i++) {
      results[i] = Address.functionCallWithValue(address(this), data[i], 0);
    }
    return results;
  }
}
