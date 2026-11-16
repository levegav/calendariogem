import { useState } from 'react'
import { SUGGESTED_COLORS, type ColorOwner } from '../lib/colors'
import styles from './ColorPicker.module.css'
import { ColorStatus } from './ColorStatus'
import { CustomColorPanel } from './CustomColorPanel'

/**
 * Selector del color identificador: colores sugeridos y "Color personalizado"
 * (panel visual al estilo de Office). Avisa si el color ya lo usa otro usuario
 * (no se puede guardar) o si se parece mucho al de otro (solo advertencia).
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
  const [customOpen, setCustomOpen] = useState(false)
  const owners = new Map(users.filter((u) => u.id !== excludeId).map((u) => [u.color, u.full_name]))
  const isCustom = !SUGGESTED_COLORS.includes(value)

  return (
    <fieldset className={styles.picker}>
      <legend>Color identificador</legend>

      <div className={styles.selected}>
        <span className={styles.selectedSwatch} style={{ background: value }} aria-hidden="true" />
        <div>
          <strong className={styles.hex}>{value.toUpperCase()}</strong>
          <small className="muted">{isCustom ? 'Color personalizado' : 'Color sugerido'}</small>
        </div>
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
                onClick={() => {
                  setCustomOpen(false)
                  onChange(color)
                }}
              />
            )
          })}
          <button
            type="button"
            className={`${styles.swatch} ${styles.customSwatch}`}
            aria-pressed={isCustom}
            aria-expanded={customOpen}
            title="Color personalizado"
            aria-label="Color personalizado"
            onClick={() => setCustomOpen((open) => !open)}
          >
            +
          </button>
        </div>
      </div>

      {customOpen ? (
        <CustomColorPanel
          current={value}
          users={users}
          excludeId={excludeId}
          onAccept={(color) => {
            onChange(color)
            setCustomOpen(false)
          }}
          onCancel={() => setCustomOpen(false)}
        />
      ) : (
        <ColorStatus color={value} users={users} excludeId={excludeId} />
      )}
    </fieldset>
  )
}
