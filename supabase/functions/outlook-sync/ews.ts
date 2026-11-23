// Mensajes de Exchange Web Services (EWS) para leer calendarios: arma las
// solicitudes SOAP e interpreta las respuestas. No depende de Deno ni de
// ninguna librería (el lector de XML se recibe como parámetro), así se prueba
// con Vitest igual que el resto de la app.

/** Lector de XML ya configurado (sin prefijos de espacio de nombres, atributos con "@"). */
export type XmlParse = (xml: string) => unknown

/** Opciones con que debe crearse el lector (fast-xml-parser). */
export const XML_PARSER_OPTIONS = {
  ignoreAttributes: false,
  attributeNamePrefix: '@',
  removeNSPrefix: true,
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: true,
} as const

/** Error devuelto por Exchange (ResponseCode) o por la conexión. */
export class EwsError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message)
  }
}

/** Estado que se guarda para el usuario según el error de Exchange. */
export type LinkStatus = 'ok' | 'sin_permiso' | 'no_encontrado' | 'error'

export function classifyError(code: string): Exclude<LinkStatus, 'ok'> {
  if (code === 'ErrorNonExistentMailbox' || code === 'ErrorInvalidSmtpAddress') return 'no_encontrado'
  if (code === 'ErrorAccessDenied' || code === 'ErrorFolderNotFound' || code === 'ErrorItemNotFound') return 'sin_permiso'
  return 'error'
}

/** Mensaje en español para el admin. */
export function describeStatus(status: LinkStatus, code: string, message: string): string | null {
  switch (status) {
    case 'ok':
      return null
    case 'sin_permiso':
      return 'La cuenta de servicio no tiene permiso de Revisor sobre este calendario.'
    case 'no_encontrado':
      return 'No existe un buzón con ese correo en Exchange.'
    case 'error':
      return `${code}: ${message}`.slice(0, 500)
  }
}

// -----------------------------------------------------------------------------
// Solicitudes
// -----------------------------------------------------------------------------

export function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')
}

function envelope(body: string): string {
  return (
    '<?xml version="1.0" encoding="utf-8"?>' +
    '<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"' +
    ' xmlns:t="http://schemas.microsoft.com/exchange/services/2006/types"' +
    ' xmlns:m="http://schemas.microsoft.com/exchange/services/2006/messages">' +
    '<soap:Header><t:RequestServerVersion Version="Exchange2013_SP1"/></soap:Header>' +
    `<soap:Body>${body}</soap:Body></soap:Envelope>`
  )
}

/** Carpeta Calendario del buzón indicado (requiere permiso de Revisor). */
function calendarFolder(email: string): string {
  return (
    '<t:DistinguishedFolderId Id="calendar">' +
    `<t:Mailbox><t:EmailAddress>${escapeXml(email)}</t:EmailAddress></t:Mailbox>` +
    '</t:DistinguishedFolderId>'
  )
}

/** ¿Qué cambió en el calendario desde el último estado? (solo identificadores: liviano). */
export function syncFolderItemsRequest(email: string, syncState: string | null, maxChanges = 512): string {
  return envelope(
    '<m:SyncFolderItems>' +
      '<m:ItemShape><t:BaseShape>IdOnly</t:BaseShape></m:ItemShape>' +
      `<m:SyncFolderId>${calendarFolder(email)}</m:SyncFolderId>` +
      (syncState ? `<m:SyncState>${escapeXml(syncState)}</m:SyncState>` : '') +
      `<m:MaxChangesReturned>${maxChanges}</m:MaxChangesReturned>` +
      '</m:SyncFolderItems>',
  )
}

/** Reuniones (con cada repetición por separado) entre dos fechas. */
export function calendarViewRequest(email: string, startIso: string, endIso: string, maxEntries = 1000): string {
  return envelope(
    '<m:FindItem Traversal="Shallow">' +
      '<m:ItemShape><t:BaseShape>IdOnly</t:BaseShape></m:ItemShape>' +
      `<m:CalendarView MaxEntriesReturned="${maxEntries}" StartDate="${startIso}" EndDate="${endIso}"/>` +
      `<m:ParentFolderIds>${calendarFolder(email)}</m:ParentFolderIds>` +
      '</m:FindItem>',
  )
}

