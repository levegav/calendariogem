# Estado del proyecto: Calendario GEM

**Estado general: entregado (2026-11-17).** Las fases 0 a 9 están terminadas y aprobadas (la fase 9, estilo Bento, se aprobó el 19/11/2026). La fase 11 (calendario general) se aprobó el 19/11/2026 y la fase 12 (reuniones de Outlook) el 23/11/2026.

## Fases

| Fase | Contenido | Estado |
|---|---|---|
| 0 | Base: proyecto, Supabase, pruebas, primer despliegue | Terminada (aprobada) |
| 1 | Usuarios: login, panel admin, colores RGB, perfil, menú, responsive | Terminada (aprobada) |
| 2 | Categorías, CRUD de recordatorios, vistas día/semana/mes/año | Terminada (aprobada) |
| 3 | Compartir: etiquetas, "Creado por", ver calendarios de otros, salirse | Terminada (aprobada) |
| 4 | Notificaciones en tiempo real y avisos previos por participante | Terminada (aprobada) |
| 5 | Ventana Conservar / Eliminar (borrado y usuario desactivado) | Terminada (aprobada) |
| 6 | Búsqueda y filtros | Terminada (aprobada) |
| 7 | Pulido y entrega final | Terminada (aprobada) |
| 8 | Estilo visual "Corporativo GEM" | Terminada (aprobada) |
| 9 | Estilo visual "Bento" | Terminada (aprobada) |
| 11 | Calendario general compartido entre usuarios con acceso | Terminada (aprobada) |
| 12 | Reuniones de Outlook (un solo sentido, solo lectura) | Terminada (aprobada) |
| 13 | Avisos y notificaciones de las reuniones de Outlook | En prueba con el calendario de Luis |
| Posteriores | Recurrencia, exportar a Excel, feriados, sincronización con Google | — |

Regla: no se empieza una fase sin la autorización explícita del usuario.

## Decisiones acordadas (2026-11-16)

**Usuarios y roles**
- Solo dos roles: **admin** y **user**. El admin también tiene su calendario y se le puede etiquetar.
- Inicio de sesión con **nombre de usuario** y contraseña. Solo el admin crea cuentas, no hay registro público. El admin restablece contraseñas y el usuario cambia la temporal al entrar por primera vez.
- Desactivar un usuario no borra su información: solo le impide entrar.

**Colores e identificación**
- Cada usuario tiene un color que asigna el admin con un selector RGB libre. Se avisa si el color es igual o muy parecido al de otro usuario.
- El color del creador se muestra como línea lateral, junto con "Creado por: Nombre". La categoría se muestra como insignia, aparte.

**Ver calendarios**
- **Cambio del 2026-11-17:** solo el **admin** ve los calendarios de los demás, con el selector "Ver calendario de…" de varias personas. Un usuario ve únicamente los recordatorios que creó y aquellos en los que está etiquetado, junto con los demás participantes de esos recordatorios.
- Solo el creador edita o elimina un recordatorio.

**Recordatorios**
- Campos: título, descripción, fecha y hora de inicio, fin opcional, "todo el día", categoría, etiquetados, avisos previos, ubicación o enlace (opcional) y nota (opcional).
- Un solo registro original por recordatorio. Los etiquetados se relacionan con él, sin copias.
- Al etiquetar, la persona queda agregada automáticamente y se le notifica. Puede **salirse**, y se notifica al creador.
- Si el creador quita a alguien de las etiquetas, esa persona recibe solo una notificación.
- Los etiquetados ven a los demás participantes.
- La notificación de una modificación indica qué cambió.

**Notificaciones y avisos**
- Solo dentro de la app, en tiempo real.
- Cada participante configura sus propios avisos previos. Si la app estaba cerrada, el aviso aparece como perdido al entrar.

**Ventana Conservar / Eliminar**
- Sale **de inmediato** si el usuario está conectado, y si no, al entrar. No se puede cerrar sin decidir, y si hay varias, salen una por una. También sale si el evento ya pasó.
- Se aplica cuando el creador elimina el recordatorio, y cuando se desactiva al creador (solo para sus recordatorios **futuros**).
- "Conservar" crea una copia independiente de la que el usuario pasa a ser dueño. "Eliminar" quita su participación. Las decisiones de cada persona son independientes.

**Categorías**
- Solo las administra el admin: crear, editar, color y eliminar. Si una categoría está en uso, eliminar solo la desactiva.
- Iniciales: Reunión, Vencimiento, Tarea, Personal, Feriado.

**Vistas y formato**
- Día (franjas horarias), semana, mes y año. Zona horaria `America/Costa_Rica`, la semana empieza el lunes, todo en español.

## Fase 0: base

**Infraestructura**
- Supabase en una cuenta nueva, proyecto `kpufmrodkwkvaljxhewj` (plan gratis, East US).
- Repositorio `levegav/calendariogem` (privado) y Cloudflare Pages `calendariogem`.

**Base técnica**
- React 19, TypeScript, Vite, Vitest y oxlint. Es la misma base técnica que `nacente`.
- Supabase local en los puertos `5642x`.
- `scripts/remoto.ps1` permite usar la CLI contra el proyecto real con un token propio, sin cerrar la sesión de la cuenta de oficina/nacente.

**Seguridad**
- La app rechaza claves secretas en las variables `VITE_`.
- La CSP solo permite conectar con este proyecto de Supabase.

**Página temporal**
- Muestra "Calendario GEM · En construcción" y comprueba la conexión con el servidor.

### Pruebas de la Fase 0 (2026-11-16)

- `npm run check`: lint, tipos, 10 pruebas unitarias y build, todo correcto.
- Supabase real: `/auth/v1/health` responde 200. Registro público bloqueado (`disable_signup: true`) y confirmación de correo apagada.
- Supabase local: `npx supabase start` levanta en los puertos `5642x`.
- Cloudflare Pages: https://calendariogem.pages.dev responde 200 con las cabeceras de seguridad (CSP, `X-Frame-Options: DENY`). El build incluye la URL y la clave pública del proyecto.
- CORS: Supabase acepta peticiones desde `https://calendariogem.pages.dev`.
- Nota: el primer despliegue falló porque el proyecto de Cloudflare quedó desconectado de GitHub. Se resolvió dando acceso al repositorio en la app de Cloudflare en GitHub.

## Fase 1: usuarios

