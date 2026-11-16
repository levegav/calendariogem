import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import {
  checkColor,
  hexToHsv,
  hexToRgb,
  hsvToHex,
  normalizeHex,
  rgbToHex,
  type ColorOwner,
  type Hsv,
} from '../lib/colors'
import { ColorStatus } from './ColorStatus'
import styles from './CustomColorPanel.module.css'

type Channel = 'r' | 'g' | 'b'
const CHANNELS: { key: Channel; label: string }[] = [
  { key: 'r', label: 'R' },
  { key: 'g', label: 'G' },
  { key: 'b', label: 'B' },
]

const clamp01 = (value: number) => Math.min(1, Math.max(0, value))

/**
 * "Color personalizado", al estilo de Office: un recuadro donde se elige la
 * intensidad (horizontal) y el brillo (vertical), una barra de matices y la
 * vista previa Nuevo / Actual. El color solo se aplica con "Usar este color".
 */
export function CustomColorPanel({
  current,
  users,
  excludeId,
  onAccept,
  onCancel,
}: {
  current: string
  users: ColorOwner[]
  excludeId?: string
  onAccept: (color: string) => void
  onCancel: () => void
}) {
  const [hsv, setHsv] = useState<Hsv>(() => hexToHsv(current))
  const [hexDraft, setHexDraft] = useState<string | null>(null)
  const [rgbDraft, setRgbDraft] = useState<Partial<Record<Channel, string>>>({})
  const areaRef = useRef<HTMLDivElement>(null)

  const color = hsvToHex(hsv)
  const rgb = hexToRgb(color)
  const taken = checkColor(color, users, excludeId).taken

  /** Aplica un color escrito (HEX o RGB) conservando el matiz si el color es gris. */
  function setFromHex(hex: string) {
    const next = hexToHsv(hex)
    setHsv((prev) => (next.s === 0 ? { ...next, h: prev.h } : next))
  }

  function pickFromPointer(event: PointerEvent<HTMLDivElement>) {
    const rect = areaRef.current?.getBoundingClientRect()
    if (!rect || rect.width === 0 || rect.height === 0) return
    setHexDraft(null)
    setRgbDraft({})
    setHsv((prev) => ({
      ...prev,
      s: clamp01((event.clientX - rect.left) / rect.width),
      v: clamp01(1 - (event.clientY - rect.top) / rect.height),
    }))
  }

  function onAreaKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const step = event.shiftKey ? 0.1 : 0.02
    const moves: Record<string, Partial<Hsv>> = {
      ArrowLeft: { s: clamp01(hsv.s - step) },
      ArrowRight: { s: clamp01(hsv.s + step) },
      ArrowUp: { v: clamp01(hsv.v + step) },
      ArrowDown: { v: clamp01(hsv.v - step) },
    }
    const move = moves[event.key]
    if (!move) return
    event.preventDefault()
    setHexDraft(null)
    setRgbDraft({})
    setHsv((prev) => ({ ...prev, ...move }))
  }

  function changeHex(text: string) {
    setHexDraft(text)
    const normalized = normalizeHex(text)
    if (normalized) setFromHex(normalized)
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
    setFromHex(rgbToHex({ ...rgb, [channel]: number }))
  }

  return (
    <div className={styles.panel} role="group" aria-label="Color personalizado">
      <div className={styles.picker}>
        <div
          ref={areaRef}
          className={styles.area}
          style={{ backgroundColor: `hsl(${hsv.h} 100% 50%)` }}
          role="slider"
          tabIndex={0}
          aria-label="Intensidad y brillo"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(hsv.s * 100)}
          aria-valuetext={`Intensidad ${Math.round(hsv.s * 100)} %, brillo ${Math.round(hsv.v * 100)} %`}
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture?.(event.pointerId)
            pickFromPointer(event)
          }}
          onPointerMove={(event) => {
            if (event.currentTarget.hasPointerCapture?.(event.pointerId)) pickFromPointer(event)
          }}
          onKeyDown={onAreaKeyDown}
        >
          <span
            className={styles.areaThumb}
            style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%`, background: color }}
          />
        </div>

        <label className={styles.hue}>
          <span className="sr-only">Matiz</span>
          <input
            type="range"
            min={0}
            max={359}
            step={1}
            value={Math.round(hsv.h)}
            onChange={(e) => {
              setHexDraft(null)
              setRgbDraft({})
              setHsv((prev) => ({ ...prev, h: Number(e.target.value) }))
            }}
          />
        </label>
      </div>

      <div className={styles.side}>
        <div className={styles.preview} aria-live="polite">
          <div className={styles.previewHalf} style={{ background: color }}>
            <span>Nuevo</span>
          </div>
          <div className={styles.previewHalf} style={{ background: current }}>
            <span>Actual</span>
          </div>
        </div>
        <p className={styles.code}>{color.toUpperCase()}</p>

        <details className={styles.exact}>
          <summary>Valores exactos (HEX / RGB)</summary>
          <div className={styles.exactFields}>
            <label className={`field ${styles.hexField}`}>
              <span>HEX</span>
              <input
                value={hexDraft ?? color.toUpperCase()}
                onChange={(e) => changeHex(e.target.value)}
                onBlur={() => setHexDraft(null)}
                spellCheck={false}
                autoComplete="off"
                maxLength={7}
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
        </details>
      </div>

      <div className={styles.footer}>
        <ColorStatus color={color} users={users} excludeId={excludeId} />
        <div className="actions">
          <button type="button" className="btn btn-primary btn-sm" disabled={Boolean(taken)} onClick={() => onAccept(color)}>
            Usar este color
          </button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={onCancel}>
            Cancelar
          </button>
        </div>
      </div>
    </div>
  )
}
