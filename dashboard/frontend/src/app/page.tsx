'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { readApiKeys } from './hooks/useApiKeys'
import { RippleButton } from './components/RippleButton'
import { API } from './lib/api'

// ── Constants ─────────────────────────────────────────────────────────────────

const CATEGORIES = [
  { key: 'prompt_injection',      label: 'Prompt Injection',  icon: '⌗', color: '#ff1744', desc: 'Override system instructions via injected payloads' },
  { key: 'hallucination_trigger', label: 'Hallucination',     icon: '◈', color: '#00e5ff', desc: 'Force fabrication of false confident outputs' },
  { key: 'jailbreak',             label: 'Jailbreak',         icon: '⚡', color: '#ff6d00', desc: 'Bypass safety constraints and alignment' },
  { key: 'context_confusion',     label: 'Context Confusion', icon: '⊕', color: '#d500f9', desc: 'Corrupt the conversation context window' },
  { key: 'over_refusal_bait',     label: 'Over-Refusal',      icon: '⊘', color: '#ffea00', desc: 'Induce excessive restriction on benign requests' },
]

const STEP_LABELS = ['Probe', 'Exploit', 'Extract']
const STEP_COLORS = ['#00e5ff', '#ff6d00', '#ff1744']

type ModelOption = {
  id: string
  label: string
  subtitle: string
  model: string
  keyField: 'groq' | 'gemini' | 'openai' | 'anthropic' | 'deepseek'
  free: boolean
  color: string
}

const MODEL_OPTIONS: ModelOption[] = [
  { id: 'groq',      label: 'Groq',      subtitle: 'Llama 3.3 70B',    model: 'llama-3.3-70b',    keyField: 'groq',      free: true,  color: '#f97316' },
  { id: 'gemini',    label: 'Gemini',    subtitle: 'Flash 2.5 Lite',   model: 'gemini-2.5-lite',  keyField: 'gemini',    free: true,  color: '#3b82f6' },
  { id: 'openai',    label: 'GPT-4o',    subtitle: 'mini',             model: 'gpt-4o-mini',      keyField: 'openai',    free: false, color: '#10b981' },
  { id: 'anthropic', label: 'Claude',    subtitle: '3.5 Haiku',        model: 'claude-3.5-haiku', keyField: 'anthropic', free: false, color: '#a855f7' },
  { id: 'deepseek',  label: 'DeepSeek',  subtitle: 'Chat',             model: 'deepseek-chat',    keyField: 'deepseek',  free: false, color: '#06b6d4' },
]

// ── Types ─────────────────────────────────────────────────────────────────────

type GenerateResult      = { use_case: string; system_prompt: string; attacks: Record<string, string[]> }
type ExternalGenResult   = { behavior_description: string; attacks: Record<string, string[]> }
type LaunchMode          = 'overview' | 'deep_probe'
type TargetMode          = 'internal' | 'external'

