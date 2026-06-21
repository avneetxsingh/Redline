'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

const CATEGORIES = [
  { key: 'prompt_injection',      label: 'Prompt Injection' },
  { key: 'hallucination_trigger', label: 'Hallucination Trigger' },
  { key: 'jailbreak',             label: 'Jailbreak' },
  { key: 'context_confusion',     label: 'Context Confusion' },
  { key: 'over_refusal_bait',     label: 'Over-Refusal Bait' },
]

type GenerateResult = {
  use_case: string
  system_prompt: string
  attacks: Record<string, string[]>
}

const STEP_LABELS = ['Setup', 'Pivot', 'Strike']

export default function SetupPage() {
  const router = useRouter()

  const [useCase, setUseCase]           = useState('')
  const [generating, setGenerating]     = useState(false)
  const [generated, setGenerated]       = useState<GenerateResult | null>(null)
  const [systemPrompt, setSystemPrompt] = useState('')
  const [attacks, setAttacks]           = useState<Record<string, string[]>>({})
  const [error, setError]               = useState<string | null>(null)

  async function handleGenerate() {
    if (!useCase.trim()) return
    setGenerating(true)
    setError(null)
    try {
      const res = await fetch('http://localhost:8000/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ use_case: useCase.trim() }),
      })
      if (!res.ok) throw new Error(`Server error: ${res.status}`)
      const data: GenerateResult = await res.json()
      setGenerated(data)
      setSystemPrompt(data.system_prompt)
      setAttacks(data.attacks)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error')
    } finally {
      setGenerating(false)
    }
  }

  function handleLaunch() {
    if (!generated) return
    sessionStorage.setItem('redline_system_prompt', systemPrompt)
    sessionStorage.setItem('redline_attacks', JSON.stringify(attacks))
    sessionStorage.setItem('redline_use_case', generated.use_case)
    router.push('/run')
  }

  return (
    <div className="max-w-3xl mx-auto w-full px-6 py-10 flex flex-col gap-8">

      {/* Step 1: Enter use case */}
      <section className="flex flex-col gap-4">
        <h1 className="text-2xl font-semibold">Setup</h1>
        <p className="text-zinc-400 text-sm">
          Describe the AI assistant you want to attack. The generator will produce a realistic
          victim system prompt and a 3-step kill chain per failure category.
        </p>

        <div className="flex gap-3">
          <input
            type="text"
            value={useCase}
            onChange={e => setUseCase(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleGenerate()}
            placeholder="e.g. customer support bot for a bank"
            className="flex-1 bg-zinc-900 border border-zinc-700 rounded-md px-4 py-2 text-sm
                       placeholder:text-zinc-600 focus:outline-none focus:border-red-500"
          />
          <button
            onClick={handleGenerate}
            disabled={generating || !useCase.trim()}
            className="px-5 py-2 rounded-md bg-red-600 hover:bg-red-500 disabled:opacity-40
                       disabled:cursor-not-allowed text-sm font-medium transition-colors"
          >
            {generating ? 'Generating…' : 'Generate'}
          </button>
        </div>

        {error && (
          <p className="text-red-400 text-sm">{error}</p>
        )}
      </section>

      {/* Step 2: Review + edit */}
      {generated && (
        <>
          <section className="flex flex-col gap-3">
            <h2 className="text-lg font-medium">Victim System Prompt</h2>
            <p className="text-zinc-500 text-xs">
              This is the system prompt the victim AI will use. Edit it if needed.
            </p>
            <textarea
              value={systemPrompt}
              onChange={e => setSystemPrompt(e.target.value)}
              rows={10}
              className="w-full bg-zinc-900 border border-zinc-700 rounded-md px-4 py-3 text-sm
                         font-mono leading-relaxed focus:outline-none focus:border-red-500 resize-y"
            />
          </section>

          <section className="flex flex-col gap-6">
            <div>
              <h2 className="text-lg font-medium">Attack Kill Chains</h2>
              <p className="text-zinc-500 text-xs mt-1">
                Each category has a 3-step scripted sequence. Attempts 4–5 switch to adaptive
                escalation per model.
              </p>
            </div>

            {CATEGORIES.map(({ key, label }) => (
              <div key={key} className="flex flex-col gap-2">
                <span className="text-xs font-mono text-zinc-400 uppercase tracking-widest">
                  {label}
                </span>
                {STEP_LABELS.map((stepLabel, i) => (
                  <div key={i} className="flex flex-col gap-1">
                    <span className="text-xs text-zinc-600">
                      Step {i + 1} — {stepLabel}
                    </span>
                    <textarea
                      value={attacks[key]?.[i] ?? ''}
                      onChange={e => setAttacks(prev => {
                        const steps = [...(prev[key] ?? ['', '', ''])]
                        steps[i] = e.target.value
                        return { ...prev, [key]: steps }
                      })}
                      rows={2}
                      className="w-full bg-zinc-900 border border-zinc-700 rounded-md px-4 py-2.5
                                 text-sm font-mono leading-relaxed focus:outline-none focus:border-red-500
                                 resize-y"
                    />
                  </div>
                ))}
              </div>
            ))}
          </section>

          <button
            onClick={handleLaunch}
            className="self-start px-6 py-2.5 rounded-md bg-red-600 hover:bg-red-500
                       text-sm font-semibold transition-colors"
          >
            Launch Probes →
          </button>
        </>
      )}
    </div>
  )
}
