'use client'

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { useApiKeys } from '../hooks/useApiKeys'
import { ApiKeysModal } from './ApiKeysModal'
import { RippleButton } from './RippleButton'
import Link from 'next/link'

export function ClientHeader() {
  const { keys, setKeys }       = useApiKeys()
  const [open, setOpen]         = useState(false)
  const [scrolled, setScrolled] = useState(false)

  const hasGroq      = !!keys.groq
  const hasGemini    = !!keys.gemini
  const hasOpenAI    = !!keys.openai
  const hasAnthropic = !!keys.anthropic
  const hasDeepSeek  = !!keys.deepseek
  const hasAnyKey    = hasGroq || hasGemini || hasOpenAI || hasAnthropic || hasDeepSeek

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 10)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <>
      <header
        className={`sticky top-0 z-40 transition-all duration-300 ${
          scrolled
            ? 'border-b border-red-900/30 backdrop-blur-md shadow-[0_1px_0_rgba(220,38,38,0.1)]'
            : 'border-b border-transparent'
        }`}
        style={{ background: scrolled ? 'rgba(3,3,3,0.95)' : 'transparent' }}
      >
        <div className="h-[2px] w-full bg-gradient-to-r from-transparent via-red-600 to-transparent opacity-80" />

        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
          className="px-6 py-3.5 flex items-center justify-between max-w-screen-xl mx-auto"
        >
          {/* Logo */}
          <Link href="/" className="flex items-center gap-3 group">
            <span className="text-2xl font-black tracking-[-0.02em] font-mono text-white animate-flicker select-none">
              RED<span className="text-red-500">LINE</span>
            </span>
            <div className="hidden sm:flex flex-col gap-0">
              <span className="text-[10px] font-mono text-red-500/70 uppercase tracking-[0.2em] leading-none">adversarial</span>
              <span className="text-[10px] font-mono uppercase tracking-[0.15em] leading-none" style={{ color: 'var(--text-3)' }}>llm testing</span>
            </div>
          </Link>

          {/* Right side */}
          <div className="flex items-center gap-3">
            {/* Keys status dot */}
            <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full border" style={{ background: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.05)' }}>
              <span className={`h-1.5 w-1.5 rounded-full ${hasGroq ? 'bg-green-500' : 'bg-red-500 animate-pulse-dot'}`} />
              <span className="text-[10px] font-mono" style={{ color: 'var(--text-3)' }}>
                {hasGroq ? (hasAnyKey ? 'keys set' : 'groq only') : 'no groq key'}
              </span>
            </div>

            {/* Settings */}
            <RippleButton
              onClick={() => setOpen(true)}
              className="relative p-2 rounded-lg border transition-all duration-200 hover:border-red-700/30 hover:bg-red-900/10"
              style={{ background: 'rgba(255,255,255,0.02)', borderColor: 'rgba(255,255,255,0.06)' }}
            >
              <GearIcon className="h-4 w-4" style={{ color: 'var(--text-3)' }} />
              {!hasGroq && (
                <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-red-500 animate-pulse-dot border-2" style={{ borderColor: 'var(--bg)' }} />
              )}
            </RippleButton>
          </div>
        </motion.div>

        {/* Provider pills */}
        <div className="px-6 pb-2 max-w-screen-xl mx-auto flex items-center gap-1.5 flex-wrap">
          <span className="text-[9px] font-mono uppercase tracking-widest mr-1" style={{ color: 'var(--text-3)' }}>providers</span>
          <ProviderPill label="GROQ"      active={hasGroq}      required />
          <ProviderPill label="GEMINI"    active={hasGemini}    />
          <ProviderPill label="GPT-4o"    active={hasOpenAI}    />
          <ProviderPill label="CLAUDE"    active={hasAnthropic} />
          <ProviderPill label="DEEPSEEK"  active={hasDeepSeek}  />
          <ProviderPill label="CLASSIFIER" active={hasGroq}     />
        </div>
      </header>

      {open && (
        <ApiKeysModal
          keys={keys}
          onSave={next => setKeys(next)}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  )
}

function ProviderPill({ label, active, required }: { label: string; active: boolean; required?: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-mono font-semibold border transition-all duration-300 ${
        active
          ? 'border-green-800/50 text-green-500/80'
          : required
            ? 'border-red-900/60 text-red-500/70'
            : 'border-zinc-800/40 text-zinc-600/60'
      }`}
      style={{ background: active ? 'rgba(34,197,94,0.05)' : required ? 'rgba(220,38,38,0.04)' : 'rgba(255,255,255,0.02)' }}
    >
      <span className={`h-1 w-1 rounded-full ${active ? 'bg-green-500' : required ? 'bg-red-500 animate-pulse-dot' : 'bg-zinc-700'}`} />
      {label}
    </span>
  )
}

function GearIcon({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg className={className} style={style} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  )
}
