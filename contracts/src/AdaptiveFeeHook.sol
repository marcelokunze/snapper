// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

// Uniswap v4 core imports (types and hook interfaces)
import {IHooks} from "@uniswap/v4-core/contracts/interfaces/IHooks.sol";
import {IPoolManager} from "@uniswap/v4-core/contracts/interfaces/IPoolManager.sol";
import {PoolKey} from "@uniswap/v4-core/contracts/types/PoolKey.sol";
import {BalanceDelta} from "@uniswap/v4-core/contracts/types/BalanceDelta.sol";
import {BeforeSwapDelta, BeforeSwapDeltaLibrary} from "@uniswap/v4-core/contracts/types/BeforeSwapDelta.sol";

import {PolicyController} from "./PolicyController.sol";

/// @notice Adaptive fee hook that computes a dynamic fee per swap using a simple volatility bucket heuristic.
/// The exact Uniswap v4 hook signatures are implemented to enable dynamic fee via beforeSwap.
contract AdaptiveFeeHook is IHooks {
  IPoolManager public immutable poolManager;
  PolicyController public controller;

  event PolicyUsed(uint16 feeBps, int8 volBucket);

  constructor(IPoolManager _pm, PolicyController _c) {
    poolManager = _pm;
    controller = _c;
  }

  /// @dev Very cheap heuristic returning -1, 0, or +1 bucket based on timestamp.
  function _bucketHeuristic() internal view returns (int8) {
    return int8(int256(block.timestamp % 3)) - 1; // -1, 0, +1
  }

  /// @notice Compute the current fee in basis points, bounded by [0, maxFeeBps].
  function currentFeeBps() public view returns (uint16) {
    PolicyController.Policy memory p = controller.getPolicy();
    int8 b = _bucketHeuristic();

    int256 fee = int256(uint256(p.baseFeeBps)) + int256(p.volSlopeBpsPerBucket) * int256(b);
    if (fee < 0) fee = 0;
    if (fee > int256(uint256(p.maxFeeBps))) fee = int256(uint256(p.maxFeeBps));
    return uint16(uint256(fee));
  }

  // --------------------------------------------------------------------------------------------
  // Uniswap v4 hook functions
  // --------------------------------------------------------------------------------------------

  /// @notice Called by PoolManager before a swap is executed. Returns the hook selector, a zero delta,
  /// and a dynamic fee for the swap.
  /// NOTE: The returned fee is in hundredths of a basis point per Uniswap v4 convention. We convert
  /// from basis points by multiplying by 100. Adjust if your v4-core dependency uses a different scale.
  function beforeSwap(
    address,
    PoolKey calldata,
    IPoolManager.SwapParams calldata,
    bytes calldata
  ) external returns (bytes4, BeforeSwapDelta, uint24) {
    uint16 feeBps = currentFeeBps();

    // Convert BPS to hundredths-of-a-basis-point (1 bps = 100 h-bps) for hook fee
    uint24 hookFee = uint24(uint256(feeBps) * 100);

    // No custom delta adjustments
    BeforeSwapDelta zeroDelta = BeforeSwapDeltaLibrary.ZERO_DELTA;

    return (IHooks.beforeSwap.selector, zeroDelta, hookFee);
  }

  /// @notice Called by PoolManager after a swap is executed. Emits the policy used for observability.
  function afterSwap(
    address,
    PoolKey calldata,
    IPoolManager.SwapParams calldata,
    BalanceDelta,
    bytes calldata
  ) external returns (bytes4) {
    uint16 feeBps = currentFeeBps();
    emit PolicyUsed(feeBps, _bucketHeuristic());
    return IHooks.afterSwap.selector;
  }
}


