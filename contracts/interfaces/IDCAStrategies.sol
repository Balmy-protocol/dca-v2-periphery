// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity >=0.8.7 <0.9.0;

interface IDCAStrategiesManagementHandler {}

interface IDCAStrategiesPermissionsHandler {}

interface IDCAStrategiesPositionsHandler {}

interface IDCAStrategies is IDCAStrategiesManagementHandler, IDCAStrategiesPermissionsHandler, IDCAStrategiesPositionsHandler {}
