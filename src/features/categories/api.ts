import { duplicateAs } from '../../lib/errors'
import { supabase } from '../../lib/supabase'

export interface Category {
  id: number
  name: string
  color: string
  active: boolean
}

const COLUMNS = 'id, name, color, active'
const DUPLICATE = 'Ya existe una categoría con ese nombre.'

/** Todas las categorías (activas e inactivas), ordenadas por nombre. */
export async function listCategories(): Promise<Category[]> {
  const { data, error } = await supabase.from('categories').select(COLUMNS).order('name')
  if (error) throw error
  return data
}

export async function createCategory(input: { name: string; color: string }): Promise<void> {
  const { error } = await supabase.from('categories').insert(input)
  if (error) throw duplicateAs(error, DUPLICATE)
}

export async function updateCategory(id: number, changes: Partial<Pick<Category, 'name' | 'color' | 'active'>>) {
  const { error } = await supabase.from('categories').update(changes).eq('id', id)
  if (error) throw duplicateAs(error, DUPLICATE)
}

/** Elimina la categoría, o la desactiva si algún recordatorio la usa. */
export async function deleteCategory(id: number): Promise<'eliminada' | 'desactivada'> {
  const { data, error } = await supabase.rpc('admin_delete_category', { p_category_id: id })
  if (error) throw error
  return data as 'eliminada' | 'desactivada'
}
