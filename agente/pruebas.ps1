# Pruebas del script de sincronización (sin Exchange ni Supabase: se simulan).
# Uso:  powershell -NoProfile -ExecutionPolicy Bypass -File agente/pruebas.ps1
#       (también con pwsh). Termina con código 1 si alguna falla.

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'sincronizar-calendario.ps1') -SoloFunciones
$script:Registro = Join-Path ([IO.Path]::GetTempPath()) 'calendario-gem-pruebas.log'

$script:Fallas = 0
$script:Total = 0
function Test-Igual($Obtenido, $Esperado, [string]$Nombre) {
  $script:Total++
  $a = ConvertTo-Json -InputObject $Obtenido -Depth 8 -Compress
  $b = ConvertTo-Json -InputObject $Esperado -Depth 8 -Compress
  if ($a -ceq $b) {
    Write-Host "  ok  $Nombre"
  } else {
    $script:Fallas++
    Write-Host "  FALLA  $Nombre" -ForegroundColor Red
    Write-Host "     obtenido: $a"
    Write-Host "     esperado: $b"
  }
}

function New-Respuesta([string]$Cuerpo) {
  return '<?xml version="1.0" encoding="utf-8"?><s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/">' +
    '<s:Header/><s:Body>' + $Cuerpo + '</s:Body></s:Envelope>'
}
$M = 'xmlns:m="http://schemas.microsoft.com/exchange/services/2006/messages" xmlns:t="http://schemas.microsoft.com/exchange/services/2006/types"'

function New-RespuestaCambios([string]$Estado, [string]$Cambios, [string]$Ultimo = 'true') {
  return New-Respuesta ("<m:SyncFolderItemsResponse $M><m:ResponseMessages><m:SyncFolderItemsResponseMessage ResponseClass=""Success"">" +
    "<m:ResponseCode>NoError</m:ResponseCode><m:SyncState>$Estado</m:SyncState>" +
    "<m:IncludesLastItemInRange>$Ultimo</m:IncludesLastItemInRange><m:Changes>$Cambios</m:Changes>" +
    '</m:SyncFolderItemsResponseMessage></m:ResponseMessages></m:SyncFolderItemsResponse>')
}

function New-RespuestaVista([string[]]$Ids) {
  $items = ($Ids | ForEach-Object { "<t:CalendarItem><t:ItemId Id=""$_"" ChangeKey=""k""/></t:CalendarItem>" }) -join ''
  return New-Respuesta ("<m:FindItemResponse $M><m:ResponseMessages><m:FindItemResponseMessage ResponseClass=""Success"">" +
    "<m:ResponseCode>NoError</m:ResponseCode><m:RootFolder TotalItemsInView=""$($Ids.Count)"" IncludesLastItemInRange=""true"">" +
    "<t:Items>$items</t:Items></m:RootFolder></m:FindItemResponseMessage></m:ResponseMessages></m:FindItemResponse>")
}

function New-Item([string]$Id, [string]$Extra) {
  return '<m:GetItemResponseMessage ResponseClass="Success"><m:ResponseCode>NoError</m:ResponseCode><m:Items>' +
    "<t:CalendarItem><t:ItemId Id=""$Id"" ChangeKey=""k""/>$Extra</t:CalendarItem></m:Items></m:GetItemResponseMessage>"
}

