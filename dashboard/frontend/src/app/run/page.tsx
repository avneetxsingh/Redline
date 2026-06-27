'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { VerdictBadge, VERDICT_BG } from '../components/VerdictBadge'
import { RippleButton } from '../components/RippleButton'
import { API } from '../lib/api'

// ── Types ─────────────────────────────────────────────────────────────────────

type WsEvent =
  | { type: 'attempt';       category: string; model: string; attempt: number; attacker_msg: string }
  | { type: 'response';      category: string; model: string; attempt: number; model_response: string; verdict: string; reason: string; confidence?: number | null; elapsed_ms?: number | null; response_length?: number | null }
  | { type: 'category_done'; category: string; results: Record<string, { verdict: string; attempt: number; reason: string }> }
  | { type: 'complete';      results: Record<string, Record<string, unknown>> }
  | { type: 'error';         message: string }

type Turn = {
  attempt: number
  attacker_msg?: string
  model_response?: string
  verdict?: string
  reason?: string
  confidence?: number | null
  elapsed_ms?: number | null
  response_length?: number | null
}

type Stream = Record<string, Turn[]>

const CATEGORIES = [
  { key: 'prompt_injection',      label: 'Prompt Injection',      icon: '⌗' },
  { key: 'hallucination_trigger', label: 'Hallucination Trigger',  icon: '◈' },
  { key: 'jailbreak',             label: 'Jailbreak',              icon: '⚡' },
  { key: 'context_confusion',     label: 'Context Confusion',      icon: '⊕' },
  { key: 'over_refusal_bait',     label: 'Over-Refusal Bait',      icon: '⊘' },
]