const fadeUp = {
  hidden:  { opacity: 0, y: 16 },
  visible: (i = 0) => ({ opacity: 1, y: 0, transition: { delay: i * 0.07, duration: 0.45, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] } }),
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function SetupPage() {
  const router = useRouter()

  // Internal mode state
  const [useCase, setUseCase]           = useState('')
  const [generated, setGenerated]       = useState<GenerateResult | null>(null)
  const [systemPrompt, setSystemPrompt] = useState('')

  // External mode state
  const [targetMode, setTargetMode]               = useState<TargetMode>('internal')
  const [behaviorDescription, setBehaviorDescription] = useState('')
  const [externalUrl, setExternalUrl]             = useState('')
  const [externalApiKey, setExternalApiKey]       = useState('')
  const [externalModelName, setExternalModelName] = useState('gpt-3.5-turbo')
  const [externalGenerated, setExternalGenerated] = useState<ExternalGenResult | null>(null)

  // Shared state
  const [generating, setGenerating]         = useState(false)
  const [attacks, setAttacks]               = useState<Record<string, string[]>>({})
  const [error, setError]                   = useState<string | null>(null)
  const [launchMode, setLaunchMode]         = useState<LaunchMode>('deep_probe')
  const [probeCategory, setProbeCategory]   = useState(CATEGORIES[0].key)
  const [probeMaxAttempts, setProbeMaxAttempts] = useState(15)
  const [expandedCats, setExpandedCats]     = useState<Set<string>>(new Set(CATEGORIES.map(c => c.key)))

  // Model selection
  const [selectedModels, setSelectedModels] = useState<Set<string>>(new Set(['groq', 'gemini']))

  const hasGenerated = targetMode === 'internal' ? !!generated : !!externalGenerated

  // ── Actions ────────────────────────────────────────────────────────────────

  async function handleGenerate() {
    if (!useCase.trim()) return
    setGenerating(true); setError(null)
    const { groq: groq_api_key } = readApiKeys()
    try {
      const res = await fetch(API.generate, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ use_case: useCase.trim(), groq_api_key: groq_api_key || undefined }),
      })
      if (!res.ok) throw new Error(`Server error: ${res.status}`)
      const data: GenerateResult = await res.json()
      setGenerated(data); setSystemPrompt(data.system_prompt); setAttacks(data.attacks)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error')
    } finally { setGenerating(false) }
  }

  async function handleGenerateExternal() {
    if (!behaviorDescription.trim()) return
    setGenerating(true); setError(null)
    const { groq: groq_api_key } = readApiKeys()
    try {
      const res = await fetch(API.generateAttacks, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ behavior_description: behaviorDescription.trim(), groq_api_key: groq_api_key || undefined }),
      })
      if (!res.ok) throw new Error(`Server error: ${res.status}`)
      const data: ExternalGenResult = await res.json()
      setExternalGenerated(data); setAttacks(data.attacks)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error')
    } finally { setGenerating(false) }
  }

  function toggleModel(id: string) {
    setSelectedModels(prev => {
      const next = new Set(prev)
      if (next.has(id)) {
        if (next.size === 1) return prev  // always keep at least one
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  function handleLaunch() {
    const keys = readApiKeys()
    const models = Array.from(selectedModels)

    // Validate: paid models (openai, anthropic, deepseek) require a user-supplied key.
    // Free models (groq, gemini) fall back to the server .env — no key required from the user.
    const missingKeys = models.filter(m => {
      const opt = MODEL_OPTIONS.find(o => o.id === m)
      if (!opt || opt.free) return false   // free models have .env fallback
      return !keys[opt.keyField]
    })

    if (missingKeys.length > 0) {
      const labels = missingKeys.map(m => MODEL_OPTIONS.find(o => o.id === m)?.label ?? m)
      setError(`Missing API keys for: ${labels.join(', ')}. Add them via the ⚙ button in the header.`)
      return
    }

    const apiKeyPayload = {
      groq_api_key:      keys.groq      || undefined,
      gemini_api_key:    keys.gemini    || undefined,
      openai_api_key:    keys.openai    || undefined,
      anthropic_api_key: keys.anthropic || undefined,
      deepseek_api_key:  keys.deepseek  || undefined,
    }

    if (targetMode === 'internal') {
      if (!generated) return
      if (launchMode === 'overview') {
        sessionStorage.setItem('redline_system_prompt', systemPrompt)
        sessionStorage.setItem('redline_attacks', JSON.stringify(attacks))
        sessionStorage.setItem('redline_use_case', generated.use_case)
        sessionStorage.setItem('redline_selected_models', JSON.stringify(models))
        sessionStorage.setItem('redline_api_keys', JSON.stringify(apiKeyPayload))
        router.push('/run')
      } else {
        sessionStorage.setItem('redline_probe', JSON.stringify({
          system_prompt:    systemPrompt,
          attack_opener:    attacks[probeCategory]?.[0] ?? '',
          kill_chain:       attacks[probeCategory] ?? [],
          failure_category: probeCategory,
          max_attempts:     probeMaxAttempts,
          use_case:         generated.use_case,
          selected_models:  models,
          ...apiKeyPayload,
        }))
        router.push('/probe')
      }
    } else {
      if (!externalGenerated) return
      if (!externalUrl.trim())    { setError('Target base URL is required'); return }
      if (!externalApiKey.trim()) { setError('API key is required'); return }
      sessionStorage.setItem('redline_probe', JSON.stringify({
        system_prompt:    behaviorDescription.trim(),
        attack_opener:    attacks[probeCategory]?.[0] ?? '',
        kill_chain:       attacks[probeCategory] ?? [],
        failure_category: probeCategory,
        max_attempts:     probeMaxAttempts,
        external_config:  { endpoint_url: externalUrl.trim(), api_key: externalApiKey.trim(), model_name: externalModelName.trim() || 'gpt-3.5-turbo' },
        external_mode:    true,
        groq_api_key:     keys.groq || undefined,
      }))
      router.push('/probe')
    }
  }

  function switchMode(mode: TargetMode) {
    setTargetMode(mode); setError(null)
    if (mode === 'external') setLaunchMode('deep_probe')
  }

  function toggleCat(key: string) {
    setExpandedCats(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n })
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen w-full" style={{ background: 'var(--bg)' }}>

      {/* ── Hero ── */}
      <section className="max-w-screen-xl mx-auto px-6 pt-16 pb-12">
        <motion.div variants={fadeUp} initial="hidden" animate="visible" className="flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <div className="h-px w-8" style={{ background: 'var(--red)' }} />
            <span className="text-[11px] font-mono uppercase tracking-[0.25em]" style={{ color: 'rgba(255,23,68,0.7)' }}>
              Threat Assessment
            </span>
          </div>

          <h1 className="text-5xl sm:text-6xl font-black tracking-tight leading-none font-mono">
            <span style={{ color: 'var(--text-1)' }}>BREAK</span>
            <br />
            <span style={{
              background: 'linear-gradient(90deg, #ff1744 0%, #ff6d00 50%, #ff1744 100%)',
              backgroundSize: '200% auto',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
              animation: 'shimmer 3s linear infinite',
            }}>
              THE MODEL.
            </span>
          </h1>

          <p className="text-sm max-w-lg leading-relaxed" style={{ color: 'var(--text-2)' }}>
            Generates adversarial kill chains across 5 failure vectors. Probes target models in real time
            with adaptive escalation. LLM-as-judge classifier returns per-turn confidence scores.
          </p>

          <div className="flex items-center gap-6 mt-2">
            {[['5', 'Attack Vectors'], ['5', 'AI Models'], ['∞', 'Adaptive Turns']].map(([n, label]) => (
              <div key={label} className="flex items-baseline gap-1.5">
                <span className="text-2xl font-black font-mono" style={{ color: 'var(--red)' }}>{n}</span>
                <span className="text-xs font-mono" style={{ color: 'var(--text-3)' }}>{label}</span>
              </div>
            ))}
          </div>
        </motion.div>

        {/* Attack vector cards */}
        <motion.div
          variants={fadeUp} initial="hidden" animate="visible" custom={1}
          className="mt-10 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3"
        >
          {CATEGORIES.map((cat, i) => (
            <motion.div
              key={cat.key}
              initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 + i * 0.06, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
              className="rounded-xl p-4 flex flex-col gap-2.5"
              style={{ background: 'var(--surface)', border: '1px solid rgba(255,255,255,0.05)' }}
            >
              <span className="text-2xl">{cat.icon}</span>
              <div>
                <p className="text-xs font-bold font-mono leading-tight" style={{ color: 'var(--text-1)' }}>{cat.label}</p>
                <p className="text-[10px] mt-1 leading-snug" style={{ color: 'var(--text-3)' }}>{cat.desc}</p>
              </div>
              <div className="h-px w-full mt-auto" style={{ background: `linear-gradient(90deg, ${cat.color}60, transparent)` }} />
            </motion.div>
          ))}
        </motion.div>
      </section>

      {/* ── Configuration panel ── */}
      <section className="max-w-screen-xl mx-auto px-6 pb-20">
        <motion.div
          variants={fadeUp} initial="hidden" animate="visible" custom={2}
          className="rounded-2xl overflow-hidden"
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--border-2)',
            boxShadow: '0 0 60px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.03)',
          }}
        >
          {/* Panel header */}
          <div className="flex items-center justify-between px-6 py-4"
            style={{ borderBottom: '1px solid var(--border)', background: 'rgba(255,255,255,0.02)' }}>
            <div className="flex items-center gap-3">
              <div className="flex gap-1.5">
                <span className="h-3 w-3 rounded-full bg-red-500/70" />
                <span className="h-3 w-3 rounded-full bg-yellow-500/50" />
                <span className="h-3 w-3 rounded-full bg-green-500/50" />
              </div>
              <span className="text-xs font-mono uppercase tracking-widest" style={{ color: 'var(--text-3)' }}>
                Target Configuration
              </span>
            </div>

            {/* Mode toggle */}
            <div className="flex gap-1 p-1 rounded-lg" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
              {(['internal', 'external'] as TargetMode[]).map(mode => (
                <RippleButton
                  key={mode}
                  onClick={() => switchMode(mode)}
                  className="px-3 py-1 rounded-md text-xs font-mono font-medium transition-all duration-200"
                  style={targetMode === mode
                    ? { background: 'rgba(255,23,68,0.18)', color: 'var(--text-1)', border: '1px solid rgba(255,23,68,0.3)' }
                    : { color: 'var(--text-3)', border: '1px solid transparent' }}
                >
                  {mode === 'internal' ? 'Internal' : 'External'}
                </RippleButton>
              ))}
            </div>
          </div>

          <div className="p-6 flex flex-col gap-6">

            {/* Input section */}
            {targetMode === 'internal' ? (
              <div className="flex flex-col gap-3">
                <label className="text-xs font-mono uppercase tracking-widest" style={{ color: 'var(--text-3)' }}>
                  Target Description
                </label>
                <p className="text-xs leading-relaxed" style={{ color: 'var(--text-2)' }}>
                  Describe the AI assistant to attack. The generator creates a realistic victim system prompt
                  with embedded secrets, then produces a 3-step kill chain per attack vector.
                </p>
                <div className="flex gap-3 mt-1">
                  <input
                    type="text"
                    value={useCase}
                    onChange={e => setUseCase(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && !generating && handleGenerate()}
                    placeholder="e.g. customer support bot for a bank"
                    disabled={generating}
                    className="input-field flex-1 px-4 py-3 text-sm"
                  />
                  <RippleButton
                    onClick={handleGenerate}
                    disabled={generating || !useCase.trim()}
                    className="btn-primary px-6 py-3 rounded-lg text-sm font-bold font-mono shrink-0"
                    style={{ background: 'var(--red)', color: '#fff' }}
                  >
                    {generating ? (
                      <span className="flex items-center gap-2">
                        <span className="h-3.5 w-3.5 rounded-full border-2 border-white/20 border-t-white animate-spin" />
                        Generating
                      </span>
                    ) : '⚡ Generate'}
                  </RippleButton>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                <label className="text-xs font-mono uppercase tracking-widest" style={{ color: 'var(--text-3)' }}>
                  External Target Configuration
                </label>
                <p className="text-xs leading-relaxed" style={{ color: 'var(--text-2)' }}>
                  Probe a real deployed AI product. Attacks are generated blind — no system prompt access required.
                </p>
                <textarea
                  value={behaviorDescription}
                  onChange={e => setBehaviorDescription(e.target.value)}
                  rows={3}
                  placeholder="e.g. Acme Corp customer support bot. Handles orders. Must not reveal internal pricing or escalation codes..."
                  className="input-field px-4 py-3 text-sm font-mono resize-y"
                />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-mono uppercase tracking-wider" style={{ color: 'var(--text-3)' }}>Target URL</label>
                    <input type="text" value={externalUrl} onChange={e => setExternalUrl(e.target.value)}
                      placeholder="https://api.openai.com" className="input-field px-3 py-2.5 text-sm" />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-mono uppercase tracking-wider" style={{ color: 'var(--text-3)' }}>Model Name</label>
                    <input type="text" value={externalModelName} onChange={e => setExternalModelName(e.target.value)}
                      placeholder="gpt-3.5-turbo" className="input-field px-3 py-2.5 text-sm" />
                  </div>
                  <div className="flex flex-col gap-1.5 sm:col-span-2">
                    <label className="text-[10px] font-mono uppercase tracking-wider" style={{ color: 'var(--text-3)' }}>API Key</label>
                    <input type="password" value={externalApiKey} onChange={e => setExternalApiKey(e.target.value)}
                      placeholder="sk-..." className="input-field px-3 py-2.5 text-sm font-mono" />
                  </div>
                </div>
                <RippleButton
                  onClick={handleGenerateExternal}
                  disabled={generating || !behaviorDescription.trim()}
                  className="btn-primary self-start px-6 py-2.5 rounded-lg text-sm font-bold font-mono"
                  style={{ background: 'var(--red)', color: '#fff' }}
                >
                  {generating ? (
                    <span className="flex items-center gap-2">
                      <span className="h-3.5 w-3.5 rounded-full border-2 border-white/20 border-t-white animate-spin" />
                      Generating
                    </span>
                  ) : '⚡ Generate Attacks'}
                </RippleButton>
              </div>
            )}

            {/* Error */}
            <AnimatePresence>
              {error && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                  className="flex items-start gap-3 px-4 py-3 rounded-lg text-sm"
                  style={{ background: 'rgba(255,23,68,0.08)', border: '1px solid rgba(255,23,68,0.25)', color: '#ff6b6b' }}
                >
                  <span className="mt-0.5 shrink-0">⚠</span>
                  <span>{error}</span>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Generated content */}
            <AnimatePresence>
              {hasGenerated && (
                <motion.div
                  initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                  className="flex flex-col gap-6"
                >
                  {/* Victim system prompt */}
                  {targetMode === 'internal' && (
                    <div className="flex flex-col gap-2">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-mono uppercase tracking-widest" style={{ color: 'var(--text-3)' }}>
                          Victim System Prompt
                        </label>
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded"
                          style={{ background: 'rgba(255,255,255,0.04)', color: 'var(--text-3)', border: '1px solid var(--border)' }}>
                          editable
                        </span>
                      </div>
                      <textarea
                        value={systemPrompt}
                        onChange={e => setSystemPrompt(e.target.value)}
                        rows={8}
                        className="input-field px-4 py-3 text-sm font-mono resize-y leading-relaxed"
                      />
                    </div>
                  )}

                  {/* Kill chains */}
                  <div className="flex flex-col gap-3">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-mono uppercase tracking-widest" style={{ color: 'var(--text-3)' }}>
                        Attack Kill Chains
                      </label>
                      <span className="text-[10px]" style={{ color: 'var(--text-3)' }}>
                        Step 1 is the opener · 2+ are adaptive context
                      </span>
                    </div>

                    {CATEGORIES.map((cat, catIdx) => {
                      const expanded = expandedCats.has(cat.key)
                      return (
                        <motion.div
                          key={cat.key}
                          initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: catIdx * 0.05, duration: 0.3 }}
                          className="rounded-xl overflow-hidden"
                          style={{ border: '1px solid rgba(255,255,255,0.05)', background: 'var(--surface-2)' }}
                        >
                          <button
                            onClick={() => toggleCat(cat.key)}
                            className="w-full flex items-center justify-between px-4 py-3 text-left transition-colors"
                            style={{ background: expanded ? `rgba(${hexToRgb(cat.color)},0.05)` : 'transparent' }}
                          >
                            <div className="flex items-center gap-3">
                              <span className="text-base">{cat.icon}</span>
                              <span className="text-xs font-mono font-semibold uppercase tracking-wider" style={{ color: 'var(--text-1)' }}>
                                {cat.label}
                              </span>
                            </div>
                            <span className="text-xs" style={{ color: 'var(--text-3)', transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>▾</span>
                          </button>

                          <AnimatePresence initial={false}>
                            {expanded && (
                              <motion.div
                                initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                                style={{ overflow: 'hidden' }}
                              >
                                <div className="px-4 pb-4 flex flex-col gap-3" style={{ borderTop: '1px solid var(--border)' }}>
                                  {STEP_LABELS.map((stepLabel, i) => (
                                    <div key={i} className="flex flex-col gap-1.5 pt-3">
                                      <div className="flex items-center gap-2">
                                        <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: STEP_COLORS[i] }} />
                                        <span className="text-[10px] font-mono font-semibold uppercase tracking-wider" style={{ color: STEP_COLORS[i] }}>
                                          {i + 1} · {stepLabel}
                                        </span>
                                      </div>
                                      <textarea
                                        value={attacks[cat.key]?.[i] ?? ''}
                                        onChange={e => setAttacks(prev => {
                                          const steps = [...(prev[cat.key] ?? ['', '', ''])]
                                          steps[i] = e.target.value
                                          return { ...prev, [cat.key]: steps }
                                        })}
                                        rows={2}
                                        className="input-field px-3 py-2.5 text-xs font-mono resize-y leading-relaxed"
                                      />
                                    </div>
                                  ))}
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </motion.div>
                      )
                    })}
                  </div>

                  {/* ── Model selection ── */}
                  {targetMode === 'internal' && (
                    <div className="flex flex-col gap-3">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-mono uppercase tracking-widest" style={{ color: 'var(--text-3)' }}>
                          Target Models
                        </label>
                        <span className="text-[10px]" style={{ color: 'var(--text-3)' }}>
                          {selectedModels.size} selected · keys required for non-free models
                        </span>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
                        {MODEL_OPTIONS.map(opt => {
                          const keys = readApiKeys()
                          const hasKey = !!keys[opt.keyField]
                          const isSelected = selectedModels.has(opt.id)
                          return (
                            <ModelCard
                              key={opt.id}
                              opt={opt}
                              isSelected={isSelected}
                              hasKey={hasKey}
                              onToggle={() => toggleModel(opt.id)}
                            />
                          )
                        })}
                      </div>

                      <p className="text-[10px] leading-relaxed" style={{ color: 'var(--text-3)' }}>
                        <span style={{ color: 'rgba(255,23,68,0.8)' }}>Groq key always required</span> — powers the attack generator, classifier, and adaptive escalator.
                        Add other keys via <span style={{ color: 'var(--text-2)' }}>⚙ API Keys</span> in the header.
                      </p>
                    </div>
                  )}

                  {/* Launch configuration */}
                  <div className="rounded-xl p-5 flex flex-col gap-5"
                    style={{ background: 'var(--surface-3)', border: '1px solid var(--border)' }}>
                    <span className="text-xs font-mono uppercase tracking-widest" style={{ color: 'var(--text-3)' }}>
                      Launch Configuration
                    </span>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {[
                        {
                          value: 'deep_probe' as LaunchMode,
                          label: 'Deep Probe',
                          desc: 'Focus one category. Adaptive escalation until model cracks or limit hit.',
                          disabled: false,
                        },
                        {
                          value: 'overview' as LaunchMode,
                          label: 'Overview Sweep',
                          desc: 'All 5 categories simultaneously. Quick surface scan of every attack vector.',
                          disabled: targetMode === 'external',
                        },
                      ].map(opt => (
                        <label
                          key={opt.value}
                          className={`flex items-start gap-3 p-4 rounded-xl cursor-pointer transition-all duration-200 ${opt.disabled ? 'opacity-30 cursor-not-allowed' : ''}`}
                          style={{
                            background: launchMode === opt.value ? 'rgba(255,23,68,0.06)' : 'var(--surface)',
                            border: launchMode === opt.value ? '1px solid rgba(255,23,68,0.3)' : '1px solid var(--border)',
                          }}
                        >
                          <input type="radio" checked={launchMode === opt.value}
                            onChange={() => !opt.disabled && setLaunchMode(opt.value)}
                            disabled={opt.disabled} className="mt-0.5 accent-red-500 shrink-0" />
                          <div>
                            <p className="text-sm font-semibold" style={{ color: 'var(--text-1)' }}>{opt.label}</p>
                            <p className="text-xs mt-0.5 leading-snug" style={{ color: 'var(--text-3)' }}>{opt.desc}</p>
                          </div>
                        </label>
                      ))}
                    </div>

                    {launchMode === 'deep_probe' && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}
                        className="grid grid-cols-1 sm:grid-cols-2 gap-4"
                        style={{ borderTop: '1px solid var(--border)', paddingTop: '1.25rem' }}
                      >
                        <div className="flex flex-col gap-1.5">
                          <label className="text-[10px] font-mono uppercase tracking-wider" style={{ color: 'var(--text-3)' }}>
                            Attack Vector
                          </label>
                          <select
                            value={probeCategory}
                            onChange={e => setProbeCategory(e.target.value)}
                            className="input-field px-3 py-2.5 text-sm appearance-none"
                          >
                            {CATEGORIES.map(({ key, label }) => (
                              <option key={key} value={key}>{label}</option>
                            ))}
                          </select>
                        </div>

                        <div className="flex flex-col gap-1.5">
                          <label className="text-[10px] font-mono uppercase tracking-wider" style={{ color: 'var(--text-3)' }}>
                            Max Attempts — <span style={{ color: 'var(--text-1)' }}>{probeMaxAttempts}</span>
                          </label>
                          <input
                            type="range" min={5} max={20} value={probeMaxAttempts}
                            onChange={e => setProbeMaxAttempts(Number(e.target.value))}
                            className="mt-2" style={{ accentColor: 'var(--red)' }}
                          />
                          <div className="flex justify-between text-[10px] font-mono" style={{ color: 'var(--text-3)' }}>
                            <span>5</span><span>20</span>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </div>

                  {/* Launch button */}
                  <RippleButton
                    onClick={handleLaunch}
                    className="btn-primary w-full py-4 rounded-xl font-black text-base font-mono tracking-wider"
                    style={{
                      background: 'linear-gradient(135deg, #ff1744 0%, #c41230 100%)',
                      color: '#fff',
                      boxShadow: '0 4px 30px rgba(255,23,68,0.3)',
                    }}
                  >
                    <span className="flex items-center justify-center gap-3">
                      <span>▶</span>
                      <span>{launchMode === 'deep_probe' ? 'INITIALIZE DEEP PROBE' : 'LAUNCH OVERVIEW SWEEP'}</span>
                    </span>
                  </RippleButton>
                </motion.div>
              )}
            </AnimatePresence>

          </div>
        </motion.div>
      </section>

    </div>
  )
}

