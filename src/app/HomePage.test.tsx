import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { HomePage } from './HomePage'

describe('HomePage', () => {
  it('muestra el nombre de la app y la conexión correcta', async () => {
    render(<HomePage check={() => Promise.resolve('ok')} />)
    expect(screen.getByRole('heading', { name: 'Calendario GEM' })).toBeInTheDocument()
    expect(await screen.findByText('Conexión con el servidor: correcta')).toBeInTheDocument()
  })

  it('avisa si no hay conexión', async () => {
    render(<HomePage check={() => Promise.resolve('error')} />)
    expect(await screen.findByText('No se pudo conectar con el servidor')).toBeInTheDocument()
  })
})
