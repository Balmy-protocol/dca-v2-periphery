/// @notice Context necessary for the swap execution
struct SwapContext {
  // The index of the swapper that should execute each swap. This might look strange but it's way cheaper than alternatives
  uint8 swapperIndex;
  // The ETH/MATIC/BNB to send as part of the swap
  uint256 value;
}
