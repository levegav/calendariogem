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

async function openCustom() {
  await userEvent.click(screen.getByRole('button', { name: 'Color personalizado' }))
  return screen.getByRole('group', { name: 'Color personalizado' })
}

describe('ColorPicker', () => {
  it('elige un color sugerido; los que están en uso aparecen deshabilitados', async () => {
    render(<Harness />)
    expect(screen.getByRole('button', { name: '#2563EB, en uso por Luis' })).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: '#9333EA' }))
    expect(screen.getByTestId('valor')).toHaveTextContent('#9333ea')
    expect(screen.getByText('Color sugerido')).toBeInTheDocument()
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

  describe('color personalizado', () => {
    it('cambia el matiz con la barra y solo aplica al pulsar "Usar este color"', async () => {
      render(<Harness initial="#ff0000" />)
      await openCustom()
      fireEvent.change(screen.getByRole('slider', { name: 'Matiz' }), { target: { value: '240' } })

      expect(screen.getByText('#0000FF')).toBeInTheDocument()
      expect(screen.getByTestId('valor')).toHaveTextContent('#ff0000')

      await userEvent.click(screen.getByRole('button', { name: 'Usar este color' }))
      expect(screen.getByTestId('valor')).toHaveTextContent('#0000ff')
      expect(screen.getByText('Color personalizado', { selector: 'small' })).toBeInTheDocument()
      expect(screen.queryByRole('group', { name: 'Color personalizado' })).not.toBeInTheDocument()
    })

    it('ajusta intensidad y brillo con el teclado en el recuadro', async () => {
      render(<Harness initial="#ff0000" />)
      await openCustom()
      const area = screen.getByRole('slider', { name: 'Intensidad y brillo' })
      area.focus()
      await userEvent.keyboard('{Shift>}{ArrowDown}{ArrowDown}{ArrowDown}{ArrowDown}{ArrowDown}{/Shift}')
      expect(area).toHaveAttribute('aria-valuetext', 'Intensidad 100 %, brillo 50 %')
      await userEvent.click(screen.getByRole('button', { name: 'Usar este color' }))
      expect(screen.getByTestId('valor')).toHaveTextContent('#800000')
    })

    it('"Cancelar" conserva el color anterior', async () => {
      render(<Harness initial="#ff0000" />)
      await openCustom()
      fireEvent.change(screen.getByRole('slider', { name: 'Matiz' }), { target: { value: '120' } })
      await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
      expect(screen.getByTestId('valor')).toHaveTextContent('#ff0000')
    })

    it('muestra la vista previa Nuevo / Actual', async () => {
      render(<Harness />)
      await openCustom()
      expect(screen.getByText('Nuevo')).toBeInTheDocument()
      expect(screen.getByText('Actual')).toBeInTheDocument()
    })

    it('no deja usar un color de otro usuario', async () => {
      render(<Harness />)
      await openCustom()
      await userEvent.click(screen.getByText('Valores exactos (HEX / RGB)'))
      const hex = screen.getByRole('textbox', { name: 'HEX' })
      await userEvent.clear(hex)
      await userEvent.type(hex, '#16A34A')
      expect(screen.getByText('Este color ya lo usa Carlos. Elija uno distinto.')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Usar este color' })).toBeDisabled()
    })

    it('los valores exactos siguen disponibles (HEX y RGB)', async () => {
      render(<Harness initial="#000000" />)
      await openCustom()
      await userEvent.click(screen.getByText('Valores exactos (HEX / RGB)'))
      const red = screen.getByRole('textbox', { name: 'R (0 a 255)' })
      await userEvent.clear(red)
      await userEvent.type(red, '300')
      expect(red).toHaveValue('255')
      await userEvent.click(screen.getByRole('button', { name: 'Usar este color' }))
      expect(screen.getByTestId('valor')).toHaveTextContent('#ff0000')
    })
  })
})