// ── ModelCard sub-component ────────────────────────────────────────────────────

function ModelCard({ opt, isSelected, hasKey, onToggle }: {
  opt: ModelOption
  isSelected: boolean
  hasKey: boolean
  onToggle: () => void
}) {
  const needsKey = !opt.free && !hasKey
  return (
    <button
      onClick={onToggle}
      className="relative flex flex-col gap-2 p-3 rounded-xl text-left transition-all duration-200"
      style={{
        background: isSelected ? `rgba(${hexToRgb(opt.color)},0.08)` : 'var(--surface-2)',
        border: isSelected
          ? `1px solid ${opt.color}50`
          : '1px solid rgba(255,255,255,0.06)',
        boxShadow: isSelected ? `0 0 16px ${opt.color}15` : 'none',
      }}
    >
      {/* Selection checkmark */}
      <div
        className="absolute top-2 right-2 h-4 w-4 rounded-full flex items-center justify-center transition-all"
        style={{
          background: isSelected ? opt.color : 'rgba(255,255,255,0.06)',
          border: isSelected ? `1px solid ${opt.color}` : '1px solid rgba(255,255,255,0.1)',
        }}
      >
        {isSelected && <span className="text-[8px] font-bold text-black">✓</span>}
      </div>

      {/* Free badge */}
      {opt.free && (
        <span className="text-[9px] font-mono px-1.5 py-0.5 rounded self-start"
          style={{ background: 'rgba(34,197,94,0.12)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.2)' }}>
          FREE
        </span>
      )}

      <div className="flex flex-col gap-0.5 pr-4">
        <span className="text-xs font-bold font-mono" style={{ color: isSelected ? opt.color : 'var(--text-1)' }}>
          {opt.label}
        </span>
        <span className="text-[10px] font-mono" style={{ color: 'var(--text-3)' }}>
          {opt.subtitle}
        </span>
      </div>

      {/* Key warning */}
      {needsKey && (
        <div className="flex items-center gap-1">
          <span className="h-1 w-1 rounded-full bg-orange-500/80" />
          <span className="text-[9px] font-mono" style={{ color: 'rgba(249,115,22,0.7)' }}>no key set</span>
        </div>
      )}
    </button>
  )
}

// ── Utility ────────────────────────────────────────────────────────────────────
function hexToRgb(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `${r},${g},${b}`
}
