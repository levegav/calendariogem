import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeAuth, fakeProfile, renderWithAuth } from '../../test/fakeAuth'
import { createCategory, deleteCategory, listCategories, updateCategory } from './api'
import { CategoriesPage } from './CategoriesPage'

vi.mock('./api', () => ({
  listCategories: vi.fn(),
  createCategory: vi.fn(),
  updateCategory: vi.fn(),
  deleteCategory: vi.fn(),
}))

const routes = [{ path: '/categorias', element: <CategoriesPage /> }]

function renderPage() {
  renderWithAuth(routes, '/categorias', fakeAuth({ status: 'signedIn', profile: fakeProfile() }))
}

beforeEach(() => {
  vi.mocked(listCategories).mockResolvedValue([
    { id: 1, name: 'Reunión', color: '#2563eb', active: true, personal_only: false },
    { id: 2, name: 'Feriado', color: '#ca8a04', active: false, personal_only: false },
  ])
  vi.mocked(createCategory).mockResolvedValue(undefined)
  vi.mocked(updateCategory).mockResolvedValue(undefined)
  vi.mocked(deleteCategory).mockResolvedValue('desactivada')
  vi.spyOn(window, 'confirm').mockReturnValue(true)
})

describe('CategoriesPage', () => {
  it('lista las categorías con su color y estado', async () => {
    renderPage()
    expect(await screen.findByText('Reunión')).toBeInTheDocument()
    expect(screen.getByText('#2563EB')).toBeInTheDocument()
    expect(screen.getByText('Desactivada')).toBeInTheDocument()
  })

  it('crea una categoría con nombre y color', async () => {
    renderPage()
    await userEvent.click(await screen.findByRole('button', { name: 'Nueva categoría' }))
    await userEvent.type(screen.getByLabelText('Nombre'), '  Capacitación ')
    await userEvent.click(screen.getByRole('button', { name: '#0891B2' }))
    await userEvent.click(screen.getByRole('button', { name: 'Crear categoría' }))
    expect(createCategory).toHaveBeenCalledWith({ name: 'Capacitación', color: '#0891b2', personal_only: false })
    expect(await screen.findByText('La categoría "Capacitación" fue creada.')).toBeInTheDocument()
  })

  it('pide un nombre', async () => {
    renderPage()
    await userEvent.click(await screen.findByRole('button', { name: 'Nueva categoría' }))
    await userEvent.click(screen.getByRole('button', { name: 'Crear categoría' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Ingrese el nombre de la categoría.')
    expect(createCategory).not.toHaveBeenCalled()
  })

  it('eliminar una categoría en uso explica que se desactivó', async () => {
    renderPage()
    const card = (await screen.findByText('Reunión')).closest('li')!
    await userEvent.click(within(card).getByRole('button', { name: 'Eliminar' }))
    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('quedará desactivada'))
    expect(deleteCategory).toHaveBeenCalledWith(1)
    expect(await screen.findByText(/está en uso: se desactivó/)).toBeInTheDocument()
  })

  it('reactiva una categoría desactivada', async () => {
    renderPage()
    const card = (await screen.findByText('Feriado')).closest('li')!
    await userEvent.click(within(card).getByRole('button', { name: 'Activar' }))
    expect(updateCategory).toHaveBeenCalledWith(2, { active: true })
  })
})
