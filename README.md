# Calendario GEM

Calendario empresarial multifuncional. Cada colaborador tiene su cuenta y su calendario. Puede crear recordatorios y eventos, etiquetar a otros colaboradores y recibir notificaciones de lo que le involucra.

- **Frontend:** React 19 + TypeScript + Vite (SPA), alojado en Cloudflare Pages.
- **Backend:** Supabase (Postgres con RLS, Auth, Realtime, Edge Functions).
- **Idioma / zona horaria:** español, `America/Costa_Rica`, la semana empieza el lunes.

**App publicada:** https://calendariogem.pages.dev · **Código:** https://github.com/levegav/calendariogem (privado)

El avance por fases está en [PROJECT_STATUS.md](PROJECT_STATUS.md).

El logo de GEM Consulting está en `public/brand/`. Hay una versión normal y otra con letras claras para el modo oscuro, y se usa en la pantalla de ingreso y al pie del menú. Para cambiarlo, reemplaza esos dos PNG con los mismos nombres.

**Estilo visual ("Bento", fase 9):** los colores, las esquinas, las sombras y el degradado del logo se definen como variables al inicio de `src/styles/global.css` (modo claro en `:root`, modo oscuro en `:root[data-theme='dark']`). Los colores del menú lateral son las variables `--sidebar-*`. El degradado del día de hoy y del botón principal es `--hot`. La forma de los mosaicos, el menú flotante y las fichas está en los bloques "Estilo Bento" al final de `global.css`, `src/app/AppLayout.module.css` y `src/features/calendar/calendar.module.css`. La fuente (Manrope) viene del paquete `@fontsource-variable/manrope` y se importa en `src/main.tsx`.

## Requisitos

- Node.js 24 (ver `.node-version`).
- Docker Desktop, para la base de datos local y las pruebas de base de datos.

## Configuración local

```powershell
npm install
copy .env.example .env.local   # y complete los valores
npm run dev                    # http://localhost:5173
```

| Variable | Valor |
|---|---|
| `VITE_SUPABASE_URL` | `https://kpufmrodkwkvaljxhewj.supabase.co` |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Clave **pública** (`sb_publishable_...`) |

Todo lo que empieza con `VITE_` termina en el navegador. **Nunca** coloque la clave secreta (`sb_secret_...`) ni la `service_role` en estas variables. La app se niega a iniciar si detecta una.

## Scripts

| Comando | Qué hace |
|---|---|
| `npm run dev` | Servidor de desarrollo |
| `npm run check` | Lint + tipos + pruebas + build (**obligatorio antes de cada push**) |
| `npm run test` | Pruebas unitarias |
| `npm run test:db` | Pruebas de la base de datos local (pgTAP) |
| `npm run test:integration` | Pruebas contra el Supabase local |
| `npm run remoto -- <args>` | CLI de Supabase contra el proyecto real (ver abajo) |

## Supabase local

```powershell
npx supabase start     # API en http://127.0.0.1:56421, Studio en http://127.0.0.1:56423
npx supabase stop
```

Los puertos son `5642x`, distintos de los de `nacente` (`5532x`), para poder correr los dos proyectos a la vez.

## Notificaciones y avisos previos

- Las **notificaciones** (etiquetado, quitado, salida, modificación) las crean triggers de la base de datos en la tabla `notifications`. La app las recibe por **Supabase Realtime**: la tabla está en la publicación `supabase_realtime`, y RLS hace que cada usuario reciba solo las suyas.
- Los **avisos previos** de cada participante están en `reminder_alerts`. Los dispara en el servidor la tarea de **pg_cron** `avisos-previos`, cada 30 segundos, con la función `private.fire_due_alerts()`. Por eso llegan aunque la app esté cerrada: al entrar aparecen en la campana como "Perdido".
- **Conservar / Eliminar:** al eliminar un recordatorio con etiquetados, o al desactivar a su creador, se crea una fila por etiquetado en `reminder_decisions` (también publicada en Realtime). Cada persona la resuelve con `resolve_reminder_decision`.
- Si la conexión en tiempo real se corta, la app vuelve a consultar al reconectar, al volver a la pestaña y cada 2 minutos.
- **Sonido:** un timbre corto al llegar una notificación (se silencia desde la campana). Al entrar, si llegaron notificaciones mientras la persona no estaba, suena una sola vez; cada navegador anota lo último que ya anunció para no repetir.
- Para revisar la tarea en el proyecto real: Supabase > Integrations > Cron (o la tabla `cron.job_run_details`).

## Reuniones de Outlook (Fase 12)

Las reuniones del calendario de Outlook de cada persona se ven en el Calendario GEM, **en un solo sentido** (de Outlook hacia la app) y **de solo lectura**.

