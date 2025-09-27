'use client'

import React, {
  useEffect,
  useMemo,
  useRef,
  useState,
  forwardRef,
  useImperativeHandle,
} from 'react'

type TerminalEntry = {
  ts: number
  emoji: string
  message: string
  raw?: unknown
  isResult?: boolean
  withLogo?: boolean
}

export type TerminalHandle = {
  push: (message: string, emoji?: string) => void
  pushResult: (message: string, emoji?: string) => void
}

type Props = {
  url?: string
  height?: number | string
  className?: string
}

const emojiForType = (type?: string): string => {
  switch (type) {
    case 'PolicyUpdated':
      return '🛠️'
    case 'PolicyUsed':
      return '📈'
    case 'swap':
      return '🔄'
    default:
      return '🔔'
  }
}

function formatTime(ts: number): string {
  const d = new Date(ts)
  return d.toLocaleTimeString()
}

const Terminal = forwardRef<TerminalHandle, Props>(function Terminal(
  { url = 'http://localhost:4002/events', height = 240, className },
  ref
) {
  const [entries, setEntries] = useState<TerminalEntry[]>([])
  const bottomRef = useRef<HTMLDivElement | null>(null)

  useImperativeHandle(ref, () => ({
    push: (message: string, emoji = '💬') => {
      setEntries((prev) => [
        ...prev,
        { ts: Date.now(), emoji, message },
      ])
    },
    pushResult: (message: string, emoji = '📦') => {
      setEntries((prev) => [
        ...prev,
        { ts: Date.now(), emoji, message, isResult: true },
      ])
    },
  }))

  useEffect(() => {
    const es = new EventSource(url)

    es.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data)
        const emoji = emojiForType(data?.type)
        const msg = data?.msg ? JSON.stringify(data.msg) : ev.data
        setEntries((prev) => [
          ...prev,
          { ts: Date.now(), emoji, message: msg, raw: data },
        ])
      } catch {
        setEntries((prev) => [
          ...prev,
          { ts: Date.now(), emoji: '🔔', message: ev.data },
        ])
      }
    }

    es.onerror = () => {
      setEntries((prev) => [
        ...prev,
        { ts: Date.now(), emoji: '⚠️', message: 'SSE connection error' },
      ])
    }

    return () => {
      es.close()
    }
  }, [url])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [entries.length])

  // Seed a welcome entry once if empty, treated like a normal message
  useEffect(() => {
    setEntries((prev) => {
      if (prev.length > 0) return prev
      const welcome = `SNAPPER v1 — AI-native Uniswap v4 Hook playground\nThis demo shows programmable swap fees using a Uniswap v4 Hook.\nEach swap calls our Hook, which computes a dynamic fee from a policy, then emits PolicyUsed(feeBps, bucket) so you can see the decision live here in the terminal.\n\nWhat you can do:\n• Simulate: compare baseline vs dynamic fee.\n• Swap: we auto-check approvals → build real calldata → send tx.\n• Update Policy: change base/max/slope, then swap again to see a different fee/output.\n\nRecommended flow: Simulate → (auto) Approvals → Build Tx → Send → watch PolicyUsed.\nNetwork: Localhost (31337). Use Faucet for TOKEN0/TOKEN1 if needed.\nTip: If Anvil restarts, redeploy contracts, restart backend, and refresh this page.\n\nReady when you are—pick a tool above or hit Swap to see the Hook in action.`
      return [
        { ts: Date.now(), emoji: '', message: welcome, withLogo: true },
      ]
    })
  }, [])

  const containerStyle = useMemo<React.CSSProperties>(() => ({
    height: typeof height === 'number' ? `${height}px` : height,
  }), [height])

  return (
    <div className={className} style={{ display: 'flex', flexDirection: 'column' }}>
      <div
        className="bg-zinc-800 text-zinc-100"
        style={{
          ...containerStyle,
          border: 'none',
          borderRadius: 6,
          padding: 12,
          overflowY: 'auto',
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
          fontSize: 13,
          fontWeight: 500,
          lineHeight: 1.6,
        }}
      >
        {entries.map((e, i) => {
          const content = (
            <span style={{ wordBreak: 'break-word', whiteSpace: 'pre-wrap' }}>{e.message}</span>
          )
          return (
            <div key={`${e.ts}-${i}`} style={{ marginBottom: e.withLogo ? 20 : 6 }}>
              {e.withLogo && (
                <img src="/SNAPPER-logo.svg" alt="SNAPPER" style={{ width: '100%', height: 'auto', marginBottom: 16, opacity: 0.2 }} />
              )}
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                <span style={{ opacity: 0.7, paddingTop: 2, minWidth: 60 }}>{formatTime(e.ts)}</span>
                <span style={{ opacity: 0.7, paddingTop: 2 }}>&gt;</span>
                <span style={{ width: 22 }}>{e.emoji}</span>
                <div style={{ flex: 1 }}>
                  {e.isResult ? (
                    <div className="bg-zinc-700 rounded p-2">
                      <div style={{ fontSize: 11, fontWeight: 600, opacity: 0.85, marginBottom: 4 }}>RESULT</div>
                      {content}
                    </div>
                  ) : (
                    content
                  )}
                </div>
              </div>
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>
    </div>
  )
})

export default Terminal


