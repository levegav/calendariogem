/** Casilla "Acceso al calendario general" (al crear o editar un usuario). */
export function GeneralAccessField({ checked, onChange }: { checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className="check-row">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>
        <span className="check-row-title">
          <span className="general-mark" aria-hidden="true" /> Acceso al calendario general
        </span>
        <small className="muted">
          Ve, junto con lo suyo, todo lo del calendario general y puede publicar en él. Recibe una notificación cuando
          otro publica, cambia o elimina algo ahí.
        </small>
      </span>
    </label>
  )
}