**Cómo funciona**
- El admin pone el **correo de Outlook** de cada usuario en **Usuarios** (al crearlo o al editarlo). Sin correo, ese usuario no se sincroniza.
- La lectura la hace un **script de PowerShell dentro de la empresa** (`agente/sincronizar-calendario.ps1`), en la VM de Exchange, como tarea programada **cada minuto**. Corre con la cuenta de servicio `svccalendario` (permiso de **Revisor** sobre la carpeta Calendario de cada persona) y se conecta a EWS por la red interna con la sesión de Windows de la tarea: **no guarda contraseñas**.
- El script envía las reuniones a la Edge Function `outlook-agent` por HTTPS (solo conexiones de salida; el firewall de Exchange no se abre). Se autentica con el token `OUTLOOK_AGENT_TOKEN`, que solo permite pedir la lista de usuarios a sincronizar y guardar sus reuniones.
- En cada pasada pregunta a Exchange qué cambió (`SyncFolderItems`, liviano). Si cambió algo, vuelve a leer las reuniones de **un mes atrás a tres meses adelante** (`FindItem` con `CalendarView` y luego `GetItem`) y las reemplaza. Además hace una lectura completa al día.
- **Sin recargar la página:** `outlook_links` está en Realtime. Cuando el script guarda cambios de una persona, el calendario abierto que la muestra se recarga solo (en menos de un minuto desde el cambio en Outlook). La fila solo se toca cuando hay algo nuevo, no en cada pasada.
- Se guardan en `outlook_events` (cada repetición por separado). Cada persona ve las suyas y el admin, las de los calendarios que elige. Se **omiten las reuniones privadas**. No generan avisos previos ni notificaciones, y no aparecen en el calendario general.
- En el calendario se ven con fondo azul y borde punteado, con la marca "Outlook". El detalle muestra organizador, asistentes, respuesta y el botón **Unirse a la reunión** (Teams, Zoom o Meet, si la invitación trae el enlace).
- En **Usuarios** se ve si el programa de la oficina está conectado y el estado de cada persona: sincronizado, pendiente, **sin permiso en Exchange**, buzón no encontrado o error. **Sincronizar Outlook** pide releer todo en la próxima pasada.
- Para sumar a alguien: (1) TI le da a la cuenta de servicio permiso de Revisor sobre su calendario; (2) se pone su correo de Outlook en Usuarios.

**Por qué corre en la oficina:** la primera versión leía Exchange desde Supabase (Estados Unidos), pero el firewall de Exchange no acepta esas conexiones. Correrlo adentro evita abrir el firewall y deja la contraseña de la cuenta de servicio solo en el Programador de tareas de la VM.

**Instalación (TI, una sola vez):** guía "Programa de Outlook para el Calendario GEM" (artifact). En resumen: copiar `sincronizar-calendario.ps1` y `configuracion.json` a `C:\CalendarioGEM`, dar a `svccalendario` el derecho "Iniciar sesión como proceso por lotes" en esa VM, agregar `neptune.gemconsulting.inc` a `BackConnectionHostNames` (sin eso, el *loopback check* de Windows rechaza con 401 la autenticación del servidor contra sí mismo) y crear la tarea programada que corre cada minuto como `svccalendario`.
- `agente/configuracion.json` lleva el token y **no se sube a Git** (hay una plantilla: `configuracion.ejemplo.json`). Se entrega a TI en persona o por una carpeta interna, nunca por correo.
- Pruebas del script (sin Exchange ni Supabase, simulados): `npm run test:agente` (Windows PowerShell 5.1, como en el servidor).
- Registro: `C:\CalendarioGEM\registro.log` en la VM (se rota a los 2 MB).

**Si algo falla**
- Usuarios dice "El programa de la oficina no se conecta desde…": revisar la tarea programada en la VM (`Get-ScheduledTaskInfo 'Calendario GEM - Outlook'`) y el registro.
- "Sin permiso en Exchange": falta el permiso de Revisor de esa persona.
- "Exchange no aceptó la cuenta de la tarea": falta `neptune.gemconsulting.inc` en `BackConnectionHostNames` (loopback check), la tarea no está corriendo como `svccalendario`, o cambió su contraseña (actualizarla en la tarea programada).

## Instalar la app (teléfono o computadora)

La app es una PWA: se puede instalar y abre en su propia ventana, con su ícono.
- **Android (Chrome o Edge):** menú ⋮ > **Instalar aplicación** (o "Agregar a pantalla principal").
- **iPhone (Safari):** botón Compartir > **Agregar a inicio**.
- **Computadora (Chrome o Edge):** ícono de instalar en la barra de direcciones.

No usa service worker: cada vez que se abre carga la última versión publicada. Los avisos y notificaciones llegan mientras la app está abierta (aunque esté en segundo plano). Si estaba cerrada, aparecen en la campana como "Perdido".

Archivos: `public/manifest.webmanifest` y `public/icons/`. Los PNG se generaron a partir de `public/favicon.svg`.

## Seguridad

- **RLS en todas las tablas.** `anon` no tiene permisos sobre ninguna tabla ni función.
- **Funciones SECURITY DEFINER:** todas tienen `search_path` fijo. Las de `public` que puede llamar un usuario con sesión validan por dentro quién llama. Son `admin_*`, `complete_password_change`, `set_my_theme` y `resolve_reminder_decision`. El asesor de Supabase las marca como aviso, pero es intencional, y las pruebas pgTAP lo cubren.
- El esquema `private` no está expuesto en la API.
- **Pendiente opcional:** la protección contra contraseñas filtradas (HaveIBeenPwned) es de los planes de pago de Supabase.

