import { fireEvent, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeAuth, fakeProfile, renderWithAuth } from '../../test/fakeAuth'
import { listCategories } from '../categories/api'
import { deleteReminder, leaveReminder, listCalendarReminders, listPeople, saveReminder } from './api'
import { CalendarPage } from './CalendarPage'
import { fakeEvent } from './testEvents'

vi.mock('./api', () => ({
  listCalendarReminders: vi.fn(),
  listPeople: vi.fn(),
  saveReminder: vi.fn(),
  deleteReminder: vi.fn(),
  leaveReminder: vi.fn(),
}))
vi.mock('../categories/api', () => ({ listCategories: vi.fn() }))

const me = fakeProfile({ id: 'yo', full_name: 'Luis Vega', color: '#2563eb' })
const carlos = { id: 'carlos', full_name: 'Carlos Mora', color: '#16a34a' }
const ana = { id: 'ana', full_name: 'Ana Rodríguez', color: '#ea580c' }
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
  vi.mocked(listCalendarReminders).mockResolvedValue([meeting])
  vi.mocked(listPeople).mockResolvedValue([ana, carlos, { id: 'yo', full_name: 'Luis Vega', color: '#2563eb' }])
  vi.mocked(listCategories).mockResolvedValue([
    { id: 1, name: 'Reunión', color: '#2563eb', active: true },
    { id: 2, name: 'Tarea', color: '#16a34a', active: true },
    { id: 3, name: 'Vieja', color: '#000000', active: false },
  ])
  vi.mocked(saveReminder).mockResolvedValue(1)
  vi.mocked(deleteReminder).mockResolvedValue(undefined)
  vi.mocked(leaveReminder).mockResolvedValue(undefined)
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
    expect(listCalendarReminders).toHaveBeenCalledWith(['yo'], '2026-10-26T06:00:00.000Z', '2026-12-07T06:00:00.000Z')
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
    await userEvent.type(within(dialog).getByRole('searchbox', { name: /Etiquetar personas/ }), 'car')
    await userEvent.click(await within(dialog).findByRole('button', { name: 'Etiquetar a Carlos Mora' }))
    expect(within(dialog).getByRole('button', { name: 'Quitar a Carlos Mora' })).toBeInTheDocument()
    expect(within(dialog).getByText(/1 persona etiquetada/)).toBeInTheDocument()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Crear recordatorio' }))

    expect(saveReminder).toHaveBeenCalledWith(null, {
      title: 'Entrega de informe',
      description: null,
      start_at: '2026-11-16T20:30:00.000Z',
      end_at: '2026-11-16T22:00:00.000Z',
      all_day: false,
      category_id: 2,
      location: null,
      note: 'Llevar copias',
      participant_ids: ['carlos'],
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
    expect(saveReminder).not.toHaveBeenCalled()
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
    expect(saveReminder).toHaveBeenCalledWith(1, expect.objectContaining({ title: 'Reunión semanal', category_id: 1 }))
  })

  it('el creador elimina su recordatorio tras confirmar', async () => {
    renderAt('/')
    await userEvent.click(await screen.findByRole('button', { name: /Reunión de equipo/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Eliminar' }))
    expect(deleteReminder).toHaveBeenCalledWith(1)
    expect(await screen.findByText('Recordatorio "Reunión de equipo" eliminado.')).toBeInTheDocument()
  })

  it('un recordatorio de otra persona no se puede editar ni eliminar', async () => {
    vi.mocked(listCalendarReminders).mockResolvedValue([{ ...meeting, owner: carlos }])
    renderAt('/')
    await userEvent.click(await screen.findByRole('button', { name: /Reunión de equipo/ }))
    expect(screen.queryByRole('button', { name: 'Editar' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Eliminar' })).not.toBeInTheDocument()
    expect(screen.getByText('Solo Carlos Mora puede modificar o eliminar este recordatorio.')).toBeInTheDocument()
  })

  it('al crear no se ofrece etiquetarse a uno mismo', async () => {
    renderAt('/')
    await userEvent.click(screen.getAllByRole('button', { name: 'Nuevo recordatorio' })[0])
    const dialog = screen.getByRole('dialog', { name: 'Nuevo recordatorio' })
    const search = within(dialog).getByRole('searchbox', { name: /Etiquetar personas/ })
    await userEvent.type(search, 'rodri')
    expect(await within(dialog).findByRole('button', { name: 'Etiquetar a Ana Rodríguez' })).toBeInTheDocument()
    await userEvent.clear(search)
    await userEvent.type(search, 'luis')
    expect(within(dialog).queryByRole('button', { name: 'Etiquetar a Luis Vega' })).not.toBeInTheDocument()
    expect(within(dialog).getByText('No se encontró a nadie con ese nombre.')).toBeInTheDocument()
  })

  it('al editar se puede quitar a un etiquetado', async () => {
    vi.mocked(listCalendarReminders).mockResolvedValue([{ ...meeting, participants: [ana, carlos] }])
    renderAt('/')
    await userEvent.click(await screen.findByRole('button', { name: /Reunión de equipo/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Editar' }))
    const dialog = screen.getByRole('dialog', { name: 'Editar recordatorio' })
    await userEvent.click(within(dialog).getByRole('button', { name: 'Quitar a Ana Rodríguez' }))
    expect(within(dialog).queryByRole('button', { name: 'Quitar a Ana Rodríguez' })).not.toBeInTheDocument()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Guardar cambios' }))
    expect(saveReminder).toHaveBeenCalledWith(1, expect.objectContaining({ participant_ids: ['carlos'] }))
  })

  it('los detalles muestran a los etiquetados', async () => {
    vi.mocked(listCalendarReminders).mockResolvedValue([{ ...meeting, participants: [ana, carlos] }])
    renderAt('/')
    await userEvent.click(await screen.findByRole('button', { name: /Reunión de equipo/ }))
    const dialog = screen.getByRole('dialog', { name: 'Reunión de equipo' })
    expect(within(dialog).getByText('Etiquetados')).toBeInTheDocument()
    expect(within(dialog).getByText('Ana Rodríguez')).toBeInTheDocument()
    expect(within(dialog).getByText('Carlos Mora')).toBeInTheDocument()
  })

  it('un etiquetado puede salirse del recordatorio', async () => {
    vi.mocked(listCalendarReminders).mockResolvedValue([
      { ...meeting, owner: carlos, participants: [{ id: 'yo', full_name: 'Luis Vega', color: '#2563eb' }] },
    ])
    renderAt('/')
    await userEvent.click(await screen.findByRole('button', { name: /Reunión de equipo/ }))
    expect(screen.queryByRole('button', { name: 'Editar' })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Salir del recordatorio' }))
    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('Dejará de aparecer en su calendario'))
    expect(leaveReminder).toHaveBeenCalledWith(1, 'yo')
    expect(await screen.findByText('Salió del recordatorio "Reunión de equipo".')).toBeInTheDocument()
  })

  it('en Semana se resalta la franja de media hora bajo el mouse y desaparece al salir', async () => {
    renderAt('/?vista=semana&fecha=2026-11-16')
    const container = document.body
    await screen.findByRole('button', { name: /Reunión de equipo/ })
    const column = container.querySelector<HTMLElement>('[class*="dayColumn"]')!
    // 9:40 a. m. -> franja de 9:30 (48 px por hora).
    fireEvent.mouseMove(column, { clientY: 9 * 48 + 32 })
    const slot = container.querySelector<HTMLElement>('[class*="hoverSlot"]')!
    expect(slot.style.top).toBe(`${9.5 * 48}px`)
    expect(slot.style.height).toBe('24px')
    fireEvent.mouseLeave(column)
    expect(container.querySelector('[class*="hoverSlot"]')).toBeNull()
  })

  it('un usuario que no es admin no tiene "Ver calendario de…" y solo consulta el suyo', async () => {
    localStorage.setItem('calendarios-visibles:yo', JSON.stringify(['yo', 'carlos']))
    renderWithAuth(routes, '/', fakeAuth({ status: 'signedIn', profile: { ...me, role: 'user' } }))
    expect(await screen.findByRole('button', { name: /Reunión de equipo/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Ver calendario de/ })).not.toBeInTheDocument()
    expect(listCalendarReminders).toHaveBeenLastCalledWith(['yo'], expect.any(String), expect.any(String))
  })

  it('el admin, con "Ver calendario de…", agrega el calendario de otra persona y lo recuerda', async () => {
    renderAt('/')
    await userEvent.click(await screen.findByRole('button', { name: /Ver calendario de/ }))
    const mine = screen.getByRole('checkbox', { name: 'Luis Vega (yo)' })
    expect(mine).toBeChecked()
    expect(mine).toBeDisabled() // siempre queda al menos uno
    await userEvent.click(screen.getByRole('checkbox', { name: 'Carlos Mora' }))
    expect(listCalendarReminders).toHaveBeenLastCalledWith(['yo', 'carlos'], expect.any(String), expect.any(String))
    expect(JSON.parse(localStorage.getItem('calendarios-visibles:yo')!)).toEqual(['yo', 'carlos'])
    expect(screen.getByRole('button', { name: /Ver calendario de:.*2 calendarios/ })).toBeInTheDocument()

    await userEvent.click(screen.getByRole('checkbox', { name: 'Luis Vega (yo)' }))
    expect(listCalendarReminders).toHaveBeenLastCalledWith(['carlos'], expect.any(String), expect.any(String))
    await userEvent.click(screen.getByRole('button', { name: 'Solo el mío' }))
    expect(listCalendarReminders).toHaveBeenLastCalledWith(['yo'], expect.any(String), expect.any(String))
  })
})