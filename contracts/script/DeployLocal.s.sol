// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script} from "forge-std/Script.sol";
import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {HookMiner} from "@uniswap/v4-periphery/src/utils/HookMiner.sol";

import {PolicyController} from "../src/PolicyController.sol";
import {AdaptiveFeeHook} from "../src/AdaptiveFeeHook.sol";
import {POOLMANAGER, CREATE2_DEPLOYER} from "./base/Constants.sol";

contract DeployLocal is Script {
    function run() external {
        vm.startBroadcast();

        // Deploy policy controller with simple defaults
        address admin = msg.sender;
        PolicyController pc = new PolicyController({
            admin: admin,
            base: 20,         // 0.20%
            slope: 5,         // +/- 0.05% per bucket
            maxFee: 60,       // 0.60% cap
            cooldown: 30
        });

        // Mine an address that encodes the flags we need
        uint160 flags = uint160(
            Hooks.BEFORE_SWAP_FLAG | Hooks.AFTER_SWAP_FLAG | Hooks.BEFORE_SWAP_RETURNS_DELTA_FLAG
        );

        bytes memory ctorArgs = abi.encode(IPoolManager(POOLMANAGER), pc);
        (address mined, bytes32 salt) =
            HookMiner.find(CREATE2_DEPLOYER, flags, type(AdaptiveFeeHook).creationCode, ctorArgs);

        // Deploy the hook at the mined address
        AdaptiveFeeHook hook = new AdaptiveFeeHook{salt: salt}(IPoolManager(POOLMANAGER), pc);
        require(address(hook) == mined, "hook address mismatch");

        vm.stopBroadcast();
    }
}
