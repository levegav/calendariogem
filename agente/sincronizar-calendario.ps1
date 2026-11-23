<#
.SYNOPSIS
  Sincroniza las reuniones de Outlook con el Calendario GEM (en un solo sentido).

.DESCRIPTION
  Corre cada minuto como tarea programada en la VM de Exchange, con la cuenta de
  servicio svccalendario (permiso de Revisor sobre los calendarios). Para cada
  usuario con correo de Outlook en la app:
    1. Pregunta a Exchange qué cambió desde la última vez (SyncFolderItems, liviano).
    2. Si cambió algo, o toca la lectura completa del día, lee sus reuniones de un
       mes atrás a tres meses adelante y se las envía a la app.
  Se conecta a Exchange por la red interna con la sesión de Windows de la tarea
  (no guarda contraseñas) y a la app solo con conexiones de salida por HTTPS.
  Compatible con Windows PowerShell 5.1 (viene con Windows Server).

.PARAMETER Configuracion
  Archivo JSON con supabaseUrl, agentToken y ewsUrl (por defecto, junto al script).

.PARAMETER SoloFunciones
  Carga las funciones sin sincronizar (para las pruebas).
#>
[CmdletBinding()]
param(
  [string]$Configuracion = '',
  [switch]$SoloFunciones
)

$ErrorActionPreference = 'Stop'
if (-not $Configuracion) { $Configuracion = Join-Path $PSScriptRoot 'configuracion.json' }
$script:Version = '1.1'
# Fin de la última ventana leída (se envía con las reuniones).
$script:VentanaHasta = $null
$script:DiasAtras = 31
$script:DiasAdelante = 92
$script:MaxLotesCambios = 20
$script:LoteDetalles = 50
$script:TiempoEsperaMs = 30000
$script:Config = $null
$script:Registro = Join-Path $PSScriptRoot 'registro.log'

# -----------------------------------------------------------------------------
# Utilidades
# -----------------------------------------------------------------------------

function Write-Registro([string]$Texto) {
  try {
    if ((Test-Path $script:Registro) -and (Get-Item $script:Registro).Length -gt 2MB) {
      Move-Item $script:Registro "$($script:Registro).anterior" -Force
    }
    $linea = '{0} {1}' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $Texto
    [IO.File]::AppendAllText($script:Registro, $linea + [Environment]::NewLine, [Text.Encoding]::UTF8)
  } catch {
    # sin registro no se detiene la sincronización
  }
}

function New-EwsError([string]$Codigo, [string]$Mensaje) {
  $e = New-Object System.Exception $Mensaje
  $e.Data['Codigo'] = $Codigo
  return $e
}

function Get-CodigoError($Excepcion) {
  $e = $Excepcion
  while ($e) {
    if ($e.Data -and $e.Data.Contains('Codigo')) { return [string]$e.Data['Codigo'] }
    $e = $e.InnerException
  }
  return 'Error'
}

function ConvertTo-XmlSeguro([string]$Texto) {
  return [System.Security.SecurityElement]::Escape($Texto)
}

# -----------------------------------------------------------------------------
# Solicitudes a Exchange (EWS)
# -----------------------------------------------------------------------------

function New-Sobre([string]$Cuerpo) {
  return '<?xml version="1.0" encoding="utf-8"?>' +
    '<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"' +
    ' xmlns:t="http://schemas.microsoft.com/exchange/services/2006/types"' +
    ' xmlns:m="http://schemas.microsoft.com/exchange/services/2006/messages">' +
    '<soap:Header><t:RequestServerVersion Version="Exchange2013_SP1"/></soap:Header>' +
    "<soap:Body>$Cuerpo</soap:Body></soap:Envelope>"
}

function New-CarpetaCalendario([string]$Correo) {
  return '<t:DistinguishedFolderId Id="calendar">' +
    "<t:Mailbox><t:EmailAddress>$(ConvertTo-XmlSeguro $Correo)</t:EmailAddress></t:Mailbox>" +
    '</t:DistinguishedFolderId>'
}

