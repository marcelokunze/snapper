import express from 'express'
import cors from 'cors'

type PaymentStatus = {
  paid: boolean
  expiresAt: number
}

const app = express()
const PORT = 4001

app.use(
  cors({
    origin: 'http://localhost:3000',
  })
)
app.use(express.json())

// In-memory store keyed by nonce
const payments = new Map<string, PaymentStatus>()

function getOrInit(nonce: string): PaymentStatus {
  let status = payments.get(nonce)
  const now = Math.floor(Date.now() / 1000)
  if (!status) {
    status = { paid: false, expiresAt: now + 300 }
    payments.set(nonce, status)
  }
  return status
}

// POST /premium/simulate
// Request body: { nonce: string, ...optional fields }
app.post('/premium/simulate', (req, res) => {
  const { nonce } = req.body || {}
  if (!nonce || typeof nonce !== 'string') {
    return res.status(400).json({ error: 'nonce is required' })
  }

  const status = getOrInit(nonce)
  const now = Math.floor(Date.now() / 1000)

  // Expired -> reset to unpaid and extend TTL
  if (status.expiresAt <= now) {
    status.paid = false
    status.expiresAt = now + 300
  }

  if (!status.paid) {
    return res.status(402).json({
      price: '0.5 USDC',
      payTo: '0x000000000000000000000000000000000000dEaD',
      memo: nonce,
      ttl: status.expiresAt - now,
    })
  }

  // Simulate some premium response when paid
  const buckets = ['low', 'med', 'high'] as const
  const pick = buckets[Number(BigInt('0x' + Buffer.from(nonce).toString('hex')) % 3n)]

  const worstCaseOut = '990000000000000000' // ~0.99 for demo
  const confidence = 0.95
  const routeHint = 'direct:tokenIn->tokenOut'

  return res.json({ mevRiskScore: pick, worstCaseOut, confidence, routeHint })
})

// POST /webhook/paid
// Body: { nonce: string }
app.post('/webhook/paid', (req, res) => {
  const { nonce } = req.body || {}
  if (!nonce || typeof nonce !== 'string') {
    return res.status(400).json({ error: 'nonce is required' })
  }
  const status = getOrInit(nonce)
  status.paid = true
  // extend expiry a bit for demonstration
  status.expiresAt = Math.floor(Date.now() / 1000) + 600
  payments.set(nonce, status)
  return res.json({ ok: true })
})

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log('MCPay proxy up')
})


