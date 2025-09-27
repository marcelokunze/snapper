## Snapper — AI‑native Uniswap v4 Hook playground

Snapper is a local Uniswap v4 playground showing programmable, policy‑driven swap fees via a custom v4 Hook, a minimal unlock‑callback router, a small HTTP API, an event indexer (SSE), and a Next.js UI.

### What it does
- Deploys a Uniswap v4 `PoolManager`, two ERC‑20 tokens, a `PolicyController`, and an `AdaptiveFeeHook` that computes a dynamic per‑swap fee.
- Uses a minimal `Swapper` (unlock‑callback router) to execute exact‑input swaps through `PoolManager.unlock → swap`.
- Emits `PolicyUsed(feeBps, bucket)` on every swap; an indexer streams these events to the UI terminal in real time.

### How Uniswap v4 is used
- The Hook extends `BaseHook` and enables `beforeSwap`/`afterSwap` permissions.
- `_beforeSwap` sets the fee in v4 fee units (hundredths of a bip, 1e‑6) derived from policy bps; `_afterSwap` emits `PolicyUsed`.
- The router follows the v4 unlock pattern and settles input/output via the `CurrencySettler` helpers.

### Repository layout
- `contracts/` (Foundry)
  - `src/AdaptiveFeeHook.sol` — dynamic‑fee Hook emitting `PolicyUsed`.
  - `src/PolicyController.sol` — stores base/max/slope policy (admin‑updatable).
  - `src/Swapper.sol` — minimal unlock‑callback router for exact‑in swaps.
  - `script/DeployLocal.s.sol` — deploys the stack and writes `out/addresses.local.json`.
- `backend/`
  - `api-server/` — HTTP API (Express + viem) on port 4000.
  - `indexer/` — simple event streamer (SSE) on port 4002.
- `src/` (Next.js UI)
  - `app/` — pages and layout.
  - `components/Terminal.tsx` — bottom console that shows live events and results.

### Prerequisites
- Node.js (tested with modern Node 20+)
- NPM (comes with Node)
- Foundry (for anvil/forge): https://book.getfoundry.sh/

### Quickstart (local demo)
1) Start a local chain
```bash
cd contracts
anvil -p 8545
```

2) Deploy contracts
```bash
cd contracts
forge script script/DeployLocal.s.sol \
  --rpc-url http://127.0.0.1:8545 \
  --private-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 \
  --broadcast
```
This writes `contracts/out/addresses.local.json`.

3) Start the API and indexer
```bash
cd backend
export RPC_URL=http://127.0.0.1:8545
export DEMO_PRIVKEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
# optional, defaults to ../contracts/out/addresses.local.json relative to backend/
# export ADDRESSES_JSON=/Users/<you>/path/to/contracts/out/addresses.local.json
npm run dev
```
You should see: `API server up on port 4000` and `Indexer listening on 4002`.

4) Start the frontend
```bash
cd ..   # repo root
npm run dev
```
Open http://localhost:3000 and connect a wallet on Localhost (31337).

### Using the app
- Approve TOKEN0: the UI provides a button that sends ERC‑20 `approve` to authorize the router.
- Simulate swap: prints baseline vs dynamic fee and estimated outputs in the terminal.
- Build Tx → Send: the API returns real calldata for `Swapper.swapExactIn`; your wallet submits the tx.
- Update Policy: adjust fee policy (base/slope/max) and observe a different `PolicyUsed` on the next swap.

Faucet (optional): fund ERC‑20 balances to your wallet via the API
```bash
curl -X POST http://localhost:4000/api/faucet \
  -H 'Content-Type: application/json' \
  -d '{"token":"TOKEN0","to":"<YOUR_WALLET>","amount":"1000000000000000000"}'
```

### API (selected endpoints)
- `GET /api/addresses` — returns deployed addresses.
- `GET /api/diagnostics` — chainId and presence of code for the hook/swapper.
- `GET /api/getPoolState?pair=TOKEN0-TOKEN1` — reads current fee from the hook.
- `POST /api/simulateSwap` — `{ amountIn, tokenIn, tokenOut, slippageBps? }` → baseline vs dynamic.
- `POST /api/buildApproveTx` — `{ token, owner, amount }` → ERC‑20 approve calldata.
- `POST /api/buildTx` — `{ amountIn, tokenIn, tokenOut, recipient }` → `to/data` for `swapExactIn`.
- `POST /api/updatePolicy` — demo policy bump (requires `DEMO_PRIVKEY`).

### Troubleshooting
- If Anvil restarts, you must redeploy and restart the backend so addresses match the live chain.
- Verify the API sees contracts: `curl http://localhost:4000/api/diagnostics` (look for `hasHookCode: true`).
- If swaps revert, ensure you approved TOKEN0 to the router and your wallet has local ETH for gas.

### Notes
- This repository is intended for local demonstration and development only.
- The Hook, router, and policy contracts are minimal and not audited.

This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