const ITEM_FIELDS = [
  'item:Subject',
  'item:Sensitivity',
  'item:Body',
  'calendar:Start',
  'calendar:End',
  'calendar:IsAllDayEvent',
  'calendar:Location',
  'calendar:Organizer',
  'calendar:RequiredAttendees',
  'calendar:OptionalAttendees',
  'calendar:IsCancelled',
  'calendar:LegacyFreeBusyStatus',
  'calendar:MyResponseType',
  'calendar:IsRecurring',
]

/** Detalles de varias reuniones (asistentes y texto para encontrar el enlace de Teams). */
export function getItemRequest(ids: string[]): string {
  return envelope(
    '<m:GetItem>' +
      '<m:ItemShape><t:BaseShape>IdOnly</t:BaseShape><t:BodyType>Text</t:BodyType>' +
      `<t:AdditionalProperties>${ITEM_FIELDS.map((f) => `<t:FieldURI FieldURI="${f}"/>`).join('')}</t:AdditionalProperties>` +
      '</m:ItemShape>' +
      `<m:ItemIds>${ids.map((id) => `<t:ItemId Id="${escapeXml(id)}"/>`).join('')}</m:ItemIds>` +
      '</m:GetItem>',
  )
}

// -----------------------------------------------------------------------------
// Respuestas
// -----------------------------------------------------------------------------

type Node = Record<string, unknown>

function asArray(value: unknown): Node[] {
  if (value === undefined || value === null || value === '') return []
  return (Array.isArray(value) ? value : [value]) as Node[]
}

function text(value: unknown): string {
  if (typeof value === 'string') return value
  if (value && typeof value === 'object' && '#text' in value) return String((value as Node)['#text'])
  return ''
}

function child(node: unknown, key: string): Node | undefined {
  if (!node || typeof node !== 'object') return undefined
  const value = (node as Node)[key]
  return value && typeof value === 'object' ? (value as Node) : undefined
}

/** Los mensajes de respuesta de una operación; lanza EwsError ante un SOAP Fault. */
function responseMessages(xml: string, parse: XmlParse, operation: string): Node[] {
  const body = child(child(parse(xml), 'Envelope'), 'Body')
  if (!body) throw new EwsError('RespuestaInvalida', 'Exchange devolvió una respuesta que no es SOAP.')
  const fault = child(body, 'Fault')
  if (fault) {
    const detail = child(fault, 'detail')
    const code = text(detail?.ResponseCode) || 'Fault'
    throw new EwsError(code, text(fault.faultstring) || 'Error de Exchange.')
  }
  const messages = child(child(body, `${operation}Response`), 'ResponseMessages')
  return asArray(messages?.[`${operation}ResponseMessage`])
}

function checkSuccess(message: Node | undefined): Node {
  if (!message) throw new EwsError('RespuestaInvalida', 'Exchange no devolvió ningún resultado.')
  if (message['@ResponseClass'] !== 'Success' && message['@ResponseClass'] !== 'Warning') {
    throw new EwsError(text(message.ResponseCode) || 'Error', text(message.MessageText) || 'Error de Exchange.')
  }
  return message
}

export interface SyncResult {
  syncState: string
  /** Reuniones creadas, cambiadas o borradas en este lote. */
  changes: number
  /** true = ya no quedan más cambios por leer. */
  includesLast: boolean
}

export function parseSyncFolderItems(xml: string, parse: XmlParse): SyncResult {
  const message = checkSuccess(responseMessages(xml, parse, 'SyncFolderItems')[0])
  const changes = child(message, 'Changes')
  const count = ['Create', 'Update', 'Delete'].reduce((sum, key) => sum + asArray(changes?.[key]).length, 0)
  return {
    syncState: text(message.SyncState),
    changes: count,
    includesLast: text(message.IncludesLastItemInRange) !== 'false',
  }
}

