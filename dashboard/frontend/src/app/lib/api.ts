/**
 * Resolves backend URLs from NEXT_PUBLIC_API_URL env var.
 * Falls back to localhost:8000 for local development.
 *
 * Set NEXT_PUBLIC_API_URL in .env.local or your deployment platform:
 *   NEXT_PUBLIC_API_URL=https://your-backend.railway.app
 */

const BASE = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000').replace(/\/$/, '')

// Derive WebSocket base: https → wss, http → ws
const WS_BASE = BASE.replace(/^https/, 'wss').replace(/^http/, 'ws')

export const API = {
  generate:        `${BASE}/api/generate`,
  generateAttacks: `${BASE}/api/generate-attacks`,
  wsRun:           `${WS_BASE}/ws/run`,
  wsProbe:         `${WS_BASE}/ws/probe`,
}
