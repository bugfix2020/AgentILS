import React, { useEffect, useMemo, useRef, useState } from 'react'
import { ConfigProvider, Empty, Tag, theme } from 'antd'
import { Bubble, Sender } from '@ant-design/x'
import { AgentilsBridge, type PendingRequest } from './bridge'

const HEARTBEAT_MS = 10_000

export function App(): React.ReactElement {
  const bridge = useMemo(() => new AgentilsBridge(), [])
  const [pending, setPending] = useState<PendingRequest[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const heartbeatRef = useRef<number | null>(null)

  useEffect(() => {
    const es = bridge.connect({
      onRequest: (req) =>
        setPending((prev) => (prev.some((p) => p.id === req.id) ? prev : [...prev, req])),
      onSubmitted: (id) => removeRequest(id),
      onCancelled: (id) => removeRequest(id),
      onExpired: (id) => removeRequest(id),
    })

    return () => es.close()
  }, [bridge])

  function removeRequest(id: string): void {
    setPending((prev) => prev.filter((p) => p.id !== id))
    setActiveId((cur) => (cur === id ? null : cur))
  }

  // Active request rotates to the head of the queue.
  useEffect(() => {
    if (!activeId && pending.length > 0) setActiveId(pending[0].id)
  }, [pending, activeId])

  // Heartbeat for the active request.
  useEffect(() => {
    if (!activeId) return
    heartbeatRef.current = window.setInterval(() => {
      void bridge.heartbeat(activeId)
    }, HEARTBEAT_MS)
    return () => {
      if (heartbeatRef.current !== null) window.clearInterval(heartbeatRef.current)
    }
  }, [activeId, bridge])

  const active = pending.find((p) => p.id === activeId) ?? null

  async function handleSubmit(): Promise<void> {
    if (!active || !draft.trim()) return
    await bridge.submit(active.id, draft.trim())
    setDraft('')
  }

  return (
    <ConfigProvider theme={{ algorithm: theme.darkAlgorithm }}>
      <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', padding: 12, gap: 12 }}>
        <header style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <strong>AgentILS</strong>
          <Tag color={pending.length > 0 ? 'processing' : 'default'}>
            {pending.length} pending
          </Tag>
        </header>

        <div style={{ flex: 1, overflow: 'auto' }}>
          {!active && <Empty description="Waiting for the agent…" />}
          {active && (
            <Bubble.List
              items={[
                ...(active.context
                  ? [{ key: 'context', role: 'system', content: active.context }]
                  : []),
                {
                  key: 'question',
                  role: 'assistant',
                  content: active.question,
                },
              ]}
            />
          )}
        </div>

        <Sender
          value={draft}
          onChange={setDraft}
          onSubmit={() => void handleSubmit()}
          onCancel={() => active && void bridge.cancel(active.id)}
          placeholder={active?.placeholder ?? 'Reply…'}
          disabled={!active}
        />
      </div>
    </ConfigProvider>
  )
}
