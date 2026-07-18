interface Props {
  value: number
  className?: string
}

/**
 * Price in the mono voice. The ₪ glyph is rendered in the Hebrew sans —
 * IBM Plex Mono has no U+20AA, and cross-platform generic-mono fallbacks
 * render it as tofu.
 */
export function Price({ value, className = '' }: Props) {
  if (value <= 0) return null
  return (
    <span className={`mono ${className}`} dir="ltr">
      <span className="shekel">₪</span>
      {value.toLocaleString('he-IL')}
    </span>
  )
}
