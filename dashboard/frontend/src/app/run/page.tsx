'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

// ── Types ─────────────────────────────────────────────────────────────────────

type WsEvent =
  | { type: 'attempt';       category: string; model: string; attempt: number; attacker_msg: string }
  | { type: 'response';      category: string; model: string; attempt: number; model_response: string; verdict: string; reason: string }
  | { type: 'category_done'; category: string; results: Record<string, { verdict: string; attempt: number; reason: string }> }
  | { type: 'complete';      results: Record<string, Record<string, unknown>> }
  | { type: 'error';         message: string }

type Turn = {
  attempt: number
  attacker_msg?: string
  model_response?: string
  verdict?: string
  reason?: string
}

// keyed as `${category}::${model}`
type Stream = Record<string, Turn[]>

const VERDICT_COLORS: Record<string, string> = {
  PASSED:       'text-green-400',
  PARTIAL:      'text-blue-400',
  JAILBROKEN:   'text-red-400',
  HALLUCINATED: 'text-yellow-400',
  OVER_REFUSED: 'text-orange-400',
  CONTEXT_LOST: 'text-purple-400',
  ERROR:        'text-zinc-500',
}

const CATEGORIES = [
  'prompt_injection',
  'hallucination_trigger',
  'jailbreak',
  'context_confusion',
  'over_refusal_bait',
]

const CATEGORY_LABELS: Record<string, string> = {
  prompt_injection:      'Prompt Injection',
  hallucination_trigger: 'Hallucination Trigger',
  jailbreak:             'Jailbreak',
  context_confusion:     'Context Confusion',
  over_refusal_bait:     'Over-Refusal Bait',
}

const MODELS = ['groq', 'gemini']

// ── Component ─────────────────────────────────────────────────────────────────

export default function RunPage() {
  const router = useRouter()
  const bottomRef = useRef<HTMLDivElement>(null)

  const [stream, setStream]     = useState<Stream>({})
  const [status, setStatus]     = useState<'connecting' | 'running' | 'done' | 'error'>('connecting')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  useEffect(() => {
    const systemPrompt = sessionStorage.getItem('redline_system_prompt')
    const attacksRaw   = sessionStorage.getItem('redline_attacks')

    if (!systemPrompt || !attacksRaw) {
      router.replace('/')
      return
    }

    const attacks = JSON.parse(attacksRaw)
    const ws = new WebSocket('ws://localhost:8000/ws/run')

    ws.onopen = () => {
      setStatus('running')
      ws.send(JSON.stringify({ system_prompt: systemPrompt, attacks }))
    }

    ws.onmessage = (e) => {
      const event: WsEvent = JSON.parse(e.data)

      if (event.type === 'attempt') {
        const key = `${event.category}::${event.model}`
        setStream(prev => {
          const existing = prev[key] ?? []
          // Find or create the turn for this attempt number
          const idx = existing.findIndex(t => t.attempt === event.attempt)
          if (idx >= 0) {
            const updated = [...existing]
            updated[idx] = { ...updated[idx], attacker_msg: event.attacker_msg }
            return { ...prev, [key]: updated }
          }
          return { ...prev, [key]: [...existing, { attempt: event.attempt, attacker_msg: event.attacker_msg }] }
        })
      }

      if (event.type === 'response') {
        const key = `${event.category}::${event.model}`
        setStream(prev => {
          const existing = prev[key] ?? []
          const idx = existing.findIndex(t => t.attempt === event.attempt)
          if (idx >= 0) {
            const updated = [...existing]
            updated[idx] = {
              ...updated[idx],
              model_response: event.model_response,
              verdict: event.verdict,
              reason: event.reason,
            }
            return { ...prev, [key]: updated }
          }
          return {
            ...prev,
            [key]: [...existing, {
              attempt: event.attempt,
              model_response: event.model_response,
              verdict: event.verdict,
              reason: event.reason,
            }],
          }
        })
      }

      if (event.type === 'complete') {
        sessionStorage.setItem('redline_results', JSON.stringify(event.results))
        setStatus('done')
      }

      if (event.type === 'error') {
        setErrorMsg(event.message)
        setStatus('error')
      }
    }

    ws.onerror = () => {
      setErrorMsg('WebSocket connection failed. Is the backend running on port 8000?')
      setStatus('error')
    }

    return () => ws.close()
  }, [router])

  // Auto-scroll to bottom as new content arrives
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [stream])

  return (
    <div className="max-w-5xl mx-auto w-full px-6 py-8 flex flex-col gap-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Live Probes</h1>
          <p className="text-zinc-500 text-sm mt-1">
            {status === 'connecting' && 'Connecting to backend…'}
            {status === 'running'    && 'Running — attacking all five categories concurrently per model…'}
            {status === 'done'       && 'All probes complete.'}
            {status === 'error'      && (errorMsg ?? 'Unknown error')}
          </p>
        </div>
        {status === 'done' && (
          <button
            onClick={() => router.push('/results')}
            className="px-5 py-2 rounded-md bg-red-600 hover:bg-red-500 text-sm font-semibold transition-colors"
          >
            View Results →
          </button>
        )}
      </div>

      {/* Per-category, per-model stream */}
      {CATEGORIES.map(category => (
        <section key={category} className="flex flex-col gap-3">
          <h2 className="text-sm font-mono uppercase tracking-widest text-zinc-400 border-b border-zinc-800 pb-2">
            {CATEGORY_LABELS[category]}
          </h2>

          <div className="grid grid-cols-2 gap-4">
            {MODELS.map(model => {
              const key = `${category}::${model}`
              const turns = stream[key] ?? []
              return (
                <div key={model} className="flex flex-col gap-2">
                  <span className="text-xs font-semibold uppercase text-zinc-500 tracking-wider">
                    {model}
                  </span>

                  {turns.length === 0 ? (
                    <p className="text-zinc-700 text-xs italic">Waiting…</p>
                  ) : (
                    turns.map(turn => (
                      <div key={turn.attempt} className="bg-zinc-900 rounded-md p-3 flex flex-col gap-2 text-xs">
                        <div className="text-zinc-500">Attempt {turn.attempt}</div>

                        {turn.attacker_msg && (
                          <div>
                            <span className="text-zinc-600 mr-1">↑ attacker:</span>
                            <span className="text-zinc-300">{turn.attacker_msg}</span>
                          </div>
                        )}

                        {turn.model_response && (
                          <div>
                            <span className="text-zinc-600 mr-1">↓ model:</span>
                            <span className="text-zinc-300 line-clamp-4">{turn.model_response}</span>
                          </div>
                        )}

                        {turn.verdict && (
                          <div className="flex items-center gap-2 pt-1 border-t border-zinc-800">
                            <span className={`font-mono font-bold ${VERDICT_COLORS[turn.verdict] ?? 'text-zinc-400'}`}>
                              {turn.verdict}
                            </span>
                            <span className="text-zinc-500">{turn.reason}</span>
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              )
            })}
          </div>
        </section>
      ))}

      <div ref={bottomRef} />
    </div>
  )
}