**Base de datos** (`20261116120000_usuarios.sql`)
- `profiles` con rol `admin` o `user`, `active`, `must_change_password`, `color` (#rrggbb, único) y `theme`.
- Los perfiles se crean automáticamente al crear la cuenta en Auth: rol `user`, **desactivado** y con el primer color libre de la paleta.
- `audit_log` registra los cambios administrativos, como nombre, rol, estado, color y restablecimientos.
- RLS: solo los usuarios activos ven los perfiles (nombres y colores, necesarios para "Creado por" y las etiquetas). Nadie escribe directamente en `profiles`.
- Funciones:
  - `admin_update_user`: nombre, rol, estado y color. Valida el formato del color y que no esté repetido. El admin no puede cambiar su propio rol ni desactivarse.
  - `admin_flag_password_reset`
  - `complete_password_change`
  - `set_my_theme`

**Edge Function `admin-users`**
- Acciones: crear (con color), activar o desactivar (bloquea en Auth) y restablecer la contraseña.
- Solo la usa un admin activo, y solo desde `calendariogem.pages.dev` o `localhost`.
- Si el color está en uso, rechaza la creación antes de crear la cuenta.

**Frontend**
- Inicio de sesión con usuario, y cambio obligatorio de la contraseña temporal.
- Menú lateral con Calendario, Mi perfil y, para el admin, Administración > Usuarios. En celular se abre como panel con ☰.
- **Usuarios** (admin): lista con avatar, línea del color y código HEX. Permite crear, editar, desactivar y restablecer la contraseña.
- **Selector de color:** 16 colores sugeridos (deshabilitados si ya están en uso) y el botón **+ Color personalizado**, que abre un panel visual al estilo de Office: un recuadro de intensidad y brillo, una barra de matices, la vista previa Nuevo / Actual y los botones "Usar este color" y "Cancelar". Los valores exactos (HEX y R/G/B) están en una sección plegable. Bloquea un color repetido y advierte si se parece mucho a otro (ΔE < 15).
- **Mi perfil:** datos, color identificador con vista previa de "Creado por", apariencia (claro, oscuro o automático) y cambio de contraseña.
- El inicio es provisional ("Su calendario estará aquí muy pronto"). El calendario llega en la Fase 2.

**Pruebas (2026-11-16)**
- `npm run check`: lint, tipos, 68 pruebas unitarias y build, todo correcto.
- `npm run test:db`: 31 pruebas pgTAP de permisos, colores y reglas del admin, todas correctas.
- `npm run test:integration`: 9 pruebas contra el Supabase local (Edge Function, colores duplicados, permisos, desactivación, cuenta externa sin acceso), todas correctas.
- Hallazgo corregido: en la paleta sugerida, `#7c3aed` era casi igual a `#9333ea`. Se reemplazó por `#475569`.

**Despliegue de la Fase 1 (2026-11-16)**
- `db push`: migración `20261116120000_usuarios.sql` aplicada en el proyecto real. `migration list` muestra el local y el remoto iguales.
- Edge Function `admin-users` desplegada.
- Verificación remota:
  - Un anónimo no lee `profiles` (401) ni ejecuta `admin_update_user` (401).
  - La función sin sesión responde 401, y desde otro sitio responde 403.
  - El preflight CORS de `calendariogem.pages.dev` responde OK.
- Cloudflare publicó el build. `/login`, `/perfil` y `/usuarios` responden 200.
- Pendiente: crear el primer administrador (ver README) y la prueba del usuario.
- Ajuste pedido por el usuario: color personalizado visual al estilo de Office, en lugar de escribir valores RGB. Se revisó en Edge (claro, oscuro y un ancho de 340 px). 73 pruebas unitarias correctas.

## Fase 2: categorías, recordatorios y vistas

**Base de datos**
- `20261117110000_color_sin_carrera.sql`: corrige una condición de carrera. Si se creaban dos usuarios a la vez, podían recibir el mismo color inicial y la segunda creación fallaba. Ahora la elección de color se hace de a uno (bloqueo de transacción). La encontraron las pruebas de integración.
- `20261117120000_categorias_recordatorios.sql`:
  - `categories`: nombre único sin importar mayúsculas, color `#rrggbb` y `active`. Iniciales: Reunión, Vencimiento, Tarea, Personal y Feriado.
  - `reminders`: un único registro original con `owner_id`, título, descripción, `start_at`, `end_at` (opcional, no anterior al inicio), `all_day`, categoría, ubicación o enlace, y nota.
  - Reglas:
    - Solo se asignan categorías activas; uno que ya usa una categoría desactivada la conserva.
    - El dueño no cambia nunca: la columna no tiene permiso de escritura y además un trigger lo impide.
  - RLS:
    - Todos los usuarios activos **ven** los recordatorios, porque se acordó que los calendarios son visibles.
    - Solo el dueño los modifica o elimina.
    - Solo el admin administra las categorías.
  - `admin_delete_category`: si la categoría está en uso, la desactiva; si no, la borra. Queda auditado.

**Frontend**
- **Calendario** (pantalla de inicio):
  - Vistas Día, Semana, Mes y Año, con navegación ‹ › y "Hoy".
  - La vista y la fecha quedan en la dirección (`?vista=semana&fecha=…`), y se recuerda la última vista usada.
- **Hora de Costa Rica (UTC−6)** en toda la app, sin importar la zona del dispositivo (`src/lib/dates.ts`). Las fechas se manejan como "AAAA-MM-DD". La semana empieza el lunes.
- **Día y Semana:**
  - Cuadrícula por horas, con una franja de "Todo el día" (también para eventos de varios días).
  - Los eventos que se cruzan se reparten en columnas.
  - Una línea roja marca la hora actual.
  - Al hacer clic en una hora vacía se crea un recordatorio a esa hora (redondeada a 30 min). Al abrir, la vista muestra desde las 7 a. m.
- **Mes:**
  - Hasta 3 recordatorios por día, más "+N más".
  - Al tocar el número del día se abre la vista Día; al tocar un espacio vacío se crea un recordatorio en ese día.
  - En celular: puntos con el color del creador.
- **Año:** los 12 meses; los días con recordatorios van resaltados y con un punto. Al tocar un día se abre la vista Día, y al tocar un mes, la vista Mes.
- **Identificación visual:** línea lateral con el color del **creador**, punto con el color de la **categoría** y "Creado por: Nombre" en los detalles. En la vista Día también aparece en el bloque, si cabe.
- **Nuevo / Editar recordatorio** (ventana emergente; en celular, pantalla completa):
  - Campos: título, categoría (pastillas de color), "Todo el día", fecha y hora de inicio (lista cada 15 min, como al agendar una reunión), finalización opcional ("Dura varios días" si es de todo el día), descripción, ubicación o enlace, y nota.
  - Validación: título y categoría obligatorios, y la finalización no puede ser anterior al inicio.
- **Detalles:** cuándo, ubicación (si es un enlace, se abre en otra pestaña), descripción, nota y "Creado por". Editar y Eliminar solo para el creador.
- **Categorías** (admin): crear, editar nombre y color (mismo selector visual), eliminar o desactivar y reactivar.
- En celular, botón flotante **+** para crear.
- Pendiente para la Fase 3: etiquetar usuarios y "Ver calendario de…". Por ahora, el calendario muestra los recordatorios propios.

**Pruebas (2026-11-16)**
- `npm run check`: lint, tipos, 124 pruebas unitarias y build, todo correcto.
- `npm run test:db`: 61 pruebas pgTAP, todas correctas. Las pruebas cuentan solo sus propios datos, para no depender de los que dejan otras pruebas.
- `npm run test:integration`: 13 pruebas contra el Supabase local, correctas en ejecuciones repetidas. Incluyen la consulta por rango (eventos que cruzan el rango) y la propiedad (otro usuario ve, pero no modifica ni elimina).
- Revisión visual en Edge con datos de demostración:
  - Vistas Mes, Semana, Día y Año en escritorio.
  - Mes y Semana en celular.
  - El formulario de nuevo recordatorio.
- Corregido en la revisión: en celular aparecían el botón "Nuevo recordatorio" y el botón flotante a la vez, y la etiqueta "7 a. m." quedaba cortada.

**Despliegue (2026-11-17)**
- `db push`: las 2 migraciones se aplicaron en el proyecto remoto (por el hotspot, porque la red de la oficina bloquea el puerto 5432).
- Verificación remota sin sesión: leer `categories` y `reminders` da 401 (42501), crear una categoría da 401 y `admin_delete_category` da 401.
- `npm run check` correcto. Push del commit ce64d4f; Cloudflare publicó la nueva versión en https://calendariogem.pages.dev.

**Ajuste tras la revisión del usuario (2026-11-17)**
- En Día y Semana las líneas de los encabezados no coincidían con las de la cuadrícula: la zona de horas tiene barra de desplazamiento y los encabezados no. Ahora los encabezados y la franja "Todo el día" reservan el mismo espacio (`scrollbar-gutter: stable`). Verificado con captura con barras visibles.

## Fase 3: compartir (etiquetados y calendarios de otros)

**Base de datos** (`20261118120000_etiquetados.sql`)
- `reminder_participants (reminder_id, user_id, added_at)`: vínculo entre el recordatorio original y cada etiquetado. Nunca se copia el recordatorio.
- Reglas (trigger): no se etiqueta al propio creador ni a usuarios inactivos.
- RLS:
  - Todos los usuarios activos ven quién está etiquetado.
  - Solo el creador agrega o quita etiquetados.
  - Cada etiquetado puede quitarse a sí mismo (salirse); el recordatorio original no se toca.
  - Al eliminar el recordatorio se eliminan sus vínculos. La ventana Conservar / Eliminar para los etiquetados llega en la Fase 5.
- `save_reminder(...)`: guarda el recordatorio y sus etiquetados en una sola transacción. Es SECURITY INVOKER: corre con los permisos de quien llama, así que se aplican las mismas reglas que a un cambio directo. Quien ya estaba etiquetado se mantiene; solo se agregan los nuevos y se quitan los que salieron de la lista.
- `calendar_reminders(usuarios, desde, hasta)`: recordatorios de los calendarios elegidos (creados por esas personas o en los que están etiquetadas), sin repetir. También SECURITY INVOKER.

**Frontend**
- **Etiquetar personas** en el formulario: se escribe un nombre y aparecen hasta 6 coincidencias. Primero salen las que empiezan igual y la búsqueda ignora tildes. Enter agrega la primera. Cada etiquetado queda como una pastilla con su avatar y color, y una × para quitarlo. El creador no aparece en la búsqueda.
- **Detalles**: lista de "Etiquetados" (con "(yo)"). Un etiquetado ve **Salir del recordatorio** (con confirmación); no ve Editar ni Eliminar.
- **Ver calendario de…** (barra superior, **solo admin**): casillas con el propio calendario y el de cada usuario activo, más "Solo el mío" y "Todos". Siempre queda al menos uno. La elección se recuerda por usuario en el navegador.
- "Mi calendario" ahora incluye los recordatorios en los que el usuario está etiquetado, con la línea del color de quien los creó y "Creado por".
- Las notificaciones (etiquetado, quitado, salida, cambios) llegan en la Fase 4.

**Pruebas (2026-11-17)**
- `npm run check`: lint, tipos, 129 pruebas unitarias y build, todo correcto. El lint muestra 2 advertencias que ya existían.
- `npm run test:db`: 83 pruebas pgTAP (22 nuevas), todas correctas: quién etiqueta, que no se etiquete al creador ni a inactivos, que un etiquetado no modifique ni quite a otros pero sí se salga, que quien ya estaba no se reinserte, el borrado en cascada y que sin sesión no haya acceso.
- `npm run test:integration`: 19 pruebas contra el Supabase local (6 nuevas) con la misma consulta que usa la app.
- Revisión visual en Edge: Semana con solo mi calendario y con 3 calendarios, formulario con etiquetados, detalles de un recordatorio donde estoy etiquetado y Mes en celular con el selector.

**Despliegue (2026-11-17)**
- `db push` de `20261118120000_etiquetados.sql` en el proyecto remoto.
- Verificación sin sesión: `reminder_participants`, `calendar_reminders` y `save_reminder` responden 401.
- Cloudflare publicó la versión con la Fase 3.

### Ajuste del 2026-11-17: visibilidad solo para el admin y buscador de etiquetados

**Base de datos** (`20261118130000_visibilidad_admin.sql`)
- `reminders`: el admin lee todos los recordatorios. Un usuario lee los que creó y aquellos en los que está etiquetado.
- `reminder_participants`: los etiquetados de un recordatorio los ven el admin, su creador y sus etiquetados.
- Se agregaron las funciones auxiliares `private.is_reminder_owner` y `private.is_reminder_participant` (SECURITY DEFINER), que evitan que las políticas se llamen entre sí en bucle. Las políticas para agregar y quitar etiquetados usan esas mismas funciones.
- `calendar_reminders` no cambia: es SECURITY INVOKER, así que RLS ya filtra lo que cada quien recibe.

**Frontend**
- El selector "Ver calendario de…" solo aparece para el admin. Un usuario siempre consulta su propio calendario, aunque el navegador tenga guardada una elección anterior.
- Hay un buscador nuevo para etiquetar personas (descrito arriba).

**Pruebas (2026-11-17)**
- `npm run check`: lint, tipos, 130 pruebas unitarias y build, todo correcto.
  - Se actualizaron 3 pruebas para el buscador nuevo.
  - 1 prueba nueva: un usuario que no es admin no ve "Ver calendario de…".
- `npm run test:db`: 88 pruebas pgTAP, todas correctas. Las 5 nuevas comprueban que:
  - un usuario no ve recordatorios ajenos, pero el admin sí;
  - después de salirse, ya no ve el recordatorio ni a sus etiquetados;
  - un usuario no ve el calendario de otro, pero el admin sí.
- `npm run test:integration`: 20 pruebas contra el Supabase local, todas correctas.

**Despliegue**
- `db push` de `20261118130000_visibilidad_admin.sql` en el proyecto remoto. `migration list` muestra el local y el remoto iguales.

### Ajuste del 2026-11-17: resaltar la casilla bajo el mouse

- **Mes:** la casilla del día bajo el mouse se oscurece un poco.
- **Día y Semana:** se oscurece la franja de media hora bajo el mouse, que es la misma que se usa al hacer clic para crear un recordatorio. Sobre un recordatorio no se resalta, porque ese clic lo abre.
- En modo oscuro el resaltado aclara en vez de oscurecer. En pantallas táctiles no se muestra.
- `npm run check`: 131 pruebas unitarias (1 nueva: la franja aparece en la posición correcta y desaparece al salir) y build, todo correcto.

## Fase 4: notificaciones en tiempo real y avisos previos

**Decisiones (2026-11-17)**
- **Avisos previos:** cada participante puede marcar uno o varios de una lista fija: a la hora, 5, 15 o 30 min, 1 o 2 horas, 1 o 2 días y 1 semana antes.
  - En los de todo el día, la referencia son las 8:00 a. m. Las opciones son: el mismo día, el día anterior, 2 días antes y 1 semana antes.
- **Aviso por defecto:** 15 min antes. En los de todo el día, el día anterior a las 8:00 a. m. Se pone al crear el recordatorio y al etiquetar a alguien.
- **Presentación:**
  - Hay una campana con contador.
  - Los avisos previos que llegan con la app abierta salen en una ventana con el botón **Entendido**.
  - Las demás notificaciones salen como mensaje breve en una esquina.
  - Los avisos que llegaron con la app cerrada quedan solo en la campana, marcados **Perdido**.

**Base de datos** (`20261119120000_notificaciones.sql`)
- `reminder_alerts`: avisos previos de cada participante.
  - RLS: cada quien ve, crea y quita solo los suyos, y solo en recordatorios que creó o en los que está etiquetado.
  - `set_reminder_alerts(recordatorio, minutos[])` los reemplaza.
  - `save_reminder` recibe `p_alerts` con los avisos del creador.
- `notifications`: tipos `etiquetado`, `quitado`, `salida`, `modificado` y `aviso`.
  - Guarda una copia del título, porque quien fue quitado ya no puede leer el recordatorio.
  - RLS: cada quien lee las suyas y solo puede marcarlas como leídas. Nadie las crea directamente.
  - Está publicada en Realtime.
- Triggers:
  - Al etiquetar: notificación "etiquetado" y aviso por defecto.
  - Al quitar a alguien: solo esa persona recibe "quitado", y se borran sus avisos.
  - Al salirse: el creador recibe "salida".
  - Al modificar: los etiquetados reciben "modificado" con lo que cambió (título, fecha y hora, categoría, ubicación, descripción, nota) y el título y horario anteriores.
    - Es un trigger diferido, para que quien fue quitado o recién agregado en el mismo guardado no reciba también "modificado".
  - Al mover la fecha u hora, los avisos se vuelven a armar. Si cambia "todo el día", todos vuelven al aviso por defecto.
  - Al eliminar un recordatorio no se notifica: lo reemplaza la ventana Conservar / Eliminar de la Fase 5.
- **pg_cron** `avisos-previos`: cada 30 segundos convierte en notificación los avisos que ya tocan.
  - Cada aviso se dispara una sola vez.
  - No se disparan avisos cuya hora ya había pasado cuando se configuraron.
  - Si el recordatorio se mueve, vuelve a avisar con la nueva hora.

**Frontend**
- **Campana** en el menú lateral (escritorio) y en el encabezado (celular).
  - Muestra el contador de no leídas, que también aparece en el título de la pestaña: "(3) Calendario GEM".
  - Lista las últimas 50 notificaciones, con la persona que hizo el cambio, el detalle y hace cuánto llegaron.
  - Tiene la opción "Marcar todas como leídas".
  - Al tocar una notificación se abre el día del recordatorio.
- **Ventana de aviso:** "Empieza en 15 min" con el título y la hora. Tiene los botones "Ver en el calendario" y "Entendido".
- **Mensajes breves:** salen 8 segundos en la esquina, con la línea del color de quien hizo el cambio.
- **Mis avisos:**
  - En el formulario de nuevo y editar recordatorio, para el creador.
  - En los detalles del recordatorio, para el creador y los etiquetados. Se guardan al marcarlos; si falla, vuelven a como estaban.
- Al llegar una notificación, el calendario se recarga.
- **Ajustes encontrados en la revisión visual:**
  - El panel de la campana quedaba debajo de la barra del calendario: ahora se dibuja sobre toda la página.
  - En celular, el título largo de la vista Día desbordaba la página (problema que venía de la Fase 2): ahora se recorta con "…".

**Pruebas (2026-11-17)**
- `npm run check`: lint, tipos, 146 pruebas unitarias (15 nuevas) y build, todo correcto.
  - Cubren los textos de cada tipo de notificación, las opciones de aviso, la campana y los perdidos, la ventana de aviso en vivo, el mensaje breve, y "Mis avisos" en los detalles y en el formulario.
- `npm run test:db`: 119 pruebas pgTAP (31 nuevas), todas correctas.
  - Hora de disparo (también en los de todo el día).
  - Avisos por defecto y propios.
  - Que nadie toque los avisos ni las notificaciones de otros.
  - Qué notificación recibe cada quien al modificar, quitar o salirse.
  - Disparo único y nuevo disparo al mover el recordatorio.
  - Que la tarea programada exista y que la tabla esté publicada en Realtime.
- `npm run test:integration`: 25 pruebas (5 nuevas) contra el Supabase local.
  - La notificación llega por Realtime solo a su destinatario.
  - pg_cron dispara un aviso real y llega en tiempo real.
- **Revisión visual en Edge** con datos de demostración, en escritorio y en celular (390 px): campana con perdidos, día del recordatorio, "Mis avisos" en los detalles, mensaje breve en vivo y ventana de aviso disparada por pg_cron.

### Ajuste del 2026-11-17: hora escrita a mano y sonido

- **Hora libre:** la hora de inicio y la de finalización se pueden escribir a cualquier minuto, por ejemplo 10:03.
  - Al tocar el campo sigue apareciendo la lista cada 15 min, con la hora actual centrada.
  - Se acepta "10:03", "10:03 am", "3pm", "15:20" o "1003". Sin a. m./p. m. se toma en formato de 24 h.
  - Enter o salir del campo aplica la hora. Si lo escrito no es una hora, vuelve a la anterior y lo indica.
  - Con las flechas se recorre la lista. Escape cierra la lista sin cerrar la ventana.
- **Sonido:** un timbre corto generado en el navegador, sin archivos.
  - Avisos previos: tres notas ascendentes.
  - Otras notificaciones: dos notas más suaves.
  - No suena al abrir la app por los avisos perdidos.
  - Se silencia o activa con el botón de altavoz del panel de la campana; al activarlo suena de muestra. La preferencia se guarda en ese navegador.
  - Los navegadores solo permiten sonido después de que la persona tocó la página: el audio se habilita con el primer clic o tecla.
- `npm run check`: 153 pruebas unitarias y build, todo correcto. Las 7 nuevas cubren la lectura de horas escritas, el campo de hora (lista, escrita, inválida, flechas) y en qué momentos suena el timbre.
- `npm run test:integration`: 25 pruebas, todas correctas.
- Revisión visual en Edge, en escritorio y en celular: lista de horas dentro del formulario y 10:03 escrita a mano.

## Fase 5: ventana Conservar / Eliminar

**Cómo funciona**
- **Cuándo aparece:**
  - Cuando el creador elimina un recordatorio con etiquetados: cada etiquetado decide.
  - Cuando el admin desactiva a un usuario: deciden los etiquetados de sus recordatorios que **aún no terminan**. Uno de todo el día de hoy cuenta como futuro; los que ya pasaron no se tocan. Los recordatorios del usuario desactivado no se borran.
- **Cómo se presenta:**
  - Sale de inmediato si la persona está conectada (por Realtime y con sonido), o al entrar si no lo está.
  - No se puede cerrar sin decidir: no tiene X y Escape no la cierra.
  - Si hay varias, salen una por una, de la más vieja a la más nueva, e indica cuántas faltan.
  - Si hay un aviso previo en pantalla, la decisión sale después de "Entendido".
  - Sale aunque el evento ya haya pasado.
- **Conservar una copia:** crea un recordatorio nuevo a nombre de la persona.
  - Tiene los mismos datos (título, descripción, fecha y hora, todo el día, categoría, ubicación y nota) y los avisos previos que tenía la persona.
  - La copia no incluye a los demás etiquetados.
  - Mantiene la categoría aunque se haya desactivado; si se eliminó, usa la primera activa.
- **Eliminar de mi calendario:** solo quita su participación.
- En los dos casos, si el original sigue existiendo (creador desactivado), la persona deja de estar etiquetada en él.
- Las decisiones de cada persona son independientes.
- **Confirmaciones:**
  - Al eliminar un recordatorio con etiquetados se avisa que podrán conservar una copia.
  - Al desactivar a un usuario se avisa que sus etiquetados decidirán.
- Los recordatorios eliminados antes de esta fase no generan ventana: no quedó registro para preguntar.

**Base de datos** (`20261120120000_conservar_eliminar.sql`)
- `reminder_decisions`: decisión por persona, con la copia de los datos del recordatorio y sus avisos.
  - RLS: cada quien solo ve las suyas y no las puede cambiar directamente.
  - Está publicada en Realtime.
- Trigger antes de eliminar un recordatorio: crea una decisión por etiquetado. Si ya había una pendiente por desactivación de ese mismo recordatorio, se reemplaza.
- Trigger al desactivar un perfil: crea las decisiones de sus recordatorios que aún no terminan. Si se reactiva y se vuelve a desactivar, no se duplican.
- `resolve_reminder_decision(id, conservar)`:
  - Solo resuelve decisiones propias y pendientes.
  - Crea la copia si corresponde y quita la participación en el original.
  - Marca la decisión con lo que se eligió.
- Las notificaciones ya no se envían a usuarios desactivados (por ejemplo, "salida" al creador desactivado).

**Pruebas (2026-11-17)**
- `npm run check`: lint, tipos, 156 pruebas unitarias (3 nuevas) y build, todo correcto.
  - Presentación una por una, que no se pueda cerrar, error al guardar, y llegada en vivo con sonido.
- `npm run test:db`: 149 pruebas pgTAP (30 nuevas), todas correctas.
  - Decisiones por etiquetado y copia de datos y avisos.
  - Que nadie resuelva las de otro ni decida dos veces.
  - Recordatorios futuros, pasados y de todo el día de hoy al desactivar, sin duplicar.
  - La copia con categoría desactivada.
  - Que no se notifique a desactivados, y el acceso sin sesión.
- `npm run test:integration`: 27 pruebas (2 nuevas).
  - La decisión llega por Realtime.
  - La copia aparece en el calendario de quien la conservó.
  - Desactivar al creador genera la decisión.
- **Revisión visual en Edge:** ventana "Recordatorio eliminado" (escritorio) y "Creador desactivado" (celular), con "Conservar" y "Eliminar" de punta a punta.

## Fase 6: búsqueda y filtros

**Decisiones (2026-11-17)**
- **Búsqueda:** muestra una lista de resultados de todas las fechas, pasadas y futuras. Al tocar un resultado se abre su día y sus detalles.
- **Filtros:** por categoría; todos, creados por mí o donde me etiquetaron; ocultar los que ya pasaron; solo con ubicación o enlace.
- **Admin:** busca en los calendarios elegidos en "Ver calendario de…".
- Los filtros no se guardan: al volver a entrar se ve todo.

**Búsqueda**
- Hay un buscador en la barra del calendario. En celular ocupa todo el ancho.
  - Busca al dejar de escribir, desde 2 letras.
  - Escape o "Volver al calendario" limpian la búsqueda.
- Busca en título, descripción, ubicación y nota, sin importar tildes ni mayúsculas. Con varias palabras, deben aparecer todas, en cualquier orden.
- Respeta los permisos:
  - Un usuario encuentra solo lo suyo y aquello en lo que está etiquetado.
  - El admin busca en los calendarios que tenga elegidos.
- Los resultados se agrupan en **Próximos** (de lo más cercano a lo más lejano) y **Anteriores** (de lo más reciente a lo más viejo), por día, marcando "Hoy".
  - Cada resultado muestra la hora, la categoría, quién lo creó y la ubicación, con la línea del color del creador.
- Se muestran hasta 100 resultados, empezando por los más cercanos a hoy. Si hay más, se pide afinar la búsqueda.
- Los filtros activos también se aplican a los resultados, y se indica cuántos ocultan.

**Filtros**
- El botón **Filtros** muestra cuántos hay activos. Su menú tiene:
  - Las categorías, con su color; también aparecen las desactivadas.
  - Mostrar: Todos, Creados por mí o Donde me etiquetaron.
  - Ocultar los que ya pasaron. Uno de todo el día de hoy todavía no pasó.
  - Solo con ubicación o enlace.
- Con filtros activos aparece un aviso con el resumen, cuántos recordatorios ocultan en el período y el botón **Quitar filtros**.
  - Si los filtros ocultan todo, el calendario lo indica.
- Funcionan en las vistas Día, Semana, Mes y Año.

**Base de datos** (`20261121120000_busqueda.sql`)
- Extensión `unaccent` y `search_reminders(calendarios, texto, límite)`, SECURITY INVOKER: RLS decide qué ve cada quien.
- La búsqueda usa comparación literal, así que caracteres como `%` no funcionan como comodín.

**Pruebas (2026-11-17)**
- `npm run check`: lint, tipos, 166 pruebas unitarias (10 nuevas) y build, todo correcto.
  - Cubren la lógica de filtros y la agrupación de resultados, la búsqueda que abre el día y los detalles, la búsqueda sin resultados, y los filtros por categoría y por relación.
- `npm run test:db`: 160 pruebas pgTAP (11 nuevas), todas correctas.
  - Sin tildes ni mayúsculas, en descripción, ubicación y nota, varias palabras.
  - Que un usuario no encuentre lo de otros, y que el admin busque en los calendarios elegidos.
- `npm run test:integration`: 28 pruebas (1 nueva), con la misma consulta que usa la app.
- **Revisión visual en Edge:**
  - Escritorio: barra con buscador y filtros, menú de filtros con el aviso, y resultados.
  - Celular: buscador a todo el ancho y resultados.
  - Ajuste: con 0 coincidencias el encabezado dice "Sin resultados para «…»".

## Fase 7: pulido y entrega final

**Decisiones (2026-11-17)**
- **Extras elegidos:** que la app se pueda instalar en el teléfono (PWA) y limpiar los datos de prueba del proyecto real.
- Sin manual de uso ni página de error especial.

**Datos de prueba (proyecto real)**
- Se borraron, con autorización: 5 recordatorios "Test…", 7 notificaciones y 1 decisión ya resuelta.
- Se conservaron las cuentas `luis` (admin) y `luisb` (Luis Benavides, cuenta real), las 5 categorías y la bitácora de auditoría.

**Rendimiento**
- El paquete principal bajó de 635 KB a 83 KB.
  - React (314 KB) y Supabase (216 KB) van en archivos aparte que el navegador guarda en caché entre versiones.
  - Perfil, cambio de contraseña, Usuarios y Categorías se descargan al abrirlos (2 a 10 KB cada una).
- Ya no aparece la advertencia de tamaño del build.
- Migración `20261122120000_pulido.sql`: índices para las 4 llaves foráneas que el asesor de Supabase marcó sin índice.

**Calidad**
- El lint queda sin advertencias:
  - `Modal` ya no toca referencias durante el render.
  - En el calendario, "cargando" y "buscando" se calculan en vez de activarse dentro de efectos.
  - La advertencia de `NotificationsProvider` es un falso positivo (la función es asíncrona) y quedó documentada.
- Se corrigió una prueba de búsqueda intermitente.

**Instalable (PWA)**
- `manifest.webmanifest` con nombre, colores e íconos de 192 y 512, la versión adaptable de Android y el ícono para iPhone (180).
- Edge confirma que es instalable, sin errores (`Page.getInstallabilityErrors`).
- Sin service worker, a propósito: así nunca queda una versión vieja en caché. Las instrucciones para instalar están en el README.

**Seguridad (proyecto real)**
- Todas las tablas tienen RLS.
- `anon` no tiene permisos sobre ninguna tabla ni función.
- Todas las funciones SECURITY DEFINER tienen `search_path` fijo.
- El esquema `private` no está expuesto.
- Asesor de Supabase:
  - 6 avisos por funciones que valida cada una por dentro (intencional y documentado en el README).
  - 1 sugerencia de un plan de pago: la protección contra contraseñas filtradas.
- La tarea `avisos-previos` (pg_cron) corre en el proyecto real: 179 ejecuciones correctas y 0 fallidas al revisarla.
- Las cabeceras de seguridad (CSP, HSTS, X-Frame-Options, etc.) se revisaron sin cambios.

**Revisión visual final** (Edge, modo oscuro en escritorio; oscuro y claro en celular)
- Revisado: inicio de sesión, Semana, detalles, edición, campana, Usuarios, Categorías, Perfil, Mes y menú en celular.
- Ajuste: en celular, con "Mi calendario" visible (admin), los botones de vista no cabían. Ahora van en su propia fila.

**Pruebas (2026-11-17)**
- `npm run check`: lint sin advertencias, tipos, 166 pruebas unitarias y build sin advertencias.
- `npm run test:db`: 160 pruebas pgTAP, todas correctas.
- `npm run test:integration`: 28 pruebas, todas correctas.

### Ajuste del 2026-11-17: logo de GEM Consulting
- **Inicio de sesión:** el logo aparece difuminado detrás del cuadro de ingreso. El cuadro es semitransparente para que el logo se vea a través de él. En celular el logo va en el espacio libre de arriba.
- **Menú lateral:** el logo aparece al pie, encima del nombre del usuario. Ocupa el espacio libre sin cambiar el tamaño del menú y se encoge si la pantalla es baja.
- **Modo oscuro:** el logo tiene una versión con letras claras, porque el azul marino no se lee sobre fondo oscuro. El trazo de color queda igual.
- **Archivos:** `public/brand/gem-consulting.png` y `public/brand/gem-consulting-oscuro.png`. El tema elige cuál usar con la variable CSS `--brand-logo`.
- **Pruebas:** revisado en computadora y celular, modo claro y oscuro. `npm run check` correcto (166 pruebas).

## Fase 8: estilo visual "Corporativo GEM"

Se eligió entre tres propuestas comparadas en una maqueta (A Corporativo GEM, B Moderno y aireado, C Acento de marca). El usuario eligió la A con ajustes (A+).

- **Colores:** el azul marino del logo es el color principal (botones, enlaces, opción activa). El círculo del día de hoy va en naranja, tomado del trazo del logo. Hay versión para modo claro y oscuro.
- **Menú lateral:** fondo azul marino con letras claras y el logo en su versión clara. La opción activa lleva una marca naranja. Los colores se redefinen dentro del menú, así la campana y la cuenta se adaptan solas.
- **Línea del logo:** línea fina con el degradado del logo (amarillo, naranja, rojo, morado) en el borde superior de la app y de la pantalla de ingreso.
- **Esquinas y sombras:** esquinas más redondeadas (`--radius` 12px, `--radius-lg` 16px). El calendario, los cuadros y las tarjetas llevan una sombra suave alrededor en vez de borde (`--shadow-card`). Los botones secundarios y el buscador llevan un contorno con sombra (`--shadow-control`). El botón principal y el día de hoy llevan sombra de su color.
- **Tipografía:** Inter para el texto y Plus Jakarta Sans para los títulos. Se sirven desde la propia app con los paquetes `@fontsource-variable`, porque la CSP solo permite fuentes de 'self'.
- **Ingreso:** banda azul marino en la parte de abajo, cuadro más redondeado y con sombra.
- **Barra del navegador y app instalada:** color `#1d2942`.
- **Sin cambios de funciones:** solo estilos (CSS), fuentes y colores del manifiesto.

**Pruebas (2026-11-17)**
- Revisado con capturas: ingreso, Mes, Semana, Año, nuevo recordatorio, Usuarios y Perfil, en modo claro y oscuro, en computadora y celular (sin desbordes a 390px).
- `npm run check`: 166 pruebas, lint y build sin advertencias.

## Fase 9: estilo visual "Bento"

Se eligió entre seis propuestas comparadas en dos maquetas (Órbita, Plano, Mosaico, Sereno, Editorial y Bento). El usuario eligió Bento. Reemplaza al estilo Corporativo GEM.

- **Idea:** cada día del mes es un mosaico blanco redondeado, suelto, con espacio entre ellos. Los días de otros meses son solo un contorno.
- **Día de hoy:** el mosaico entero con el degradado cálido del logo (amarillo, naranja y rojo, variable `--hot`), con el número más grande y los recordatorios en blanco. En Día y Semana es el número con ese degradado; en Año, el día con ese degradado.
- **Botón principal y botón +:** con el mismo degradado. Se aplica a todos los botones principales de la app (crear, guardar, ingresar).
- **Menú lateral:** tarjeta azul marino que flota con un margen alrededor y esquinas de 22px. La opción activa es una pastilla blanca con letras azul marino (variables `--sidebar-pill` y `--sidebar-pill-text`). La cuenta va en un recuadro suave. En celular el panel también flota.
- **Recordatorios:** fichas redondeadas. La línea del color del creador pasa a ser una barrita redondeada dentro de la ficha (el punto sigue siendo la categoría).
- **Selector Día / Semana / Mes / Año:** la opción elegida es una pastilla oscura (clara en modo oscuro).
- **Colores:** fondo gris azulado `#e8ebf1`; en modo oscuro casi negro `#07090e` con mosaicos `#121722`. Se quitó la línea del degradado del borde superior de la app.
- **Tipografía:** Manrope para todo (paquete `@fontsource-variable/manrope`). Se quitaron Inter y Plus Jakarta Sans.
- **Dónde está:** los colores en `:root` y `:root[data-theme='dark']` de `src/styles/global.css`; la forma en el bloque "Estilo Bento" al final de `global.css`, `src/app/AppLayout.module.css` y `src/features/calendar/calendar.module.css`.
- **Ancho:** a pedido del usuario, el contenido ya no se limita a 1200px: llega hasta 1720px (`.main` en `AppLayout.module.css`). En pantallas anchas el calendario ocupa el espacio de los costados y la barra de herramientas cabe en una fila (revisado también a 1650px).
- **Alto:** en computadora (más de 700px), Mes, Semana y Día llenan la pantalla hasta abajo: la página mide el alto de la ventana y el calendario toma todo el espacio libre (con `:has(.month, .timeGrid)` al final de `calendar.module.css`). Las filas del mes se estiran y en Semana/Día se ven más horas sin desplazarse. La vista Año, la búsqueda y el celular no cambian. El final de la página (el calendario o, si no hay recordatorios, el aviso de abajo) queda al mismo nivel que el pie del menú lateral, a 12px del borde.
- **Sin cambios de funciones:** solo estilos (CSS) y fuentes.

**Pruebas (2026-11-17)**
- Revisado con capturas: ingreso, Mes, Semana, Año, nuevo recordatorio, Usuarios y Perfil, en modo claro y oscuro, en computadora y celular (sin desbordes a 390px).
- `npm run check`: 166 pruebas, lint y build sin advertencias.

## Fase 11: calendario general (19/11/2026, aprobada)

Pedido del usuario: unos pocos usuarios "especiales" comparten un calendario general. Cada uno ve, junto con lo suyo, todo lo del general, y al guardar elige si publica en su calendario o en el general.

**Decisiones del usuario**
- El acceso se da con una casilla en **Usuarios > Editar**: "Acceso al calendario general". Sirve para usuarios y admins.
- Solo **quien creó** un recordatorio del general lo modifica o elimina; los demás lo ven.
- Cuando alguien publica, modifica, quita o elimina algo del general, **los demás con acceso reciben una notificación**.
- Los **usuarios sin acceso no ven** el calendario general (solo los recordatorios donde los etiquetaron).
- Quien tiene acceso ve **siempre todo junto**: no hay selector ni filtro para ocultar el general.
- **Color fijo:** los recordatorios del general usan un degradado arcoíris en vez del color de quien los creó. Llevan además la marca "General" (en Semana, Día, búsqueda y detalle) y el detalle muestra "Creado por".

**Base de datos** (`supabase/migrations/20261123120000_calendario_general.sql`)
- `profiles.general_access` y `reminders.is_general` (por defecto `false`).
- RLS: el general lo leen quienes tienen acceso (`private.has_general_access()`); también ven sus etiquetados.
- Un trigger impide publicar en el general sin acceso, incluso con un insert directo. Quien perdió el acceso sigue modificando lo que ya publicó, pero no publica nada nuevo.
- `save_reminder` recibe `p_is_general` (null = al crear, personal; al modificar, no cambia de calendario). `admin_update_user` recibe `p_general_access` (null = sin cambio).
- `calendar_reminders` y `search_reminders` incluyen el general para quien tiene acceso.
- Notificación nueva `general` con `data.accion`: `publicado`, `modificado` (con qué cambió), `retirado` o `eliminado`. No llega a quien hizo el cambio ni a los etiquetados (ellos ya reciben las suyas).

**Casos especiales**
- Si se le quita el acceso a alguien, deja de ver el general; lo que publicó sigue visible para los demás.
- Si se desactiva a quien publicó, sus recordatorios del general siguen en el general. La ventana Conservar / Eliminar sigue aplicando solo a sus etiquetados, como antes. (Se ajustó lo propuesto: si todos los especiales tuvieran que decidir, cada uno haría una copia y el general quedaría con duplicados.)

**Ajustes pedidos tras la primera entrega (19/11/2026)** (`supabase/migrations/20261124120000_calendario_general_ajustes.sql`)
- **Sin etiquetados en el general:** al elegir "Calendario general" desaparece "Etiquetar personas". Si un recordatorio personal con etiquetados se pasa al general, se avisa que se les quitará. La base de datos no deja etiquetar en un recordatorio del general.
- **Sin categorías personales en el general:** nueva marca en **Categorías > Editar**: "Solo para calendarios personales" (`categories.personal_only`). "Personal" ya viene marcada. En el general esas categorías no se ofrecen y, si estaba elegida, se cambia a otra. La base de datos tampoco lo permite.
- **Conservar al eliminar del general:** si quien lo creó elimina un recordatorio del general que todavía no pasó, los demás con acceso reciben la ventana Conservar / Eliminar (motivo `general_eliminado`) y pueden quedarse con una copia en su calendario personal, igual que los etiquetados. La copia lleva sus avisos o el de por defecto. Si ya pasó, solo reciben la notificación "eliminado".
- **Acceso desde la creación:** la casilla "Acceso al calendario general" también está en **Usuarios > Nuevo usuario** (la Edge Function `admin-users` recibe `general_access`).
- `save_reminder` ahora quita primero a los etiquetados que salen y luego guarda el recordatorio, para poder pasarlo al general en un solo guardado.
- Pruebas: base de datos 205 (la 07 del calendario general tiene 45); `npm run check` 176; integración 28. Las pruebas 05 y 07 ahora parten sin datos previos, para no fallar por datos de demostración en la base local.

**Pruebas (19/11/2026)**
- Base de datos: `07_calendario_general.test.sql`, 35 pruebas (publicar sin acceso, quién ve, quién modifica, notificaciones, quitar el acceso). Todas las de base de datos pasan.
- `npm run check`: 174 pruebas, lint, tipos y build. Integración: 28 pruebas.
- Capturas con usuarios de demostración: Mes, Semana, detalle, formulario, notificaciones, búsqueda, Usuarios, en claro y oscuro y en celular (sin desbordes a 390px).

## Ajuste del 19/11/2026: sonido al entrar

- Pedido del usuario: si llegaron notificaciones mientras la persona no estaba, al entrar suena **una sola vez** (el timbre de aviso si entre ellas hay un aviso previo o una decisión Conservar / Eliminar; si no, el de notificación).
- Cada navegador anota lo último que ya anunció (`src/features/notifications/announced.ts`, en `localStorage` por usuario, una marca para notificaciones y otra para decisiones) para no repetir el sonido.
- Si la página aún no recibió un clic (sesión guardada), el timbre suena con el primer clic o tecla; al iniciar sesión, el clic en "Ingresar" ya cuenta.
- Lo mismo se agregó a los inventarios de oficina y del equipo de carreras.
- Pruebas: `NotificationsProvider.test.tsx` actualizado (178 pruebas en `npm run check`).

## Fase 12: reuniones de Outlook (23/11/2026, aprobada)

Pedido del usuario: que las reuniones que se agendan en Outlook se vean en el Calendario GEM, **en un solo sentido** (de Outlook a la app; el doble sentido se descartó por complejo).

**Decisiones**
- Exchange Server 2019 propio, con EWS publicado en internet y autenticación básica. Se lee con una **cuenta de servicio** de solo lectura (`svccalendario`, permiso de Revisor sobre los calendarios), sin servidores adicionales: todo corre en Supabase.
- **Cada minuto** se pregunta qué cambió; si cambió algo, se vuelve a leer la ventana de un mes atrás a tres meses adelante. Una lectura completa al día.
- El admin pone el **correo de Outlook** de cada persona en Usuarios, también **al crear** el usuario. Por ahora solo se sincroniza Luis, para probar; el resto se suma cuando él lo verifique.
- Las reuniones **privadas se omiten**. Las de Outlook no generan avisos ni notificaciones, no van al calendario general y no se pueden modificar desde la app.
- La contraseña de la cuenta de servicio vive solo en los secretos de la función, nunca en el código, archivos ni chat.

**Base de datos** (`supabase/migrations/20261125120000_reuniones_outlook.sql`)
- `outlook_links` (correo y estado por usuario), `outlook_events` (reuniones) y, en `private`, el estado de EWS y un turno para que no se pisen dos ejecuciones.
- RLS: cada quien ve lo suyo y el admin, todo. La app solo lee; escribe la función (service_role) con `outlook_save_result`.
- `admin_set_outlook_email` (solo admin; correo único; al quitarlo o cambiarlo se borran sus reuniones), `calendar_outlook_events` y `search_outlook_events`.
- Tarea de pg_cron `outlook-sync` cada minuto, que llama a la función con `pg_net` usando la dirección y el token guardados en Vault.

**Edge Function `outlook-sync`**
- `ews.ts`: arma las solicitudes SOAP e interpreta las respuestas (sin depender de Deno; se prueba con Vitest). `index.ts`: la ejecución (token de pg_cron o sesión de admin), hasta 4 usuarios a la vez y hasta 4 lecturas completas por minuto.
- Errores por usuario: sin permiso, buzón no encontrado u otro error, visibles en Usuarios. Si Exchange rechaza la contraseña, se marca en todos sin borrar sus reuniones.

**App**
- Calendario: las reuniones se ven en todas las vistas, la búsqueda y los filtros (categoría "Reunión de Outlook"; no cuentan como "Creados por mí"). Fondo azul con borde punteado y marca "Outlook". Detalle de solo lectura con organizador, asistentes, respuesta y "Unirse a la reunión".
- Usuarios: campo "Correo de Outlook" al crear y editar, estado de la sincronización y botón "Sincronizar Outlook".
- La Edge Function `admin-users` recibe `outlook_email` al crear.

**Pruebas (23/11/2026)**
- Base de datos: `08_reuniones_outlook.test.sql`, 24 pruebas (quién asigna el correo, quién ve qué, cómo guarda la sincronización, sin permiso). Todas: 229.
- `npm run check`: 195 pruebas (10 nuevas de EWS con respuestas reales de ejemplo, 4 del calendario y 3 de Usuarios), lint, tipos y build.
- Capturas en local con reuniones de ejemplo: Semana, Mes, detalle, Usuarios, edición y celular (sin desbordes a 390px), en claro y oscuro.
- Pendiente: la prueba real con el calendario de Luis (12.3), cuando estén los secretos de la cuenta de servicio.

**Prueba real (23/11/2026):** TI instaló el script en la VM de Exchange (GC-NEPTUNE). Primero Exchange respondió 401: el *loopback check* de Windows rechaza la autenticación del servidor contra sí mismo con el nombre `neptune.gemconsulting.inc`. Se agregó ese nombre a `BackConnectionHostNames` (documentado en la guía de TI) y la primera lectura completa trajo las reuniones de Luis (estado "ok", programa conectado cada minuto).

**Ajuste tras la aprobación (23/11/2026): sin recargar la página** (`supabase/migrations/20261127120000_outlook_tiempo_real.sql`)
- Pedido de Luis: los cambios de Outlook llegaban cada minuto, pero solo se veían al refrescar la página.
- `outlook_links` entra a Realtime y el calendario se recarga solo cuando llegan cambios de un calendario que se está viendo (también al reconectarse). `outlook_save_result` ya no actualiza la fila en las pasadas sin cambios, para no recargar cada minuto sin motivo; "Último cambio" reemplaza a "Última consulta" en Usuarios.
- Pruebas: base de datos 234 (la 08 tiene 29); `npm run check` 187.

**Cambio del 23/11/2026: la lectura corre dentro de la empresa** (`supabase/migrations/20261126120000_outlook_agente.sql`)
- En la prueba real, Supabase no logró conectarse con Exchange: el firewall de neptune no acepta conexiones desde Estados Unidos (desde Costa Rica sí responde). En vez de abrir el firewall, se acordó correr la lectura en la **VM de Exchange**.
- **Script de PowerShell** `agente/sincronizar-calendario.ps1` (compatible con Windows PowerShell 5.1, sin instalar nada): tarea programada cada minuto como `svccalendario`, se conecta a EWS con la sesión de Windows de la tarea (sin contraseñas guardadas) y envía las reuniones a la nueva Edge Function `outlook-agent` por HTTPS (solo salida), con su propio token.
- Se quitaron la función `outlook-sync`, la tarea de pg_cron, los secretos de Vault y **la contraseña de la cuenta de servicio de Supabase**.
- Usuarios muestra si el programa de la oficina está conectado (avisa si pasan más de 5 minutos sin conectarse). "Sincronizar Outlook" ahora pide releer todo en la próxima pasada (`admin_request_outlook_sync`).
- Pruebas: base de datos 232 (la 08 tiene 27); `npm run check` 186; script 28 (`npm run test:agente`, en PowerShell 5.1 y 7). Se probó la Edge Function con el token real y con uno falso (rechazado). Desde la computadora de Luis por el hotspot el script llegó a Exchange, pero Exchange no acepta la sesión de Windows desde fuera de la red: la prueba real se hace con el script instalado en la VM.

## Fase 13: avisos y notificaciones de las reuniones de Outlook (23/11/2026)

Pedido de Luis: que las reuniones de Outlook avisen y notifiquen como los recordatorios, copiando el aviso de Outlook; y que, si se cancela una reunión a la que lo invitaron, pueda conservarla como recordatorio.

**Decisiones**
- **Avisos previos copiados de Outlook:** el script trae el recordatorio de cada reunión (minutos antes). Si la persona los cambia en "Mis avisos", se respetan los suyos y Outlook ya no los pisa. Solo en las reuniones del propio calendario.
- **Notificaciones** "nueva" y "modificada" (fecha y hora, asunto o lugar) solo de reuniones que organizó otra persona; no en la primera lectura de alguien ni en las que ya pasaron.
- **Cancelada o borrada** (de otra persona, todavía no pasa): ventana Conservar / Eliminar. Conservar crea un recordatorio propio (categoría Reunión, organizador en la descripción, enlace en la nota, sus avisos).
- Cada reunión se identifica por su **UID de Exchange + fecha original** de la repetición, para que mover una serie no aparezca como "cancelada + nueva". Durante el cambio del script viejo al nuevo, las reuniones se reconocen también por `item_id`, sin avisos falsos.

**Base de datos** (`supabase/migrations/20261128120000_outlook_avisos.sql`)
- `outlook_events.event_key` y `reminder_minutes`; `outlook_alerts` y `outlook_alert_overrides` (RLS: cada quien ve lo suyo); `set_outlook_alerts`.
- `outlook_save_result` compara lo recibido con lo guardado y crea las notificaciones (`kind = 'outlook'`) y las decisiones (`outlook_cancelada`, con `outlook_organizer`). Recibe `p_window_to` (fin de la ventana leída).
- `private.fire_due_outlook_alerts()` y la tarea de pg_cron `avisos-outlook` cada 30 s (notificación "aviso" con `outlook = true`).

**Script de la oficina 1.1:** pide `ReminderIsSet`, `ReminderMinutesBeforeStart`, `UID` y `RecurrenceId`, y envía `window_to`. TI solo reemplaza el archivo en `C:\CalendarioGEM`.

**App:** "Mis avisos" en el detalle de la reunión (con "Copiados del recordatorio de Outlook"); textos de las notificaciones de Outlook con su marca azul en la campana; ventana "Reunión cancelada en Outlook"; avisos con minutos que no son horas exactas ("Empieza en 1 h 30 min").

**Pruebas (23/11/2026)**
- Base de datos: `09_outlook_avisos.test.sql`, 26 pruebas (primera lectura sin avisos, nueva, modificada, mía, borrada, cancelada, fuera de la ventana, cambio de identificador, avisos copiados y cambiados, disparo, Conservar). Todas: 260.
- `npm run check`: 192 pruebas, lint, tipos y build. Script: 32 pruebas en PowerShell 5.1 y 7.
- Capturas en local: ventana de reunión cancelada (claro y oscuro), "Mis avisos" y la campana con notificaciones de Outlook.

## Lista de verificación de la entrega

- [x] Fases 0 a 8 aprobadas: proyecto entregado (2026-11-17).
- [x] App publicada en https://calendariogem.pages.dev, con despliegue automático al hacer push a `main`.
- [x] Base de datos real con las 9 migraciones aplicadas (local y remoto iguales).
- [x] Datos de prueba eliminados del proyecto real.
- [x] Seguridad revisada: RLS, permisos, funciones, cabeceras y CSP.
- [x] Pruebas automáticas: unitarias, pgTAP e integración.
- [x] Instalable en teléfono y computadora.
- [x] README (configuración, scripts, Supabase local y remoto, despliegue, notificaciones, PWA, seguridad) y este documento al día.
- [ ] Opcional: protección contra contraseñas filtradas (plan de pago de Supabase).
- [ ] Posteriores (fuera del alcance acordado): recurrencia, exportar a Excel, feriados, sincronización con Google (Outlook se hizo en la fase 12).
