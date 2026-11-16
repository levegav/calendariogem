import { useCallback, useEffect, useState } from 'react'
import { SUGGESTED_COLORS } from '../../lib/colors'
import { toSpanishMessage } from '../../lib/errors'
import { createCategory, deleteCategory, listCategories, updateCategory, type Category } from './api'
import { CategoryForm } from './CategoryForm'
import styles from './CategoriesPage.module.css'

type Message = { type: 'success' | 'error'; text: string }

export function CategoriesPage() {
  const [categories, setCategories] = useState<Category[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [message, setMessage] = useState<Message | null>(null)
  const [creating, setCreating] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [busyId, setBusyId] = useState<number | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  const reload = useCallback(() => setReloadKey((key) => key + 1), [])

  useEffect(() => {
    let cancelled = false
    listCategories().then(
      (data) => {
        if (cancelled) return
        setCategories(data)
        setLoadError(null)
      },
      (err) => {
        if (!cancelled) setLoadError(toSpanishMessage(err))
      },
    )
    return () => {
      cancelled = true
    }
  }, [reloadKey])

  async function run(category: Category, action: () => Promise<string>) {
    setMessage(null)
    setBusyId(category.id)
    try {
      setMessage({ type: 'success', text: await action() })
      reload()
    } catch (err) {
      setMessage({ type: 'error', text: toSpanishMessage(err) })
    } finally {
      setBusyId(null)
    }
  }

  function remove(category: Category) {
    const question =
      `¿Eliminar la categoría "${category.name}"?\n\n` +
      'Si algún recordatorio la usa, no se borrará: quedará desactivada y esos recordatorios la conservarán.'
    if (!window.confirm(question)) return
    void run(category, async () =>
      (await deleteCategory(category.id)) === 'eliminada'
        ? `La categoría "${category.name}" fue eliminada.`
        : `"${category.name}" está en uso: se desactivó. Ya no aparece al crear recordatorios, pero los existentes la conservan.`,
    )
  }

  function reactivate(category: Category) {
    void run(category, async () => {
      await updateCategory(category.id, { active: true })
      return `La categoría "${category.name}" se activó de nuevo.`
    })
  }

  const usedColors = categories?.map((c) => c.color) ?? []
  const nextColor = SUGGESTED_COLORS.find((c) => !usedColors.includes(c)) ?? SUGGESTED_COLORS[0]

  return (
    <section className="stack narrow-wide">
      <div className="page-header">
        <div>
          <h1>Categorías</h1>
          <p className="muted">Clasifican los recordatorios y les dan un color en el calendario.</p>
        </div>
        {!creating && categories && (
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              setMessage(null)
              setCreating(true)
            }}
          >
            Nueva categoría
          </button>
        )}
      </div>

      {message && (
        <p className={`alert ${message.type === 'success' ? 'alert-success' : 'alert-error'}`} role="status">
          {message.text}
        </p>
      )}

      {creating && (
        <div className="card stack">
          <h2>Nueva categoría</h2>
          <CategoryForm
            initial={{ name: '', color: nextColor }}
            submitLabel="Crear categoría"
            onCancel={() => setCreating(false)}
            onSubmit={async (values) => {
              await createCategory(values)
              setCreating(false)
              setMessage({ type: 'success', text: `La categoría "${values.name}" fue creada.` })
              reload()
            }}
          />
        </div>
      )}

      {loadError && (
        <p className="alert alert-error" role="alert">
          {loadError}
        </p>
      )}
      {!categories && !loadError && <p className="muted">Cargando categorías…</p>}

      {categories && (
        <ul className={styles.list}>
          {categories.map((category) => {
            const busy = busyId === category.id
            return (
              <li key={category.id} className={`card ${styles.item} ${category.active ? '' : styles.inactive}`}>
                <div className={styles.summary}>
                  <span className={styles.dot} style={{ background: category.color }} aria-hidden="true" />
                  <strong className={styles.name}>{category.name}</strong>
                  <span className={styles.hex}>{category.color.toUpperCase()}</span>
                  {!category.active && <span className="badge badge-muted">Desactivada</span>}
                </div>

                {editingId === category.id ? (
                  <CategoryForm
                    initial={category}
                    submitLabel="Guardar"
                    onCancel={() => setEditingId(null)}
                    onSubmit={async (values) => {
                      await updateCategory(category.id, values)
                      setEditingId(null)
                      setMessage({ type: 'success', text: 'Categoría actualizada.' })
                      reload()
                    }}
                  />
                ) : (
                  <div className="actions">
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      disabled={busy}
                      onClick={() => {
                        setMessage(null)
                        setEditingId(category.id)
                      }}
                    >
                      Editar
                    </button>
                    {category.active ? (
                      <button type="button" className="btn btn-danger btn-sm" disabled={busy} onClick={() => remove(category)}>
                        Eliminar
                      </button>
                    ) : (
                      <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={() => reactivate(category)}>
                        Activar
                      </button>
                    )}
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
