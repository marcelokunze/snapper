// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {AccessControl} from "openzeppelin-contracts/contracts/access/AccessControl.sol";

contract PolicyController is AccessControl {
    bytes32 public constant AGENT_ROLE = keccak256("AGENT_ROLE");

    struct Policy {
        uint16 baseFeeBps;              // e.g. 20 = 0.20%
        uint16 maxFeeBps;               // cap, e.g. 60 = 0.60%
        int16  volSlopeBpsPerBucket;    // -/+ per bucket step
        uint32 cooldownSec;             // not used in POC
        uint40 lastUpdated;             // not used in POC
    }

    Policy private _policy;

    event PolicyUpdated(uint16 baseFeeBps, uint16 maxFeeBps, int16 volSlope, uint32 cooldownSec);

    constructor(address admin, uint16 base, int16 slope, uint16 maxFee, uint32 cooldown) {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(AGENT_ROLE, admin);
        _policy = Policy({baseFeeBps: base, maxFeeBps: maxFee, volSlopeBpsPerBucket: slope, cooldownSec: cooldown, lastUpdated: 0});
        emit PolicyUpdated(base, maxFee, slope, cooldown);
    }

    function setPolicy(Policy memory p) external onlyRole(AGENT_ROLE) {
        _policy = p;
        emit PolicyUpdated(p.baseFeeBps, p.maxFeeBps, p.volSlopeBpsPerBucket, p.cooldownSec);
    }

    // Lightweight getters for other contracts
    function baseFeeBps() external view returns (uint16) { return _policy.baseFeeBps; }
    function maxFeeBps() external view returns (uint16)  { return _policy.maxFeeBps; }
    function volSlopeBpsPerBucket() external view returns (int16) { return _policy.volSlopeBpsPerBucket; }
}
