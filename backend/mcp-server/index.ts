import express from 'express'
import cors from 'cors'

import { getPoolState, simulateSwap, buildTx, updatePolicy, buildApproveTx, faucet, getAddresses, getDiagnostics } from './tools.ts'

const app = express()
const PORT = parseInt(process.env.PORT || '4000', 10)

app.use(
  cors({
    origin: 'http://localhost:3000',
  })
)
app.use(express.json())

// GET /mcp/getPoolState?pair=TOKEN0-TOKEN1
app.get('/mcp/getPoolState', async (req, res) => {
  try {
    const pair = (req.query.pair as string) || ''
    if (!pair) return res.status(400).json({ error: 'pair is required' })

    const state = await getPoolState(pair)
    return res.json(state)
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || 'getPoolState failed' })
  }
})

// POST /mcp/simulateSwap
// { amountIn, tokenIn, tokenOut, slippageBps }
app.post('/mcp/simulateSwap', async (req, res) => {
  try {
    const { amountIn, tokenIn, tokenOut, slippageBps } = req.body || {}
    if (!amountIn || !tokenIn || !tokenOut)
      return res.status(400).json({ error: 'amountIn, tokenIn, tokenOut are required' })

    const result = await simulateSwap({ amountIn, tokenIn, tokenOut, slippageBps })
    return res.json(result)
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || 'simulateSwap failed' })
  }
})

// POST /mcp/buildTx
// { amountIn, tokenIn, tokenOut, minOut, deadline, recipient }
app.post('/mcp/buildTx', async (req, res) => {
  try {
    const { amountIn, tokenIn, tokenOut, minOut, deadline, recipient } = req.body || {}
    if (!amountIn || !tokenIn || !tokenOut || !recipient)
      return res.status(400).json({ error: 'amountIn, tokenIn, tokenOut, recipient are required' })

    const tx = await buildTx({ amountIn, tokenIn, tokenOut, minOut, deadline, recipient })
    return res.json(tx)
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || 'buildTx failed' })
  }
})

// POST /mcp/updatePolicy
// Optional admin-only demo: bump base fee by +5 bps
// { bumpBaseBps?: number }
app.post('/mcp/updatePolicy', async (req, res) => {
  try {
    const bumpBaseBps = typeof req.body?.bumpBaseBps === 'number' ? req.body.bumpBaseBps : 5
    const result = await updatePolicy({ bumpBaseBps })
    return res.json({ ok: true, result })
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || 'updatePolicy failed' })
  }
})

// POST /mcp/buildApproveTx
// { token: 'TOKEN0'|'TOKEN1', owner }
app.post('/mcp/buildApproveTx', async (req, res) => {
  try {
    const { token, owner, amount } = req.body || {}
    if (!token || !owner) return res.status(400).json({ error: 'token, owner are required' })
    const tx = await buildApproveTx({ token, owner, amount: amount ?? '0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff' })
    return res.json(tx)
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || 'buildApproveTx failed' })
  }
})

// POST /mcp/faucet
// { token: 'TOKEN0'|'TOKEN1', to, amount? }
app.post('/mcp/faucet', async (req, res) => {
  try {
    const { token, to, amount } = req.body || {}
    if (!token || !to) return res.status(400).json({ error: 'token, to are required' })
    const result = await faucet({ token, to, amount })
    return res.json(result)
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || 'faucet failed' })
  }
})

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`MCP server up on port ${PORT}`)
})

// GET /mcp/addresses
app.get('/mcp/addresses', (_req, res) => {
  try { res.json(getAddresses()) } catch (err: any) { res.status(500).json({ error: err?.message || 'addresses failed' }) }
})

// GET /mcp/diagnostics
app.get('/mcp/diagnostics', async (_req, res) => {
  try { res.json(await getDiagnostics()) } catch (err: any) { res.status(500).json({ error: err?.message || 'diagnostics failed' }) }
})