function New-SolicitudCambios([string]$Correo, [string]$Estado) {
  $estadoXml = ''
  if ($Estado) { $estadoXml = "<m:SyncState>$(ConvertTo-XmlSeguro $Estado)</m:SyncState>" }
  return New-Sobre ('<m:SyncFolderItems>' +
    '<m:ItemShape><t:BaseShape>IdOnly</t:BaseShape></m:ItemShape>' +
    "<m:SyncFolderId>$(New-CarpetaCalendario $Correo)</m:SyncFolderId>" +
    $estadoXml +
    '<m:MaxChangesReturned>512</m:MaxChangesReturned>' +
    '</m:SyncFolderItems>')
}

function New-SolicitudVista([string]$Correo, [string]$Inicio, [string]$Fin) {
  return New-Sobre ('<m:FindItem Traversal="Shallow">' +
    '<m:ItemShape><t:BaseShape>IdOnly</t:BaseShape></m:ItemShape>' +
    "<m:CalendarView MaxEntriesReturned=""1000"" StartDate=""$Inicio"" EndDate=""$Fin""/>" +
    "<m:ParentFolderIds>$(New-CarpetaCalendario $Correo)</m:ParentFolderIds>" +
    '</m:FindItem>')
}

$script:CamposReunion = @(
  'item:Subject', 'item:Sensitivity', 'item:Body', 'calendar:Start', 'calendar:End', 'calendar:IsAllDayEvent',
  'calendar:Location', 'calendar:Organizer', 'calendar:RequiredAttendees', 'calendar:OptionalAttendees',
  'calendar:IsCancelled', 'calendar:LegacyFreeBusyStatus', 'calendar:MyResponseType', 'calendar:IsRecurring',
  'item:ReminderIsSet', 'item:ReminderMinutesBeforeStart', 'calendar:UID', 'calendar:RecurrenceId'
)

function New-SolicitudDetalles([string[]]$Ids) {
  $campos = ($script:CamposReunion | ForEach-Object { "<t:FieldURI FieldURI=""$_""/>" }) -join ''
  $items = ($Ids | ForEach-Object { "<t:ItemId Id=""$(ConvertTo-XmlSeguro $_)""/>" }) -join ''
  return New-Sobre ('<m:GetItem>' +
    '<m:ItemShape><t:BaseShape>IdOnly</t:BaseShape><t:BodyType>Text</t:BodyType>' +
    "<t:AdditionalProperties>$campos</t:AdditionalProperties></m:ItemShape>" +
    "<m:ItemIds>$items</m:ItemIds></m:GetItem>")
}

# -----------------------------------------------------------------------------
# Respuestas de Exchange
# -----------------------------------------------------------------------------

function Get-Hijo($Nodo, [string]$Nombre) {
  if (-not $Nodo) { return $null }
  return $Nodo.SelectSingleNode("*[local-name()='$Nombre']")
}

function Get-Texto($Nodo, [string]$Nombre) {
  $hijo = Get-Hijo $Nodo $Nombre
  if ($hijo) { return $hijo.InnerText.Trim() }
  return ''
}

function Get-MensajesRespuesta([string]$Xml, [string]$Operacion) {
  $doc = New-Object System.Xml.XmlDocument
  try {
    $doc.LoadXml($Xml)
  } catch {
    throw (New-EwsError 'RespuestaInvalida' 'Exchange devolvió una respuesta que no es XML.')
  }
  $falla = $doc.SelectSingleNode("//*[local-name()='Body']/*[local-name()='Fault']")
  if ($falla) {
    $codigo = Get-Texto (Get-Hijo $falla 'detail') 'ResponseCode'
    if (-not $codigo) { $codigo = 'Fault' }
    throw (New-EwsError $codigo (Get-Texto $falla 'faultstring'))
  }
  $ruta = "//*[local-name()='${Operacion}Response']/*[local-name()='ResponseMessages']/*[local-name()='${Operacion}ResponseMessage']"
  return @($doc.SelectNodes($ruta))
}

