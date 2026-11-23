import { XMLParser } from 'fast-xml-parser'
import { describe, expect, it } from 'vitest'
import {
  calendarViewRequest,
  classifyError,
  EwsError,
  extractJoinUrl,
  getItemRequest,
  parseFindItemIds,
  parseGetItem,
  parseSyncFolderItems,
  syncFolderItemsRequest,
  XML_PARSER_OPTIONS,
} from './ews'

const parser = new XMLParser(XML_PARSER_OPTIONS)
const parse = (xml: string) => parser.parse(xml)

const soap = (body: string) =>
  '<?xml version="1.0" encoding="utf-8"?>' +
  '<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/">' +
  '<s:Header><h:ServerVersionInfo MajorVersion="15" MinorVersion="2" xmlns:h="http://schemas.microsoft.com/exchange/services/2006/types"/></s:Header>' +
  `<s:Body>${body}</s:Body></s:Envelope>`

const M = 'xmlns:m="http://schemas.microsoft.com/exchange/services/2006/messages" xmlns:t="http://schemas.microsoft.com/exchange/services/2006/types"'

describe('solicitudes', () => {
  it('pide los cambios del calendario del buzón indicado, con el estado anterior', () => {
    const xml = syncFolderItemsRequest('ana@gem.com', 'ESTADO+/=')
    expect(xml).toContain('<t:DistinguishedFolderId Id="calendar"><t:Mailbox><t:EmailAddress>ana@gem.com</t:EmailAddress>')
    expect(xml).toContain('<m:SyncState>ESTADO+/=</m:SyncState>')
    expect(syncFolderItemsRequest('ana@gem.com', null)).not.toContain('SyncState')
  })

  it('escapa los valores que van dentro del XML', () => {
    expect(syncFolderItemsRequest('a&b@gem.com', null)).toContain('a&amp;b@gem.com')
    expect(getItemRequest(['id"<x>'])).toContain('Id="id&quot;&lt;x&gt;"')
  })

  it('pide la vista de calendario entre dos fechas', () => {
    const xml = calendarViewRequest('ana@gem.com', '2026-11-01T00:00:00.000Z', '2027-02-01T00:00:00.000Z')
    expect(xml).toContain('StartDate="2026-11-01T00:00:00.000Z" EndDate="2027-02-01T00:00:00.000Z"')
  })
})

