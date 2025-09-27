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
      const welcome = `SNAPPER v1 — AI-native Uniswap v4 Hook playground\nThis demo shows programmable swap fees using a [Uniswap v4 Hook](https://uniswap.org/).\nEach swap calls our Hook, which computes a dynamic fee from a policy, then emits PolicyUsed(feeBps, bucket) so you can see the decision live here in the terminal.\n\nWhat you can do:\n• Simulate: compare baseline vs dynamic fee.\n• Swap: we auto-check approvals → build real calldata → send tx.\n• Update Policy: change base/max/slope, then swap again to see a different fee/output.\n\nRecommended flow: Simulate → (auto) Approvals → Build Tx → Send → watch PolicyUsed.\nNetwork: Localhost (31337). Use Faucet for TOKEN0/TOKEN1 if needed.\nTip: If Anvil restarts, redeploy contracts, restart backend, and refresh this page.\n\nReady when you are—pick a tool above or hit Swap to see the Hook in action.`
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
          padding: 24,
          overflowY: 'auto',
          fontFamily: 'Geist Mono',
          fontSize: 13,
          fontWeight: 600,
          lineHeight: 1.6,
        }}
      >
        {entries.map((e, i) => {
          const linkified = (raw: string) => {
            // Match markdown links or plain URLs and build clickable spans
            const regex = /(\[([^\]]+)\]\((https?:\/\/[^\s)]+)\))|(https?:\/\/[^\s)]+)/g
            const nodes: React.ReactNode[] = []
            let lastIndex = 0
            let m: RegExpExecArray | null
            while ((m = regex.exec(raw)) !== null) {
              if (m.index > lastIndex) nodes.push(<span key={nodes.length}>{raw.slice(lastIndex, m.index)}</span>)
              const [full, mdWhole, mdLabel, mdHref, plainUrl] = m
              const href = mdHref || plainUrl
              const label = mdLabel || plainUrl
              nodes.push(
                <a key={nodes.length} href={href} target="_blank" rel="noreferrer" style={{ color: '#ef4444', textDecoration: 'underline dotted' }}>
                  {label}
                </a>
              )
              lastIndex = m.index + full.length
            }
            if (lastIndex < raw.length) nodes.push(<span key={nodes.length}>{raw.slice(lastIndex)}</span>)
            return <span style={{ wordBreak: 'break-word', whiteSpace: 'pre-wrap' }}>{nodes}</span>
          }
          const content = linkified(e.message)
          const highlightColor = '#ef4444' // rose-500
          function renderHighlightedJson(raw: string) {
            let str = raw
            try { str = JSON.stringify(JSON.parse(raw), null, 2) } catch {}
            const regex = /(\"[^\"]*\"(?=:))|(\"[^\"]*\")|(\b-?\d+\.?\d*\b)|(true|false|null)/g
            const parts: Array<{ text: string; type: 'key'|'string'|'number'|'literal'|'plain' }> = []
            let lastIndex = 0
            let m: RegExpExecArray | null
            while ((m = regex.exec(str)) !== null) {
              if (m.index > lastIndex) parts.push({ text: str.slice(lastIndex, m.index), type: 'plain' })
              const [full, key, stringVal, numberVal, literalVal] = m
              if (key) parts.push({ text: full, type: 'key' })
              else if (stringVal) parts.push({ text: full, type: 'string' })
              else if (numberVal) parts.push({ text: full, type: 'number' })
              else if (literalVal) parts.push({ text: full, type: 'literal' })
              lastIndex = m.index + full.length
            }
            if (lastIndex < str.length) parts.push({ text: str.slice(lastIndex), type: 'plain' })
            const colorFor = (t: string) => t === 'key' ? highlightColor : t === 'string' ? '#93c5fd' : t === 'number' ? '#fca5a5' : t === 'literal' ? '#a7f3d0' : undefined
            return (
              <pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>
                {parts.map((p, idx) => (
                  <span key={idx} style={{ color: colorFor(p.type) }}>{p.text}</span>
                ))}
              </pre>
            )
          }
          return (
            <div key={`${e.ts}-${i}`} style={{ marginBottom: e.withLogo ? 20 : 6 }}>
              {e.withLogo && (
                <img src="/SNAPPER-logo.svg" alt="SNAPPER" style={{ width: '100%', height: 'auto', marginBottom: 20, opacity: 0.2 }} />
              )}
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                <span style={{ opacity: 0.7, paddingTop: 2, minWidth: 60 }}>{formatTime(e.ts)}</span>
                <span style={{ opacity: 0.7, paddingTop: 2 }}>&gt;</span>
                <span style={{ width: 22 }}>{e.emoji}</span>
                <div style={{ flex: 1 }}>
                  {e.isResult ? (
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 700, marginBottom: 6, color: highlightColor }}>RESULT</div>
                      {renderHighlightedJson(e.message)}
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


