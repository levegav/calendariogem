import { usePopover } from '../../components/usePopover'
import { UserAvatar } from '../../components/UserAvatar'
import styles from './calendar.module.css'
import type { Person } from './types'

/**
 * "Ver calendario de…": elige qué calendarios se muestran (el propio y los de
 * otras personas). Siempre queda al menos uno elegido.
 */
export function CalendarSelector({
  me,
  people,
  selected,
  onChange,
}: {
  me: Person
  /** Usuarios activos (puede incluir al propio usuario; se muestra primero). */
  people: Person[]
  selected: string[]
  onChange: (ids: string[]) => void
}) {
  const { open, setOpen, ref } = usePopover()
  const others = people.filter((p) => p.id !== me.id)
  const options = [me, ...others]
  const chosen = options.filter((p) => selected.includes(p.id))

  function toggle(id: string) {
    if (selected.includes(id)) {
      if (selected.length > 1) onChange(selected.filter((s) => s !== id))
    } else {
      onChange([...selected, id])
    }
  }

  const summary =
    chosen.length === 1 && chosen[0].id === me.id
      ? 'Mi calendario'
      : chosen.length === 1
        ? chosen[0].full_name
        : `${chosen.length} calendarios`

  return (
    <div className={styles.selector} ref={ref}>
      <button
        type="button"
        className="btn btn-secondary btn-sm"
        aria-expanded={open}
        aria-haspopup="true"
        onClick={() => setOpen(!open)}
        title="Ver calendario de…"
      >
        <span className={styles.selectorAvatars} aria-hidden="true">
          {chosen.slice(0, 3).map((p) => (
            <UserAvatar key={p.id} name={p.full_name} color={p.color} size={22} />
          ))}
        </span>
        <span className="sr-only">Ver calendario de: </span>
        {summary}
      </button>

      {open && (
        <div className={styles.selectorMenu}>
          <fieldset>
            <legend>Ver calendario de…</legend>
            {options.map((person) => {
              const checked = selected.includes(person.id)
              return (
                <label key={person.id} className={styles.selectorOption}>
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={checked && selected.length === 1}
                    onChange={() => toggle(person.id)}
                  />
                  <span className={styles.selectorLine} style={{ background: person.color }} aria-hidden="true" />
                  {person.id === me.id ? `${person.full_name} (yo)` : person.full_name}
                </label>
              )
            })}
          </fieldset>
          {others.length > 0 && (
            <div className={styles.selectorActions}>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => onChange([me.id])}>
                Solo el mío
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => onChange(options.map((p) => p.id))}
              >
                Todos
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
