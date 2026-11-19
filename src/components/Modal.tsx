import { useEffect, useId, useLayoutEffect, useRef, type CSSProperties, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Icon } from './Icon'
import styles from './Modal.module.css'

/**
 * Borde izquierdo de color. Un color se dibuja como borde normal; un degradado
 * (p. ej. el arcoíris del calendario general) se pinta detrás de un borde transparente.
 */
function accentStyle(accent: string | undefined): CSSProperties | undefined {
  if (!accent) return undefined
  if (!accent.includes('gradient') && !accent.startsWith('var(')) return { borderLeft: `6px solid ${accent}` }
  return {
    borderLeft: '6px solid transparent',
    background: `linear-gradient(var(--color-surface), var(--color-surface)) padding-box, ${accent} border-box`,
  }
}

const FOCUSABLE ='button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * Ventana emergente accesible: se cierra con Escape, con la X o tocando fuera
 * (si `dismissible`), mantiene el foco dentro y lo devuelve al cerrar. En
 * celular ocupa toda la pantalla.
 */
export function Modal({
  title,
  onClose,
  children,
  footer,
  dismissible = true,
  accentColor,
}: {
  title: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  dismissible?: boolean
  /** Línea de color en el borde izquierdo (p. ej. el color del creador del recordatorio). */
  accentColor?: string
}) {
  const titleId = useId()
  const dialogRef = useRef<HTMLDivElement>(null)
  // Siempre la última función de cierre, sin volver a montar los escuchadores.
  const onCloseRef = useRef(onClose)
  useLayoutEffect(() => {
    onCloseRef.current = onClose
  })

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    const dialog = dialogRef.current
    const first = dialog?.querySelector<HTMLElement>('[data-autofocus]') ?? dialog?.querySelector<HTMLElement>(FOCUSABLE)
    first?.focus()
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && dismissible) {
        event.stopPropagation()
        onCloseRef.current()
      }
      if (event.key !== 'Tab' || !dialog) return
      const items = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE))
      if (items.length === 0) return
      const [firstItem, lastItem] = [items[0], items[items.length - 1]]
      if (event.shiftKey && document.activeElement === firstItem) {
        event.preventDefault()
        lastItem.focus()
      } else if (!event.shiftKey && document.activeElement === lastItem) {
        event.preventDefault()
        firstItem.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = overflow
      previous?.focus?.()
    }
  }, [dismissible])

  return createPortal(
    <div
      className={styles.overlay}
      onMouseDown={(event) => {
        if (dismissible && event.target === event.currentTarget) onClose()
      }}
    >
      <div
        ref={dialogRef}
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        style={accentStyle(accentColor)}
      >
        <header className={styles.header}>
          <h2 id={titleId}>{title}</h2>
          {dismissible && (
            <button type="button" className="icon-btn" aria-label="Cerrar" onClick={onClose}>
              <Icon name="close" />
            </button>
          )}
        </header>
        <div className={styles.body}>{children}</div>
        {footer && <footer className={styles.footer}>{footer}</footer>}
      </div>
    </div>,
    document.body,
  )
}
