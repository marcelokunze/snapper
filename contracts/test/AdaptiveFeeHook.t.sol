// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {BaseHook} from "@uniswap/v4-periphery/src/utils/BaseHook.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {BeforeSwapDelta, BeforeSwapDeltaLibrary} from "@uniswap/v4-core/src/types/BeforeSwapDelta.sol";
import {BalanceDelta} from "@uniswap/v4-core/src/types/BalanceDelta.sol";
import {SwapParams} from "@uniswap/v4-core/src/types/PoolOperation.sol";
import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";

import {PolicyController} from "../src/PolicyController.sol";

contract AdaptiveFeeHook is BaseHook {
    PolicyController public controller;

    event PolicyUsed(uint16 feeBps, int8 volBucket);

    constructor(IPoolManager _pm, PolicyController _c) BaseHook(_pm) {
        controller = _c;
    }

    function _bucketHeuristic() internal view returns (int8) {
        return int8(int256(block.timestamp % 3)) - 1; // -1, 0, +1
    }

    function currentFeeBps() public view returns (uint16) {
        uint16 base = controller.baseFeeBps();
        int16 slope = controller.volSlopeBpsPerBucket();
        uint16 maxF = controller.maxFeeBps();

        int8 b = _bucketHeuristic();
        int256 fee = int256(uint256(base)) + int256(slope) * int256(b);
        if (fee < 0) fee = 0;
        if (fee > int256(uint256(maxF))) fee = int256(uint256(maxF));
        return uint16(uint256(fee));
    }

    function getHookPermissions() public pure override returns (Hooks.Permissions memory p) {
        p.beforeSwap = true;
        p.afterSwap  = true;
    }

    function _beforeSwap(
        address,               // sender
        PoolKey calldata,      // key
        SwapParams calldata,   // params
        bytes calldata         // hookData
    ) internal override returns (bytes4, BeforeSwapDelta, uint24) {
        BeforeSwapDelta delta = BeforeSwapDeltaLibrary.ZERO_DELTA;
        uint24 dynamicFee = uint24(uint256(currentFeeBps()) * 100); // bps -> hundredths of a bip
        return (IHooks.beforeSwap.selector, delta, dynamicFee);
    }

    function _afterSwap(
        address,               // sender
        PoolKey calldata,      // key
        SwapParams calldata,   // params
        BalanceDelta,          // delta
        bytes calldata         // hookData
    ) internal override returns (bytes4, int128) {
        emit PolicyUsed(currentFeeBps(), _bucketHeuristic());
        return (IHooks.afterSwap.selector, 0);
    }
}