function Assert-Exito($Mensaje) {
  if (-not $Mensaje) { throw (New-EwsError 'RespuestaInvalida' 'Exchange no devolvió ningún resultado.') }
  $clase = $Mensaje.GetAttribute('ResponseClass')
  if ($clase -ne 'Success' -and $clase -ne 'Warning') {
    $codigo = Get-Texto $Mensaje 'ResponseCode'
    if (-not $codigo) { $codigo = 'Error' }
    throw (New-EwsError $codigo (Get-Texto $Mensaje 'MessageText'))
  }
}

function Read-Cambios([string]$Xml) {
  $mensaje = @(Get-MensajesRespuesta $Xml 'SyncFolderItems')[0]
  Assert-Exito $mensaje
  $cambios = Get-Hijo $mensaje 'Changes'
  $cantidad = 0
  if ($cambios) {
    $cantidad = @($cambios.ChildNodes | Where-Object { $_.LocalName -in @('Create', 'Update', 'Delete') }).Count
  }
  return [pscustomobject]@{
    Estado        = Get-Texto $mensaje 'SyncState'
    Cambios       = $cantidad
    IncluyeUltimo = (Get-Texto $mensaje 'IncludesLastItemInRange') -ne 'false'
  }
}

function Read-IdsVista([string]$Xml) {
  $mensaje = @(Get-MensajesRespuesta $Xml 'FindItem')[0]
  Assert-Exito $mensaje
  $ids = New-Object System.Collections.Generic.List[string]
  $items = Get-Hijo (Get-Hijo $mensaje 'RootFolder') 'Items'
  if ($items) {
    foreach ($item in $items.ChildNodes) {
      $id = Get-Hijo $item 'ItemId'
      if ($id -and $id.GetAttribute('Id')) { $ids.Add($id.GetAttribute('Id')) }
    }
  }
  return $ids.ToArray()
}

$script:PatronEnlace = 'https://(?:teams\.microsoft\.com/l/meetup-join|teams\.live\.com/meet|[\w-]+\.zoom\.us/[jw]|meet\.google\.com)/[^\s<>"'')\]]+'

function Get-EnlaceReunion([string[]]$Textos) {
  foreach ($texto in $Textos) {
    if ($texto) {
      $m = [regex]::Match($texto, $script:PatronEnlace, 'IgnoreCase')
      if ($m.Success) { return ($m.Value -replace '[.,;:!?]+$', '') }
    }
  }
  return $null
}

function Get-Correo($Buzon) {
  $direccion = Get-Texto $Buzon 'EmailAddress'
  if ($direccion -like '*@*') { return $direccion.ToLowerInvariant() }
  return $null
}

function Get-Asistentes($Lista, [bool]$Opcional) {
  $resultado = New-Object System.Collections.Generic.List[object]
  if ($Lista) {
    foreach ($asistente in $Lista.ChildNodes) {
      $buzon = Get-Hijo $asistente 'Mailbox'
      $correo = Get-Correo $buzon
      $nombre = Get-Texto $buzon 'Name'
      if (-not $nombre) { $nombre = $correo }
      if (-not $nombre) { $nombre = 'Sin nombre' }
      $respuesta = Get-Texto $asistente 'ResponseType'
      if (-not $respuesta) { $respuesta = $null }
      $resultado.Add([ordered]@{ name = $nombre; email = $correo; response = $respuesta; optional = $Opcional })
    }
  }
  return $resultado.ToArray()
}

function Get-TextoONulo($Nodo, [string]$Nombre) {
  $texto = Get-Texto $Nodo $Nombre
  if ($texto) { return $texto }
  return $null
}

