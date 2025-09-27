import 'dotenv/config'
import fs from 'fs'
import path from 'path'

import { createPublicClient, createWalletClient, http } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'

// --- Env & addresses -------------------------------------------------------

const RPC_URL = process.env.RPC_URL || 'http://127.0.0.1:8545'
const ADDRESSES_JSON = process.env.ADDRESSES_JSON || '../contracts/out/addresses.local.json'

type Addresses = {
  token0: `0x${string}`
  token1: `0x${string}`
  poolManager: `0x${string}`
  policyController: `0x${string}`
  adaptiveFeeHook: `0x${string}`
  poolKey?: string
  chainId?: number
}

function loadAddresses(): Addresses {
  const p = path.resolve(process.cwd(), ADDRESSES_JSON)
  const raw = fs.readFileSync(p, 'utf8')
  return JSON.parse(raw)
}

const addresses = (() => {
  try {
    return loadAddresses()
  } catch {
    return {
      token0: '0x0000000000000000000000000000000000000000',
      token1: '0x0000000000000000000000000000000000000000',
      poolManager: '0x0000000000000000000000000000000000000000',
      policyController: '0x0000000000000000000000000000000000000000',
      adaptiveFeeHook: '0x0000000000000000000000000000000000000000',
      chainId: 31337,
    } as Addresses
  }
})()

// --- Clients ----------------------------------------------------------------

const publicClient = createPublicClient({ transport: http(RPC_URL) })

// Minimal ABIs for calls we need
const AdaptiveFeeHookAbi = [
  {
    type: 'function',
    name: 'currentFeeBps',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint16' }],
  },
] as const

const PolicyControllerAbi = [
  {
    type: 'function',
    name: 'getPolicy',
    stateMutability: 'view',
    inputs: [],
    outputs: [
      {
        name: '',
        type: 'tuple',
        components: [
          { name: 'baseFeeBps', type: 'uint16' },
          { name: 'maxFeeBps', type: 'uint16' },
          { name: 'cooldownSec', type: 'uint32' },
          { name: 'lastUpdated', type: 'uint40' },
          { name: 'volSlopeBpsPerBucket', type: 'int16' },
        ],
      },
    ],
  },
  {
    type: 'function',
    name: 'setPolicy',
    stateMutability: 'nonpayable',
    inputs: [
      {
        name: 'p',
        type: 'tuple',
        components: [
          { name: 'baseFeeBps', type: 'uint16' },
          { name: 'maxFeeBps', type: 'uint16' },
          { name: 'cooldownSec', type: 'uint32' },
          { name: 'lastUpdated', type: 'uint40' },
          { name: 'volSlopeBpsPerBucket', type: 'int16' },
        ],
      },
    ],
    outputs: [],
  },
] as const

// --- Helpers ----------------------------------------------------------------

function toBigInt(value: string | number | bigint): bigint {
  if (typeof value === 'bigint') return value
  if (typeof value === 'number') return BigInt(Math.trunc(value))
  if (typeof value === 'string') {
    if (value.startsWith('0x')) return BigInt(value)
    return BigInt(value)
  }
  throw new Error('unsupported value')
}

function bpsOf(amount: bigint, bps: number | bigint): bigint {
  const b = typeof bps === 'bigint' ? bps : BigInt(bps)
  return (amount * b) / 10_000n
}

// --- Exports ----------------------------------------------------------------

export async function getPoolState(pair: string) {
  const feeBps = (await publicClient.readContract({
    address: addresses.adaptiveFeeHook,
    abi: AdaptiveFeeHookAbi,
    functionName: 'currentFeeBps',
    args: [],
  })) as number

  return {
    pair,
    price: '1.0000',
    reserves: {
      token0: addresses.token0,
      token1: addresses.token1,
    },
    feeBps,
  }
}

type SimulateSwapParams = {
  amountIn: string | number | bigint
  tokenIn: string
  tokenOut: string
  slippageBps?: number
}

export async function simulateSwap(params: SimulateSwapParams) {
  const amountIn = toBigInt(params.amountIn)
  const baselineBps = 30 // 0.30%
  const hookBps = (await publicClient.readContract({
    address: addresses.adaptiveFeeHook,
    abi: AdaptiveFeeHookAbi,
    functionName: 'currentFeeBps',
    args: [],
  })) as number

  const baselineFee = bpsOf(amountIn, baselineBps)
  const hookFee = bpsOf(amountIn, hookBps)

  return {
    baseline: {
      out: (amountIn - baselineFee).toString(),
      feeBps: baselineBps,
    },
    hook: {
      out: (amountIn - hookFee).toString(),
      feeBps: hookBps,
    },
    impactBps: hookBps - baselineBps,
  }
}

type BuildTxParams = {
  amountIn: string | number | bigint
  tokenIn: string
  tokenOut: string
  minOut?: string | number | bigint
  deadline?: number
  recipient: string
}

export async function buildTx(params: BuildTxParams) {
  // POC: return a placeholder calldata targeting PoolManager (or your router)
  // so the frontend can show a summary and prepare a wallet action.
  const to = addresses.poolManager
  const gas = '0x0'
  const data = '0x'

  const hookBps = (await publicClient.readContract({
    address: addresses.adaptiveFeeHook,
    abi: AdaptiveFeeHookAbi,
    functionName: 'currentFeeBps',
    args: [],
  })) as number

  const amountIn = toBigInt(params.amountIn)
  const fee = bpsOf(amountIn, hookBps)
  const estOut = (amountIn - fee).toString()

  const summary = {
    route: `${params.tokenIn} -> ${params.tokenOut}`,
    amountIn: amountIn.toString(),
    estOut,
    feeBps: hookBps,
  }

  return { to, data, value: '0x0', gas, summary }
}

type UpdatePolicyParams = { bumpBaseBps?: number }

export async function updatePolicy(params: UpdatePolicyParams = {}) {
  const bump = params.bumpBaseBps ?? 5
  const pk = process.env.DEMO_PRIVKEY
  if (!pk) throw new Error('DEMO_PRIVKEY not set; needed for demo policy update')

  const account = privateKeyToAccount(pk as `0x${string}`)
  const wallet = createWalletClient({ account, transport: http(RPC_URL) })

  // Read current policy
  const current = (await publicClient.readContract({
    address: addresses.policyController,
    abi: PolicyControllerAbi,
    functionName: 'getPolicy',
    args: [],
  })) as unknown as {
    baseFeeBps: number
    maxFeeBps: number
    cooldownSec: number
    lastUpdated: number
    volSlopeBpsPerBucket: number
  }

  const nextBase = Math.min(current.baseFeeBps + bump, current.maxFeeBps)

  const hash = await wallet.writeContract({
    address: addresses.policyController,
    abi: PolicyControllerAbi,
    functionName: 'setPolicy',
    args: [
      {
        baseFeeBps: BigInt(nextBase),
        maxFeeBps: BigInt(current.maxFeeBps),
        cooldownSec: BigInt(current.cooldownSec),
        lastUpdated: 0n, // contract overwrites with block.timestamp
        volSlopeBpsPerBucket: BigInt(current.volSlopeBpsPerBucket),
      },
    ],
    account,
  })

  return { txHash: hash, newBaseFeeBps: nextBase }
}