describe('respuestas', () => {
  it('cuenta los cambios y lee el estado nuevo', () => {
    const xml = soap(
      `<m:SyncFolderItemsResponse ${M}><m:ResponseMessages><m:SyncFolderItemsResponseMessage ResponseClass="Success">` +
        '<m:ResponseCode>NoError</m:ResponseCode><m:SyncState>NUEVO</m:SyncState>' +
        '<m:IncludesLastItemInRange>true</m:IncludesLastItemInRange>' +
        '<m:Changes><t:Create><t:CalendarItem><t:ItemId Id="1"/></t:CalendarItem></t:Create>' +
        '<t:Update><t:CalendarItem><t:ItemId Id="2"/></t:CalendarItem></t:Update>' +
        '<t:Delete><t:ItemId Id="3"/></t:Delete><t:Delete><t:ItemId Id="4"/></t:Delete></m:Changes>' +
        '</m:SyncFolderItemsResponseMessage></m:ResponseMessages></m:SyncFolderItemsResponse>',
    )
    expect(parseSyncFolderItems(xml, parse)).toEqual({ syncState: 'NUEVO', changes: 4, includesLast: true })
  })

  it('sin cambios, devuelve cero', () => {
    const xml = soap(
      `<m:SyncFolderItemsResponse ${M}><m:ResponseMessages><m:SyncFolderItemsResponseMessage ResponseClass="Success">` +
        '<m:ResponseCode>NoError</m:ResponseCode><m:SyncState>X</m:SyncState>' +
        '<m:IncludesLastItemInRange>false</m:IncludesLastItemInRange><m:Changes/>' +
        '</m:SyncFolderItemsResponseMessage></m:ResponseMessages></m:SyncFolderItemsResponse>',
    )
    expect(parseSyncFolderItems(xml, parse)).toEqual({ syncState: 'X', changes: 0, includesLast: false })
  })

  it('convierte el error de Exchange en un estado para el admin', () => {
    const xml = soap(
      `<m:SyncFolderItemsResponse ${M}><m:ResponseMessages><m:SyncFolderItemsResponseMessage ResponseClass="Error">` +
        '<m:MessageText>Access is denied.</m:MessageText><m:ResponseCode>ErrorAccessDenied</m:ResponseCode>' +
        '</m:SyncFolderItemsResponseMessage></m:ResponseMessages></m:SyncFolderItemsResponse>',
    )
    let error: unknown
    try {
      parseSyncFolderItems(xml, parse)
    } catch (e) {
      error = e
    }
    expect(error).toBeInstanceOf(EwsError)
    expect((error as EwsError).code).toBe('ErrorAccessDenied')
    expect(classifyError('ErrorAccessDenied')).toBe('sin_permiso')
    expect(classifyError('ErrorNonExistentMailbox')).toBe('no_encontrado')
    expect(classifyError('ErrorServerBusy')).toBe('error')
  })

  it('lee un SOAP Fault', () => {
    const xml = soap(
      '<s:Fault><faultcode>a:ErrorNonExistentMailbox</faultcode><faultstring>The SMTP address has no mailbox.</faultstring>' +
        '<detail><e:ResponseCode xmlns:e="http://schemas.microsoft.com/exchange/services/2006/errors">ErrorNonExistentMailbox</e:ResponseCode></detail></s:Fault>',
    )
    expect(() => parseSyncFolderItems(xml, parse)).toThrow('The SMTP address has no mailbox.')
  })

  it('lee los identificadores de la vista de calendario (uno o varios)', () => {
    const one = soap(
      `<m:FindItemResponse ${M}><m:ResponseMessages><m:FindItemResponseMessage ResponseClass="Success">` +
        '<m:ResponseCode>NoError</m:ResponseCode><m:RootFolder TotalItemsInView="1" IncludesLastItemInRange="true">' +
        '<t:Items><t:CalendarItem><t:ItemId Id="AAA" ChangeKey="k"/></t:CalendarItem></t:Items></m:RootFolder>' +
        '</m:FindItemResponseMessage></m:ResponseMessages></m:FindItemResponse>',
    )
    expect(parseFindItemIds(one, parse)).toEqual(['AAA'])
    const many = one.replace(
      '<t:CalendarItem><t:ItemId Id="AAA" ChangeKey="k"/></t:CalendarItem>',
      '<t:CalendarItem><t:ItemId Id="A"/></t:CalendarItem><t:CalendarItem><t:ItemId Id="B"/></t:CalendarItem>',
    )
    expect(parseFindItemIds(many, parse)).toEqual(['A', 'B'])
  })

  it('lee los detalles de las reuniones y omite las privadas', () => {
    const item = (id: string, extra: string) =>
      '<m:GetItemResponseMessage ResponseClass="Success"><m:ResponseCode>NoError</m:ResponseCode><m:Items>' +
      `<t:CalendarItem><t:ItemId Id="${id}" ChangeKey="k"/>${extra}</t:CalendarItem></m:Items></m:GetItemResponseMessage>`
    const xml = soap(
      `<m:GetItemResponse ${M}><m:ResponseMessages>` +
        item(
          'R1',
          '<t:Subject>Comité de proyecto</t:Subject><t:Sensitivity>Normal</t:Sensitivity>' +
            '<t:Body BodyType="Text">Únase: &lt;https://teams.microsoft.com/l/meetup-join/19%3ameeting_x%40thread.v2/0?context=1&gt; gracias</t:Body>' +
            '<t:Start>2026-12-01T15:00:00Z</t:Start><t:End>2026-12-01T16:00:00Z</t:End><t:IsAllDayEvent>false</t:IsAllDayEvent>' +
            '<t:Location>Microsoft Teams Meeting</t:Location>' +
            '<t:Organizer><t:Mailbox><t:Name>Ana Mora</t:Name><t:EmailAddress>Ana@gem.com</t:EmailAddress><t:RoutingType>SMTP</t:RoutingType></t:Mailbox></t:Organizer>' +
            '<t:RequiredAttendees><t:Attendee><t:Mailbox><t:Name>Luis Vega</t:Name><t:EmailAddress>/o=ExchangeLabs/ou=x/cn=luis</t:EmailAddress><t:RoutingType>EX</t:RoutingType></t:Mailbox><t:ResponseType>Accept</t:ResponseType></t:Attendee></t:RequiredAttendees>' +
            '<t:OptionalAttendees><t:Attendee><t:Mailbox><t:Name>Carlos</t:Name><t:EmailAddress>carlos@gem.com</t:EmailAddress></t:Mailbox><t:ResponseType>Unknown</t:ResponseType></t:Attendee></t:OptionalAttendees>' +
            '<t:IsCancelled>false</t:IsCancelled><t:LegacyFreeBusyStatus>Busy</t:LegacyFreeBusyStatus>' +
            '<t:MyResponseType>Accept</t:MyResponseType><t:IsRecurring>true</t:IsRecurring>',
        ) +
        item('R2', '<t:Subject>Cita médica</t:Subject><t:Sensitivity>Private</t:Sensitivity><t:Start>2026-12-02T15:00:00Z</t:Start><t:End>2026-12-02T16:00:00Z</t:End>') +
        item('R3', '<t:Subject>Feriado</t:Subject><t:Start>2026-12-25T06:00:00Z</t:Start><t:End>2026-12-26T06:00:00Z</t:End><t:IsAllDayEvent>true</t:IsAllDayEvent>') +
        '<m:GetItemResponseMessage ResponseClass="Error"><m:ResponseCode>ErrorItemNotFound</m:ResponseCode></m:GetItemResponseMessage>' +
        '</m:ResponseMessages></m:GetItemResponse>',
    )
    const rows = parseGetItem(xml, parse)
    expect(rows.map((r) => r.item_id)).toEqual(['R1', 'R3'])
    expect(rows[0]).toEqual({
      item_id: 'R1',
      subject: 'Comité de proyecto',
      start_at: '2026-12-01T15:00:00Z',
      end_at: '2026-12-01T16:00:00Z',
      all_day: false,
      location: 'Microsoft Teams Meeting',
      organizer_name: 'Ana Mora',
      organizer_email: 'ana@gem.com',
      attendees: [
        { name: 'Luis Vega', email: null, response: 'Accept', optional: false },
        { name: 'Carlos', email: 'carlos@gem.com', response: 'Unknown', optional: true },
      ],
      join_url: 'https://teams.microsoft.com/l/meetup-join/19%3ameeting_x%40thread.v2/0?context=1',
      is_recurring: true,
      is_cancelled: false,
      show_as: 'Busy',
      my_response: 'Accept',
    })
    expect(rows[1]).toMatchObject({ all_day: true, attendees: [], join_url: null, organizer_name: null })
  })

  it('encuentra el enlace para unirse en la ubicación o en el texto', () => {
    expect(extractJoinUrl('https://us02web.zoom.us/j/123?pwd=x', null)).toBe('https://us02web.zoom.us/j/123?pwd=x')
    expect(extractJoinUrl('Sala 2', 'Enlace: https://meet.google.com/abc-defg-hij.')).toBe('https://meet.google.com/abc-defg-hij')
    expect(extractJoinUrl('Sala 2', 'sin enlace')).toBeNull()
  })
})
