// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.7 <0.9.0;

import '../../DCAStrategies/DCAStrategies/DCAStrategiesPositionsHandler.sol';

contract DCAStrategiesPositionsHandlerMock is DCAStrategiesPositionsHandler {
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
}
