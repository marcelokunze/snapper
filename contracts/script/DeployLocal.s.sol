// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";

// Minimal mintable token for local testing
import {ERC20} from "openzeppelin-contracts/token/ERC20/ERC20.sol";

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

contract MintableToken is ERC20 {
  constructor(string memory name_, string memory symbol_, address initialHolder, uint256 initialSupply)
    ERC20(name_, symbol_)
  {
    _mint(initialHolder, initialSupply);
  }

  function mint(address to, uint256 amount) external {
    _mint(to, amount);
  }
}

contract DeployLocal is Script {
  using PoolId for PoolKey;

  function run() external {
    vm.startBroadcast();

    // Deploy tokens and mint to the broadcaster
    address deployer = msg.sender;
    MintableToken token0 = new MintableToken("Token0", "TK0", deployer, 10_000_000 ether);
    MintableToken token1 = new MintableToken("Token1", "TK1", deployer, 10_000_000 ether);

    // Deploy core contracts
    PoolManager pm = new PoolManager();
    PolicyController pc = new PolicyController();

    // Grant agent to deployer so they can update policy
    pc.grantRole(pc.AGENT_ROLE(), deployer);

    // Deploy hook and set controller
    AdaptiveFeeHook hook = new AdaptiveFeeHook(IPoolManager(address(pm)), pc);

    // Compose hook flags: before/after swap + returns fee and delta from beforeSwap
    uint160 flags = Hooks.BEFORE_SWAP_FLAG | Hooks.AFTER_SWAP_FLAG | Hooks.BEFORE_SWAP_RETURNS_DELTA_FLAG | Hooks.BEFORE_SWAP_RETURNS_FEE_FLAG;
    address hookWithFlags = address(uint160(address(hook)) | flags);

    // Build PoolKey for token0/token1 1:1 price (tick 0)
    PoolKey memory key = PoolKey({
      currency0: Currency.wrap(address(token0)),
      currency1: Currency.wrap(address(token1)),
      fee: 0, // base fee, dynamic fee provided by hook
      tickSpacing: 60,
      hooks: IHooks(hookWithFlags)
    });

    // Initialize pool at sqrtPrice for tick 0 (1:1)
    pm.initialize(key, TickMath.getSqrtRatioAtTick(0));

    // Approve and (attempt to) seed some liquidity around tick 0
    token0.approve(address(pm), 100_000 ether);
    token1.approve(address(pm), 100_000 ether);

    // Many examples use modifyLiquidity/modifyPosition. Exact API may vary by v4 commit.
    // This call is illustrative for local scaffolding; adjust to your v4-core version if needed.
    // pm.modifyLiquidity(
    //   key,
    //   IPoolManager.ModifyLiquidityParams({tickLower: -60, tickUpper: 60, liquidityDelta: 10_000})
    // , ""
    // );

    // Set initial policy
    pc.setPolicy(
      PolicyController.Policy({
        baseFeeBps: 20,
        maxFeeBps: 60,
        cooldownSec: 30,
        lastUpdated: 0,
        volSlopeBpsPerBucket: 5
      })
    );

    // Ensure output dir exists and write addresses JSON
    vm.createDir("contracts/out", true);

    bytes32 poolId = key.toId();
    string memory json = string(
      abi.encodePacked(
        "{\n  \"token0\": \"", _toHex(address(token0)),
        "\",\n  \"token1\": \"", _toHex(address(token1)),
        "\",\n  \"poolManager\": \"", _toHex(address(pm)),
        "\",\n  \"policyController\": \"", _toHex(address(pc)),
        "\",\n  \"adaptiveFeeHook\": \"", _toHex(address(hook)),
        "\",\n  \"poolKey\": \"", _toHex(poolId),
        "\",\n  \"chainId\": 31337\n}"
      )
    );
    vm.writeFile("contracts/out/addresses.local.json", json);

    vm.stopBroadcast();
  }

  function _toHex(address a) internal pure returns (string memory) {
    return _toHex(abi.encodePacked(a));
  }

  function _toHex(bytes32 b) internal pure returns (string memory) {
    return _toHex(abi.encodePacked(b));
  }

  function _toHex(bytes memory data) internal pure returns (string memory) {
    bytes16 alphabet = 0x30313233343536373839616263646566; // 0-9a-f
    bytes memory str = new bytes(2 + data.length * 2);
    str[0] = "0";
    str[1] = "x";
    for (uint256 i = 0; i < data.length; i++) {
      str[2 + i * 2] = bytes1(alphabet[uint8(data[i] >> 4)]);
      str[3 + i * 2] = bytes1(alphabet[uint8(data[i] & 0x0f)]);
    }
    return string(str);
  }
}


