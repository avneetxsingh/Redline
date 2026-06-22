'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

// ── Types ─────────────────────────────────────────────────────────────────────

type WsEvent =
  | { type: 'attempt';  category: string; model: string; attempt: number; attacker_msg: string }
  | { type: 'response'; category: string; model: string; attempt: number; model_response: string; verdict: string; reason: string; elapsed_ms: number | null; response_length: number | null }
  | { type: 'complete'; results: Record<string, unknown> }
  | { type: 'error';    message: string }

type ProbeTurn = {
  attempt: number
  strategy?: string
  attacker_msg?: string
  model_response?: string
  verdict?: string
  reason?: string
  elapsed_ms?: number | null
  response_length?: number | null
}

// keyed by model name
type ProbeStream = Record<string, ProbeTurn[]>

// ── Constants ─────────────────────────────────────────────────────────────────

const VERDICT_COLORS: Record<string, string> = {
  PASSED:       'text-green-400',
  PARTIAL:      'text-blue-400',
  JAILBROKEN:   'text-red-400',
  HALLUCINATED: 'text-yellow-400',
  OVER_REFUSED: 'text-orange-400',
  CONTEXT_LOST: 'text-purple-400',
  ERROR:        'text-zinc-500',
}

const VERDICT_BG: Record<string, string> = {
  PASSED:       'bg-green-900/20 border-green-800/40',
  PARTIAL:      'bg-blue-900/20 border-blue-800/40',
  JAILBROKEN:   'bg-red-900/30 border-red-700/60',
  HALLUCINATED: 'bg-yellow-900/20 border-yellow-800/40',
  OVER_REFUSED: 'bg-orange-900/20 border-orange-800/40',
  CONTEXT_LOST: 'bg-purple-900/20 border-purple-800/40',
  ERROR:        'bg-zinc-800/20 border-zinc-700/40',
}

const MODELS = ['groq', 'gemini']

