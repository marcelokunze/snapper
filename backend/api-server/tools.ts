import 'dotenv/config'
import fs from 'fs'
import path from 'path'

import { createPublicClient, createWalletClient, encodeFunctionData, http } from 'viem'
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
  swapper?: `0x${string}`
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
      swapper: '0x0000000000000000000000000000000000000000',
      chainId: 31337,
    } as Addresses
  }
})()

// --- Clients ----------------------------------------------------------------

const publicClient = createPublicClient({ transport: http(RPC_URL) })
function getWalletFromEnv() {
  const pk = process.env.DEMO_PRIVKEY
  if (!pk) throw new Error('DEMO_PRIVKEY not set')
  const account = privateKeyToAccount(pk as `0x${string}`)
  const wallet = createWalletClient({ account, transport: http(RPC_URL) })
  return { wallet, account }
}
// We don't need wallet client for buildTx; the frontend wallet will sign and send

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
  // view getters available on our PolicyController
  { type: 'function', name: 'baseFeeBps', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'uint16' }] },
  { type: 'function', name: 'maxFeeBps', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'uint16' }] },
  { type: 'function', name: 'volSlopeBpsPerBucket', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'int16' }] },
  {
    type: 'function',
    name: 'setPolicy',
    stateMutability: 'nonpayable',
    inputs: [
      {
        name: 'p',
        type: 'tuple',
        components: [
          // Order must match Policy struct in contract: base, max, volSlope, cooldown, lastUpdated
          { name: 'baseFeeBps', type: 'uint16' },
          { name: 'maxFeeBps', type: 'uint16' },
          { name: 'volSlopeBpsPerBucket', type: 'int16' },
          { name: 'cooldownSec', type: 'uint32' },
          { name: 'lastUpdated', type: 'uint40' },
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
  const feeBps = Number(await publicClient.readContract({
    address: addresses.adaptiveFeeHook,
    abi: AdaptiveFeeHookAbi,
    functionName: 'currentFeeBps',
    args: [],
  }))

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
  const hookBps = Number(await publicClient.readContract({
    address: addresses.adaptiveFeeHook,
    abi: AdaptiveFeeHookAbi,
    functionName: 'currentFeeBps',
    args: [],
  }))

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
  // Build calldata to call Swapper.swapExactIn with proper PoolKey and direction
  if (!addresses.swapper) throw new Error('Swapper address missing in addresses JSON')

  // Minimal ABI for our Swapper contract
  const SwapperAbi = [
    {
      type: 'function',
      name: 'swapExactIn',
      stateMutability: 'nonpayable',
      inputs: [
        {
          name: 'key',
          type: 'tuple',
          components: [
            { name: 'currency0', type: 'address' },
            { name: 'currency1', type: 'address' },
            { name: 'fee', type: 'uint24' },
            { name: 'tickSpacing', type: 'int24' },
            { name: 'hooks', type: 'address' },
          ],
        },
        { name: 'zeroForOne', type: 'bool' },
        { name: 'amountIn', type: 'uint256' },
        { name: 'recipient', type: 'address' },
      ],
      outputs: [],
    },
  ] as const

  // Our demo pool uses dynamic fee flag and tickSpacing 60 with the mined hook
  const key = {
    currency0: addresses.token0,
    currency1: addresses.token1,
    fee: 0x800000, // LPFeeLibrary.DYNAMIC_FEE_FLAG
    tickSpacing: 60,
    hooks: addresses.adaptiveFeeHook,
  }

  const tokenInIs0 = params.tokenIn === 'TOKEN0'
  const tokenOutIs1 = params.tokenOut === 'TOKEN1'
  const zeroForOne = tokenInIs0 && tokenOutIs1 ? true : false

  const amountIn = toBigInt(params.amountIn)

  const to = addresses.swapper as `0x${string}`
  const data = encodeFunctionData({
    abi: SwapperAbi,
    functionName: 'swapExactIn',
    args: [key, zeroForOne, amountIn, params.recipient as `0x${string}`],
  }) as `0x${string}`
  let gas: string = '0x0'
  try {
    await publicClient.simulateContract({
      address: to,
      abi: SwapperAbi,
      functionName: 'swapExactIn',
      args: [key, zeroForOne, amountIn, params.recipient as `0x${string}`],
      account: params.recipient as `0x${string}`,
    })
  } catch {}

  const hookBps = Number(await publicClient.readContract({
    address: addresses.adaptiveFeeHook,
    abi: AdaptiveFeeHookAbi,
    functionName: 'currentFeeBps',
    args: [],
  }))

  const amountInBIForSummary = toBigInt(params.amountIn)
  const fee = bpsOf(amountInBIForSummary, hookBps)
  const estOut = (amountInBIForSummary - fee).toString()

  const summary = {
    route: `${params.tokenIn} -> ${params.tokenOut}`,
    amountIn: amountInBIForSummary.toString(),
    estOut,
    feeBps: hookBps,
  }

  return { to, data, value: '0x0', gas, summary }
}

// --- Approvals & Faucet ------------------------------------------------------

const ERC20Abi = [
  { type: 'function', name: 'approve', stateMutability: 'nonpayable', inputs: [ { name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' } ], outputs: [ { name: '', type: 'bool' } ] },
  { type: 'function', name: 'transfer', stateMutability: 'nonpayable', inputs: [ { name: 'to', type: 'address' }, { name: 'amount', type: 'uint256' } ], outputs: [ { name: '', type: 'bool' } ] },
] as const

export async function buildApproveTx(params: { token: 'TOKEN0' | 'TOKEN1'; owner: `0x${string}`; amount: string | number | bigint }) {
  const tokenAddress = params.token === 'TOKEN0' ? addresses.token0 : addresses.token1
  const amount = toBigInt(params.amount)
  // Approval needs to be for Swapper, which calls transferFrom(payer, manager, amount) inside unlockCallback
  const spender = addresses.swapper!
  const data = encodeFunctionData({
    abi: ERC20Abi,
    functionName: 'approve',
    args: [spender, amount],
  }) as `0x${string}`
  return { to: tokenAddress, data, value: '0x0', gas: '0x0' }
}

export async function faucet(params: { token: 'TOKEN0' | 'TOKEN1'; to: `0x${string}`; amount?: string | number | bigint }) {
  const tokenAddress = params.token === 'TOKEN0' ? addresses.token0 : addresses.token1
  const amount = toBigInt(params.amount ?? '1000000000000000000') // 1 token default
  const { wallet, account } = getWalletFromEnv()
  const hash = await wallet.writeContract({
    address: tokenAddress,
    abi: ERC20Abi,
    functionName: 'transfer',
    args: [params.to, amount],
    account,
    chain: undefined,
  })
  return { txHash: hash }
}

type UpdatePolicyParams = { bumpBaseBps?: number }

export async function updatePolicy(params: UpdatePolicyParams = {}) {
  const bump = params.bumpBaseBps ?? 5
  const pk = process.env.DEMO_PRIVKEY
  if (!pk) throw new Error('DEMO_PRIVKEY not set; needed for demo policy update')

  const account = privateKeyToAccount(pk as `0x${string}`)
  const wallet = createWalletClient({ account, transport: http(RPC_URL) })

  // Read current parts (contract does not expose getPolicy in this build)
  const [base, max, slope] = await Promise.all([
    publicClient.readContract({ address: addresses.policyController, abi: PolicyControllerAbi, functionName: 'baseFeeBps', args: [] }).then(Number),
    publicClient.readContract({ address: addresses.policyController, abi: PolicyControllerAbi, functionName: 'maxFeeBps', args: [] }).then(Number),
    publicClient.readContract({ address: addresses.policyController, abi: PolicyControllerAbi, functionName: 'volSlopeBpsPerBucket', args: [] }).then(Number),
  ])

  const nextBase = Math.min(base + bump, max)
  const cooldownSec = 30 // keep same as demo deploy

  const hash = await wallet.writeContract({
    address: addresses.policyController,
    abi: PolicyControllerAbi,
    functionName: 'setPolicy',
    args: [
      {
        // Order must be base, max, slope, cooldown, lastUpdated
        baseFeeBps: Number(nextBase),
        maxFeeBps: Number(max),
        volSlopeBpsPerBucket: Number(slope),
        cooldownSec: Number(cooldownSec),
        lastUpdated: 0,
      },
    ],
    account,
    chain: undefined,
  })

  return { txHash: hash, newBaseFeeBps: nextBase }
}

// --- Diagnostics -------------------------------------------------------------

export function getAddresses() {
  return addresses
}

export async function getDiagnostics() {
  const chainId = await publicClient.getChainId()
  const hookCode = await publicClient.getBytecode({ address: addresses.adaptiveFeeHook })
  const swapperCode = addresses.swapper ? await publicClient.getBytecode({ address: addresses.swapper }) : null
  return { chainId, addresses, hasHookCode: !!hookCode, hasSwapperCode: !!swapperCode }
}