Write-Host 'Solicitudes'
$x = New-SolicitudCambios 'ana@gem.com' 'ESTADO+/='
Test-Igual ($x -like '*<t:DistinguishedFolderId Id="calendar"><t:Mailbox><t:EmailAddress>ana@gem.com</t:EmailAddress>*') $true 'pide los cambios del calendario del buzón indicado'
Test-Igual ($x -like '*<m:SyncState>ESTADO+/=</m:SyncState>*') $true 'incluye el estado anterior'
Test-Igual ((New-SolicitudCambios 'ana@gem.com' '') -like '*SyncState*') $false 'sin estado anterior, no lo envía'
Test-Igual ((New-SolicitudCambios 'a&b@gem.com' '') -like '*a&amp;b@gem.com*') $true 'escapa el correo'
Test-Igual ((New-SolicitudDetalles @('id"<x>')) -like '*Id="id&quot;&lt;x&gt;"*') $true 'escapa los identificadores'
Test-Igual ((New-SolicitudVista 'ana@gem.com' '2026-11-01T00:00:00Z' '2027-02-01T00:00:00Z') -like '*StartDate="2026-11-01T00:00:00Z" EndDate="2027-02-01T00:00:00Z"*') $true 'pide la vista entre dos fechas'
$doc = New-Object System.Xml.XmlDocument
$doc.LoadXml((New-SolicitudDetalles @('A', 'B')))
Test-Igual $doc.DocumentElement.LocalName 'Envelope' 'las solicitudes son XML válido'

Write-Host 'Respuestas'
$r = Read-Cambios (New-RespuestaCambios 'NUEVO' '<t:Create><t:CalendarItem><t:ItemId Id="1"/></t:CalendarItem></t:Create><t:Update><t:CalendarItem><t:ItemId Id="2"/></t:CalendarItem></t:Update><t:Delete><t:ItemId Id="3"/></t:Delete><t:ReadFlagChange><t:ItemId Id="4"/></t:ReadFlagChange>')
Test-Igual @($r.Estado, $r.Cambios, $r.IncluyeUltimo) @('NUEVO', 3, $true) 'cuenta los cambios (sin las marcas de leído) y lee el estado nuevo'
$r = Read-Cambios (New-RespuestaCambios 'X' '' 'false')
Test-Igual @($r.Estado, $r.Cambios, $r.IncluyeUltimo) @('X', 0, $false) 'sin cambios devuelve cero'

$errorXml = New-Respuesta ("<m:SyncFolderItemsResponse $M><m:ResponseMessages><m:SyncFolderItemsResponseMessage ResponseClass=""Error"">" +
  '<m:MessageText>Access is denied.</m:MessageText><m:ResponseCode>ErrorAccessDenied</m:ResponseCode>' +
  '</m:SyncFolderItemsResponseMessage></m:ResponseMessages></m:SyncFolderItemsResponse>')
$codigo = $null
try { $null = Read-Cambios $errorXml } catch { $codigo = Get-CodigoError $_.Exception }
Test-Igual $codigo 'ErrorAccessDenied' 'convierte el error de Exchange en un código'
Test-Igual @((Get-EstadoPorError 'ErrorAccessDenied'), (Get-EstadoPorError 'ErrorNonExistentMailbox'), (Get-EstadoPorError 'ErrorServerBusy')) @('sin_permiso', 'no_encontrado', 'error') 'clasifica los errores para el admin'

$falla = New-Respuesta ('<s:Fault><faultcode>a:ErrorNonExistentMailbox</faultcode><faultstring>The SMTP address has no mailbox.</faultstring>' +
  '<detail><e:ResponseCode xmlns:e="http://schemas.microsoft.com/exchange/services/2006/errors">ErrorNonExistentMailbox</e:ResponseCode></detail></s:Fault>')
$codigo = $null; $mensaje = $null
try { $null = Read-Cambios $falla } catch { $codigo = Get-CodigoError $_.Exception; $mensaje = $_.Exception.Message }
Test-Igual @($codigo, $mensaje) @('ErrorNonExistentMailbox', 'The SMTP address has no mailbox.') 'lee un SOAP Fault'

Test-Igual @(Read-IdsVista (New-RespuestaVista @('AAA'))) @('AAA') 'lee un identificador de la vista'
Test-Igual @(Read-IdsVista (New-RespuestaVista @('A', 'B'))) @('A', 'B') 'lee varios identificadores'
Test-Igual @(Read-IdsVista (New-RespuestaVista @())).Count 0 'vista vacía'

