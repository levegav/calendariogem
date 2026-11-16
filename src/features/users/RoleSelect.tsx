import { ROLE_DESCRIPTIONS, ROLE_LABELS, type UserRole } from '../../lib/auth'

const ROLES: UserRole[] = ['user', 'admin']

export function RoleSelect({
  value,
  onChange,
  disabled,
}: {
  value: UserRole
  onChange: (role: UserRole) => void
  disabled?: boolean
}) {
  return (
    <div className="field">
      <label className="field">
        <span>Rol</span>
        <select value={value} onChange={(e) => onChange(e.target.value as UserRole)} disabled={disabled}>
          {ROLES.map((role) => (
            <option key={role} value={role}>
              {ROLE_LABELS[role]}
            </option>
          ))}
        </select>
      </label>
      <small className="muted">{ROLE_DESCRIPTIONS[value]}</small>
    </div>
  )
}
