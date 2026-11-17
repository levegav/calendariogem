import { useCallback, useEffect, useState } from 'react'
import { UserAvatar } from '../../components/UserAvatar'
import { generateTemporaryPassword, ROLE_LABELS } from '../../lib/auth'
import { toSpanishMessage } from '../../lib/errors'
import { useAuth, type Profile } from '../auth/AuthContext'
import { listUsers, resetUserPassword, setUserActive } from './api'
import { CreateUserForm, type Credentials } from './CreateUserForm'
import { EditUserForm } from './EditUserForm'
import styles from './UsersPage.module.css'

type Message = { type: 'success' | 'error'; text: string; credentials?: Credentials }

export function UsersPage() {
  const { state, refreshProfile } = useAuth()
  const currentUserId = state.status === 'signedIn' ? state.profile.id : null

  const [users, setUsers] = useState<Profile[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [message, setMessage] = useState<Message | null>(null)
  const [creating, setCreating] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  const reload = useCallback(() => setReloadKey((key) => key + 1), [])

  useEffect(() => {
    let cancelled = false
    listUsers().then(
      (data) => {
        if (cancelled) return
        setUsers(data)
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

  async function runAction(user: Profile, action: () => Promise<Message>) {
    setMessage(null)
    setBusyId(user.id)
    try {
      setMessage(await action())
      reload()
    } catch (err) {
      setMessage({ type: 'error', text: toSpanishMessage(err) })
    } finally {
      setBusyId(null)
    }
  }

  function toggleActive(user: Profile) {
    const question = user.active
      ? `¿Desactivar a ${user.full_name}? No podrá iniciar sesión, pero su información y recordatorios se conservan. ` +
        'Quienes estén etiquetados en sus recordatorios que aún no pasan decidirán si conservan una copia.'
      : `¿Activar a ${user.full_name}?`
    if (!window.confirm(question)) return
    void runAction(user, async () => {
      await setUserActive(user.id, !user.active)
      return {
        type: 'success',
        text: user.active
          ? `${user.full_name} fue desactivado. Ya no podrá iniciar sesión; su información se conserva.`
          : `${user.full_name} fue activado.`,
      }
    })
  }

  function resetPassword(user: Profile) {
    if (!window.confirm(`¿Restablecer la contraseña de ${user.full_name}? Se generará una contraseña temporal.`)) return
    const password = generateTemporaryPassword()
    void runAction(user, async () => {
      await resetUserPassword(user.id, password)
      return {
        type: 'success',
        text: `Contraseña restablecida para ${user.full_name}.`,
        credentials: { username: user.username, password },
      }
    })
  }

  const activeCount = users?.filter((u) => u.active).length ?? 0

  return (
    <section className="stack">
      <div className="page-header">
        <div>
          <h1>Usuarios</h1>
          {users && (
            <p className="muted">
              {activeCount} activo{activeCount === 1 ? '' : 's'} de {users.length}
            </p>
          )}
        </div>
        {!creating && users && (
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              setMessage(null)
              setCreating(true)
            }}
          >
            Nuevo usuario
          </button>
        )}
      </div>

      {message && (
        <div className={`alert ${message.type === 'success' ? 'alert-success' : 'alert-error'}`} role="status">
          <p>{message.text}</p>
          {message.credentials && (
            <div className={styles.credentials}>
              <p>Entregue estos datos al usuario. La contraseña no se volverá a mostrar:</p>
              <dl>
                <dt>Usuario</dt>
                <dd>{message.credentials.username}</dd>
                <dt>Contraseña temporal</dt>
                <dd>{message.credentials.password}</dd>
              </dl>
            </div>
          )}
        </div>
      )}

      {creating && users && (
        <CreateUserForm
          users={users}
          onCancel={() => setCreating(false)}
          onCreated={(credentials) => {
            setCreating(false)
            setMessage({ type: 'success', text: 'Usuario creado correctamente.', credentials })
            reload()
          }}
        />
      )}

      {loadError && (
        <p className="alert alert-error" role="alert">
          {loadError}
        </p>
      )}
      {!users && !loadError && <p className="muted">Cargando usuarios…</p>}

      {users && (
        <ul className={styles.list}>
          {users.map((user) => {
            const isSelf = user.id === currentUserId
            const busy = busyId === user.id
            return (
              <li
                key={user.id}
                className={`card ${styles.item} ${user.active ? '' : styles.inactive}`}
                style={{ borderLeftColor: user.color }}
              >
                <div className={styles.summary}>
                  <div className={styles.identity}>
                    <UserAvatar name={user.full_name} color={user.color} />
                    <div>
                      <strong>{user.full_name}</strong>
                      {isSelf && <span className="muted"> (usted)</span>}
                      <div className="muted">
                        {user.username} · <span className={styles.hex}>{user.color.toUpperCase()}</span>
                      </div>
                    </div>
                  </div>
                  <div className={styles.badges}>
                    <span className="badge">{ROLE_LABELS[user.role]}</span>
                    <span className={`badge ${user.active ? 'badge-success' : 'badge-muted'}`}>
                      {user.active ? 'Activo' : 'Inactivo'}
                    </span>
                    {user.active && user.must_change_password && (
                      <span className="badge badge-warning">Contraseña temporal</span>
                    )}
                  </div>
                </div>

                {editingId === user.id ? (
                  <EditUserForm
                    user={user}
                    users={users}
                    isSelf={isSelf}
                    onCancel={() => setEditingId(null)}
                    onSaved={() => {
                      setEditingId(null)
                      setMessage({ type: 'success', text: 'Usuario actualizado.' })
                      reload()
                      // Si el admin cambió su propio nombre o color, se refleja en el menú.
                      if (isSelf) void refreshProfile()
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
                        setEditingId(user.id)
                      }}
                    >
                      Editar
                    </button>
                    {!isSelf && (
                      <>
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          disabled={busy || !user.active}
                          onClick={() => resetPassword(user)}
                        >
                          Restablecer contraseña
                        </button>
                        <button
                          type="button"
                          className={`btn btn-sm ${user.active ? 'btn-danger' : 'btn-secondary'}`}
                          disabled={busy}
                          onClick={() => toggleActive(user)}
                        >
                          {user.active ? 'Desactivar' : 'Activar'}
                        </button>
                      </>
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