$detalles = New-Respuesta ("<m:GetItemResponse $M><m:ResponseMessages>" +
  (New-Item 'R1' ('<t:Subject>Comité de proyecto</t:Subject><t:Sensitivity>Normal</t:Sensitivity>' +
    '<t:Body BodyType="Text">Únase: &lt;https://teams.microsoft.com/l/meetup-join/19%3ameeting_x%40thread.v2/0?context=1&gt; gracias</t:Body>' +
    '<t:Start>2026-12-01T15:00:00Z</t:Start><t:End>2026-12-01T16:00:00Z</t:End><t:IsAllDayEvent>false</t:IsAllDayEvent>' +
    '<t:Location>Microsoft Teams Meeting</t:Location>' +
    '<t:Organizer><t:Mailbox><t:Name>Ana Mora</t:Name><t:EmailAddress>Ana@gem.com</t:EmailAddress><t:RoutingType>SMTP</t:RoutingType></t:Mailbox></t:Organizer>' +
    '<t:RequiredAttendees><t:Attendee><t:Mailbox><t:Name>Luis Vega</t:Name><t:EmailAddress>/o=ExchangeLabs/ou=x/cn=luis</t:EmailAddress><t:RoutingType>EX</t:RoutingType></t:Mailbox><t:ResponseType>Accept</t:ResponseType></t:Attendee></t:RequiredAttendees>' +
    '<t:OptionalAttendees><t:Attendee><t:Mailbox><t:Name>Carlos</t:Name><t:EmailAddress>carlos@gem.com</t:EmailAddress></t:Mailbox><t:ResponseType>Unknown</t:ResponseType></t:Attendee></t:OptionalAttendees>' +
    '<t:IsCancelled>false</t:IsCancelled><t:LegacyFreeBusyStatus>Busy</t:LegacyFreeBusyStatus>' +
    '<t:MyResponseType>Accept</t:MyResponseType><t:IsRecurring>true</t:IsRecurring>')) +
  (New-Item 'R2' '<t:Subject>Cita médica</t:Subject><t:Sensitivity>Private</t:Sensitivity><t:Start>2026-12-02T15:00:00Z</t:Start><t:End>2026-12-02T16:00:00Z</t:End>') +
  (New-Item 'R3' '<t:Subject>Feriado</t:Subject><t:Start>2026-12-25T06:00:00Z</t:Start><t:End>2026-12-26T06:00:00Z</t:End><t:IsAllDayEvent>true</t:IsAllDayEvent>') +
  '<m:GetItemResponseMessage ResponseClass="Error"><m:ResponseCode>ErrorItemNotFound</m:ResponseCode></m:GetItemResponseMessage>' +
  '</m:ResponseMessages></m:GetItemResponse>')
$reuniones = @(Read-Reuniones $detalles)
Test-Igual @($reuniones | ForEach-Object { $_.item_id }) @('R1', 'R3') 'omite las privadas y las que Exchange no entregó'
Test-Igual $reuniones[0] ([ordered]@{
    event_key       = 'R1'
    item_id         = 'R1'
    subject         = 'Comité de proyecto'
    start_at        = '2026-12-01T15:00:00Z'
    end_at          = '2026-12-01T16:00:00Z'
    all_day         = $false
    location        = 'Microsoft Teams Meeting'
    organizer_name  = 'Ana Mora'
    organizer_email = 'ana@gem.com'
    attendees       = @(
      [ordered]@{ name = 'Luis Vega'; email = $null; response = 'Accept'; optional = $false },
      [ordered]@{ name = 'Carlos'; email = 'carlos@gem.com'; response = 'Unknown'; optional = $true }
    )
    join_url        = 'https://teams.microsoft.com/l/meetup-join/19%3ameeting_x%40thread.v2/0?context=1'
    is_recurring    = $true
    is_cancelled    = $false
    show_as         = 'Busy'
    my_response     = 'Accept'
    reminder_minutes = $null
  }) 'lee todos los detalles de una reunión'
