export const VERDICT_COLORS: Record<string, string> = {
  PASSED:       'text-emerald-400',
  PARTIAL:      'text-blue-400',
  JAILBROKEN:   'text-red-400',
  HALLUCINATED: 'text-yellow-400',
  OVER_REFUSED: 'text-orange-400',
  CONTEXT_LOST: 'text-purple-400',
  ERROR:        'text-zinc-500',
}

export const VERDICT_BG: Record<string, string> = {
  PASSED:       'bg-emerald-900/15 border-emerald-800/30',
  PARTIAL:      'bg-blue-900/15 border-blue-800/30',
  JAILBROKEN:   'bg-red-900/25 border-red-700/50',
  HALLUCINATED: 'bg-yellow-900/15 border-yellow-800/30',
  OVER_REFUSED: 'bg-orange-900/15 border-orange-800/30',
  CONTEXT_LOST: 'bg-purple-900/15 border-purple-800/30',
  ERROR:        'bg-zinc-800/15 border-zinc-700/30',
}

const BADGE: Record<string, { base: string; glow: string }> = {
  PASSED:       { base: 'bg-emerald-900/30 text-emerald-400 border-emerald-700/50', glow: 'shadow-[0_0_10px_rgba(0,230,118,0.3)]' },
  PARTIAL:      { base: 'bg-cyan-900/30 text-cyan-400 border-cyan-700/50',          glow: 'shadow-[0_0_10px_rgba(0,229,255,0.3)]' },
  JAILBROKEN:   { base: 'bg-red-900/40 border-red-500/60',                          glow: 'shadow-[0_0_18px_rgba(255,23,68,0.6)]' },
  HALLUCINATED: { base: 'bg-yellow-900/30 text-yellow-400 border-yellow-700/50',    glow: 'shadow-[0_0_10px_rgba(255,234,0,0.3)]' },
  OVER_REFUSED: { base: 'bg-orange-900/30 text-orange-400 border-orange-700/50',    glow: 'shadow-[0_0_10px_rgba(255,109,0,0.3)]' },
  CONTEXT_LOST: { base: 'bg-purple-900/30 text-purple-400 border-purple-700/50',    glow: 'shadow-[0_0_10px_rgba(213,0,249,0.3)]' },
  ERROR:        { base: 'bg-zinc-800/30 text-zinc-500 border-zinc-700/40',           glow: '' },
}

export function VerdictBadge({
  verdict,
  confidence,
  size = 'sm',
}: {
  verdict: string
  confidence?: number
  size?: 'xs' | 'sm'
}) {
  const s         = BADGE[verdict] ?? BADGE.ERROR
  const text      = size === 'xs' ? 'text-[10px]' : 'text-xs'
  const jailbroken = verdict === 'JAILBROKEN'
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border font-mono font-bold whitespace-nowrap ${text} ${s.base} ${s.glow} ${jailbroken ? 'animate-glow-pulse text-red-400' : ''}`}>
      {verdict}
      {confidence != null && (
        <span className="opacity-50 font-normal text-[9px]">{confidence}%</span>
      )}
    </span>
  )
}
