// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity >=0.8.7 <0.9.0;

import './DCAStrategiesManagementHandler.sol';
import './DCAStrategiesPermissionsHandler.sol';
import './DCAStrategiesPositionsHandler.sol';

// TODO: add -> import '../../interfaces/IDCAStrategies.sol';

contract DCAStrategies is DCAStrategiesManagementHandler, DCAStrategiesPermissionsHandler, DCAStrategiesPositionsHandler {
  constructor(
    address _governor,
    IDCAHubPositionDescriptor _descriptor,
    uint8 _maxTokenShares
  )
    ERC721('Mean Finance - DCA Strategy Position', 'MF-DCA-STRAT-P')
    EIP712('Mean Finance - DCA Strategy Position', '1')
    Governable(_governor)
    DCAStrategiesPermissionsHandler(_descriptor)
    DCAStrategiesManagementHandler(_maxTokenShares)
  {}

  function _getTokenShares(uint80 _strategyId, uint16 _version) internal view override returns (IDCAStrategies.ShareOfToken[] memory) {
    return _tokenShares[_getStrategyAndVersionKey(_strategyId, _version)];
  }

  function _create(address _owner, IDCAStrategies.PermissionSet[] calldata _permissions) internal override returns (uint256 _mintId) {
    _mintId = super._mint(_owner, _permissions);
  }
}
