# Contracts
- PolicyController: stores dynamic fee policy (base, max, cooldown, slope).
- AdaptiveFeeHook: Uniswap v4 Hook that returns a dynamic fee in beforeSwap and emits PolicyUsed in afterSwap.
- DeployLocal.s.sol: deploys tokens, PoolManager, controller + hook, initializes pool, mints liquidity, sets policy, writes addresses.local.json.


