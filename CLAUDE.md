# CLAUDE.md

Guía para Claude Code en este repo. **Solo lo que aplica a TODA sesión.** Lo de un dominio vive en
`.claude/rules/<dominio>.md` y se carga al tocar sus archivos. Techo (lo verifica el hook de push
`.claude/hooks/check_contexto.mjs`): 200 líneas, 16 KB, sin fechas. Si no entra, se mueve, no se achica.

@AGENTS.md

## Remotes, auth y autor de los commits

- `origin` → `github.com/NMolloAV/acaquant-frontend` (PRINCIPAL; **Vercel deploya de acá** al pushear
  a `main`) · `org` → `github.com/acacoop/…` (espejo). **`git pushall`** = push a los dos. Misma cuenta
  **NMolloAV** en ambos (Git Credential Manager): no hay que loguearse.
- **No pisar `user.name`/`user.email` al commitear.** Vercel bloquea el deploy si el autor no es miembro
  del proyecto, **sin error visible**: el código está en `main`, compila, y la app no cambia. Si algo
  no aparece, mirar Deployments en Vercel antes que el código. El footer de la barra muestra los 7
  chars de `VERCEL_GIT_COMMIT_SHA` (`dev` en local) para contestar «¿estoy viendo este build?».

## Qué es esto

`acaquant-web` — el frontend de **TradingAV**, plataforma quant MERVAL/ROFEX. Next.js 16 (App
Router) + React 19 + Tailwind v4, en Vercel. **No tiene base de datos ni lógica de negocio propia**:
es una terminal que renderiza lo que sirve el backend FastAPI (`api.acaquant.com`, repo hermano
`acaquant-backend`). Las route handlers de `src/app/api/**` son **proxies** hacia ese backend
(inyectan auth y reenvían). Si algo hay que derivar, se deriva allá.

Dos portales sobre el MISMO deploy, separados por Cloudflare Access:
- **trading.acaquant.com** — la mesa. Ve todo según su rol.
- **www.acaquant.com** — portal **INVITADO** (otro sector de la empresa): SOLO mercado + research,
  read-only. **Default-deny**: nada del negocio de la mesa (portfolios, operaciones, manager,
  back-office, clientes, AuM, P&L, ACA) puede quedarle accesible, jamás. Detalle en `rules/rbac.md`.

## Contexto que se carga solo (no hace falta leerlo de antemano)

| Al tocar… | Se carga |
|---|---|
| `src/proxy.ts`, `lib/cf-access.ts`, `lib/me.ts`, `header.tsx`, `src/app/api/**` | `rules/rbac.md` — identidad firmada, sanitización, pre-gate, portal invitado |
| `src/lib/**`, `src/components/**` | `rules/red-cliente.md` — los 4 helpers de red, `usePoll` y su techo, patrones de UI |
| `components/trading*.tsx`, `src/app/trading/**` | `rules/trading.md` — la vista TRADING: nada auto-asigna un chart |
| `components/agente/**`, `src/app/api/agente/**` | `rules/agente.md` — el modal del AV AGENT: la red se toca desde UN lugar |

## Comandos

```bash
npm install            # node_modules NO está en el repo — instalar antes de nada
npm run dev            # dev server en :3000
npm run build          # build de producción (es la única verificación de tipos real)
npm run lint           # eslint (flat config, eslint 9)
npx tsc --noEmit       # typecheck aislado, sin build
```

**No hay suite de tests ni CI propio** (`.github/` solo tiene `dependabot.yml`). La verificación
antes de pushear es `npm run lint && npm run build` — el build es lo que falla si rompiste un tipo, y
Vercel lo va a correr igual. Sub-agente `pre-push-check` lo corre en contexto limpio.

## Convenciones que rompen cosas si se olvidan

- **`export const dynamic = "force-dynamic"` en TODA page.** El `layout.tsx` también, y ahí es
  **crítico para RBAC**: el nav se renderiza por usuario (`getMe()`); sin `force-dynamic` Vercel
  puede servirle a un trader el HTML cacheado de un admin con el link de MANAGER a la vista.