# Reuniones de una respuesta de GetItem. Se omiten las privadas y las que
# Exchange no entregó (por ejemplo, por falta de permiso sobre ese elemento).
function Read-Reuniones([string]$Xml) {
  $reuniones = New-Object System.Collections.Generic.List[object]
  foreach ($mensaje in (Get-MensajesRespuesta $Xml 'GetItem')) {
    if ($mensaje.GetAttribute('ResponseClass') -ne 'Success') { continue }
    $items = Get-Hijo $mensaje 'Items'
    if (-not $items) { continue }
    foreach ($item in $items.ChildNodes) {
      if ($item.LocalName -ne 'CalendarItem') { continue }
      if ((Get-Texto $item 'Sensitivity') -eq 'Private') { continue }
      $idNodo = Get-Hijo $item 'ItemId'
      $inicio = Get-Texto $item 'Start'
      if (-not $idNodo -or -not $inicio) { continue }
      $fin = Get-Texto $item 'End'
      if (-not $fin) { $fin = $inicio }
      $ubicacion = Get-TextoONulo $item 'Location'
      $organizador = Get-Hijo (Get-Hijo $item 'Organizer') 'Mailbox'
      $asistentes = @(Get-Asistentes (Get-Hijo $item 'RequiredAttendees') $false) + @(Get-Asistentes (Get-Hijo $item 'OptionalAttendees') $true)
      # Identificador permanente (no cambia al mover una serie): UID + repetición.
      $itemId = $idNodo.GetAttribute('Id')
      $uid = Get-Texto $item 'UID'
      $clave = $itemId
      if ($uid) { $clave = "$uid|$(Get-Texto $item 'RecurrenceId')" }
      # Recordatorio que tiene en Outlook (minutos antes), si está activado.
      $recordatorio = $null
      $minutos = 0
      if ((Get-Texto $item 'ReminderIsSet') -eq 'true' -and [int]::TryParse((Get-Texto $item 'ReminderMinutesBeforeStart'), [ref]$minutos)) {
        $recordatorio = $minutos
      }
      $reuniones.Add([ordered]@{
          event_key       = $clave
          item_id         = $itemId
          subject         = Get-Texto $item 'Subject'
          start_at        = $inicio
          end_at          = $fin
          all_day         = (Get-Texto $item 'IsAllDayEvent') -eq 'true'
          location        = $ubicacion
          organizer_name  = Get-TextoONulo $organizador 'Name'
          organizer_email = Get-Correo $organizador
          attendees       = [object[]]$asistentes
          join_url        = Get-EnlaceReunion @($ubicacion, (Get-Texto $item 'Body'))
          is_recurring    = (Get-Texto $item 'IsRecurring') -eq 'true'
          is_cancelled    = (Get-Texto $item 'IsCancelled') -eq 'true'
          show_as         = Get-TextoONulo $item 'LegacyFreeBusyStatus'
          my_response     = Get-TextoONulo $item 'MyResponseType'
          reminder_minutes = $recordatorio
        })
    }
  }
  return $reuniones.ToArray()
}

function Get-EstadoPorError([string]$Codigo) {
  if ($Codigo -in @('ErrorNonExistentMailbox', 'ErrorInvalidSmtpAddress')) { return 'no_encontrado' }
  if ($Codigo -in @('ErrorAccessDenied', 'ErrorFolderNotFound', 'ErrorItemNotFound')) { return 'sin_permiso' }
  return 'error'
}

function Get-DetalleEstado([string]$Estado, [string]$Codigo, [string]$Mensaje) {
  switch ($Estado) {
    'sin_permiso' { return 'La cuenta de servicio no tiene permiso de Revisor sobre este calendario.' }
    'no_encontrado' { return 'No existe un buzón con ese correo en Exchange.' }
    default {
      $texto = "${Codigo}: $Mensaje"
      if ($texto.Length -gt 500) { $texto = $texto.Substring(0, 500) }
      return $texto
    }
  }
}

# -----------------------------------------------------------------------------
# Conexiones
# -----------------------------------------------------------------------------

