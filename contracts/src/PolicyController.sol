// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControl} from "openzeppelin-contracts/access/AccessControl.sol";

struct Policy {
  uint16 baseFeeBps;
  uint16 maxFeeBps;
  uint32 cooldownSec;
  uint40 lastUpdated;
  int16 volSlopeBpsPerBucket;
}

contract PolicyController is AccessControl {
  bytes32 public constant AGENT_ROLE = keccak256("AGENT_ROLE");

  Policy private _policy;

  event PolicyUpdated(Policy p, address indexed updater);

  constructor() {
    _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
  }

  function setPolicy(Policy calldata p) external onlyRole(AGENT_ROLE) {
    if (_policy.lastUpdated != 0) {
      require(
        block.timestamp - _policy.lastUpdated >= _policy.cooldownSec,
        "Cooldown not elapsed"
      );
    }

    require(p.baseFeeBps <= p.maxFeeBps, "base > max");
    require(p.maxFeeBps <= 1000, "max > 1000");

    Policy memory next = p;
    next.lastUpdated = uint40(block.timestamp);
    _policy = next;

    emit PolicyUpdated(next, msg.sender);
  }

  function getPolicy() external view returns (Policy memory) {
    return _policy;
  }
}


