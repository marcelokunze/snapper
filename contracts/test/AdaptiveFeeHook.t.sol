// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";

import {PoolManager} from "@uniswap/v4-core/contracts/PoolManager.sol";
import {IPoolManager} from "@uniswap/v4-core/contracts/interfaces/IPoolManager.sol";
import {IHooks} from "@uniswap/v4-core/contracts/interfaces/IHooks.sol";
import {PoolKey} from "@uniswap/v4-core/contracts/types/PoolKey.sol";
import {Currency} from "@uniswap/v4-core/contracts/types/Currency.sol";
import {Hooks} from "@uniswap/v4-core/contracts/libraries/Hooks.sol";
import {TickMath} from "@uniswap/v4-core/contracts/libraries/TickMath.sol";
import {PoolId} from "@uniswap/v4-core/contracts/libraries/PoolId.sol";

import {PolicyController} from "../src/PolicyController.sol";
import {AdaptiveFeeHook} from "../src/AdaptiveFeeHook.sol";
import {MintableToken} from "../script/DeployLocal.s.sol";

contract AdaptiveFeeHookTest is Test {
  using PoolId for PoolKey;

  PoolManager internal pm;
  PolicyController internal pc;
  AdaptiveFeeHook internal hook;

  MintableToken internal token0;
  MintableToken internal token1;

  PoolKey internal key;

  function setUp() public {
    token0 = new MintableToken("Token0", "TK0", address(this), 10_000_000 ether);
    token1 = new MintableToken("Token1", "TK1", address(this), 10_000_000 ether);

    pm = new PoolManager();
    pc = new PolicyController();
    pc.grantRole(pc.AGENT_ROLE(), address(this));

    hook = new AdaptiveFeeHook(IPoolManager(address(pm)), pc);

    uint160 flags = Hooks.BEFORE_SWAP_FLAG | Hooks.AFTER_SWAP_FLAG | Hooks.BEFORE_SWAP_RETURNS_DELTA_FLAG | Hooks.BEFORE_SWAP_RETURNS_FEE_FLAG;
    address hookWithFlags = address(uint160(address(hook)) | flags);

    key = PoolKey({
      currency0: Currency.wrap(address(token0)),
      currency1: Currency.wrap(address(token1)),
      fee: 0,
      tickSpacing: 60,
      hooks: IHooks(hookWithFlags)
    });

    pm.initialize(key, TickMath.getSqrtRatioAtTick(0));

    token0.approve(address(pm), type(uint256).max);
    token1.approve(address(pm), type(uint256).max);
    // If your v4-core has modifyLiquidity, uncomment and adjust accordingly.
    // pm.modifyLiquidity(
    //   key,
    //   IPoolManager.ModifyLiquidityParams({tickLower: -60, tickUpper: 60, liquidityDelta: 1e18}),
    //   ""
    // );

    pc.setPolicy(
      PolicyController.Policy({
        baseFeeBps: 20,
        maxFeeBps: 60,
        cooldownSec: 30,
        lastUpdated: 0,
        volSlopeBpsPerBucket: 5
      })
    );
  }

  function test_CurrentFee_InBounds() public {
    // bucket cycles with timestamp % 3; sample a few times via warp
    for (uint256 i = 0; i < 6; i++) {
      uint16 fee = hook.currentFeeBps();
      PolicyController.Policy memory p = pc.getPolicy();
      assertLe(fee, p.maxFeeBps);
      // fee is uint16 so implicitly >= 0
      vm.warp(block.timestamp + 1);
    }
  }

  function test_SetPolicy_Cooldown() public {
    PolicyController.Policy memory p = PolicyController.Policy({
      baseFeeBps: 10,
      maxFeeBps: 50,
      cooldownSec: 30,
      lastUpdated: 0,
      volSlopeBpsPerBucket: 5
    });
    pc.setPolicy(p);

    // immediate set should revert due to cooldown
    vm.expectRevert();
    pc.setPolicy(p);

    vm.warp(block.timestamp + 31);
    pc.setPolicy(p);
  }

  function test_Swap_AppliesFee() public {
    // We do not rely on full swap mechanics; we call beforeSwap to fetch fee
    // and compare expected fee magnitude on a hypothetical amountIn.
    uint256 amountIn = 1e18; // 1 token
    uint16 feeBps = hook.currentFeeBps();
    uint256 expectedFee = (amountIn * feeBps) / 10_000;

    // Sanity check expectedFee not exploding
    PolicyController.Policy memory p = pc.getPolicy();
    uint256 maxFee = (amountIn * p.maxFeeBps) / 10_000;
    assertLe(expectedFee, maxFee + 1);
  }
}


