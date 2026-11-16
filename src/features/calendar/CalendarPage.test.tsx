import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeAuth, fakeProfile, renderWithAuth } from '../../test/fakeAuth'
import { listCategories } from '../categories/api'
import { createReminder, deleteReminder, listMyReminders, updateReminder } from './api'
import { CalendarPage } from './CalendarPage'
import { fakeEvent } from './testEvents'

vi.mock('./api', () => ({
  listMyReminders: vi.fn(),
  createReminder: vi.fn(),
  updateReminder: vi.fn(),
  deleteReminder: vi.fn(),
}))
vi.mock('../categories/api', () => ({ listCategories: vi.fn() }))

const me = fakeProfile({ id: 'yo', full_name: 'Luis Vega', color: '#2563eb' })
const routes = [{ path: '/', element: <CalendarPage /> }]

const meeting = fakeEvent({
  id: 1,
  title: 'Reunión de equipo',
  start_at: '2026-11-18T14:00:00-06:00',
  end_at: '2026-11-18T15:00:00-06:00',
  location: 'https://meet.google.com/abc',
  description: 'Revisar avances',
  owner: { id: 'yo', full_name: 'Luis Vega', color: '#2563eb' },
})

function renderAt(path: string) {
  return renderWithAuth(routes, path, fakeAuth({ status: 'signedIn', profile: me }))
}

