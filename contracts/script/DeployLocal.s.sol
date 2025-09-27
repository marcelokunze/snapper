// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script} from "forge-std/Script.sol";
import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {PoolManager} from "@uniswap/v4-core/src/PoolManager.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {Currency, CurrencyLibrary} from "@uniswap/v4-core/src/types/Currency.sol";
import {ModifyLiquidityParams} from "@uniswap/v4-core/src/types/PoolOperation.sol";
import {LPFeeLibrary} from "@uniswap/v4-core/src/libraries/LPFeeLibrary.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {PoolModifyLiquidityTest} from "@uniswap/v4-core/src/test/PoolModifyLiquidityTest.sol";
import {HookMiner} from "@uniswap/v4-periphery/src/utils/HookMiner.sol";

import {PolicyController} from "../src/PolicyController.sol";
import {AdaptiveFeeHook} from "../src/AdaptiveFeeHook.sol";
import {HookDeployer} from "../src/HookDeployer.sol";
import {MockToken} from "../src/MockToken.sol";
import {Swapper} from "../src/Swapper.sol";

contract DeployLocal is Script {
    using CurrencyLibrary for Currency;

    // sqrtPriceX96 for 1:1 price
    uint160 constant SQRT_PRICE_1_1 = 79228162514264337593543950336;

    function run() external {
        vm.startBroadcast();

        address admin = msg.sender;

        // 1) Deploy PoolManager
        IPoolManager manager = IPoolManager(address(new PoolManager(admin)));

        // 2) Deploy simple ERC20 tokens and mint to admin
        MockToken tokenA = new MockToken("Token A", "TKNA", 18, 1_000_000e18, admin);
        MockToken tokenB = new MockToken("Token B", "TKNB", 18, 1_000_000e18, admin);

        // order currencies for pool key (currency0 < currency1)
        Currency cA = Currency.wrap(address(tokenA));
        Currency cB = Currency.wrap(address(tokenB));
        Currency currency0 = cA < cB ? cA : cB;
        Currency currency1 = cA < cB ? cB : cA;

        // 3) Deploy PolicyController with defaults
        PolicyController pc = new PolicyController({
            admin: admin,
            base: 20,   // 0.20%
            slope: 5,   // +/-0.05% per bucket
            maxFee: 60, // 0.60% cap
            cooldown: 30
        });

        // 4) Mine a CREATE2 salt for AdaptiveFeeHook to embed flags
        // Match AdaptiveFeeHook.getHookPermissions(): beforeSwap=true, afterSwap=true
        uint160 flags = uint160(
            Hooks.BEFORE_SWAP_FLAG | Hooks.AFTER_SWAP_FLAG
        );

        bytes memory ctorArgs = abi.encode(IPoolManager(manager), pc);
        // Deploy a stable on-chain deployer and mine a salt against its address
        HookDeployer hd = new HookDeployer();
        (address mined, bytes32 salt) =
            HookMiner.find(address(hd), flags, type(AdaptiveFeeHook).creationCode, ctorArgs);

        // 5) Deploy the hook at the mined address via the deployer
        address hookAddr = hd.deployAdaptiveFeeHook(salt, IPoolManager(manager), pc);
        require(hookAddr == mined, "hook address mismatch");
        AdaptiveFeeHook hook = AdaptiveFeeHook(payable(hookAddr));

        // 6) Initialize a dynamic-fee pool at 1:1 price with tickSpacing 60
        PoolKey memory key = PoolKey({
            currency0: currency0,
            currency1: currency1,
            fee: LPFeeLibrary.DYNAMIC_FEE_FLAG,
            tickSpacing: 60,
            hooks: IHooks(address(hook))
        });

        manager.initialize(key, SQRT_PRICE_1_1);

        // 7) Deploy test modify-liquidity router and approve tokens to it
        PoolModifyLiquidityTest router = new PoolModifyLiquidityTest(manager);

        // Approve max for both tokens from admin to router
        tokenA.approve(address(router), type(uint256).max);
        tokenB.approve(address(router), type(uint256).max);

        // 8) Add some initial liquidity around the current price
        ModifyLiquidityParams memory liq = ModifyLiquidityParams({
            tickLower: -600,
            tickUpper: 600,
            liquidityDelta: int256(1000e18),
            salt: bytes32(0)
        });

        router.modifyLiquidity(key, liq, new bytes(0));

        // 9) Deploy minimal Swapper
        Swapper swapper = new Swapper(manager);

        // 10) Persist deployed addresses for the backend/indexer
        string memory root = "addresses";
        vm.serializeAddress(root, "token0", Currency.unwrap(currency0));
        vm.serializeAddress(root, "token1", Currency.unwrap(currency1));
        vm.serializeAddress(root, "poolManager", address(manager));
        vm.serializeAddress(root, "policyController", address(pc));
        vm.serializeAddress(root, "adaptiveFeeHook", address(hook));
        vm.serializeAddress(root, "swapper", address(swapper));
        vm.serializeUint(root, "chainId", block.chainid);
        string memory out = vm.serializeString(root, "note", string(abi.encodePacked("tickSpacing=60, dynamic-fee")));
        vm.writeJson(out, "out/addresses.local.json");

        vm.stopBroadcast();
    }
}
