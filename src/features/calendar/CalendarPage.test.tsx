import { fireEvent, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeAuth, fakeProfile, renderWithAuth } from '../../test/fakeAuth'
import { listCategories } from '../categories/api'
import { deleteReminder, leaveReminder, listCalendarReminders, listPeople, saveReminder, searchReminders, setMyAlerts } from './api'
import { CalendarPage } from './CalendarPage'
import {
  listOutlookEvents,
  outlookToEvent,
  searchOutlookEvents,
  setOutlookAlerts,
  subscribeToOutlookChanges,
} from './outlook'
import { fakeEvent } from './testEvents'

vi.mock('./api', () => ({
  listCalendarReminders: vi.fn(),
  listPeople: vi.fn(),
  saveReminder: vi.fn(),
  deleteReminder: vi.fn(),
  leaveReminder: vi.fn(),
  setMyAlerts: vi.fn(),
  searchReminders: vi.fn(),
}))
vi.mock('../categories/api', () => ({ listCategories: vi.fn() }))
vi.mock('./outlook', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./outlook')>()),
  listOutlookEvents: vi.fn(),
  searchOutlookEvents: vi.fn(),
  subscribeToOutlookChanges: vi.fn(() => () => {}),
  setOutlookAlerts: vi.fn(),
}))

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
    { id: 1, name: 'Reunión', color: '#2563eb', active: true, personal_only: false },
    { id: 2, name: 'Tarea', color: '#16a34a', active: true, personal_only: false },
    { id: 3, name: 'Vieja', color: '#000000', active: false, personal_only: false },
  ])
  vi.mocked(saveReminder).mockResolvedValue(1)
  vi.mocked(deleteReminder).mockResolvedValue(undefined)
  vi.mocked(leaveReminder).mockResolvedValue(undefined)
  vi.mocked(setMyAlerts).mockResolvedValue(undefined)
  vi.mocked(listOutlookEvents).mockResolvedValue([])
  vi.mocked(searchOutlookEvents).mockResolvedValue([])
  vi.spyOn(window, 'confirm').mockReturnValue(true)
})

