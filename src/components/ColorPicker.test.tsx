import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import { ColorPicker } from './ColorPicker'

const users = [
  { id: '1', full_name: 'Luis', color: '#2563eb' },
  { id: '2', full_name: 'Carlos', color: '#16a34a' },
]

function Harness({ initial = '#ea580c', excludeId }: { initial?: string; excludeId?: string }) {
  const [color, setColor] = useState(initial)
  return (
    <>
      <ColorPicker value={color} onChange={setColor} users={users} excludeId={excludeId} />
      <output data-testid="valor">{color}</output>
    </>
  )
}

describe('ColorPicker', () => {
  it('cambia el color escribiendo el código HEX', async () => {
    render(<Harness />)
    const hex = screen.getByRole('textbox', { name: 'HEX' })
    await userEvent.clear(hex)
    await userEvent.type(hex, '#A1B2C3')
    expect(screen.getByTestId('valor')).toHaveTextContent('#a1b2c3')
  })

  it('cambia el color con los valores R, G y B', async () => {
    render(<Harness initial="#000000" />)
    const red = screen.getByRole('textbox', { name: 'R (0 a 255)' })
    await userEvent.clear(red)
    await userEvent.type(red, '255')
    expect(screen.getByTestId('valor')).toHaveTextContent('#ff0000')
  })

  it('ajusta a 255 los valores RGB mayores', async () => {
    render(<Harness initial="#000000" />)
    const green = screen.getByRole('textbox', { name: 'G (0 a 255)' })
    await userEvent.clear(green)
    await userEvent.type(green, '300')
    expect(green).toHaveValue('255')
    expect(screen.getByTestId('valor')).toHaveTextContent('#00ff00')
  })

  it('acepta el selector visual de color', () => {
    render(<Harness />)
    fireEvent.change(screen.getByLabelText('Elegir color'), { target: { value: '#123456' } })
    expect(screen.getByTestId('valor')).toHaveTextContent('#123456')
  })

  it('avisa si el color ya lo usa otro usuario', () => {
    render(<Harness initial="#2563eb" />)
    expect(screen.getByText('Este color ya lo usa Luis. Elija uno distinto.')).toBeInTheDocument()
  })

  it('no avisa cuando el usuario conserva su propio color', () => {
    render(<Harness initial="#2563eb" excludeId="1" />)
    expect(screen.queryByText(/ya lo usa/)).not.toBeInTheDocument()
  })

  it('advierte si el color se parece mucho al de otro usuario', () => {
    render(<Harness initial="#2a66ee" />)
    expect(screen.getByText(/Se parece mucho al color de Luis/)).toBeInTheDocument()
  })

  it('los colores sugeridos en uso aparecen deshabilitados', async () => {
    render(<Harness />)
    expect(screen.getByRole('button', { name: '#2563EB, en uso por Luis' })).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: '#9333EA' }))
    expect(screen.getByTestId('valor')).toHaveTextContent('#9333ea')
  })
})