Test-Igual @($reuniones[1].all_day, $reuniones[1].attendees.Count, $reuniones[1].join_url, $reuniones[1].organizer_name) @($true, 0, $null, $null) 'reunión de todo el día sin asistentes'
Test-Igual (ConvertTo-Json -InputObject ([ordered]@{ attendees = $reuniones[1].attendees }) -Compress) '{"attendees":[]}' 'sin asistentes se envía una lista vacía'
$uno = @(Read-Reuniones (New-Respuesta ("<m:GetItemResponse $M><m:ResponseMessages>" + (New-Item 'U' '<t:Subject>Uno</t:Subject><t:Start>2026-12-01T15:00:00Z</t:Start><t:RequiredAttendees><t:Attendee><t:Mailbox><t:Name>Ana</t:Name></t:Mailbox></t:Attendee></t:RequiredAttendees>') + '</m:ResponseMessages></m:GetItemResponse>')))
Test-Igual (ConvertTo-Json -InputObject ([ordered]@{ events = [object[]]$uno }) -Depth 8 -Compress) '{"events":[{"event_key":"U","item_id":"U","subject":"Uno","start_at":"2026-12-01T15:00:00Z","end_at":"2026-12-01T15:00:00Z","all_day":false,"location":null,"organizer_name":null,"organizer_email":null,"attendees":[{"name":"Ana","email":null,"response":null,"optional":false}],"join_url":null,"is_recurring":false,"is_cancelled":false,"show_as":null,"my_response":null,"reminder_minutes":null}]}' 'una sola reunión con un asistente se envía como lista'

$serie = @(Read-Reuniones (New-Respuesta ("<m:GetItemResponse $M><m:ResponseMessages>" +
  (New-Item 'OCC1' ('<t:Subject>Daily</t:Subject><t:Start>2026-12-01T14:30:00Z</t:Start><t:End>2026-12-01T14:45:00Z</t:End>' +
    '<t:ReminderIsSet>true</t:ReminderIsSet><t:ReminderMinutesBeforeStart>10</t:ReminderMinutesBeforeStart>' +
    '<t:UID>040000008200E00074C5B7101A82E008</t:UID><t:RecurrenceId>2026-12-01T14:30:00Z</t:RecurrenceId>')) +
  (New-Item 'S1' ('<t:Subject>Sin aviso</t:Subject><t:Start>2026-12-02T14:30:00Z</t:Start>' +
    '<t:ReminderIsSet>false</t:ReminderIsSet><t:ReminderMinutesBeforeStart>15</t:ReminderMinutesBeforeStart>' +
    '<t:UID>ABC</t:UID>')) +
  '</m:ResponseMessages></m:GetItemResponse>')))
Test-Igual @($serie[0].event_key, $serie[0].item_id, $serie[0].reminder_minutes) @('040000008200E00074C5B7101A82E008|2026-12-01T14:30:00Z', 'OCC1', 10) 'una repetición se identifica por UID + fecha original y trae su recordatorio'
Test-Igual @($serie[1].event_key, $serie[1].reminder_minutes) @('ABC|', $null) 'una reunión única usa su UID; con el recordatorio apagado no hay aviso'
Test-Igual ((New-SolicitudDetalles @('A')) -like '*FieldURI="item:ReminderMinutesBeforeStart"*FieldURI="calendar:UID"*FieldURI="calendar:RecurrenceId"*') $true 'pide el recordatorio y el identificador permanente'

Test-Igual (Get-EnlaceReunion @('https://us02web.zoom.us/j/123?pwd=x')) 'https://us02web.zoom.us/j/123?pwd=x' 'enlace de Zoom en la ubicación'
Test-Igual (Get-EnlaceReunion @('Sala 2', 'Enlace: https://meet.google.com/abc-defg-hij.')) 'https://meet.google.com/abc-defg-hij' 'enlace de Meet en el texto, sin el punto final'
Test-Igual (Get-EnlaceReunion @('Sala 2', 'sin enlace')) $null 'sin enlace'

