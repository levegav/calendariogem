# Calendario GEM

Calendario empresarial multifuncional. Cada colaborador tiene su cuenta y su calendario. Puede crear recordatorios y eventos, etiquetar a otros colaboradores y recibir notificaciones de lo que le involucra.

- **Frontend:** React 19 + TypeScript + Vite (SPA), alojado en Cloudflare Pages.
- **Backend:** Supabase (Postgres con RLS, Auth, Realtime, Edge Functions).
- **Idioma / zona horaria:** español, `America/Costa_Rica`, la semana empieza el lunes.

**App publicada:** https://calendariogem.pages.dev · **Código:** https://github.com/levegav/calendariogem (privado)

El avance por fases está en [PROJECT_STATUS.md](PROJECT_STATUS.md).

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