const MODEL_LABELS: Record<string, string> = {
  groq:      'Groq / Llama 3.3',
  gemini:    'Gemini Flash',
  openai:    'GPT-4o-mini',
  anthropic: 'Claude 3.5 Haiku',
  deepseek:  'DeepSeek Chat',
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function RunPage() {
  const router    = useRouter()
  const bottomRef = useRef<HTMLDivElement>(null)

  const [stream, setStream]                 = useState<Stream>({})
  const [status, setStatus]                 = useState<'connecting' | 'running' | 'done' | 'error'>('connecting')
  const [errorMsg, setErrorMsg]             = useState<string | null>(null)
  const [doneCategories, setDoneCategories] = useState<Set<string>>(new Set())
  const [activeCategory, setActiveCategory] = useState<string | null>(null)
  const [expanded, setExpanded]             = useState<Set<string>>(new Set())
  const [models, setModels]                 = useState<string[]>(['groq', 'gemini'])

  useEffect(() => {
    const systemPrompt  = sessionStorage.getItem('redline_system_prompt')
    const attacksRaw    = sessionStorage.getItem('redline_attacks')

    if (!systemPrompt || !attacksRaw) { router.replace('/'); return }

    const attacks        = JSON.parse(attacksRaw)
    const selectedModels: string[] = JSON.parse(sessionStorage.getItem('redline_selected_models') || '["groq","gemini"]')
    const apiKeysRaw     = sessionStorage.getItem('redline_api_keys')
    const apiKeys        = apiKeysRaw ? JSON.parse(apiKeysRaw) : {}

    setModels(selectedModels)

    const ws = new WebSocket(API.wsRun)

    ws.onopen = () => {
      setStatus('running')
      ws.send(JSON.stringify({
        system_prompt:    systemPrompt,
        attacks,
        selected_models:  selectedModels,
        groq_api_key:     apiKeys.groq_api_key     || undefined,
        gemini_api_key:   apiKeys.gemini_api_key   || undefined,
        openai_api_key:   apiKeys.openai_api_key   || undefined,
        anthropic_api_key: apiKeys.anthropic_api_key || undefined,
        deepseek_api_key: apiKeys.deepseek_api_key || undefined,
      }))
    }

    ws.onmessage = (e) => {
      const event: WsEvent = JSON.parse(e.data)

      if (event.type === 'attempt') {
        const key = `${event.category}::${event.model}`
        setExpanded(prev => { const n = new Set(prev); n.add(event.category); return n })
        setActiveCategory(event.category)
        setStream(prev => {
          const existing = prev[key] ?? []
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
            updated[idx] = { ...updated[idx], model_response: event.model_response, verdict: event.verdict, reason: event.reason, confidence: event.confidence, elapsed_ms: event.elapsed_ms, response_length: event.response_length }
            return { ...prev, [key]: updated }
          }
          return { ...prev, [key]: [...existing, { attempt: event.attempt, model_response: event.model_response, verdict: event.verdict, reason: event.reason, confidence: event.confidence }] }
        })
      }

      if (event.type === 'category_done') {
        setDoneCategories(prev => { const n = new Set(prev); n.add(event.category); return n })
      }

      if (event.type === 'complete') {
        sessionStorage.setItem('redline_results', JSON.stringify(event.results))
        setStatus('done')
        setActiveCategory(null)
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

  const doneCount = doneCategories.size

  // Dynamic grid class based on model count
  const gridClass = models.length === 1
    ? 'grid-cols-1 max-w-md'
    : models.length === 2
      ? 'grid-cols-1 md:grid-cols-2'
      : models.length <= 4
        ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3'
        : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5'

  return (
    <div className="max-w-7xl mx-auto w-full px-6 py-8 flex flex-col gap-6">

      {/* Header row */}
      <motion.div
        initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        className="flex items-start justify-between gap-4"
      >
        <div className="flex flex-col gap-2">
          <h1 className="text-xl font-black font-mono uppercase tracking-tight" style={{ color: 'var(--text-1)' }}>
            Overview <span className="text-red-500">Probe</span>
          </h1>
          <p className="text-sm font-mono" style={{ color: 'var(--text-3)' }}>
            {status === 'connecting' && 'Connecting to backend…'}
            {status === 'running' && (activeCategory
              ? <span>Running <span className="text-zinc-400">{activeCategory.replace(/_/g, ' ')}</span>…</span>
              : 'Preparing…')}
            {status === 'done'  && 'All probes complete.'}
            {status === 'error' && (errorMsg ?? 'Unknown error')}
          </p>
        </div>

        <AnimatePresence>
          {status === 'done' && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
              transition={{ type: 'spring', stiffness: 300, damping: 24 }}
            >
              <RippleButton
                onClick={() => router.push('/results')}
                className="btn-primary px-5 py-2.5 rounded-lg text-white text-sm font-bold font-mono shrink-0"
                style={{ background: 'linear-gradient(135deg, #ff1744 0%, #c41230 100%)', boxShadow: '0 4px 24px rgba(255,23,68,0.35)' }}
              >
                View Results →
              </RippleButton>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* Overall progress */}
      <motion.div
        initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.06, ease: [0.16, 1, 0.3, 1] }}
        className="flex flex-col gap-2"
      >
        <div className="flex items-center justify-between text-xs font-mono" style={{ color: 'var(--text-3)' }}>
          <span>{doneCount} / {CATEGORIES.length} categories · {models.length} model{models.length !== 1 ? 's' : ''}</span>
          {status === 'running' && (
            <span className="flex items-center gap-1.5 text-red-500">
              <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse-dot" />
              live
            </span>
          )}
        </div>

        <div className="relative h-1.5 rounded-full overflow-visible" style={{ background: 'var(--surface-2)' }}>
          <div
            className="h-full rounded-full transition-all duration-700 relative"
            style={{
              width: `${(doneCount / CATEGORIES.length) * 100}%`,
              background: 'linear-gradient(90deg, #ff1744, #ff1744)',
              boxShadow: status === 'running' ? '0 0 8px rgba(255,23,68,0.5)' : 'none',
            }}
          >
            {status === 'running' && doneCount > 0 && (
              <span
                className="absolute right-0 top-1/2 -translate-y-1/2 h-2.5 w-2.5 rounded-full bg-red-400 animate-glow-pulse"
                style={{ boxShadow: '0 0 6px 2px rgba(239,68,68,0.7)', transform: 'translate(50%, -50%)' }}
              />
            )}
          </div>
        </div>

        <div className="flex gap-1.5 items-center">
          {CATEGORIES.map(({ key, label }) => {
            const done   = doneCategories.has(key)
            const active = activeCategory === key
            return (
              <div key={key} className="flex-1 flex flex-col gap-1" title={label}>
                <div
                  className={`h-0.5 rounded-full transition-all duration-300 ${active ? 'animate-progress-pulse' : ''}`}
                  style={{ background: done ? '#22c55e' : active ? '#ff1744' : 'var(--surface-2)' }}
                />
              </div>
            )
          })}
        </div>
      </motion.div>

      {/* Category sections */}
      {CATEGORIES.map(({ key, label, icon }, catIdx) => {
        const isExpanded = expanded.has(key)
        const isDone     = doneCategories.has(key)
        const isActive   = activeCategory === key

        const catVerdicts = models.map(m => {
          const turns = stream[`${key}::${m}`] ?? []
          return turns[turns.length - 1]?.verdict
        }).filter(Boolean) as string[]

        const cracked = catVerdicts.some(v => v !== 'PASSED' && v !== 'ERROR')

        return (
          <motion.section
            key={key}
            initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
            transition={{ delay: catIdx * 0.04, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
            className="rounded-xl overflow-hidden"
            style={{
              background: 'var(--surface)',
              border: isActive
                ? '1px solid rgba(255,23,68,0.3)'
                : isDone && cracked
                  ? '1px solid rgba(255,23,68,0.2)'
                  : isDone
                    ? '1px solid rgba(34,197,94,0.15)'
                    : '1px solid var(--border)',
              boxShadow: isActive ? '0 0 30px rgba(255,23,68,0.08)' : 'none',
              transition: 'box-shadow 0.3s ease, border-color 0.3s ease',
            }}
          >
            {/* Section header */}
            <RippleButton
              onClick={() => setExpanded(prev => {
                const n = new Set(prev)
                if (n.has(key)) n.delete(key); else n.add(key)
                return n
              })}
              className="w-full flex items-center justify-between px-4 py-3.5 transition-colors hover:bg-white/[0.02]"
            >
              <div className="flex items-center gap-3">
                <span className="relative flex items-center justify-center shrink-0">
                  <span className={`h-2 w-2 rounded-full transition-all duration-300 ${
                    isDone
                      ? cracked ? 'bg-red-500 shadow-[0_0_6px_rgba(255,23,68,0.5)]' : 'bg-emerald-500 shadow-[0_0_6px_rgba(34,197,94,0.4)]'
                      : isActive ? 'bg-red-500 animate-pulse-dot'
                      : ''
                  }`}
                  style={{ background: !isDone && !isActive ? 'var(--text-3)' : undefined }}
                  />
                  {isActive && <span className="absolute h-3 w-3 rounded-full border border-red-500/50 animate-radar-ping" />}
                </span>

                <span className="text-red-500/50 font-mono text-sm w-5 shrink-0">{icon}</span>
                <span className="text-xs font-mono uppercase tracking-widest font-semibold" style={{ color: 'var(--text-2)' }}>
                  {label}
                </span>

                {isDone && catVerdicts.length > 0 && (
                  <div className="flex gap-1.5">
                    {catVerdicts.map((v, i) => <VerdictBadge key={i} verdict={v} size="xs" />)}
                  </div>
                )}
                {isActive && <span className="text-[10px] font-mono text-red-500/70 animate-pulse-dot">probing…</span>}
              </div>
              <span className={`text-xs transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} style={{ color: 'var(--text-3)' }}>
                ▾
              </span>
            </RippleButton>

            {/* Section content */}
            <AnimatePresence>
              {isExpanded && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                  className="overflow-hidden"
                >
                  <div className="p-4" style={{ borderTop: '1px solid var(--border)' }}>
                    <div className={`grid ${gridClass} gap-4`}>
                      {models.map(model => {
                        const streamKey = `${key}::${model}`
                        const turns     = stream[streamKey] ?? []
                        return (
                          <div key={model} className="flex flex-col gap-2">
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] font-mono uppercase tracking-wider font-bold" style={{ color: 'var(--text-3)' }}>
                                {MODEL_LABELS[model] ?? model}
                              </span>
                              {turns.length > 0 && (
                                <span className="text-[10px] font-mono" style={{ color: 'var(--text-3)' }}>
                                  {turns.length} turns
                                </span>
                              )}
                            </div>

                            {turns.length === 0 ? (
                              <div className="flex items-center gap-1.5 px-3 py-2 rounded-lg" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                                <span className="h-1 w-1 rounded-full bg-zinc-700 animate-pulse-dot" />
                                <span className="text-xs font-mono" style={{ color: 'var(--text-3)' }}>Waiting…</span>
                              </div>
                            ) : (
                              turns.map((turn, i) => {
                                const bgCls  = turn.verdict ? (VERDICT_BG[turn.verdict] ?? '') : ''
                                const isAct  = !turn.verdict && status === 'running'
                                return (
                                  <motion.div
                                    key={turn.attempt}
                                    initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: i * 0.04, type: 'spring', stiffness: 300, damping: 30 }}
                                    className={`rounded-lg border p-3 flex flex-col gap-2 text-xs transition-all ${bgCls}`}
                                    style={!bgCls ? {
                                      background: 'var(--surface-2)',
                                      border: `1px solid ${isAct ? 'rgba(255,23,68,0.2)' : 'var(--border)'}`,
                                    } : undefined}
                                  >
                                    <div className="flex items-center justify-between">
                                      <span className="font-mono text-[10px] font-bold" style={{ color: 'var(--text-3)' }}>#{turn.attempt}</span>
                                      {isAct && <span className="text-[10px] font-mono text-red-500/60 animate-pulse-dot">live</span>}
                                    </div>

                                    {turn.attacker_msg && (
                                      <div>
                                        <span className="text-[10px] uppercase tracking-wider font-mono" style={{ color: 'var(--text-3)' }}>attacker</span>
                                        <p className="mt-0.5 leading-relaxed line-clamp-2 whitespace-pre-wrap" style={{ color: 'var(--text-2)' }}>
                                          {turn.attacker_msg}
                                          {isAct && <span className="inline-block ml-0.5 w-px h-3 bg-red-400 animate-pulse-dot align-middle">|</span>}
                                        </p>
                                      </div>
                                    )}

                                    {turn.model_response && (
                                      <div className="pt-1.5" style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                                        <span className="text-[10px] uppercase tracking-wider font-mono" style={{ color: 'var(--text-3)' }}>
                                          {MODEL_LABELS[model] ?? model}
                                        </span>
                                        <p className="mt-0.5 leading-relaxed line-clamp-2 whitespace-pre-wrap text-zinc-300">
                                          {turn.model_response}
                                        </p>
                                      </div>
                                    )}

                                    {turn.verdict && (
                                      <div className="flex items-start justify-between gap-2 pt-1.5" style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                                        <div className="flex flex-col gap-0.5">
                                          <VerdictBadge verdict={turn.verdict} confidence={turn.confidence ?? undefined} size="xs" />
                                          <span className="text-[11px] leading-snug" style={{ color: 'var(--text-3)' }}>{turn.reason}</span>
                                        </div>
                                        {(turn.elapsed_ms != null || turn.response_length != null) && (
                                          <span className="font-mono text-[10px] shrink-0 text-right" style={{ color: 'var(--text-3)' }}>
                                            {turn.elapsed_ms != null && <span className="block">{turn.elapsed_ms}ms</span>}
                                            {turn.response_length != null && <span className="block">{turn.response_length}c</span>}
                                          </span>
                                        )}
                                      </div>
                                    )}
                                  </motion.div>
                                )
                              })
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.section>
        )
      })}

      <div ref={bottomRef} />
    </div>
  )
}
