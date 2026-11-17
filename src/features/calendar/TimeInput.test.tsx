import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { TimeInput } from './TimeInput'
import { TIME_OPTIONS } from './reminderForm'

function Harness({ initial = 9 * 60, onChange = vi.fn() }: { initial?: number; onChange?: (m: number) => void }) {
  const [value, setValue] = useState(initial)
  return (
    <TimeInput
      label="Hora de inicio"
      value={value}
      options={TIME_OPTIONS}
      onChange={(m) => {
        setValue(m)
        onChange(m)
      }}
    />
  )
}

const field = () => screen.getByRole('combobox', { name: 'Hora de inicio' })

describe('TimeInput', () => {
  it('muestra la lista cada 15 min al tocarla y se elige con un clic', async () => {
    const onChange = vi.fn()
    render(<Harness onChange={onChange} />)
    await userEvent.click(field())
    expect(screen.getAllByRole('option')).toHaveLength(96)
    expect(screen.getByRole('option', { name: '9:00 a. m.' })).toHaveAttribute('aria-selected', 'true')
    await userEvent.click(screen.getByRole('option', { name: '10:45 a. m.' }))
    expect(onChange).toHaveBeenCalledWith(10 * 60 + 45)
    expect(field()).toHaveValue('10:45 a. m.')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  it('acepta una hora escrita a mano con Enter', async () => {
    const onChange = vi.fn()
    render(<Harness onChange={onChange} />)
    await userEvent.click(field())
    await userEvent.clear(field())
    await userEvent.type(field(), '10:03{Enter}')
    expect(onChange).toHaveBeenCalledWith(10 * 60 + 3)
    expect(field()).toHaveValue('10:03 a. m.')
  })

  it('si lo escrito no es una hora, vuelve a la anterior y lo indica', async () => {
    const onChange = vi.fn()
    render(<Harness onChange={onChange} />)
    await userEvent.click(field())
    await userEvent.clear(field())
    await userEvent.type(field(), '25:99')
    await userEvent.tab()
    expect(onChange).not.toHaveBeenCalled()
    expect(field()).toHaveValue('9:00 a. m.')
    expect(field()).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByText(/No es una hora válida/)).toBeInTheDocument()
  })

  it('con las flechas se recorre la lista y Enter elige', async () => {
    const onChange = vi.fn()
    render(<Harness onChange={onChange} />)
    await userEvent.click(field())
    await userEvent.keyboard('{ArrowDown}{ArrowDown}{Enter}')
    expect(onChange).toHaveBeenCalledWith(9 * 60 + 30)
  })

  it('una hora fuera de la lista se conserva', () => {
    render(<Harness initial={10 * 60 + 3} />)
    expect(field()).toHaveValue('10:03 a. m.')
  })
})
