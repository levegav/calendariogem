import type { Person } from '../calendar/types'

export type NotificationKind = 'etiquetado' | 'quitado' | 'salida' | 'modificado' | 'aviso' | 'general' | 'outlook'

/** Qué pasó en el calendario general. */
export type GeneralAction = 'publicado' | 'modificado' | 'retirado' | 'eliminado'

/** Qué pasó con una reunión de Outlook (de otra persona). */
export type OutlookAction = 'nueva' | 'modificada'

/** Campos que puede indicar una notificación de modificación. */
export type ChangedField = 'titulo' | 'horario' | 'categoria' | 'ubicacion' | 'descripcion' | 'nota'

export interface NotificationData {
  start_at?: string
  end_at?: string | null
  all_day?: boolean
  /** "modificado": qué cambió y cómo era antes. */
  changes?: ChangedField[]
  before?: { title: string; start_at: string; end_at: string | null; all_day: boolean }
  /** "aviso": cuánto antes era el aviso. */
  minutes_before?: number
  /** "general": qué pasó en el calendario general; "outlook": qué pasó con la reunión. */
  accion?: GeneralAction | OutlookAction
  /** "outlook": quién organiza la reunión. */
  organizer?: string | null
  /** "aviso": es de una reunión de Outlook. */
  outlook?: boolean
}

export interface AppNotification {
  id: number
  kind: NotificationKind
  reminder_id: number | null
  reminder_title: string
  data: NotificationData
  created_at: string
  read_at: string | null
  /** Quien hizo el cambio (no hay en los avisos previos). */
  actor: Person | null
}