const CATEGORY_LABELS: Record<string, string> = {
  prompt_injection:      'Prompt Injection',
  hallucination_trigger: 'Hallucination Trigger',
  jailbreak:             'Jailbreak',
  context_confusion:     'Context Confusion',
  over_refusal_bait:     'Over-Refusal Bait',
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function confidenceTrend(turns: ProbeTurn[]): '▼' | '▲' | '→' | '' {
  const scores = turns
    .map(t => {
      // confidence is not in the turn type directly — we'd need to pass it.
      // We infer trend from verdict sequence for now.
      return t.verdict
    })
    .filter(Boolean)
  if (scores.length < 3) return ''
  // Will be populated once we wire confidence through (see note below)
  return ''
}

// Extract the strategy label from the model's most recent turn if the backend
// streams it. Currently the strategy is logged server-side; we surface it once
// the backend emits it in attempt events (future). For now we show attempt number.
function strategyBadge(strategy: string | undefined) {
  if (!strategy) return null
  return (
    <span className="px-1.5 py-0.5 rounded text-xs font-mono bg-zinc-800 text-zinc-400 border border-zinc-700">
      {strategy}
    </span>
  )
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function ProbePage() {
  const router = useRouter()
  const bottomRef = useRef<HTMLDivElement>(null)

  const [stream, setStream]             = useState<ProbeStream>({})
  const [status, setStatus]             = useState<'connecting' | 'running' | 'done' | 'error'>('connecting')
  const [errorMsg, setErrorMsg]         = useState<string | null>(null)
  const [category, setCategory]         = useState('')
  const [maxAttempts, setMaxAttempts]   = useState(15)
  const [currentAttempt, setCurrentAttempt] = useState(0)
  // Track per-model confidence history for trend arrow
  const [confHistories, setConfHistories] = useState<Record<string, number[]>>({})

  useEffect(() => {
    const raw = sessionStorage.getItem('redline_probe')
    if (!raw) { router.replace('/'); return }

    let payload: {
      system_prompt: string
      attack_opener: string
      failure_category: string
      max_attempts: number
      use_case?: string
    }
    try {
      payload = JSON.parse(raw)
    } catch {
      router.replace('/')
      return
    }

    setCategory(payload.failure_category)
    setMaxAttempts(payload.max_attempts)

    const ws = new WebSocket('ws://localhost:8000/ws/probe')

    ws.onopen = () => {
      setStatus('running')
      ws.send(JSON.stringify(payload))
    }

    ws.onmessage = (e) => {
      const event: WsEvent = JSON.parse(e.data)

      if (event.type === 'attempt') {
        setCurrentAttempt(event.attempt)
        setStream(prev => {
          const turns = prev[event.model] ?? []
          const idx = turns.findIndex(t => t.attempt === event.attempt)
          if (idx >= 0) {
            const updated = [...turns]
            updated[idx] = { ...updated[idx], attacker_msg: event.attacker_msg }
            return { ...prev, [event.model]: updated }
          }
          return { ...prev, [event.model]: [...turns, { attempt: event.attempt, attacker_msg: event.attacker_msg }] }
        })
      }

      if (event.type === 'response') {
        setStream(prev => {
          const turns = prev[event.model] ?? []
          const idx = turns.findIndex(t => t.attempt === event.attempt)
          const updated = idx >= 0 ? [...turns] : [...turns, { attempt: event.attempt }]
          updated[idx >= 0 ? idx : updated.length - 1] = {
            ...updated[idx >= 0 ? idx : updated.length - 1],
            model_response: event.model_response,
            verdict: event.verdict,
            reason: event.reason,
            elapsed_ms: event.elapsed_ms,
            response_length: event.response_length,
          }
          return { ...prev, [event.model]: updated }
        })
      }

      if (event.type === 'complete') {
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

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [stream])

  const categoryLabel = CATEGORY_LABELS[category] ?? category

  // Compute per-model final verdict for the summary
  const finalVerdicts = MODELS.reduce<Record<string, string | undefined>>((acc, m) => {
    const turns = stream[m] ?? []
    const last = turns[turns.length - 1]
    acc[m] = last?.verdict
    return acc
  }, {})

  const cracked = Object.values(finalVerdicts).some(v => v && v !== 'PASSED' && v !== 'ERROR')

  return (
    <div className="max-w-6xl mx-auto w-full px-6 py-8 flex flex-col gap-6">

      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-semibold font-mono uppercase tracking-widest text-zinc-200">
              {categoryLabel}
            </h1>
            {status === 'running' && (
              <span className="text-xs text-zinc-500 font-mono">
                attempt {currentAttempt} / {maxAttempts}
              </span>
            )}
          </div>
          <p className="text-zinc-500 text-sm">
            {status === 'connecting' && 'Connecting…'}
            {status === 'running'    && 'Deep probe running — adaptive escalation until failure or limit.'}
            {status === 'done'       && (cracked ? 'Model cracked.' : `Held for all ${maxAttempts} attempts.`)}
            {status === 'error'      && (errorMsg ?? 'Unknown error')}
          </p>
        </div>
        <Link href="/" className="text-sm text-zinc-600 hover:text-zinc-300 transition-colors">
          ← New test
        </Link>
      </div>

      {/* Summary banner — shown on completion */}
      {status === 'done' && (
        <div className={`rounded-lg border px-5 py-4 flex items-center justify-between ${
          cracked ? 'bg-red-900/20 border-red-700/50' : 'bg-green-900/10 border-green-800/40'
        }`}>
          <div>
            <p className={`font-semibold ${cracked ? 'text-red-400' : 'text-green-400'}`}>
              {cracked ? 'Cracked' : 'Held'}
            </p>
            <p className="text-xs text-zinc-400 mt-0.5">
              {MODELS.map(m => `${m}: ${finalVerdicts[m] ?? '—'}`).join('  ·  ')}
            </p>
          </div>
          <span className="text-2xl font-mono font-bold text-zinc-600">
            {currentAttempt} / {maxAttempts}
          </span>
        </div>
      )}

      {/* Two-column model grid */}
      <div className="grid grid-cols-2 gap-5">
        {MODELS.map(model => {
          const turns = stream[model] ?? []
          return (
            <div key={model} className="flex flex-col gap-3">
              <div className="flex items-center gap-2 pb-2 border-b border-zinc-800">
                <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                  {model}
                </span>
                <span className="text-xs text-zinc-600">{turns.length} attempts</span>
              </div>

              {turns.length === 0 ? (
                <p className="text-zinc-700 text-xs italic">Waiting…</p>
              ) : (
                turns.map(turn => {
                  const cardBg = turn.verdict
                    ? VERDICT_BG[turn.verdict] ?? 'bg-zinc-900 border-zinc-800'
                    : 'bg-zinc-900 border-zinc-800'
                  return (
                    <div
                      key={turn.attempt}
                      className={`rounded-md border p-3 flex flex-col gap-2.5 text-xs ${cardBg}`}
                    >
                      {/* Card header */}
                      <div className="flex items-center gap-2">
                        <span className="text-zinc-500 font-mono">#{turn.attempt}</span>
                        {turn.strategy && strategyBadge(turn.strategy)}
                      </div>

                      {/* Attacker message */}
                      {turn.attacker_msg && (
                        <div className="flex flex-col gap-0.5">
                          <span className="text-zinc-600 text-[10px] uppercase tracking-wider">attacker</span>
                          <p className="text-zinc-300 leading-relaxed whitespace-pre-wrap">
                            {turn.attacker_msg}
                          </p>
                        </div>
                      )}

                      {/* Model response */}
                      {turn.model_response && (
                        <div className="flex flex-col gap-0.5">
                          <span className="text-zinc-600 text-[10px] uppercase tracking-wider">{model}</span>
                          <p className="text-zinc-300 leading-relaxed whitespace-pre-wrap">
                            {turn.model_response}
                          </p>
                        </div>
                      )}

                      {/* Verdict + telemetry footer */}
                      {turn.verdict && (
                        <div className="flex items-start justify-between gap-2 pt-2 border-t border-zinc-800/60">
                          <div className="flex flex-col gap-0.5">
                            <div className="flex items-center gap-1.5">
                              <span className={`font-mono font-bold ${VERDICT_COLORS[turn.verdict] ?? 'text-zinc-400'}`}>
                                {turn.verdict}
                              </span>
                            </div>
                            <span className="text-zinc-500 leading-snug">{turn.reason}</span>
                          </div>
                          <div className="flex flex-col items-end gap-0.5 text-zinc-600 shrink-0 font-mono text-[10px]">
                            {turn.elapsed_ms != null && <span>{turn.elapsed_ms}ms</span>}
                            {turn.response_length != null && <span>{turn.response_length} chars</span>}
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })
              )}
            </div>
          )
        })}
      </div>

      <div ref={bottomRef} />
    </div>
  )
}