# Llama a EWS con la sesión de Windows de la tarea (Kerberos/NTLM): sin contraseñas guardadas.
function Invoke-Ews([string]$Cuerpo) {
  $solicitud = [Net.HttpWebRequest]::Create($script:Config.ewsUrl)
  $solicitud.Method = 'POST'
  $solicitud.ContentType = 'text/xml; charset=utf-8'
  $solicitud.UseDefaultCredentials = $true
  $solicitud.Timeout = $script:TiempoEsperaMs
  $bytes = [Text.Encoding]::UTF8.GetBytes($Cuerpo)
  $respuesta = $null
  try {
    $flujo = $solicitud.GetRequestStream()
    $flujo.Write($bytes, 0, $bytes.Length)
    $flujo.Close()
    $respuesta = $solicitud.GetResponse()
  } catch {
    $e = $_.Exception
    while ($e -and -not ($e -is [Net.WebException])) { $e = $e.InnerException }
    if ($e -and $e.Response) {
      $respuesta = $e.Response
    } else {
      throw (New-EwsError 'SinConexion' "No se pudo conectar con Exchange: $($_.Exception.Message)")
    }
  }
  try {
    $codigoHttp = [int]$respuesta.StatusCode
    if ($codigoHttp -eq 401) {
      throw (New-EwsError 'SinAutorizacion' 'Exchange no aceptó la cuenta de la tarea. La tarea programada debe correr como svccalendario.')
    }
    $lector = New-Object IO.StreamReader($respuesta.GetResponseStream(), [Text.Encoding]::UTF8)
    $texto = $lector.ReadToEnd()
    $lector.Close()
    if ($codigoHttp -ge 400 -and $texto -notmatch 'Envelope') {
      throw (New-EwsError "HTTP$codigoHttp" "Exchange respondió con el código $codigoHttp.")
    }
    return $texto
  } finally {
    $respuesta.Close()
  }
}

# Llama a la app (Edge Function outlook-agent) por HTTPS.
function Invoke-App($Datos) {
  $json = ConvertTo-Json -InputObject $Datos -Depth 8 -Compress
  $parametros = @{
    Uri         = "$($script:Config.supabaseUrl.TrimEnd('/'))/functions/v1/outlook-agent"
    Method      = 'Post'
    Headers     = @{ 'x-agent-token' = $script:Config.agentToken }
    ContentType = 'application/json; charset=utf-8'
    Body        = [Text.Encoding]::UTF8.GetBytes($json)
    TimeoutSec  = 60
  }
  if ($PSVersionTable.PSVersion.Major -lt 6) { $parametros.UseBasicParsing = $true }
  return Invoke-RestMethod @parametros
}

function Save-Resultado([string]$UsuarioId, [string]$Estado, $Detalle, $EstadoEws, $Reuniones, [bool]$Completa) {
  $eventos = $null
  if ($null -ne $Reuniones) { $eventos = [object[]]$Reuniones }
  $null = Invoke-App ([ordered]@{
      action     = 'save'
      user_id    = $UsuarioId
      status     = $Estado
      detail     = $Detalle
      sync_state = $EstadoEws
      events     = $eventos
      full       = $Completa
      window_to  = $script:VentanaHasta
    })
}

# -----------------------------------------------------------------------------
# Sincronización
# -----------------------------------------------------------------------------

function Read-Ventana([string]$Correo) {
  $ahora = (Get-Date).ToUniversalTime()
  $inicio = $ahora.AddDays(-$script:DiasAtras).ToString('yyyy-MM-ddTHH:mm:ssZ')
  $fin = $ahora.AddDays($script:DiasAdelante).ToString('yyyy-MM-ddTHH:mm:ssZ')
  $script:VentanaHasta = $fin
  $ids = @(Read-IdsVista (Invoke-Ews (New-SolicitudVista $Correo $inicio $fin)))
  $reuniones = New-Object System.Collections.Generic.List[object]
  for ($i = 0; $i -lt $ids.Count; $i += $script:LoteDetalles) {
    $lote = $ids[$i..([Math]::Min($i + $script:LoteDetalles, $ids.Count) - 1)]
    foreach ($r in (Read-Reuniones (Invoke-Ews (New-SolicitudDetalles $lote)))) { $reuniones.Add($r) }
  }
  return $reuniones.ToArray()
}