/** Reunión de Outlook de ejemplo (en el calendario de Luis). */
const comite = outlookToEvent({
  id: 7,
  event_key: 'UID-7|',
  subject: 'Comité de proyecto',
  start_at: '2026-11-17T15:00:00Z',
  end_at: '2026-11-17T16:00:00Z',
  all_day: false,
  location: 'Microsoft Teams Meeting',
  organizer_name: 'Ana Rodríguez',
  organizer_email: 'ana@empresa.com',
  attendees: [
    { name: 'Luis Vega', email: null, response: 'Accept', optional: false },
    { name: 'Carlos Mora', email: null, response: 'Decline', optional: true },
  ],
  join_url: 'https://teams.microsoft.com/l/meetup-join/abc',
  is_recurring: true,
  is_cancelled: false,
  show_as: 'Busy',
  my_response: 'Accept',
  owner: { id: 'yo', full_name: 'Luis Vega', color: '#2563eb' },
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
    // De la lista (cada 15 min)…
    await userEvent.click(within(dialog).getByRole('combobox', { name: 'Hora de inicio' }))
    await userEvent.click(within(dialog).getByRole('option', { name: '2:30 p. m.' }))
    await userEvent.click(within(dialog).getByLabelText('Agregar fecha y hora de finalización'))
    // …o escrita a mano, a cualquier minuto.
    const fin = within(dialog).getByRole('combobox', { name: 'Hora de finalización' })
    await userEvent.clear(fin)
    await userEvent.type(fin, '4:07 pm')
    await userEvent.tab()
    expect(fin).toHaveValue('4:07 p. m.')
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
      end_at: '2026-11-16T22:07:00.000Z',
      all_day: false,
      category_id: 2,
      location: null,
      note: 'Llevar copias',
      participant_ids: ['carlos'],
      alerts: [15],
      is_general: null,
    })
    expect(await screen.findByText('Recordatorio "Entrega de informe" creado.')).toBeInTheDocument()
  })

  it('sin acceso al calendario general no se ofrece dónde publicar', async () => {
    renderAt('/')
    await userEvent.click(screen.getAllByRole('button', { name: 'Nuevo recordatorio' })[0])
    const dialog = screen.getByRole('dialog', { name: 'Nuevo recordatorio' })
    expect(within(dialog).queryByRole('group', { name: 'Publicar en' })).not.toBeInTheDocument()
  })

  it('con acceso, se publica en el calendario general', async () => {
    vi.mocked(listCategories).mockResolvedValue([
      { id: 4, name: 'Personal', color: '#9333ea', active: true, personal_only: true },
      { id: 1, name: 'Reunión', color: '#2563eb', active: true, personal_only: false },
    ])
    renderWithAuth(routes, '/', fakeAuth({ status: 'signedIn', profile: { ...me, general_access: true } }))
    await userEvent.click(screen.getAllByRole('button', { name: 'Nuevo recordatorio' })[0])
    const dialog = screen.getByRole('dialog', { name: 'Nuevo recordatorio' })
    const publishIn = within(dialog).getByRole('group', { name: 'Publicar en' })
    expect(within(publishIn).getByRole('radio', { name: 'Mi calendario' })).toBeChecked()
    // En su calendario se puede etiquetar y usar la categoría Personal…
    expect(within(dialog).getByRole('searchbox', { name: /Etiquetar personas/ })).toBeInTheDocument()
    expect(within(dialog).getByRole('radio', { name: 'Personal' })).toBeChecked()
    await userEvent.click(within(publishIn).getByRole('radio', { name: 'Calendario general' }))
    expect(within(dialog).getByText(/Lo verán todos los que tienen acceso al calendario general/)).toBeInTheDocument()
    // …en el general, no: se ocultan y la categoría pasa a otra.
    expect(within(dialog).queryByRole('searchbox', { name: /Etiquetar personas/ })).not.toBeInTheDocument()
    expect(within(dialog).queryByRole('radio', { name: 'Personal' })).not.toBeInTheDocument()
    expect(within(dialog).getByRole('radio', { name: 'Reunión' })).toBeChecked()
    await userEvent.type(within(dialog).getByLabelText('Título'), 'Comité')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Crear recordatorio' }))

    expect(saveReminder).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ title: 'Comité', is_general: true, category_id: 1, participant_ids: [] }),
    )
    expect(await screen.findByText('Recordatorio "Comité" publicado en el calendario general.')).toBeInTheDocument()
  })

  it('lo del calendario general se ve con su marca y quien lo creó', async () => {
    vi.mocked(listCalendarReminders).mockResolvedValue([{ ...meeting, owner: carlos, is_general: true }])
    renderWithAuth(routes, '/', fakeAuth({ status: 'signedIn', profile: { ...me, role: 'user', general_access: true } }))
    const chip = await screen.findByRole('button', { name: /Reunión de equipo, .*calendario general, creado por Carlos Mora/ })
    expect(chip).toHaveAttribute('data-general', 'true')
    // Un usuario con acceso no elige calendarios: lo propio y lo general se ven juntos.
    expect(screen.queryByRole('button', { name: /Ver calendario de/ })).not.toBeInTheDocument()
    await userEvent.click(chip)
    const dialog = screen.getByRole('dialog', { name: 'Reunión de equipo' })
    expect(within(dialog).getByText('Calendario general')).toBeInTheDocument()
    expect(within(dialog).getByText('Creado por: Carlos Mora')).toBeInTheDocument()
    expect(within(dialog).queryByRole('button', { name: 'Editar' })).not.toBeInTheDocument()
  })

  it('al editar uno del general sin tener ya acceso, no cambia de calendario', async () => {
    vi.mocked(listCalendarReminders).mockResolvedValue([{ ...meeting, is_general: true }])
    renderAt('/')
    await userEvent.click(await screen.findByRole('button', { name: /Reunión de equipo/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Editar' }))
    const dialog = screen.getByRole('dialog', { name: 'Editar recordatorio' })
    expect(within(dialog).queryByRole('group', { name: 'Publicar en' })).not.toBeInTheDocument()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Guardar cambios' }))
    expect(saveReminder).toHaveBeenCalledWith(1, expect.objectContaining({ is_general: null }))
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

  it('en los detalles, cada participante cambia sus avisos y se guardan al marcarlos', async () => {
    vi.mocked(listCalendarReminders).mockResolvedValue([
      { ...meeting, owner: carlos, participants: [{ id: 'yo', full_name: 'Luis Vega', color: '#2563eb' }], my_alerts: [15] },
    ])
    renderAt('/')
    await userEvent.click(await screen.findByRole('button', { name: /Reunión de equipo/ }))
    const dialog = screen.getByRole('dialog', { name: 'Reunión de equipo' })
    const avisos = within(dialog).getByRole('group', { name: 'Mis avisos' })
    expect(within(avisos).getByRole('checkbox', { name: '15 min antes' })).toBeChecked()
    await userEvent.click(within(avisos).getByRole('checkbox', { name: '1 día antes' }))
    expect(setMyAlerts).toHaveBeenCalledWith(1, [15, 1440])
    expect(await within(dialog).findByText('Avisos guardados.')).toBeInTheDocument()
    expect(within(avisos).getByRole('checkbox', { name: '1 día antes' })).toBeChecked()
  })

  it('si no se pueden guardar los avisos, vuelven a como estaban', async () => {
    vi.mocked(setMyAlerts).mockRejectedValue(new Error('sin conexión'))
    renderAt('/')
    await userEvent.click(await screen.findByRole('button', { name: /Reunión de equipo/ }))
    const avisos = screen.getByRole('group', { name: 'Mis avisos' })
    await userEvent.click(within(avisos).getByRole('checkbox', { name: '15 min antes' }))
    expect(await screen.findByText('No se pudieron guardar los avisos. Intente de nuevo.')).toBeInTheDocument()
    expect(within(avisos).getByRole('checkbox', { name: '15 min antes' })).toBeChecked()
  })

  it('al crear, "Todo el día" cambia las opciones de aviso y pone el del día anterior', async () => {
    renderAt('/')
    await userEvent.click(screen.getAllByRole('button', { name: 'Nuevo recordatorio' })[0])
    const dialog = screen.getByRole('dialog', { name: 'Nuevo recordatorio' })
    const avisos = within(dialog).getByRole('group', { name: 'Mis avisos' })
    expect(within(avisos).getByRole('checkbox', { name: '15 min antes' })).toBeChecked()
    await userEvent.click(within(dialog).getByLabelText('Todo el día'))
    expect(within(avisos).getByRole('checkbox', { name: 'El día anterior' })).toBeChecked()
    expect(within(avisos).queryByRole('checkbox', { name: '15 min antes' })).not.toBeInTheDocument()
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

  describe('búsqueda', () => {
    it('busca en todas las fechas y al tocar un resultado abre su día y sus detalles', async () => {
      const lejano = fakeEvent({
        id: 9,
        title: 'Comité anual',
        start_at: '2027-03-10T09:00:00-06:00',
        owner: { id: 'yo', full_name: 'Luis Vega', color: '#2563eb' },
      })
      const pasado = fakeEvent({ id: 8, title: 'Comité de octubre', start_at: '2026-10-05T09:00:00-06:00' })
      vi.mocked(searchReminders).mockResolvedValue({ results: [lejano, pasado], truncated: false })
      const router = renderAt('/')
      await userEvent.type(screen.getByRole('searchbox', { name: 'Buscar recordatorios' }), 'comite')

      const results = await screen.findByRole('region', { name: 'Resultados de la búsqueda' })
      expect(searchReminders).toHaveBeenCalledWith(['yo'], 'comite')
      expect(await within(results).findByRole('heading', { name: '2 resultados para «comite»' })).toBeInTheDocument()
      expect(within(results).getByText('Próximos')).toBeInTheDocument()
      expect(within(results).getByText('Anteriores')).toBeInTheDocument()
      expect(within(results).getByText('Miércoles 10 de marzo de 2027')).toBeInTheDocument()

      await userEvent.click(within(results).getByRole('button', { name: /Comité anual/ }))
      expect(router.state.location.search).toBe('?vista=dia&fecha=2027-03-10')
      expect(screen.getByRole('dialog', { name: 'Comité anual' })).toBeInTheDocument()
      expect(screen.queryByRole('region', { name: 'Resultados de la búsqueda' })).not.toBeInTheDocument()
    })

    it('sin coincidencias lo indica, y "Volver al calendario" limpia la búsqueda', async () => {
      vi.mocked(searchReminders).mockResolvedValue({ results: [], truncated: false })
      renderAt('/')
      const box = screen.getByRole('searchbox', { name: 'Buscar recordatorios' })
      await userEvent.type(box, 'xyz')
      expect(await screen.findByText(/No se encontraron recordatorios/)).toBeInTheDocument()
      await userEvent.click(screen.getByRole('button', { name: 'Volver al calendario' }))
      expect(box).toHaveValue('')
      expect(await screen.findByRole('button', { name: /Reunión de equipo/ })).toBeInTheDocument()
    })
  })

  describe('filtros', () => {
    it('por categoría: oculta, lo indica y se quitan', async () => {
      renderAt('/')
      expect(await screen.findByRole('button', { name: /Reunión de equipo/ })).toBeInTheDocument()
      await userEvent.click(screen.getByRole('button', { name: /^Filtros/ }))
      await userEvent.click(screen.getByRole('checkbox', { name: 'Reunión' }))
      expect(screen.queryByRole('button', { name: /Reunión de equipo/ })).not.toBeInTheDocument()
      const banner = screen.getByText('Filtros:').closest('p')!
      expect(banner).toHaveTextContent('Categorías: Tarea, Vieja')
      expect(banner).toHaveTextContent('1 recordatorio oculto')
      expect(screen.getByText('Los filtros ocultan todos los recordatorios de este período.')).toBeInTheDocument()
      await userEvent.click(within(banner).getByRole('button', { name: 'Quitar filtros' }))
      expect(screen.getByRole('button', { name: /Reunión de equipo/ })).toBeInTheDocument()
    })

    it('"Donde me etiquetaron" oculta los que creé', async () => {
      const etiquetado = fakeEvent({
        id: 2,
        title: 'Visita de Carlos',
        start_at: '2026-11-19T09:00:00-06:00',
        owner: carlos,
        participants: [{ id: 'yo', full_name: 'Luis Vega', color: '#2563eb' }],
      })
      vi.mocked(listCalendarReminders).mockResolvedValue([meeting, etiquetado])
      renderAt('/')
      await screen.findByRole('button', { name: /Reunión de equipo/ })
      await userEvent.click(screen.getByRole('button', { name: /^Filtros/ }))
      await userEvent.click(screen.getByRole('radio', { name: 'Donde me etiquetaron' }))
      expect(screen.queryByRole('button', { name: /Reunión de equipo/ })).not.toBeInTheDocument()
      expect(screen.getByRole('button', { name: /Visita de Carlos/ })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Filtros (1 activo)' })).toBeInTheDocument()
    })
  })

  describe('reuniones de Outlook', () => {
    it('se ven junto a los recordatorios y su detalle es de solo lectura', async () => {
      vi.mocked(listOutlookEvents).mockResolvedValue([comite])
      renderAt('/')
      expect(await screen.findByRole('button', { name: /Reunión de equipo/ })).toBeInTheDocument()
      const chip = screen.getByRole('button', { name: /Comité de proyecto, 9:00 a\. m\., Reunión de Outlook/ })
      expect(chip).toHaveAttribute('data-outlook', 'true')
      expect(listOutlookEvents).toHaveBeenCalledWith(['yo'], '2026-10-26T06:00:00.000Z', '2026-12-07T06:00:00.000Z')

      await userEvent.click(chip)
      const dialog = screen.getByRole('dialog', { name: 'Comité de proyecto' })
      expect(within(dialog).getByText('Ana Rodríguez')).toBeInTheDocument()
      expect(within(dialog).getByText('Se repite')).toBeInTheDocument()
      expect(within(dialog).getByText('Aceptó · Ocupado')).toBeInTheDocument()
      expect(within(dialog).getByRole('link', { name: 'Unirse a la reunión' })).toHaveAttribute(
        'href',
        'https://teams.microsoft.com/l/meetup-join/abc',
      )
      expect(within(dialog).queryByRole('button', { name: 'Editar' })).not.toBeInTheDocument()
      expect(within(dialog).queryByRole('button', { name: 'Eliminar' })).not.toBeInTheDocument()
    })

    it('se pueden ocultar con el filtro de categorías y no cuentan como "Creados por mí"', async () => {
      vi.mocked(listOutlookEvents).mockResolvedValue([comite])
      renderAt('/')
      await screen.findByRole('button', { name: /Comité de proyecto/ })
      await userEvent.click(screen.getByRole('button', { name: /^Filtros/ }))
      await userEvent.click(screen.getByRole('radio', { name: 'Creados por mí' }))
      expect(screen.queryByRole('button', { name: /Comité de proyecto/ })).not.toBeInTheDocument()
      await userEvent.click(screen.getByRole('radio', { name: 'Todos' }))
      await userEvent.click(screen.getByRole('checkbox', { name: 'Reunión de Outlook' }))
      expect(screen.queryByRole('button', { name: /Comité de proyecto/ })).not.toBeInTheDocument()
      expect(screen.getByRole('button', { name: /Reunión de equipo/ })).toBeInTheDocument()
    })

    it('cuando llegan cambios de Outlook del calendario que se ve, se recarga solo', async () => {
      let notify: (userId: string | null) => void = () => {}
      vi.mocked(subscribeToOutlookChanges).mockImplementation((onChange) => {
        notify = onChange
        return () => {}
      })
      renderAt('/')
      await screen.findByRole('button', { name: /Reunión de equipo/ })
      expect(screen.queryByRole('button', { name: /Comité de proyecto/ })).not.toBeInTheDocument()

      vi.mocked(listOutlookEvents).mockResolvedValue([comite])
      notify('otra-persona') // un calendario que no se está viendo: no recarga
      notify('yo')
      expect(await screen.findByRole('button', { name: /Comité de proyecto/ }, { timeout: 3000 })).toBeInTheDocument()
      expect(listOutlookEvents).toHaveBeenCalledTimes(2)
    })

    it('en mis reuniones muestra los avisos copiados de Outlook y se pueden cambiar', async () => {
      vi.mocked(setOutlookAlerts).mockResolvedValue(undefined)
      vi.mocked(listOutlookEvents).mockResolvedValue([{ ...comite, my_alerts: [15] }])
      renderAt('/')
      await userEvent.click(await screen.findByRole('button', { name: /Comité de proyecto/ }))
      const dialog = screen.getByRole('dialog', { name: 'Comité de proyecto' })
      expect(within(dialog).getByRole('checkbox', { name: '15 min antes' })).toBeChecked()
      expect(within(dialog).getByText(/Copiados del recordatorio de Outlook/)).toBeInTheDocument()

      await userEvent.click(within(dialog).getByRole('checkbox', { name: '1 hora antes' }))
      expect(setOutlookAlerts).toHaveBeenCalledWith('UID-7|', [15, 60])
      expect(await within(dialog).findByText(/Ya no cambian aunque cambie el recordatorio en Outlook/)).toBeInTheDocument()
    })

    it('en reuniones de otro calendario (admin) no hay avisos propios', async () => {
      vi.mocked(listOutlookEvents).mockResolvedValue([{ ...comite, owner: carlos }])
      renderAt('/')
      await userEvent.click(await screen.findByRole('button', { name: /Comité de proyecto/ }))
      const dialog = screen.getByRole('dialog', { name: 'Comité de proyecto' })
      expect(within(dialog).queryByText('Mis avisos')).not.toBeInTheDocument()
    })

    it('si fallan las reuniones de Outlook, los recordatorios se muestran igual', async () => {
      vi.mocked(listOutlookEvents).mockRejectedValue(new Error('sin conexión'))
      renderAt('/')
      expect(await screen.findByRole('button', { name: /Reunión de equipo/ })).toBeInTheDocument()
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    })

    it('la búsqueda también encuentra reuniones de Outlook', async () => {
      vi.mocked(searchReminders).mockResolvedValue({ results: [], truncated: false })
      vi.mocked(searchOutlookEvents).mockResolvedValue([comite])
      renderAt('/')
      fireEvent.change(screen.getByRole('searchbox', { name: 'Buscar recordatorios' }), { target: { value: 'comite' } })
      expect(await screen.findByRole('button', { name: /Comité de proyecto/ })).toBeInTheDocument()
      expect(searchOutlookEvents).toHaveBeenCalledWith(['yo'], 'comite', 101)
    })
  })
})
