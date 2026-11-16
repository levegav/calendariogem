import { checkColor, type ColorOwner } from '../lib/colors'

/** Aviso si el color ya lo usa otro usuario (bloquea) o si se le parece mucho (advierte). */
export function ColorStatus({ color, users, excludeId }: { color: string; users: ColorOwner[]; excludeId?: string }) {
  const { taken, similar } = checkColor(color, users, excludeId)
  return (
    <div aria-live="polite">
      {taken ? (
        <p className="alert alert-error">Este color ya lo usa {taken.full_name}. Elija uno distinto.</p>
      ) : similar.length > 0 ? (
        <p className="alert alert-warning">
          Se parece mucho al color de {similar.map((u) => u.full_name).join(', ')}. Puede usarlo, pero será difícil
          distinguirlos en el calendario.
        </p>
      ) : null}
    </div>
  )
}