- **Route handlers que proxean data live**: `export const revalidate = 0` + `cache: "no-store"` en
  el `fetch`. Sin eso Next sirve una respuesta vieja de un endpoint que cambia cada 5s.
- **`maxDuration`** en los proxies de endpoints lentos (Manager 90s, órdenes/riesgo 30s). El
  default de Vercel corta antes de que el backend conteste.
- **El proxy nunca devuelve el error como excepción**: reenvía status y cuerpo del backend tal cual,
  y mapea un fallo de red a 502 JSON. Un handler que tira rompe la vista con un error sin mensaje.
- **Polls con techo**: toda lectura repetida lleva `conTecho(ms)` de `lib/fetch-json.ts`. El
  navegador no le pone timeout a `fetch`, y una promesa colgada en `usePoll` (request compartido por
  URL) bloquea ese endpoint para toda la vida de la pestaña, sin marcar error. Escrituras no: abortar
  un POST no deshace lo que el backend ya escribió.
- **El front no deriva ni suma nada.** Todo contador viene del backend, de la misma query que dibuja
  su lista. Si un número no viene, es un faltante del contrato, no un cálculo para hacer acá.
- **Alias de imports**: `@/*` → `./src/*`.
- **Commits en español**, estilo `feat/fix/refactor/docs(scope): mensaje` — el mensaje describe el
  efecto en la pantalla, no el diff.

## Arquitectura — el camino de un request

```
browser → (Cloudflare Access) → Vercel
            ├─ src/proxy.ts            ← pre-gate por módulo + SANITIZA identidad
            ├─ page.tsx (SSR)          → lib/api.ts   (apiFetch/safeFetch) ─┐
            └─ componente cliente      → src/app/api/**/route.ts (proxy)  ──┤
                                                                            ↓
                                                          api.acaquant.com (FastAPI)
```

El gate está en cuatro lugares y **tres son UX; el único real es el backend** (`require_module()`
devuelve 403). Esconder una solapa no es un permiso. **Contrato que hay que replicar a mano en los
dos repos**: `PATH_MODULES` de `proxy.ts` espeja `ENDPOINT_MODULE_PREFIXES` de `api/auth.py`, y el
campo `module` de `NAV` en `header.tsx` espeja `core/roles.py::MODULES`. Un módulo nuevo se toca en
los dos o el nav y el gate dejan de estar de acuerdo — y no falla nada, muestran cosas distintas.

### Temas

Todo el color pasa por tokens `--t-*` en `src/app/globals.css`. Oscuro es el default (`:root`),
claro se activa con `class="light"` en `<html>` y cambia el acento de naranja terminal a azul de
empresa. **No hardcodear hex en componentes** — `bg-[var(--t-panel)]`, `text-[var(--t-text-dim)]`.

## Variables de entorno (Vercel)

| Var | Para qué |
|---|---|
| `API_URL` | Backend FastAPI. Default `https://api.acaquant.com`. **Su ausencia es lo que marca "dev"** — sin ella el proxy deja pasar todo. |
| `API_KEY` | Bearer hacia el backend. |
| `CF_ACCESS_CLIENT_ID` / `_SECRET` | Service token para atravesar Cloudflare Access. Con service token CF **estripa** `cf-access-authenticated-user-email`, por eso se manda `x-acaquant-user-email` en paralelo (el backend lo lee con prioridad). |
| `CF_ACCESS_TEAM_DOMAIN` / `CF_ACCESS_AUD` | Activan la validación del sello firmado. Sin las dos, queda inerte. |
| `CF_ACCESS_AUD_GUEST` | AUD de la app de Access de www → identifica al invitado. |

## Cambios que tocan los dos repos

El backend (`../acaquant-backend`) es un checkout paralelo, **no un submodule**. Su `CLAUDE.md` manda
para todo lo de allá — en particular `docs/MAPA_APP.md`, el índice de toda la superficie (vistas,
tabs, endpoints, permisos) que ahorra re-relevar la app. Si agregás o cambiás una vista, una tab o
un filtro acá, actualizá su sección en ese doc en el mismo trabajo: el inventario de endpoints lo
regenera un script, una tab nueva no la detecta nadie.
