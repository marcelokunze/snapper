import express from 'express'
import cors from 'cors'

import { getPoolState, simulateSwap, buildTx, updatePolicy } from './tools.js'

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

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`MCP server up on port ${PORT}`)
})


