/// @notice A token that was left on the contract and should be transferred out
struct TransferOutBalance {
  // The token to transfer
  address token;
  // The recipient of those tokens
  address recipient;
}
