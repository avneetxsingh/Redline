'use client'

import { useState } from 'react'
import type { ApiKeys } from '../hooks/useApiKeys'

export function ApiKeysModal({
  keys,
  onSave,
  onClose,
}: {
  keys: ApiKeys
  onSave: (keys: ApiKeys) => void
  onClose: () => void
}) {
  const [draft, setDraft] = useState<ApiKeys>(keys)
  const [saved, setSaved] = useState(false)
  const [visibility, setVisibility] = useState<Record<keyof ApiKeys, boolean>>({
    groq: false, gemini: false, openai: false, anthropic: false, deepseek: false,
  })

  function toggleShow(field: keyof ApiKeys) {
    setVisibility(v => ({ ...v, [field]: !v[field] }))
  }

  function handleSave() {
    onSave(draft)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div
        className="absolute inset-0 backdrop-blur-sm"
        style={{ background: 'rgba(0,0,0,0.75)' }}
        onClick={onClose}
      />

      {/* Panel */}
      <div
        className="animate-slide-in-right relative w-full max-w-sm flex flex-col h-full shadow-2xl"
        style={{ background: 'var(--surface)', borderLeft: '1px solid rgba(220,38,38,0.2)' }}
      >
        {/* Top accent */}
        <div className="h-[2px] w-full bg-gradient-to-r from-transparent via-red-600 to-transparent opacity-60" />

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid var(--border)' }}>
          <div>
            <p className="text-sm font-semibold" style={{ color: 'var(--text-1)' }}>API Keys</p>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-3)' }}>Stored locally — never sent to third parties</p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded text-xs leading-none transition-colors hover:text-white"
            style={{ color: 'var(--text-3)' }}
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-5 flex flex-col gap-5">

          {/* Required section */}
          <div className="flex flex-col gap-4">
            <SectionLabel text="Required — Generator & Escalator" />
            <KeyField
              label="Groq API Key"
              value={draft.groq}
              show={visibility.groq}
              placeholder="gsk_..."
              hint="Always required: powers the attack generator, classifier, and escalator."
              required
              onToggleShow={() => toggleShow('groq')}
              onChange={v => setDraft(d => ({ ...d, groq: v }))}
            />
          </div>

          <div className="h-px" style={{ background: 'var(--border)' }} />

          {/* Target models section */}
          <div className="flex flex-col gap-4">
            <SectionLabel text="Target Models — Add keys to enable" />
            <KeyField
              label="Gemini API Key"
              value={draft.gemini}
              show={visibility.gemini}
              placeholder="AIza..."
              hint="Gemini 2.5 Flash Lite (free tier)"
              onToggleShow={() => toggleShow('gemini')}
              onChange={v => setDraft(d => ({ ...d, gemini: v }))}
            />
            <KeyField
              label="OpenAI API Key"
              value={draft.openai}
              show={visibility.openai}
              placeholder="sk-..."
              hint="GPT-4o-mini"
              onToggleShow={() => toggleShow('openai')}
              onChange={v => setDraft(d => ({ ...d, openai: v }))}
            />
            <KeyField
              label="Anthropic API Key"
              value={draft.anthropic}
              show={visibility.anthropic}
              placeholder="sk-ant-..."
              hint="Claude 3.5 Haiku"
              onToggleShow={() => toggleShow('anthropic')}
              onChange={v => setDraft(d => ({ ...d, anthropic: v }))}
            />
            <KeyField
              label="DeepSeek API Key"
              value={draft.deepseek}
              show={visibility.deepseek}
              placeholder="sk-..."
              hint="DeepSeek Chat (very cheap)"
              onToggleShow={() => toggleShow('deepseek')}
              onChange={v => setDraft(d => ({ ...d, deepseek: v }))}
            />
          </div>

          <div
            className="rounded-lg px-4 py-3 text-xs leading-relaxed"
            style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)', color: 'var(--text-3)' }}
          >
            Keys entered here override the server&apos;s{' '}
            <code className="text-zinc-400 font-mono">.env</code> file.
            If no key is set here, the backend falls back to its environment variable.
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-4 flex flex-col gap-2" style={{ borderTop: '1px solid var(--border)' }}>
          <button
            onClick={handleSave}
            className="w-full py-2.5 rounded-lg text-sm font-semibold transition-all btn-primary"
            style={{ background: saved ? '#00c853' : '#ff1744', color: '#fff' }}
          >
            {saved ? 'Saved ✓' : 'Save Keys'}
          </button>
          <p className="text-xs text-center" style={{ color: 'var(--text-3)' }}>
            Keys injected into all API requests automatically
          </p>
        </div>
      </div>
    </div>
  )
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function SectionLabel({ text }: { text: string }) {
  return (
    <span className="text-[10px] font-mono uppercase tracking-widest" style={{ color: 'var(--text-3)' }}>
      {text}
    </span>
  )
}

function KeyField({
  label, value, show, placeholder, hint, required, onToggleShow, onChange,
}: {
  label: string
  value: string
  show: boolean
  placeholder: string
  hint: string
  required?: boolean
  onToggleShow: () => void
  onChange: (v: string) => void
}) {
  const isSet = value.length > 0
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <label className="text-xs font-medium" style={{ color: 'var(--text-2)' }}>{label}</label>
          {required && (
            <span className="text-[9px] font-mono px-1 py-0.5 rounded" style={{ background: 'rgba(255,23,68,0.12)', color: 'rgba(255,23,68,0.8)', border: '1px solid rgba(255,23,68,0.2)' }}>
              required
            </span>
          )}
        </div>
        {isSet ? (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-900/30 text-emerald-400 border border-emerald-800/50">
            Set ✓
          </span>
        ) : (
          <span className="text-[10px] px-1.5 py-0.5 rounded border" style={{ background: 'var(--surface-2)', color: 'var(--text-3)', borderColor: 'var(--border)' }}>
            Not set
          </span>
        )}
      </div>
      <div className="relative">
        <input
          type={show ? 'text' : 'password'}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          className="input-field w-full px-3 py-2 text-sm font-mono pr-12"
        />
        <button
          type="button"
          onClick={onToggleShow}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-xs transition-colors hover:text-zinc-300"
          style={{ color: 'var(--text-3)' }}
        >
          {show ? 'hide' : 'show'}
        </button>
      </div>
      <p className="text-[10px]" style={{ color: 'var(--text-3)' }}>{hint}</p>
    </div>
  )
}
