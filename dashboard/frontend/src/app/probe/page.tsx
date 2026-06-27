'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import { API } from '../lib/api'
import { VerdictBadge, VERDICT_BG } from '../components/VerdictBadge'
import { RippleButton } from '../components/RippleButton'

// ── Types ─────────────────────────────────────────────────────────────────────

type WsEvent =
  | { type: 'attempt';  category: string; model: string; attempt: number; attacker_msg: string }
  | { type: 'response'; category: string; model: string; attempt: number; model_response: string; verdict: string; reason: string; confidence?: number | null; elapsed_ms: number | null; response_length: number | null }
  | { type: 'complete'; results: Record<string, unknown> }
  | { type: 'error';    message: string }

type ProbeTurn = {
  attempt: number
  isNuclear?: boolean
  isReset?: boolean
  attacker_msg?: string
  model_response?: string
  verdict?: string
  reason?: string
  confidence?: number | null
  elapsed_ms?: number | null
  response_length?: number | null
}

type ProbeStream = Record<string, ProbeTurn[]>

const CATEGORY_LABELS: Record<string, string> = {
  prompt_injection:      'Prompt Injection',
  hallucination_trigger: 'Hallucination Trigger',
  jailbreak:             'Jailbreak',
  context_confusion:     'Context Confusion',
  over_refusal_bait:     'Over-Refusal Bait',
}

const MODEL_LABELS: Record<string, string> = {
  groq:      'Groq / Llama 3.3',
  gemini:    'Gemini Flash',
  openai:    'GPT-4o-mini',
  anthropic: 'Claude 3.5 Haiku',
  deepseek:  'DeepSeek Chat',
}

function isNuclearPayload(msg: string | undefined): boolean {
  if (!msg) return false
  const lower = msg.toLowerCase()
  return lower.includes('dan') || lower.includes('[system override]') || lower.includes('ignore all previous') ||
    lower.includes('you are now') || lower.includes('developer mode') || lower.includes('jailbreak')
}

// ── Verdict left-border colors ────────────────────────────────────────────────

