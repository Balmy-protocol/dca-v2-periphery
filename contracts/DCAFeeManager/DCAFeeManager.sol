// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity >=0.8.7 <0.9.0;

import '../interfaces/IDCAFeeManager.sol';
import '../utils/Governable.sol';

contract DCAFeeManager is Governable, IDCAFeeManager {
  /// @inheritdoc IDCAFeeManager
  uint16 public constant MAX_TOKEN_TOTAL_SHARE = 10000;
  /// @inheritdoc IDCAFeeManager
  uint32 public constant SWAP_INTERVAL = 1 days;
  /// @inheritdoc IDCAFeeManager
  IDCAHub public immutable hub;
  /// @inheritdoc IDCAFeeManager
  IWrappedProtocolToken public immutable wToken;
  /// @inheritdoc IDCAFeeManager
  mapping(address => bool) public hasAccess;

  constructor(
    IDCAHub _hub,
    IWrappedProtocolToken _wToken,
    address _governor
  ) Governable(_governor) {
    hub = _hub;
    wToken = _wToken;
  }

  /// @inheritdoc IDCAFeeManager
  function withdrawProtocolToken(uint256[] calldata _positionIds, address payable _recipient) external onlyOwnerOrAllowed {
    // Withdraw wToken from platform balance
    uint256 _platformBalance = hub.platformBalance(address(wToken));
    if (_platformBalance > 0) {
      IDCAHub.AmountOfToken[] memory _amountToWithdraw = new IDCAHub.AmountOfToken[](1);
      _amountToWithdraw[0] = IDCAHub.AmountOfToken({token: address(wToken), amount: _platformBalance});
      hub.withdrawFromPlatformBalance(_amountToWithdraw, address(this));
    }

    // Withdraw wToken from positions
    if (_positionIds.length > 0) {
      IDCAHub.PositionSet[] memory _positionSets = new IDCAHub.PositionSet[](1);
      _positionSets[0] = IDCAHubPositionHandler.PositionSet({token: address(wToken), positionIds: _positionIds});
      hub.withdrawSwappedMany(_positionSets, address(this));
    }

    // Unwrap and transfer
    uint256 _totalBalance = wToken.balanceOf(address(this));
    if (_totalBalance > 0) {
      wToken.withdraw(_totalBalance);
      _recipient.transfer(_totalBalance);
    }
  }

  /// @inheritdoc IDCAFeeManager
  function setAccess(UserAccess[] calldata _access) external onlyGovernor {
    for (uint256 i; i < _access.length; i++) {
      hasAccess[_access[i].user] = _access[i].access;
    }
    emit NewAccess(_access);
  }

  receive() external payable {}

  modifier onlyOwnerOrAllowed() {
    if (!isGovernor(msg.sender) && !hasAccess[msg.sender]) revert CallerMustBeOwnerOrHaveAccess();
    _;
  }
}
