import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { formatTime, parseTime } from '../../lib/dates'
import styles from './TimeInput.module.css'

/** Índice de la opción igual a `value` o la primera posterior (la última si no hay). */
function nearestIndex(options: number[], value: number): number {
  const index = options.findIndex((m) => m >= value)
  return index === -1 ? options.length - 1 : index
}

/**
 * Hora con lista de sugerencias (cada 15 min) que también se puede escribir a
 * mano, p. ej. "10:03" o "3:20 pm". Al salir del campo o con Enter se aplica;
 * si lo escrito no es una hora, vuelve a la anterior y lo indica.
 */
export function TimeInput({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: number
  options: number[]
  onChange: (minutes: number) => void
}) {
  const id = useId()
  const listId = `${id}-lista`
  const hintId = `${id}-ayuda`
  const [text, setText] = useState<string | null>(null) // null = no se está editando
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const [invalid, setInvalid] = useState(false)
  const listRef = useRef<HTMLUListElement>(null)

  // Desplaza solo la lista (no la ventana) para que la opción activa quede a la vista, centrada.
  useEffect(() => {
    const list = listRef.current
    const item = list?.children[active] as HTMLElement | undefined
    if (!open || !list || !item) return
    const top = item.offsetTop
    const bottom = top + item.offsetHeight
    if (top < list.scrollTop || bottom > list.scrollTop + list.clientHeight) {
      list.scrollTop = top - (list.clientHeight - item.offsetHeight) / 2
    }
  }, [open, active])

  function openList(from: number) {
    setOpen(true)
    setActive(nearestIndex(options, from))
  }

  function choose(minutes: number) {
    onChange(minutes)
    setText(null)
    setOpen(false)
    setInvalid(false)
  }

  /** Aplica lo escrito; si no es una hora válida, se queda la anterior. */
  function commit() {
    setOpen(false)
    if (text === null) return
    const parsed = parseTime(text)
    setText(null)
    if (parsed === null) {
      setInvalid(text.trim() !== formatTime(value))
      return
    }
    setInvalid(false)
    if (parsed !== value) onChange(parsed)
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    switch (event.key) {
      case 'ArrowDown':
      case 'ArrowUp': {
        event.preventDefault()
        if (!open) return openList(value)
        const step = event.key === 'ArrowDown' ? 1 : -1
        setText(null) // al recorrer la lista se descarta lo escrito
        setActive((i) => Math.min(options.length - 1, Math.max(0, i + step)))
        return
      }
      case 'Enter':
        // Nunca envía el formulario desde aquí.
        event.preventDefault()
        if (open && active >= 0 && text === null) choose(options[active])
        else commit()
        return
      case 'Escape':
        if (open) {
          // Cierra solo la lista, no la ventana.
          event.stopPropagation()
          setOpen(false)
          setText(null)
        }
        return
    }
  }

  return (
    <div className={`field ${styles.wrapper}`}>
      <label className="field">
        <span>{label}</span>
        <input
          type="text"
          role="combobox"
          inputMode="text"
          autoComplete="off"
          spellCheck={false}
          value={text ?? formatTime(value)}
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="none"
          aria-activedescendant={open && active >= 0 ? `${id}-op-${active}` : undefined}
          aria-invalid={invalid}
          aria-describedby={hintId}
          onFocus={(e) => {
            e.currentTarget.select()
            openList(value)
          }}
          onClick={() => !open && openList(value)}
          onChange={(e) => {
            setText(e.target.value)
            setInvalid(false)
            const parsed = parseTime(e.target.value)
            if (parsed !== null) openList(parsed)
          }}
          onKeyDown={onKeyDown}
          onBlur={commit}
        />
      </label>
      {open && (
        <ul ref={listRef} id={listId} role="listbox" aria-label={label} className={styles.list}>
          {options.map((minutes, index) => (
            <li
              key={minutes}
              id={`${id}-op-${index}`}
              role="option"
              aria-selected={minutes === value}
              data-active={index === active}
              className={styles.option}
              // mousedown en vez de click: así el campo no pierde el foco antes de elegir.
              onMouseDown={(e) => {
                e.preventDefault()
                choose(minutes)
              }}
            >
              {formatTime(minutes)}
            </li>
          ))}
        </ul>
      )}
      <small id={hintId} className={invalid ? styles.error : 'sr-only'}>
        {invalid ? 'No es una hora válida. Escríbala como 10:03 a. m. o 15:20.' : 'Elija de la lista o escriba la hora, p. ej. 10:03 a. m.'}
      </small>
    </div>
  )
}