## Supabase remoto (proyecto real)

El proyecto vive en **otra cuenta de Supabase**, distinta de la de oficina y nacente. Para no cambiar la sesión global de la CLI, los comandos remotos usan un token propio:

1. En Supabase (cuenta de calendariogem), vaya a **Account → Access Tokens → Generate new token**.
2. Cree el archivo `.env.supabase` en esta carpeta. Ya está en `.gitignore` y **nunca** se sube a Git:
   ```
   SUPABASE_ACCESS_TOKEN=sbp_...
   SUPABASE_DB_PASSWORD=la_contraseña_de_la_base_de_datos
   ```
3. Use estos comandos:
   ```powershell
   npm run remoto -- link --project-ref kpufmrodkwkvaljxhewj   # una sola vez
   npm run remoto -- db push --linked --dry-run
   npm run remoto -- db push --linked --yes
   ```

**Red de la oficina:** bloquea los puertos 5432/6543 de Postgres. Antes de `db push`, compruebe la conexión con `Test-NetConnection db.kpufmrodkwkvaljxhewj.supabase.co -Port 5432`. Si falla, use el hotspot del teléfono y desconecte el Ethernet.

## Usuarios

- Se inicia sesión con **usuario y contraseña**. Internamente cada usuario es `usuario@calendariogem.local`, un correo ficticio que nunca recibe mensajes.
- El administrador crea usuarios desde **Usuarios > Nuevo usuario**, con una contraseña temporal y un color identificador. El usuario debe cambiar la contraseña en su primer ingreso.
- **Color identificador:** el admin lo elige con el selector visual, el código HEX o los valores R/G/B. Hay colores sugeridos y no hay límite. No se puede repetir el color de otro usuario, y la app advierte si es muy parecido.
- Si alguien olvida su contraseña, el admin usa **Restablecer contraseña** y le entrega la nueva contraseña temporal.
- Desactivar un usuario bloquea su acceso de inmediato y conserva toda su información.
- El admin no puede cambiar su propio rol ni desactivarse, así que siempre queda al menos un administrador.
- **Calendario general:** al crear o editar un usuario, la casilla "Acceso al calendario general" deja a esa persona ver, junto con lo suyo, todo lo publicado en el general y publicar en él ("Publicar en: Mi calendario | Calendario general" al guardar). Solo quien creó un recordatorio lo modifica o elimina. Los demás con acceso reciben una notificación cuando se publica, modifica, quita o elimina algo. Los recordatorios del general llevan un color fijo arcoíris y la marca "General". Quien no tiene acceso no los ve. En el general no se etiqueta a personas ni se usan las categorías marcadas "Solo para calendarios personales" (como "Personal"). Si se elimina un recordatorio del general que todavía no pasó, los demás con acceso pueden conservar una copia en su calendario personal.

Edge Function `supabase/functions/admin-users`: crea usuarios, los activa o desactiva y restablece contraseñas. Es la única pieza que usa la clave secreta, que Supabase inyecta en el servidor, así que no hay que configurarla. Para desplegarla: `npm run remoto -- functions deploy admin-users --use-api`.

### Crear el primer administrador (una sola vez)

1. En el panel de Supabase, vaya a **Authentication > Users > Add user > Create new user**.
   - Email: `SU_USUARIO@calendariogem.local`, por ejemplo `luis@calendariogem.local`, en minúsculas y sin espacios ni tildes.
   - Password: una contraseña segura, de mínimo 8 caracteres con letras y números.
   - Marque **Auto Confirm User**.
2. En el panel de Supabase, abra **SQL Editor** y ejecute esto, reemplazando el usuario y el nombre:
   ```sql
   update public.profiles
      set role = 'admin', active = true, full_name = 'Nombre Completo', must_change_password = false
    where username = 'luis';
   ```
3. Inicie sesión en la app con el usuario (`luis`) y esa contraseña.

## Despliegue

### Cloudflare Pages (frontend)

Conectado al repositorio de GitHub: **cada `git push` a `main` publica la app automáticamente** (unos 2-3 minutos). Si un build falla, la versión anterior sigue en línea.

| Ajuste | Valor |
|---|---|
| Proyecto / dirección | `calendariogem` → https://calendariogem.pages.dev |
| Production branch | `main` |
| Build command | `npm run build` |
| Build output directory | `dist` |
| Variables | `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `NODE_VERSION=24` |

- Cabeceras de seguridad en `public/_headers`. La CSP solo permite conectar con el proyecto de Supabase de la app, por `https://` y `wss://`.
- Para volver a una versión anterior: Cloudflare > Workers & Pages > `calendariogem` > Deployments > **Rollback**.

### Supabase (ajustes del panel)

- **Authentication > Sign In / Providers > Email:** proveedor activado, **Allow new users to sign up** desactivado, **Confirm email** desactivado.
- **Authentication > URL Configuration:** Site URL `https://calendariogem.pages.dev`, Redirect URLs `https://calendariogem.pages.dev/**` y `http://localhost:5173/**`.