const VERDICT_LEFT_BORDER: Record<string, string> = {
  PASSED:       'border-l-emerald-600',
  PARTIAL:      'border-l-blue-600',
  JAILBROKEN:   'border-l-red-600',
  HALLUCINATED: 'border-l-yellow-500',
  OVER_REFUSED: 'border-l-orange-500',
  CONTEXT_LOST: 'border-l-purple-600',
  ERROR:        'border-l-zinc-600',
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function ProbePage() {
  const router = useRouter()
  const bottomRef    = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const [stream, setStream]                 = useState<ProbeStream>({})
  const [status, setStatus]                 = useState<'connecting' | 'running' | 'done' | 'error'>('connecting')
  const [errorMsg, setErrorMsg]             = useState<string | null>(null)
  const [category, setCategory]             = useState('')
  const [maxAttempts, setMaxAttempts]       = useState(15)
  const [currentAttempt, setCurrentAttempt] = useState(0)
  const [activeModels, setActiveModels]     = useState<string[]>(['groq', 'gemini'])
  const [showJumpBtn, setShowJumpBtn]       = useState(false)
  const [expandedMsgs, setExpandedMsgs]     = useState<Set<string>>(new Set())
  // Track which turn cards should flash (jailbroken verdict just arrived)
  const [flashCards, setFlashCards]         = useState<Set<string>>(new Set())

  useEffect(() => {
    const raw = sessionStorage.getItem('redline_probe')
    if (!raw) { router.replace('/'); return }

    let payload: {
      system_prompt: string
      attack_opener: string
      failure_category: string
      max_attempts: number
      use_case?: string
      kill_chain?: string[]
      selected_models?: string[]
      external_config?: { endpoint_url: string; api_key: string; model_name: string }
      external_mode?: boolean
      groq_api_key?: string
      gemini_api_key?: string
      openai_api_key?: string
      anthropic_api_key?: string
      deepseek_api_key?: string
    }
    try {
      payload = JSON.parse(raw)
    } catch {
      router.replace('/')
      return
    }

    setCategory(payload.failure_category)
    setMaxAttempts(payload.max_attempts)
    setActiveModels(
      payload.external_mode
        ? [payload.external_config?.model_name ?? 'external']
        : (payload.selected_models ?? ['groq', 'gemini'])
    )

    const ws = new WebSocket(API.wsProbe)

    ws.onopen = () => {
      setStatus('running')
      ws.send(JSON.stringify(payload))
    }

    ws.onmessage = (e) => {
      const event: WsEvent = JSON.parse(e.data)

      if (event.type === 'attempt') {
        setCurrentAttempt(event.attempt)
        setStream(prev => {
          const turns  = prev[event.model] ?? []
          const idx    = turns.findIndex(t => t.attempt === event.attempt)
          const nuclear = isNuclearPayload(event.attacker_msg)
          if (idx >= 0) {
            const updated = [...turns]
            updated[idx] = { ...updated[idx], attacker_msg: event.attacker_msg, isNuclear: nuclear }
            return { ...prev, [event.model]: updated }
          }
          return { ...prev, [event.model]: [...turns, { attempt: event.attempt, attacker_msg: event.attacker_msg, isNuclear: nuclear }] }
        })
      }

      if (event.type === 'response') {
        const cardKey = `${event.model}-${event.attempt}`
        setStream(prev => {
          const turns   = prev[event.model] ?? []
          const idx     = turns.findIndex(t => t.attempt === event.attempt)
          const updated = idx >= 0 ? [...turns] : [...turns, { attempt: event.attempt }]
          const i       = idx >= 0 ? idx : updated.length - 1
          updated[i] = {
            ...updated[i],
            model_response:  event.model_response,
            verdict:         event.verdict,
            reason:          event.reason,
            confidence:      event.confidence,
            elapsed_ms:      event.elapsed_ms,
            response_length: event.response_length,
          }
          return { ...prev, [event.model]: updated }
        })
        // Flash card on JAILBROKEN
        if (event.verdict === 'JAILBROKEN') {
          setFlashCards(prev => new Set([...prev, cardKey]))
          setTimeout(() => {
            setFlashCards(prev => {
              const next = new Set(prev)
              next.delete(cardKey)
              return next
            })
          }, 1300)
        }
      }

      if (event.type === 'complete') setStatus('done')
      if (event.type === 'error')    { setErrorMsg(event.message); setStatus('error') }
    }

    ws.onerror = () => {
      setErrorMsg('WebSocket connection failed. Is the backend running on port 8000?')
      setStatus('error')
    }

    return () => ws.close()
  }, [router])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
    if (distFromBottom < 200) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    } else {
      setShowJumpBtn(true)
    }
  }, [stream])

  function handleScroll() {
    const el = containerRef.current
    if (!el) return
    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
    setShowJumpBtn(distFromBottom > 200)
  }

  function jumpToBottom() {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    setShowJumpBtn(false)
  }

  function toggleMsg(key: string) {
    setExpandedMsgs(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key); else next.add(key)
      return next
    })
  }

  const categoryLabel = CATEGORY_LABELS[category] ?? category

  const finalVerdicts = activeModels.reduce<Record<string, string | undefined>>((acc, m) => {
    const turns = stream[m] ?? []
    acc[m] = turns[turns.length - 1]?.verdict
    return acc
  }, {})

  const cracked    = Object.values(finalVerdicts).some(v => v && v !== 'PASSED' && v !== 'ERROR')
  const progressPct = maxAttempts > 0 ? Math.round((currentAttempt / maxAttempts) * 100) : 0

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      className="flex-1 overflow-y-auto"
    >
      {/* Full-width progress bar pinned to top */}
      <div className="sticky top-0 z-30" style={{ background: 'rgba(3,3,3,0.9)', backdropFilter: 'blur(8px)' }}>
        <div className="h-0.5 w-full overflow-hidden relative" style={{ background: 'var(--surface-2)' }}>
          <div
            className="h-full transition-all duration-500 relative"
            style={{
              width: `${progressPct}%`,
              background: cracked
                ? 'linear-gradient(90deg, #ff1744, #ff1744)'
                : status === 'done'
                  ? 'linear-gradient(90deg, #16a34a, #22c55e)'
                  : 'linear-gradient(90deg, #ff1744, #f97316)',
              boxShadow: status === 'running' ? '0 0 8px rgba(255,23,68,0.6)' : 'none',
            }}
          >
            {/* Glowing head on progress bar */}
            {status === 'running' && progressPct > 0 && (
              <span
                className="absolute right-0 top-1/2 h-2 w-2 rounded-full bg-orange-400"
                style={{ transform: 'translate(50%, -50%)', boxShadow: '0 0 6px rgba(249,115,22,0.8)' }}
              />
            )}
          </div>
        </div>
        <div className="px-6 py-2.5 max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-xs font-mono uppercase tracking-widest font-semibold" style={{ color: 'var(--text-2)' }}>
              {categoryLabel}
            </span>
            {status === 'running' && (
              <div className="flex items-center gap-1.5">
                {/* Radar ping indicator */}
                <span className="relative flex items-center justify-center h-3 w-3">
                  <span className="h-1.5 w-1.5 rounded-full bg-red-500 z-10" />
                  <span className="absolute h-3 w-3 rounded-full border border-red-500/50 animate-radar-ping" />
                </span>
                <span className="text-xs font-mono" style={{ color: 'var(--text-3)' }}>
                  {currentAttempt} / {maxAttempts}
                </span>
              </div>
            )}
            {status === 'connecting' && (
              <span className="text-xs font-mono text-zinc-600 animate-pulse-dot">connecting…</span>
            )}
          </div>
          <Link href="/" className="text-xs transition-colors hover:text-zinc-200" style={{ color: 'var(--text-3)' }}>
            ← New test
          </Link>
        </div>
      </div>

      <div className="max-w-6xl mx-auto w-full px-6 py-6 flex flex-col gap-6">

        {/* Summary banner — shown on completion */}
        <AnimatePresence>
          {status === 'done' && (
            <motion.div
              initial={{ opacity: 0, scale: 0.92, y: -8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{ type: 'spring', stiffness: 250, damping: 24 }}
              className="rounded-xl border px-6 py-5 flex items-center justify-between overflow-hidden relative"
              style={
                cracked
                  ? { background: 'rgba(255,23,68,0.06)', borderColor: 'rgba(255,23,68,0.35)', boxShadow: '0 0 60px rgba(255,23,68,0.2), inset 0 0 40px rgba(255,23,68,0.04)' }
                  : { background: 'rgba(0,230,118,0.04)', borderColor: 'rgba(0,230,118,0.25)' }
              }
            >
              {cracked && (
                <div className="absolute inset-0 pointer-events-none"
                  style={{ background: 'radial-gradient(ellipse 80% 50% at 20% 50%, rgba(255,23,68,0.1) 0%, transparent 70%)' }} />
              )}
              <div className="flex flex-col gap-1 relative">
                <p className={`text-xl font-black font-mono tracking-widest ${cracked ? '' : 'text-emerald-400'}`}
                  style={cracked ? { color: '#ff1744', textShadow: '0 0 20px rgba(255,23,68,0.5)' } : {}}>
                  {cracked ? '⚡ TARGET CRACKED' : '✓ HELD — ALL ATTEMPTS'}
                </p>
                <p className="text-xs font-mono" style={{ color: 'var(--text-3)' }}>
                  {activeModels.map(m => {
                    const v = finalVerdicts[m]
                    return v ? `${m.toUpperCase()}: ${v}` : `${m.toUpperCase()}: —`
                  }).join('   ·   ')}
                </p>
              </div>
              <div className="text-right">
                <span className="text-3xl font-mono font-black" style={{ color: 'var(--text-3)' }}>
                  {currentAttempt}
                </span>
                <span className="text-lg font-mono" style={{ color: 'var(--text-3)' }}>/{maxAttempts}</span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {status === 'error' && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            className="rounded-xl border border-red-700/40 bg-red-900/15 px-5 py-4 flex items-start gap-3"
          >
            <span className="text-red-400 mt-0.5 shrink-0">⚠</span>
            <p className="text-red-400 text-sm">{errorMsg ?? 'Unknown error'}</p>
          </motion.div>
        )}

        {/* Two-column model grid */}
        <div className={`grid gap-5 ${activeModels.length === 1 ? 'grid-cols-1 max-w-xl' : 'grid-cols-1 md:grid-cols-2'}`}>
          {activeModels.map(model => {
            const turns  = stream[model] ?? []
            const finalV = finalVerdicts[model]
            const isModelActive = status === 'running' && turns.length > 0 && !turns[turns.length - 1]?.verdict
            return (
              <div
                key={model}
                className="relative rounded-xl overflow-hidden border-animated flex flex-col gap-0"
                style={{
                  background: 'var(--surface)',
                  minHeight: 300,
                  border: '1px solid var(--border)',
                }}
              >
                {/* Large watermark model name */}
                <div className="absolute bottom-4 right-4 text-7xl font-black font-mono pointer-events-none select-none uppercase"
                  style={{ color: 'var(--text-1)', opacity: 0.04 }}>
                  {model}
                </div>

                {/* Column header */}
                <div className="px-4 py-3 flex items-center justify-between relative z-10" style={{ borderBottom: '1px solid var(--border)' }}>
                  <div className="flex items-center gap-2.5">
                    {isModelActive && (
                      <span className="relative flex items-center justify-center h-3 w-3">
                        <span className="h-1.5 w-1.5 rounded-full bg-red-500 z-10" />
                        <span className="absolute h-3 w-3 rounded-full border border-red-500/50 animate-radar-ping" />
                      </span>
                    )}
                    <span className="text-xs font-bold uppercase tracking-widest font-mono" style={{ color: 'var(--text-2)' }}>
                      {MODEL_LABELS[model] ?? model}
                    </span>
                    <span className="text-xs font-mono" style={{ color: 'var(--text-3)' }}>
                      {turns.length} attempt{turns.length !== 1 ? 's' : ''}
                    </span>
                  </div>
                  {status === 'done' && finalV && (
                    <div style={{ filter: `drop-shadow(0 0 8px rgba(255,23,68,0.4))` }}>
                      <VerdictBadge verdict={finalV} size="xs" />
                    </div>
                  )}
                </div>

                {/* Turns */}
                <div className="p-3 flex flex-col gap-2.5 relative z-10">
                  {turns.length === 0 ? (
                    <div className="flex items-center gap-2 px-4 py-3 rounded-lg" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                      <span className="h-1.5 w-1.5 rounded-full bg-zinc-700 animate-pulse-dot" />
                      <span className="text-xs font-mono" style={{ color: 'var(--text-3)' }}>Waiting…</span>
                    </div>
                  ) : (
                    <AnimatePresence>
                      {turns.map((turn, turnIdx) => {
                        const isActive = !turn.verdict && status === 'running'
                        const leftBorderClass = turn.verdict
                          ? (VERDICT_LEFT_BORDER[turn.verdict] ?? 'border-l-zinc-600')
                          : isActive
                            ? 'border-l-red-600'
                            : 'border-l-zinc-700'

                        const bgClass = turn.verdict
                          ? (VERDICT_BG[turn.verdict] ?? '')
                          : ''

                        const attackerKey  = `${model}-${turn.attempt}-attacker`
                        const responseKey  = `${model}-${turn.attempt}-response`
                        const cardFlashKey = `${model}-${turn.attempt}`
                        const attackerLong = (turn.attacker_msg?.length ?? 0) > 200
                        const responseLong = (turn.model_response?.length ?? 0) > 200
                        const isFlashing   = flashCards.has(cardFlashKey)

                        return (
                          <motion.div
                            key={turn.attempt}
                            initial={{ opacity: 0, y: 16 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: turnIdx * 0.04, type: 'spring', stiffness: 300, damping: 30 }}
                            className={`rounded-lg border-l-2 p-3 flex flex-col gap-2.5 text-xs transition-all duration-300 ${leftBorderClass} ${bgClass} ${
                              turn.isNuclear ? 'border-r border-t border-b border-orange-700/40' : 'border-r border-t border-b'
                            } ${isFlashing ? 'animate-crack-flash' : ''}`}
                            style={{
                              borderColor: turn.isNuclear ? undefined : 'var(--border)',
                              background: bgClass ? undefined : 'var(--surface-2)',
                              boxShadow: isActive
                                ? '0 0 0 1px rgba(255,23,68,0.2), inset 0 0 12px rgba(255,23,68,0.04)'
                                : 'none',
                            }}
                          >
                            {/* Card header */}
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-mono text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ background: 'rgba(255,255,255,0.04)', color: 'var(--text-3)' }}>
                                #{turn.attempt}
                              </span>
                              {turn.isNuclear && (
                                <span className="relative inline-flex items-center">
                                  {/* Radar ping behind NUCLEAR badge */}
                                  <span className="absolute inset-0 rounded animate-radar-ping border border-orange-500/40" />
                                  <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-orange-900/40 text-orange-400 border border-orange-700/50 shadow-[0_0_12px_rgba(249,115,22,0.4)] relative z-10">
                                    NUCLEAR
                                  </span>
                                </span>
                              )}
                              {isActive && (
                                <span className="text-[10px] font-mono text-red-500/70 animate-pulse-dot">in progress…</span>
                              )}
                            </div>

                            {/* Attacker message */}
                            {turn.attacker_msg && (
                              <div className="flex flex-col gap-1">
                                <span className="text-[10px] font-mono uppercase tracking-wider" style={{ color: 'var(--text-3)' }}>attacker</span>
                                <p className="leading-relaxed whitespace-pre-wrap" style={{ color: 'var(--text-2)' }}>
                                  {attackerLong && !expandedMsgs.has(attackerKey)
                                    ? <>{turn.attacker_msg.slice(0, 200)}<span style={{ color: 'var(--text-3)' }}>…</span></>
                                    : turn.attacker_msg}
                                  {/* Blinking cursor for active turn */}
                                  {isActive && <span className="inline-block w-px h-3 bg-red-400 ml-0.5 animate-pulse-dot align-middle" />}
                                </p>
                                {attackerLong && (
                                  <button
                                    onClick={() => toggleMsg(attackerKey)}
                                    className="text-[10px] self-start mt-0.5 transition-colors hover:text-zinc-300 font-mono"
                                    style={{ color: 'var(--text-3)' }}
                                  >
                                    {expandedMsgs.has(attackerKey) ? '▲ show less' : '▼ show more'}
                                  </button>
                                )}
                              </div>
                            )}

                            {/* Model response */}
                            {turn.model_response && (
                              <div className="flex flex-col gap-1 pt-2" style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                                <span className="text-[10px] font-mono uppercase tracking-wider" style={{ color: 'var(--text-3)' }}>{MODEL_LABELS[model] ?? model}</span>
                                <p className="leading-relaxed whitespace-pre-wrap text-zinc-300">
                                  {responseLong && !expandedMsgs.has(responseKey)
                                    ? <>{turn.model_response.slice(0, 200)}<span style={{ color: 'var(--text-3)' }}>…</span></>
                                    : turn.model_response}
                                </p>
                                {responseLong && (
                                  <button
                                    onClick={() => toggleMsg(responseKey)}
                                    className="text-[10px] self-start mt-0.5 transition-colors hover:text-zinc-300 font-mono"
                                    style={{ color: 'var(--text-3)' }}
                                  >
                                    {expandedMsgs.has(responseKey) ? '▲ show less' : '▼ show more'}
                                  </button>
                                )}
                              </div>
                            )}

                            {/* Verdict footer */}
                            {turn.verdict && (
                              <div className="flex items-start justify-between gap-2 pt-2" style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                                <div className="flex flex-col gap-1">
                                  <VerdictBadge verdict={turn.verdict} confidence={turn.confidence ?? undefined} size="xs" />
                                  <span className="leading-snug text-[11px]" style={{ color: 'var(--text-3)' }}>{turn.reason}</span>
                                </div>
                                <div className="flex flex-col items-end gap-0.5 shrink-0 font-mono text-[10px]" style={{ color: 'var(--text-3)' }}>
                                  {turn.elapsed_ms != null && <span>{turn.elapsed_ms}ms</span>}
                                  {turn.response_length != null && <span>{turn.response_length}c</span>}
                                </div>
                              </div>
                            )}
                          </motion.div>
                        )
                      })}
                    </AnimatePresence>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        <div ref={bottomRef} />
      </div>

      {/* Jump to bottom button */}
      <AnimatePresence>
        {showJumpBtn && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            className="fixed bottom-6 right-6"
          >
            <RippleButton
              onClick={jumpToBottom}
              className="px-3 py-2 rounded-lg text-xs font-mono transition-all hover:border-red-700/30"
              style={{
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                color: 'var(--text-2)',
                boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
              }}
            >
              ↓ Jump to bottom
            </RippleButton>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
