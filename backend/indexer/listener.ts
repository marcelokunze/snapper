import 'dotenv/config'
import fs from 'fs'
import path from 'path'
import express from 'express'
import cors from 'cors'
import { createPublicClient, http } from 'viem'

// Env
const RPC_URL = process.env.RPC_URL || 'http://127.0.0.1:8545'
const ADDRESSES_JSON = process.env.ADDRESSES_JSON || '../contracts/out/addresses.local.json'
const PORT = parseInt(process.env.INDEXER_PORT || '4002', 10)

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

const addresses: Addresses = (() => {
  try {
    return loadAddresses()
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('addresses JSON not found, using zeros; SSE will still run')
    return {
      token0: '0x0000000000000000000000000000000000000000',
      token1: '0x0000000000000000000000000000000000000000',
      poolManager: '0x0000000000000000000000000000000000000000',
      policyController: '0x0000000000000000000000000000000000000000',
      adaptiveFeeHook: '0x0000000000000000000000000000000000000000',
      chainId: 31337,
    }
  }
})()

// viem public client (HTTP polling)
const client = createPublicClient({ transport: http(RPC_URL) })

// Minimal ABIs for events we care about
const PolicyControllerEvents = [
  {
    type: 'event',
    name: 'PolicyUpdated',
    inputs: [
      {
        indexed: false,
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
      { indexed: true, name: 'updater', type: 'address' },
    ],
  },
] as const

const HookEvents = [
  {
    type: 'event',
    name: 'PolicyUsed',
    inputs: [
      { indexed: false, name: 'feeBps', type: 'uint16' },
      { indexed: false, name: 'volBucket', type: 'int8' },
    ],
  },
] as const

// SSE setup
const app = express()
app.use(
  cors({
    origin: 'http://localhost:3000',
  })
)

type SseClient = {
  write: (chunk: any) => void
  end: () => void
  on: (event: string, cb: () => void) => void
}

const subscribers = new Set<SseClient>()

function broadcast(payload: any) {
  const str = `data: ${JSON.stringify(payload)}\n\n`
  for (const res of subscribers) {
    try {
      res.write(str)
    } catch {
      // ignore
    }
  }
}

app.get('/events', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  })
  // initial comment to open the stream
  res.write(': connected\n\n')

  const client = res as unknown as SseClient
  subscribers.add(client)

  // heartbeat
  const iv = setInterval(() => {
    try {
      client.write(`: ping ${Date.now()}\n\n`)
    } catch {
      // ignore
    }
  }, 15000)

  req.on('close', () => {
    clearInterval(iv)
    subscribers.delete(client)
  })
})

// Start watchers (polling)
const unsubs: Array<() => void> = []

if (addresses.policyController !== '0x0000000000000000000000000000000000000000') {
  const un = client.watchContractEvent({
    address: addresses.policyController,
    abi: PolicyControllerEvents,
    eventName: 'PolicyUpdated',
    onLogs: (logs) => {
      for (const log of logs as any[]) {
        const block = Number(log.blockNumber || 0)
        const tx = String(log.transactionHash || '')
        const args = log.args || {}
        const msg = {
          baseFeeBps: args.p?.baseFeeBps,
          maxFeeBps: args.p?.maxFeeBps,
          cooldownSec: args.p?.cooldownSec,
          lastUpdated: args.p?.lastUpdated,
          volSlopeBpsPerBucket: args.p?.volSlopeBpsPerBucket,
          updater: args.updater,
        }
        broadcast({ type: 'PolicyUpdated', block, tx, msg, timestamp: Date.now() })
      }
    },
    poll: true,
    pollingInterval: 2000,
  })
  unsubs.push(un)
}

if (addresses.adaptiveFeeHook !== '0x0000000000000000000000000000000000000000') {
  const un = client.watchContractEvent({
    address: addresses.adaptiveFeeHook,
    abi: HookEvents,
    eventName: 'PolicyUsed',
    onLogs: (logs) => {
      for (const log of logs as any[]) {
        const block = Number(log.blockNumber || 0)
        const tx = String(log.transactionHash || '')
        const args = log.args || {}
        const msg = { feeBps: args.feeBps, volBucket: args.volBucket }
        broadcast({ type: 'PolicyUsed', block, tx, msg, timestamp: Date.now() })
      }
    },
    poll: true,
    pollingInterval: 2000,
  })
  unsubs.push(un)
}

// Optional: you could add a generic tx receipt poller here for swaps if desired

process.on('SIGINT', () => {
  for (const un of unsubs) {
    try {
      un()
    } catch {
      // ignore
    }
  }
  process.exit(0)
})

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Indexer listening on ${PORT}`)
})


