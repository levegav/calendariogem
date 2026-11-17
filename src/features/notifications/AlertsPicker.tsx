import { alertLabel, alertOptions } from './alerts'
import styles from './notifications.module.css'

/** Elegir uno o varios avisos previos (pastillas que se marcan y desmarcan). */
export function AlertsPicker({
  allDay,
  selected,
  onChange,
  legend = 'Avisos',
  disabled = false,
}: {
  allDay: boolean
  selected: number[]
  onChange: (minutes: number[]) => void
  legend?: string
  disabled?: boolean
}) {
  function toggle(minutes: number) {
    onChange(
      selected.includes(minutes) ? selected.filter((m) => m !== minutes) : [...selected, minutes].sort((a, b) => a - b),
    )
  }

  return (
    <fieldset className={styles.picker} disabled={disabled}>
      <legend>{legend}</legend>
      <div className={styles.options}>
        {alertOptions(allDay, selected).map((minutes) => {
          const checked = selected.includes(minutes)
          return (
            <label key={minutes} className={styles.option} data-checked={checked}>
              <input type="checkbox" checked={checked} onChange={() => toggle(minutes)} />
              {alertLabel(minutes, allDay)}
            </label>
          )
        })}
      </div>
      <small className={`muted ${styles.pickerHint}`}>
        {selected.length === 0
          ? 'Sin avisos: no se le avisará antes.'
          : allDay
            ? 'Los avisos de un día completo llegan a las 8:00 a. m.'
            : 'Le llegará un aviso dentro de la app.'}
      </small>
    </fieldset>
  )
}
