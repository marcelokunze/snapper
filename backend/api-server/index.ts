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

// GET /api/getPoolState?pair=TOKEN0-TOKEN1
app.get('/api/getPoolState', async (req, res) => {
  try {
    const pair = (req.query.pair as string) || ''
    if (!pair) return res.status(400).json({ error: 'pair is required' })

    const state = await getPoolState(pair)
    return res.json(state)
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || 'getPoolState failed' })
  }
})

// POST /api/simulateSwap
app.post('/api/simulateSwap', async (req, res) => {
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

// POST /api/buildTx
app.post('/api/buildTx', async (req, res) => {
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

// POST /api/updatePolicy
app.post('/api/updatePolicy', async (req, res) => {
  try {
    const bumpBaseBps = typeof req.body?.bumpBaseBps === 'number' ? req.body.bumpBaseBps : 5
    const result = await updatePolicy({ bumpBaseBps })
    return res.json({ ok: true, result })
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || 'updatePolicy failed' })
  }
})

// POST /api/buildApproveTx
app.post('/api/buildApproveTx', async (req, res) => {
  try {
    const { token, owner, amount } = req.body || {}
    if (!token || !owner) return res.status(400).json({ error: 'token, owner are required' })
    const tx = await buildApproveTx({ token, owner, amount: amount ?? '0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff' })
    return res.json(tx)
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || 'buildApproveTx failed' })
  }
})

// POST /api/faucet
app.post('/api/faucet', async (req, res) => {
  try {
    const { token, to, amount } = req.body || {}
    if (!token || !to) return res.status(400).json({ error: 'token, to are required' })
    const result = await faucet({ token, to, amount })
    return res.json(result)
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || 'faucet failed' })
  }
})

// GET /api/addresses
app.get('/api/addresses', (_req, res) => {
  try { res.json(getAddresses()) } catch (err: any) { res.status(500).json({ error: err?.message || 'addresses failed' }) }
})

// GET /api/diagnostics
app.get('/api/diagnostics', async (_req, res) => {
  try { res.json(await getDiagnostics()) } catch (err: any) { res.status(500).json({ error: err?.message || 'diagnostics failed' }) }
})

app.listen(PORT, () => {
  console.log(`API server up on port ${PORT}`)
})


