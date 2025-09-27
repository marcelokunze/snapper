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
}

export type TerminalHandle = {
  push: (message: string, emoji?: string) => void
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
  { url = 'http://localhost:4000/events', height = 240, className },
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

  const containerStyle = useMemo<React.CSSProperties>(() => ({
    height: typeof height === 'number' ? `${height}px` : height,
  }), [height])

  return (
    <div className={className} style={{ display: 'flex', flexDirection: 'column' }}>
      <div
        style={{
          ...containerStyle,
          border: '1px solid #333',
          borderRadius: 8,
          padding: 12,
          overflowY: 'auto',
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
          fontSize: 12,
          background: '#0b0f14',
          color: '#e6edf3',
        }}
      >
        {entries.map((e, i) => (
          <div key={`${e.ts}-${i}`} style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
            <span style={{ width: 22 }}>{e.emoji}</span>
            <span style={{ opacity: 0.7 }}>{formatTime(e.ts)}</span>
            <span style={{ wordBreak: 'break-word' }}>{e.message}</span>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  )
})

export default Terminal