export function parseFindItemIds(xml: string, parse: XmlParse): string[] {
  const message = checkSuccess(responseMessages(xml, parse, 'FindItem')[0])
  const items = child(child(message, 'RootFolder'), 'Items')
  return asArray(items?.CalendarItem)
    .map((item) => String(child(item, 'ItemId')?.['@Id'] ?? ''))
    .filter(Boolean)
}

export interface Attendee {
  name: string
  email: string | null
  response: string | null
  optional: boolean
}

/** Una reunión tal como se guarda en outlook_events. */
export interface OutlookEventRow {
  item_id: string
  subject: string
  start_at: string
  end_at: string
  all_day: boolean
  location: string | null
  organizer_name: string | null
  organizer_email: string | null
  attendees: Attendee[]
  join_url: string | null
  is_recurring: boolean
  is_cancelled: boolean
  show_as: string | null
  my_response: string | null
}

const JOIN_URL =
  /https:\/\/(?:teams\.microsoft\.com\/l\/meetup-join|teams\.live\.com\/meet|[\w-]+\.zoom\.us\/[jw]|meet\.google\.com)\/[^\s<>"')\]]+/i

/** Primer enlace para unirse (Teams, Zoom o Meet) en la ubicación o el texto de la invitación. */
export function extractJoinUrl(...texts: (string | null | undefined)[]): string | null {
  for (const value of texts) {
    const match = value?.match(JOIN_URL)
    if (match) return match[0].replace(/[.,;:!?]+$/, '')
  }
  return null
}

/** Solo correos reales (las direcciones internas tipo /o=Exchange… no sirven en la app). */
function smtp(mailbox: Node | undefined): string | null {
  const address = text(mailbox?.EmailAddress).trim()
  return address.includes('@') ? address.toLowerCase() : null
}

function attendees(list: Node | undefined, optional: boolean): Attendee[] {
  return asArray(list?.Attendee).map((attendee) => {
    const mailbox = child(attendee, 'Mailbox')
    const email = smtp(mailbox)
    return {
      name: text(mailbox?.Name).trim() || email || 'Sin nombre',
      email,
      response: text(attendee.ResponseType) || null,
      optional,
    }
  })
}

/**
 * Reuniones de una respuesta de GetItem. Se omiten las privadas y las que
 * Exchange no entregó (por ejemplo, por falta de permiso sobre ese elemento).
 */
export function parseGetItem(xml: string, parse: XmlParse): OutlookEventRow[] {
  const rows: OutlookEventRow[] = []
  for (const message of responseMessages(xml, parse, 'GetItem')) {
    if (message['@ResponseClass'] !== 'Success') continue
    for (const item of asArray(child(message, 'Items')?.CalendarItem)) {
      if (text(item.Sensitivity) === 'Private') continue
      const id = String(child(item, 'ItemId')?.['@Id'] ?? '')
      const start = text(item.Start)
      const end = text(item.End) || start
      if (!id || !start) continue
      const location = text(item.Location).trim() || null
      const organizer = child(child(item, 'Organizer'), 'Mailbox')
      rows.push({
        item_id: id,
        subject: text(item.Subject).trim(),
        start_at: start,
        end_at: end,
        all_day: text(item.IsAllDayEvent) === 'true',
        location,
        organizer_name: text(organizer?.Name).trim() || null,
        organizer_email: smtp(organizer),
        attendees: [
          ...attendees(child(item, 'RequiredAttendees'), false),
          ...attendees(child(item, 'OptionalAttendees'), true),
        ],
        join_url: extractJoinUrl(location, text(item.Body)),
        is_recurring: text(item.IsRecurring) === 'true',
        is_cancelled: text(item.IsCancelled) === 'true',
        show_as: text(item.LegacyFreeBusyStatus) || null,
        my_response: text(item.MyResponseType) || null,
      })
    }
  }
  return rows
}
