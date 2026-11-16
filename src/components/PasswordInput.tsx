import { useState, type InputHTMLAttributes } from 'react'

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>

/** Campo de contraseña con un botón (ojo) para ver lo que se está escribiendo. */
export function PasswordInput(props: Props) {
  const [visible, setVisible] = useState(false)
  const common = {
    width: 20,
    height: 20,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  }

  return (
    <div className="password-input">
      <input {...props} type={visible ? 'text' : 'password'} />
      <button
        type="button"
        aria-label={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'}
        title={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'}
        onClick={() => setVisible((v) => !v)}
      >
        {visible ? (
          <svg {...common}>
            <path d="M17.9 17.9A10.4 10.4 0 0 1 12 19.5C5 19.5 1.5 12 1.5 12a18.6 18.6 0 0 1 4.6-5.9M9.9 4.7A9.6 9.6 0 0 1 12 4.5c7 0 10.5 7.5 10.5 7.5a18.7 18.7 0 0 1-2.2 3.3" />
            <path d="M14.1 14.1a3 3 0 0 1-4.2-4.2M2 2l20 20" />
          </svg>
        ) : (
          <svg {...common}>
            <path d="M1.5 12S5 4.5 12 4.5 22.5 12 22.5 12 19 19.5 12 19.5 1.5 12 1.5 12z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        )}
      </button>
    </div>
  )
}
