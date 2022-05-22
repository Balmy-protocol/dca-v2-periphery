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

  TargetTokenShare[] internal _distribution;

  constructor(
    IDCAHub _hub,
    IWrappedProtocolToken _wToken,
    TargetTokenShare[] memory _distributionToSet,
    address _governor
  ) Governable(_governor) {
    hub = _hub;
    wToken = _wToken;
    _setTargetTokensDistribution(_distributionToSet);
  }

  /// @inheritdoc IDCAFeeManager
  function targetTokensDistribution() external view returns (TargetTokenShare[] memory) {
    return _distribution;
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

  /// @inheritdoc IDCAFeeManager
  function setTargetTokensDistribution(TargetTokenShare[] calldata _newDistribution) external onlyOwnerOrAllowed {
    _setTargetTokensDistribution(_newDistribution);
  }

  receive() external payable {}

  function _setTargetTokensDistribution(TargetTokenShare[] memory _newDistribution) internal {
    uint256 _currentTargetTokens = _distribution.length;
    uint256 _min = _currentTargetTokens < _newDistribution.length ? _currentTargetTokens : _newDistribution.length;

    uint16 _assignedShares;
    for (uint256 i; i < _min; i++) {
      // Rewrite storage
      _assignedShares += _newDistribution[i].shares;
      _distribution[i] = _newDistribution[i];
    }

    if (_currentTargetTokens < _newDistribution.length) {
      // If have more tokens than before, then push
      for (uint256 i = _min; i < _newDistribution.length; i++) {
        _assignedShares += _newDistribution[i].shares;
        _distribution.push(_newDistribution[i]);
      }
    } else if (_currentTargetTokens > _newDistribution.length) {
      // If have less tokens than before, then remove extra tokens
      for (uint256 i = _min; i < _currentTargetTokens; i++) {
        _distribution.pop();
      }
    }

    if (_assignedShares != MAX_TOKEN_TOTAL_SHARE) revert InvalidAmountOfShares();
    emit NewDistribution(_newDistribution);
  }

  modifier onlyOwnerOrAllowed() {
    if (!isGovernor(msg.sender) && !hasAccess[msg.sender]) revert CallerMustBeOwnerOrHaveAccess();
    _;
  }
}