beforeEach(() => {
  // Hoy: lunes 16 de noviembre de 2026, 10:20 a. m. en Costa Rica.
  vi.useFakeTimers({ now: new Date('2026-11-16T16:20:00Z'), toFake: ['Date'] })
  localStorage.clear()
  vi.mocked(listMyReminders).mockResolvedValue([meeting])
  vi.mocked(listCategories).mockResolvedValue([
    { id: 1, name: 'Reunión', color: '#2563eb', active: true },
    { id: 2, name: 'Tarea', color: '#16a34a', active: true },
    { id: 3, name: 'Vieja', color: '#000000', active: false },
  ])
  vi.mocked(createReminder).mockResolvedValue(undefined)
  vi.mocked(updateReminder).mockResolvedValue(undefined)
  vi.mocked(deleteReminder).mockResolvedValue(undefined)
  vi.spyOn(window, 'confirm').mockReturnValue(true)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('CalendarPage', () => {
  it('abre en el mes actual y muestra los recordatorios', async () => {
    renderAt('/')
    expect(screen.getByRole('heading', { name: 'Noviembre 2026' })).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: /Reunión de equipo, 2:00 p\. m\./ })).toBeInTheDocument()
    expect(listMyReminders).toHaveBeenCalledWith('yo', '2026-10-26T06:00:00.000Z', '2026-12-07T06:00:00.000Z')
  })

  it('navega entre meses y vuelve a hoy', async () => {
    const router = renderAt('/')
    await userEvent.click(screen.getByRole('button', { name: 'Mes siguiente' }))
    expect(screen.getByRole('heading', { name: 'Diciembre 2026' })).toBeInTheDocument()
    expect(router.state.location.search).toBe('?vista=mes&fecha=2026-12-16')
    await userEvent.click(screen.getByRole('button', { name: 'Hoy' }))
    expect(screen.getByRole('heading', { name: 'Noviembre 2026' })).toBeInTheDocument()
  })

  it('cambia de vista y recuerda la elegida', async () => {
    renderAt('/')
    await userEvent.click(screen.getByRole('radio', { name: 'Semana' }))
    expect(screen.getByRole('heading', { name: '16 – 22 nov 2026' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('radio', { name: 'Día' }))
    expect(screen.getByRole('heading', { name: 'Lunes 16 de noviembre de 2026' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('radio', { name: 'Año' }))
    expect(screen.getByRole('heading', { name: '2026' })).toBeInTheDocument()
    expect(localStorage.getItem('vista-calendario')).toBe('ano')
  })

  it('en la vista anual marca los días con recordatorios y lleva al día', async () => {
    const router = renderAt('/?vista=ano&fecha=2026-11-16')
    const day = await screen.findByRole('button', { name: '18 de noviembre, 1 recordatorio' })
    await userEvent.click(day)
    expect(router.state.location.search).toBe('?vista=dia&fecha=2026-11-18')
  })

  it('crea un recordatorio con categoría, hora y finalización', async () => {
    renderAt('/?vista=semana&fecha=2026-11-16')
    await userEvent.click(screen.getAllByRole('button', { name: 'Nuevo recordatorio' })[0])
    const dialog = screen.getByRole('dialog', { name: 'Nuevo recordatorio' })

    await userEvent.type(within(dialog).getByLabelText('Título'), 'Entrega de informe')
    await userEvent.click(within(dialog).getByRole('radio', { name: 'Tarea' }))
    await userEvent.selectOptions(within(dialog).getByLabelText('Hora de inicio'), '2:30 p. m.')
    await userEvent.click(within(dialog).getByLabelText('Agregar fecha y hora de finalización'))
    await userEvent.selectOptions(within(dialog).getByLabelText('Hora de finalización'), '4:00 p. m.')
    await userEvent.type(within(dialog).getByLabelText(/Nota/), 'Llevar copias')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Crear recordatorio' }))

    expect(createReminder).toHaveBeenCalledWith({
      title: 'Entrega de informe',
      description: null,
      start_at: '2026-11-16T20:30:00.000Z',
      end_at: '2026-11-16T22:00:00.000Z',
      all_day: false,
      category_id: 2,
      location: null,
      note: 'Llevar copias',
    })
    expect(await screen.findByText('Recordatorio "Entrega de informe" creado.')).toBeInTheDocument()
  })

  it('las categorías desactivadas no se ofrecen al crear', async () => {
    renderAt('/')
    await userEvent.click(screen.getAllByRole('button', { name: 'Nuevo recordatorio' })[0])
    const dialog = screen.getByRole('dialog', { name: 'Nuevo recordatorio' })
    expect(within(dialog).queryByRole('radio', { name: /Vieja/ })).not.toBeInTheDocument()
  })

  it('no crea sin título', async () => {
    renderAt('/')
    await userEvent.click(screen.getAllByRole('button', { name: 'Nuevo recordatorio' })[0])
    await userEvent.click(screen.getByRole('button', { name: 'Crear recordatorio' }))
    expect(screen.getByText('Escriba un título.')).toBeInTheDocument()
    expect(createReminder).not.toHaveBeenCalled()
  })

  it('muestra los detalles con "Creado por" y el enlace de la reunión', async () => {
    renderAt('/')
    await userEvent.click(await screen.findByRole('button', { name: /Reunión de equipo/ }))
    const dialog = screen.getByRole('dialog', { name: 'Reunión de equipo' })
    expect(within(dialog).getByText('Creado por: Luis Vega')).toBeInTheDocument()
    expect(within(dialog).getByText('Miércoles 18 de noviembre de 2026, 2:00 p. m. – 3:00 p. m.')).toBeInTheDocument()
    expect(within(dialog).getByRole('link', { name: 'https://meet.google.com/abc' })).toHaveAttribute('target', '_blank')
  })

  it('el creador edita su recordatorio', async () => {
    renderAt('/')
    await userEvent.click(await screen.findByRole('button', { name: /Reunión de equipo/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Editar' }))
    const dialog = screen.getByRole('dialog', { name: 'Editar recordatorio' })
    const title = within(dialog).getByLabelText('Título')
    await userEvent.clear(title)
    await userEvent.type(title, 'Reunión semanal')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Guardar cambios' }))
    expect(updateReminder).toHaveBeenCalledWith(1, expect.objectContaining({ title: 'Reunión semanal', category_id: 1 }))
  })

  it('el creador elimina su recordatorio tras confirmar', async () => {
    renderAt('/')
    await userEvent.click(await screen.findByRole('button', { name: /Reunión de equipo/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Eliminar' }))
    expect(deleteReminder).toHaveBeenCalledWith(1)
    expect(await screen.findByText('Recordatorio "Reunión de equipo" eliminado.')).toBeInTheDocument()
  })

  it('un recordatorio de otra persona no se puede editar ni eliminar', async () => {
    vi.mocked(listMyReminders).mockResolvedValue([
      { ...meeting, owner: { id: 'otro', full_name: 'Carlos Mora', color: '#16a34a' } },
    ])
    renderAt('/')
    await userEvent.click(await screen.findByRole('button', { name: /Reunión de equipo/ }))
    expect(screen.queryByRole('button', { name: 'Editar' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Eliminar' })).not.toBeInTheDocument()
    expect(screen.getByText('Solo Carlos Mora puede modificar o eliminar este recordatorio.')).toBeInTheDocument()
  })
})
