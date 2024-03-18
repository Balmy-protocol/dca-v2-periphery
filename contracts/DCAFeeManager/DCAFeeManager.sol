// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity >=0.8.22;

import '@openzeppelin/contracts/access/AccessControl.sol';
import '@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol';
import '@openzeppelin/contracts/utils/Multicall.sol';
import '@mean-finance/call-simulation/contracts/SimulationAdapter.sol';
import '../interfaces/IDCAFeeManager.sol';
import '../utils/SwapAdapter.sol';

contract DCAFeeManager is SwapAdapter, AccessControl, Multicall, IDCAFeeManager, SimulationAdapter {
  bytes32 public constant SUPER_ADMIN_ROLE = keccak256('SUPER_ADMIN_ROLE');
  bytes32 public constant ADMIN_ROLE = keccak256('ADMIN_ROLE');

  using SafeERC20 for IERC20;
  using Address for address payable;

  constructor(address _superAdmin, address[] memory _initialAdmins) SwapAdapter() {
    if (_superAdmin == address(0)) revert ZeroAddress();
    // We are setting the super admin role as its own admin so we can transfer it
    _setRoleAdmin(SUPER_ADMIN_ROLE, SUPER_ADMIN_ROLE);
    _setRoleAdmin(ADMIN_ROLE, SUPER_ADMIN_ROLE);
    _grantRole(SUPER_ADMIN_ROLE, _superAdmin);
    for (uint256 i; i < _initialAdmins.length; i++) {
      _grantRole(ADMIN_ROLE, _initialAdmins[i]);
    }
  }

  receive() external payable {}

  /// @inheritdoc IDCAFeeManager
  function runSwapsAndTransferMany(RunSwapsAndTransferManyParams calldata _parameters) public payable onlyRole(ADMIN_ROLE) {
    // Approve whatever is necessary
    for (uint256 i = 0; i < _parameters.allowanceTargets.length; ++i) {
      AllowanceTarget memory _allowance = _parameters.allowanceTargets[i];
      _maxApproveSpender(_allowance.token, _allowance.allowanceTarget);
    }

    // Execute swaps
    for (uint256 i = 0; i < _parameters.swaps.length; ++i) {
      SwapContext memory _context = _parameters.swapContext[i];
      _executeSwap(_parameters.swappers[_context.swapperIndex], _parameters.swaps[i], _context.value);
    }

    // Transfer out whatever was left in the contract
    for (uint256 i = 0; i < _parameters.transferOutBalance.length; ++i) {
      TransferOutBalance memory _transferOutBalance = _parameters.transferOutBalance[i];
      _sendBalanceOnContractToRecipient(_transferOutBalance.token, _transferOutBalance.recipient);
    }
  }

  /// @inheritdoc IDCAFeeManager
  function withdrawFromPlatformBalance(
    IDCAHub _hub,
    IDCAHub.AmountOfToken[] calldata _amountToWithdraw,
    address _recipient
  ) external onlyRole(ADMIN_ROLE) {
    _hub.withdrawFromPlatformBalance(_amountToWithdraw, _recipient);
  }

  /// @inheritdoc IDCAFeeManager
  function withdrawFromBalance(IDCAHub.AmountOfToken[] calldata _amountToWithdraw, address _recipient) external onlyRole(ADMIN_ROLE) {
    for (uint256 i = 0; i < _amountToWithdraw.length; ++i) {
      IDCAHub.AmountOfToken memory _amountOfToken = _amountToWithdraw[i];
      if (_amountOfToken.amount == type(uint256).max) {
        _sendBalanceOnContractToRecipient(_amountOfToken.token, _recipient);
      } else {
        _sendToRecipient(_amountOfToken.token, _amountOfToken.amount, _recipient);
      }
    }
  }

  /// @inheritdoc IDCAFeeManager
  function revokeAllowances(RevokeAction[] calldata _revokeActions) external onlyRole(ADMIN_ROLE) {
    _revokeAllowances(_revokeActions);
  }

  /// @inheritdoc IDCAFeeManager
  function availableBalances(IDCAHub _hub, address[] calldata _tokens) external view returns (AvailableBalance[] memory _balances) {
    _balances = new AvailableBalance[](_tokens.length);
    for (uint256 i = 0; i < _tokens.length; i++) {
      address _token = _tokens[i];
      _balances[i] = AvailableBalance({
        token: _token,
        platformBalance: _hub.platformBalance(_token),
        feeManagerBalance: IERC20(_token).balanceOf(address(this))
      });
    }
  }

  function supportsInterface(bytes4 _interfaceId) public view virtual override(AccessControl, SimulationAdapter) returns (bool) {
    return SimulationAdapter.supportsInterface(_interfaceId) || AccessControl.supportsInterface(_interfaceId);
  }

  function getPositionKey(address _from, address _to) public pure returns (bytes32) {
    return keccak256(abi.encodePacked(_from, _to));
  }

  /// @dev This version does not check the swapper registry at all
  function _maxApproveSpender(IERC20 _token, address _spender) internal {
    _token.forceApprove(_spender, type(uint256).max);
  }
}
