import { Icon } from '../../components/Icon'
import { usePopover } from '../../components/usePopover'
import type { Category } from '../categories/api'
import styles from './calendar.module.css'
import { countFilters, NO_FILTERS, RELATION_LABELS, type CalendarFilters, type Relation } from './filters'

/** Botón "Filtros" con su menú: categorías, míos / etiquetado, pasados y ubicación. */
export function FiltersMenu({
  categories,
  filters,
  onChange,
}: {
  categories: Category[]
  filters: CalendarFilters
  onChange: (filters: CalendarFilters) => void
}) {
  const { open, setOpen, ref } = usePopover()
  const count = countFilters(filters)
  const set = <K extends keyof CalendarFilters>(key: K, value: CalendarFilters[K]) => onChange({ ...filters, [key]: value })

  function toggleCategory(id: number) {
    const hidden = filters.hiddenCategories
    set('hiddenCategories', hidden.includes(id) ? hidden.filter((h) => h !== id) : [...hidden, id])
  }

  return (
    <div className={styles.selector} ref={ref}>
      <button
        type="button"
        className={`btn btn-secondary btn-sm ${count > 0 ? styles.filtersActive : ''}`}
        aria-expanded={open}
        aria-haspopup="true"
        aria-label={count === 0 ? 'Filtros' : `Filtros (${count === 1 ? '1 activo' : `${count} activos`})`}
        onClick={() => setOpen(!open)}
      >
        <Icon name="filter" size={16} />
        Filtros
        {count > 0 && (
          <span className={styles.filtersCount} aria-hidden="true">
            {count}
          </span>
        )}
      </button>

      {open && (
        <div className={`${styles.selectorMenu} ${styles.filtersMenu}`}>
          <fieldset>
            <legend>Categorías</legend>
            {categories.map((category) => (
              <label key={category.id} className={styles.selectorOption}>
                <input
                  type="checkbox"
                  checked={!filters.hiddenCategories.includes(category.id)}
                  onChange={() => toggleCategory(category.id)}
                />
                <span className={styles.chipDot} style={{ background: category.color }} aria-hidden="true" />
                {category.name}
                {!category.active && <small className="muted"> (desactivada)</small>}
              </label>
            ))}
          </fieldset>

          <fieldset>
            <legend>Mostrar</legend>
            {(Object.keys(RELATION_LABELS) as Relation[]).map((relation) => (
              <label key={relation} className={styles.selectorOption}>
                <input
                  type="radio"
                  name="filtro-relacion"
                  checked={filters.relation === relation}
                  onChange={() => set('relation', relation)}
                />
                {RELATION_LABELS[relation]}
              </label>
            ))}
          </fieldset>

          <fieldset>
            <legend>Otros</legend>
            <label className={styles.selectorOption}>
              <input type="checkbox" checked={filters.hidePast} onChange={(e) => set('hidePast', e.target.checked)} />
              Ocultar los que ya pasaron
            </label>
            <label className={styles.selectorOption}>
              <input
                type="checkbox"
                checked={filters.withLocation}
                onChange={(e) => set('withLocation', e.target.checked)}
              />
              Solo con ubicación o enlace
            </label>
          </fieldset>

          <div className={styles.selectorActions}>
            <button type="button" className="btn btn-secondary btn-sm" disabled={count === 0} onClick={() => onChange(NO_FILTERS)}>
              Quitar filtros
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
