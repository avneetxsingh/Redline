'use client'

import { useState, useEffect } from 'react'

const STORAGE_KEY = 'redline_api_keys'

export type ApiKeys = {
  groq: string
  gemini: string
  openai: string
  anthropic: string
  deepseek: string
}

const EMPTY: ApiKeys = { groq: '', gemini: '', openai: '', anthropic: '', deepseek: '' }

export function useApiKeys() {
  const [keys, setKeysState] = useState<ApiKeys>(EMPTY)

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) {
        const parsed = JSON.parse(raw)
        setKeysState({
          groq:      parsed.groq      ?? '',
          gemini:    parsed.gemini    ?? '',
          openai:    parsed.openai    ?? '',
          anthropic: parsed.anthropic ?? '',
          deepseek:  parsed.deepseek  ?? '',
        })
      }
    } catch { /* ignore parse errors */ }
  }, [])

  function setKeys(next: ApiKeys) {
    setKeysState(next)
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    } catch { /* ignore storage errors */ }
  }

  return { keys, setKeys }
}

/** Read keys synchronously from localStorage (for use in event handlers) */
export function readApiKeys(): ApiKeys {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      return {
        groq:      parsed.groq      ?? '',
        gemini:    parsed.gemini    ?? '',
        openai:    parsed.openai    ?? '',
        anthropic: parsed.anthropic ?? '',
        deepseek:  parsed.deepseek  ?? '',
      }
    }
  } catch { /* ignore */ }
  return { ...EMPTY }
}