Write-Host 'Sincronización (Exchange y la app simulados)'
$script:Guardado = $null
$script:Llamadas = New-Object System.Collections.Generic.List[string]
function Invoke-App($Datos) { $script:Guardado = $Datos; return $null }
$script:RespuestasEws = @{}
function Invoke-Ews([string]$Cuerpo) {
  foreach ($clave in @('SyncFolderItems', 'FindItem', 'GetItem')) {
    if ($Cuerpo -like "*<m:$clave*") {
      $script:Llamadas.Add($clave)
      $respuesta = $script:RespuestasEws[$clave]
      if ($respuesta -is [System.Exception]) { throw $respuesta }
      return $respuesta
    }
  }
  throw 'solicitud inesperada'
}

$script:RespuestasEws = @{ SyncFolderItems = (New-RespuestaCambios 'S2' ''); FindItem = (New-RespuestaVista @('R1', 'R3')); GetItem = $detalles }
$script:Llamadas.Clear()
$res = Sync-Usuario ([pscustomobject]@{ user_id = 'u1'; email = 'ana@gem.com'; sync_state = 'S1'; needs_full = $false })
Test-Igual @($res, ($script:Llamadas -join ','), $script:Guardado.status, $script:Guardado.sync_state, $script:Guardado.events) @('sin_cambios', 'SyncFolderItems', 'ok', 'S2', $null) 'sin cambios solo guarda el estado nuevo'

$script:RespuestasEws.SyncFolderItems = New-RespuestaCambios 'S3' '<t:Update><t:CalendarItem><t:ItemId Id="R1"/></t:CalendarItem></t:Update>'
$script:Llamadas.Clear()
$res = Sync-Usuario ([pscustomobject]@{ user_id = 'u1'; email = 'ana@gem.com'; sync_state = 'S2'; needs_full = $false })
Test-Igual @($res, ($script:Llamadas -join ','), $script:Guardado.sync_state, @($script:Guardado.events).Count, $script:Guardado.full) @('actualizado', 'SyncFolderItems,FindItem,GetItem', 'S3', 2, $false) 'con cambios vuelve a leer la ventana'
Test-Igual ([bool]($script:Guardado.window_to -match '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$')) $true 'envía hasta dónde llegó la ventana leída'

$script:RespuestasEws.SyncFolderItems = New-RespuestaCambios 'S0' '<t:Create><t:CalendarItem><t:ItemId Id="R1"/></t:CalendarItem></t:Create>'
$res = Sync-Usuario ([pscustomobject]@{ user_id = 'u1'; email = 'ana@gem.com'; sync_state = $null; needs_full = $true })
Test-Igual @($res, $script:Guardado.full, $script:Guardado.sync_state) @('actualizado', $true, 'S0') 'la primera vez hace la lectura completa'

$script:RespuestasEws.SyncFolderItems = New-EwsError 'ErrorAccessDenied' 'Access is denied.'
$res = Sync-Usuario ([pscustomobject]@{ user_id = 'u1'; email = 'ana@gem.com'; sync_state = 'S3'; needs_full = $false })
Test-Igual @($res, $script:Guardado.status, $script:Guardado.detail) @('error', 'sin_permiso', 'La cuenta de servicio no tiene permiso de Revisor sobre este calendario.') 'sin permiso lo informa al admin'

$script:RespuestasEws.SyncFolderItems = New-EwsError 'SinAutorizacion' 'Exchange no aceptó la cuenta de la tarea.'
$codigo = $null
try { $null = Sync-Usuario ([pscustomobject]@{ user_id = 'u1'; email = 'ana@gem.com'; sync_state = 'S3'; needs_full = $false }) } catch { $codigo = Get-CodigoError $_.Exception }
Test-Igual $codigo 'SinAutorizacion' 'si Exchange no acepta la cuenta, se detiene (afecta a todos)'

Remove-Item $script:Registro -ErrorAction SilentlyContinue
Write-Host ''
Write-Host "$($script:Total - $script:Fallas) de $script:Total pruebas pasaron (PowerShell $($PSVersionTable.PSVersion))"
if ($script:Fallas -gt 0) { exit 1 }
