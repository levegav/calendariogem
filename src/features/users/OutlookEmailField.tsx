/** Campo "Correo de Outlook" (al crear o editar un usuario). Vacío = no se sincroniza. */
export function OutlookEmailField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <div className="field">
      <label className="field">
        <span>
          <span className="outlook-mark" aria-hidden="true" /> Correo de Outlook (opcional)
        </span>
        <input
          type="email"
          inputMode="email"
          autoCapitalize="none"
          spellCheck={false}
          autoComplete="off"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="ej. maria.perez@gemconsulting.inc"
        />
      </label>
      <small className="muted">
        Sus reuniones de Outlook se verán en su calendario, de solo lectura. En Exchange, la cuenta de servicio
        necesita permiso de Revisor sobre su calendario.
      </small>
    </div>
  )
}
