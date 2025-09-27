// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {PolicyController} from "./PolicyController.sol";
import {AdaptiveFeeHook} from "./AdaptiveFeeHook.sol";

contract HookDeployer {
    function deployAdaptiveFeeHook(bytes32 salt, IPoolManager manager, PolicyController pc) external returns (address) {
        AdaptiveFeeHook h = new AdaptiveFeeHook{salt: salt}(manager, pc);
        return address(h);
    }
}