# Devuelve 'sin_cambios', 'actualizado' o 'error'. Si Exchange no acepta la
# cuenta de la tarea, lanza el error (afecta a todos los usuarios).
function Sync-Usuario($Usuario) {
  $estado = [string]$Usuario.sync_state
  $completa = [bool]$Usuario.needs_full -or -not $estado
  $cambio = $false
  try {
    $lotes = 0
    while ($lotes -lt $script:MaxLotesCambios) {
      $lotes++
      try {
        $resultado = Read-Cambios (Invoke-Ews (New-SolicitudCambios $Usuario.email $estado))
      } catch {
        if ((Get-CodigoError $_.Exception) -eq 'ErrorInvalidSyncStateData' -and $estado) {
          $estado = ''
          $completa = $true
          continue
        }
        throw
      }
      if ($estado -and $resultado.Cambios -gt 0) { $cambio = $true }
      $estado = $resultado.Estado
      if ($resultado.IncluyeUltimo) { break }
    }

    if (-not $completa -and -not $cambio) {
      Save-Resultado $Usuario.user_id 'ok' $null $estado $null $false
      return 'sin_cambios'
    }

    $reuniones = @(Read-Ventana $Usuario.email)
    Save-Resultado $Usuario.user_id 'ok' $null $estado $reuniones $completa
    Write-Registro "$($Usuario.email): $(@($reuniones).Count) reuniones leídas$(if ($completa) { ' (lectura completa)' })"
    return 'actualizado'
  } catch {
    $codigo = Get-CodigoError $_.Exception
    if ($codigo -eq 'SinAutorizacion') { throw }
    $estadoFinal = Get-EstadoPorError $codigo
    $detalle = Get-DetalleEstado $estadoFinal $codigo $_.Exception.Message
    Write-Registro "$($Usuario.email): $codigo $($_.Exception.Message)"
    try { Save-Resultado $Usuario.user_id $estadoFinal $detalle $null $null $false } catch { Write-Registro "No se pudo guardar el error: $($_.Exception.Message)" }
    return 'error'
  }
}

function Start-Sincronizacion {
  if (-not (Test-Path $Configuracion)) { throw "Falta el archivo de configuración: $Configuracion" }
  $script:Config = Get-Content $Configuracion -Raw -Encoding UTF8 | ConvertFrom-Json
  foreach ($campo in @('supabaseUrl', 'agentToken', 'ewsUrl')) {
    if (-not $script:Config.$campo) { throw "Falta '$campo' en $Configuracion" }
  }
  [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12

  $respuesta = Invoke-App ([ordered]@{ action = 'targets'; version = $script:Version; host = $env:COMPUTERNAME })
  $usuarios = @($respuesta.targets)
  $resumen = @{ sin_cambios = 0; actualizado = 0; error = 0 }
  try {
    foreach ($usuario in $usuarios) { $resumen[(Sync-Usuario $usuario)]++ }
  } catch {
    # La cuenta de la tarea no entra a Exchange: se avisa en todos, sin borrar sus reuniones.
    $mensaje = $_.Exception.Message
    foreach ($usuario in $usuarios) {
      try { Save-Resultado $usuario.user_id 'error' $mensaje $null $null $false } catch { }
    }
    throw
  }
  if ($resumen.actualizado -gt 0 -or $resumen.error -gt 0) {
    Write-Registro ("{0} usuarios: {1} actualizados, {2} sin cambios, {3} con error" -f $usuarios.Count, $resumen.actualizado, $resumen.sin_cambios, $resumen.error)
  }
  return $resumen
}

if (-not $SoloFunciones) {
  try {
    $null = Start-Sincronizacion
  } catch {
    Write-Registro "ERROR: $($_.Exception.Message)"
    exit 1
  }
}
