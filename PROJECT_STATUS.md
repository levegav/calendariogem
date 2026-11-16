# Estado del proyecto: Calendario GEM

## Fases

| Fase | Contenido | Estado |
|---|---|---|
| 0 | Base: proyecto, Supabase, pruebas, primer despliegue | Terminada (pendiente de aprobación) |
| 1 | Usuarios: login, panel admin, colores RGB, perfil, menú, responsive | Pendiente |
| 2 | Categorías, CRUD de recordatorios, vistas día/semana/mes/año | Pendiente |
| 3 | Compartir: etiquetas, "Creado por", ver calendarios de otros, salirse | Pendiente |
| 4 | Notificaciones en tiempo real y avisos previos por participante | Pendiente |
| 5 | Ventana Conservar / Eliminar (borrado y usuario desactivado) | Pendiente |
| 6 | Búsqueda y filtros | Pendiente |
| 7 | Pulido y entrega final | Pendiente |
| Posteriores | Recurrencia, exportar a Excel, feriados, sincronización Google/Outlook | — |

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
- Todos pueden **ver** los calendarios de los demás con un selector "Ver calendario de…" de varias personas. Se ve todo, no hay eventos privados.
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
