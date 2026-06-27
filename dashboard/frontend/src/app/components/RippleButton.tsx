'use client'
import { useRef } from 'react'

export function RippleButton({
  children,
  onClick,
  className = '',
  style,
  disabled,
  type = 'button',
}: {
  children: React.ReactNode
  onClick?: () => void
  className?: string
  style?: React.CSSProperties
  disabled?: boolean
  type?: 'button' | 'submit'
}) {
  const btnRef = useRef<HTMLButtonElement>(null)

  function handleClick(e: React.MouseEvent<HTMLButtonElement>) {
    if (disabled) return
    const btn = btnRef.current
    if (!btn) { onClick?.(); return }
    const rect   = btn.getBoundingClientRect()
    const x      = e.clientX - rect.left
    const y      = e.clientY - rect.top
    const size   = Math.max(rect.width, rect.height) * 2
    const ripple = document.createElement('span')
    ripple.style.cssText = `
      position:absolute;
      border-radius:50%;
      background:rgba(255,255,255,0.15);
      width:${size}px;
      height:${size}px;
      left:${x - size/2}px;
      top:${y - size/2}px;
      transform:scale(0);
      animation:ripple-expand 0.55s ease-out forwards;
      pointer-events:none;
    `
    btn.appendChild(ripple)
    setTimeout(() => ripple.remove(), 600)
    onClick?.()
  }

  return (
    <button
      ref={btnRef}
      type={type}
      disabled={disabled}
      onClick={handleClick}
      className={`relative overflow-hidden ${className}`}
      style={style}
    >
      {children}
    </button>
  )
}
