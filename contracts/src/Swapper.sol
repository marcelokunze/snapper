// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {SwapParams} from "@uniswap/v4-core/src/types/PoolOperation.sol";
import {BalanceDelta} from "@uniswap/v4-core/src/types/BalanceDelta.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {IUnlockCallback} from "@uniswap/v4-core/src/interfaces/callback/IUnlockCallback.sol";
import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";

// Local library for settlement helpers
import {CurrencySettler} from "@uniswap/v4-core/test/utils/CurrencySettler.sol";

/// @notice Minimal swapper that performs an exact-input swap via PoolManager.unlock callback.
///         It settles the input from the payer and sends the output to the recipient.
contract Swapper is IUnlockCallback {
    using CurrencySettler for Currency;

    IPoolManager public immutable manager;

    constructor(IPoolManager _manager) {
        manager = _manager;
    }

    struct CallbackData {
        address payer;
        address recipient;
        PoolKey key;
        bool zeroForOne;
        uint256 amountIn;
    }

    /// @notice Swap an exact input amount from `msg.sender` to `recipient`.
    /// @dev The caller must have approved this contract to transfer `amountIn` of the input token.
    function swapExactIn(
        PoolKey memory key,
        bool zeroForOne,
        uint256 amountIn,
        address recipient
    ) external {
        manager.unlock(abi.encode(CallbackData({
            payer: msg.sender,
            recipient: recipient,
            key: key,
            zeroForOne: zeroForOne,
            amountIn: amountIn
        })));
    }

    /// @inheritdoc IUnlockCallback
    function unlockCallback(bytes calldata data) external returns (bytes memory) {
        require(msg.sender == address(manager), "only manager");

        CallbackData memory d = abi.decode(data, (CallbackData));

        // Compute a very wide price limit depending on the direction
        uint160 limit = d.zeroForOne ? TickMath.MIN_SQRT_PRICE + 1 : TickMath.MAX_SQRT_PRICE - 1;

        // Perform the swap (exact input => negative amountSpecified)
        BalanceDelta delta = manager.swap(
            d.key,
            SwapParams({
                zeroForOne: d.zeroForOne,
                amountSpecified: -int256(d.amountIn),
                sqrtPriceLimitX96: limit
            }),
            new bytes(0)
        );

        // Settle input from payer and send output to recipient, using the actual deltas
        if (d.zeroForOne) {
            // Input is currency0, output is currency1
            d.key.currency0.settle(manager, d.payer, uint256(int256(-delta.amount0())), false);
            d.key.currency1.take(manager, d.recipient, uint256(int256(delta.amount1())), false);
        } else {
            // Input is currency1, output is currency0
            d.key.currency1.settle(manager, d.payer, uint256(int256(-delta.amount1())), false);
            d.key.currency0.take(manager, d.recipient, uint256(int256(delta.amount0())), false);
        }

        return "";
    }
}


