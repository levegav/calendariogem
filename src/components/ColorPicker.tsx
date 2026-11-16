import { useId, useState } from 'react'
import { checkColor, hexToRgb, normalizeHex, rgbToHex, SUGGESTED_COLORS, type ColorOwner } from '../lib/colors'
import styles from './ColorPicker.module.css'

type Channel = 'r' | 'g' | 'b'
const CHANNELS: { key: Channel; label: string }[] = [
  { key: 'r', label: 'R' },
  { key: 'g', label: 'G' },
  { key: 'b', label: 'B' },
]

/**
 * Selector de color libre: selector visual, código HEX, valores R/G/B (0–255)
 * y colores sugeridos. Avisa si el color ya lo usa otro usuario (no se puede
 * guardar) o si se parece mucho al de otro (solo advertencia).
 */
export function ColorPicker({
  value,
  onChange,
  users,
  excludeId,
}: {
  value: string
  onChange: (color: string) => void
  users: ColorOwner[]
  excludeId?: string
}) {
  const id = useId()
  // Texto que el usuario está escribiendo; se valida antes de aplicarlo.
  const [hexDraft, setHexDraft] = useState<string | null>(null)
  const [rgbDraft, setRgbDraft] = useState<Partial<Record<Channel, string>>>({})
  const rgb = hexToRgb(value)
  const { taken, similar } = checkColor(value, users, excludeId)
  const owners = new Map(users.filter((u) => u.id !== excludeId).map((u) => [u.color, u.full_name]))

  function apply(color: string) {
    setHexDraft(null)
    setRgbDraft({})
    onChange(color)
  }

  function changeHex(text: string) {
    setHexDraft(text)
    const normalized = normalizeHex(text)
    if (normalized) onChange(normalized)
  }

  function changeChannel(channel: Channel, text: string) {
    if (!/^\d{1,3}$/.test(text)) {
      setRgbDraft((draft) => ({ ...draft, [channel]: text }))
      return
    }
    // Más de 255 no existe: se ajusta al máximo para que lo escrito y el color coincidan.
    const number = Math.min(Number(text), 255)
    setRgbDraft((draft) => ({ ...draft, [channel]: String(number) }))
    setHexDraft(null)
    onChange(rgbToHex({ ...rgb, [channel]: number }))
  }

  return (
    <fieldset className={styles.picker}>
      <legend>Color identificador</legend>

      <div className={styles.row}>
        <label className={styles.native} style={{ background: value }}>
          <span className="sr-only">Elegir color</span>
          <input type="color" value={value} onChange={(e) => apply(e.target.value)} />
        </label>

        <label className={`field ${styles.hex}`}>
          <span>HEX</span>
          <input
            value={hexDraft ?? value.toUpperCase()}
            onChange={(e) => changeHex(e.target.value)}
            onBlur={() => setHexDraft(null)}
            spellCheck={false}
            autoComplete="off"
            maxLength={7}
            aria-describedby={`${id}-status`}
          />
        </label>

        {CHANNELS.map(({ key, label }) => (
          <label key={key} className={`field ${styles.channel}`}>
            <span>{label}</span>
            <input
              inputMode="numeric"
              value={rgbDraft[key] ?? String(rgb[key])}
              onChange={(e) => changeChannel(key, e.target.value.trim())}
              onBlur={() => setRgbDraft({})}
              maxLength={3}
              aria-label={`${label} (0 a 255)`}
            />
          </label>
        ))}
      </div>

      <div className={styles.suggested}>
        <span className="muted">Sugeridos:</span>
        <div className={styles.swatches}>
          {SUGGESTED_COLORS.map((color) => {
            const owner = owners.get(color)
            return (
              <button
                key={color}
                type="button"
                className={styles.swatch}
                style={{ background: color }}
                aria-pressed={color === value}
                disabled={Boolean(owner)}
                title={owner ? `En uso por ${owner}` : color.toUpperCase()}
                aria-label={owner ? `${color.toUpperCase()}, en uso por ${owner}` : color.toUpperCase()}
                onClick={() => apply(color)}
              />
            )
          })}
        </div>
      </div>

      <div id={`${id}-status`} aria-live="polite">
        {taken ? (
          <p className="alert alert-error">Este color ya lo usa {taken.full_name}. Elija uno distinto.</p>
        ) : similar.length > 0 ? (
          <p className="alert alert-warning">
            Se parece mucho al color de {similar.map((u) => u.full_name).join(', ')}. Puede usarlo, pero
            será difícil distinguirlos en el calendario.
          </p>
        ) : null}
      </div>
    </fieldset>
  )
}
