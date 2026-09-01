# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

> **📌 REMOTES POR PROYECTO (actualizado 2026-07-27).** DOS remotes por repo, ambos
> de la MISMA cuenta corporativa **NMolloAV** (por eso nunca piden login aparte):
> - **`origin` → NMolloAV (PRINCIPAL, default)**
>   - Frontend (este repo): `github.com/NMolloAV/acaquant-frontend.git`
>   - Backend: `github.com/NMolloAV/acaquant-backend.git`
> - **`org` → organización ACA (acacoop) — misma cuenta NMolloAV**
>   - Frontend: `github.com/acacoop/acaquant-frontend.git`
>   - Backend: `github.com/acacoop/acaquant-backend.git`
>
> El remote `personal` (cuenta NicolasEzequielMollo) fue ELIMINADO: usaba OTRA
> cuenta y pedía login en cada push. Tampoco existe ya un remote `corp` (ese URL
> ES `origin`). Cada remote tiene UN solo fetch/push URL a su propio repo.
>
> **AUTH automática (Git Credential Manager, Windows local).** Los dos remotes usan
> la cuenta **NMolloAV**, pinneada en `~/.gitconfig` global:
> `credential.https://github.com/NMolloAV.username = NMolloAV`,
> `credential.https://github.com/acacoop.username = NMolloAV`
> (+ `credential.usehttppath = true`). NO hay que hacer `gh auth switch` ni loguearse.
>
> **REGLA — sincronizar los 2 remotes:** alias global **`git pushall`** (= `git push
> origin HEAD && git push org HEAD`). Un `git push` normal va solo a `origin`.
>
> Vercel deploya de `origin` (`NMolloAV/acaquant-frontend`) desde 2026-07-27 —
> un `git push origin` (o `git pushall`) dispara el deploy de producción.

> **⚠️ AUTOR DE LOS COMMITS — Vercel BLOQUEA por identidad.** Si el commit lo firma
> alguien que NO es miembro del proyecto, el deploy queda **Blocked** y producción
> sigue sirviendo la versión anterior **sin ningún error visible**: el código está en
> `main`, el build compila, y la app no cambia. **No pisar `user.name`/`user.email`
> al commitear** — el default del checkout es el que Vercel acepta. Si algo no
> aparece en la app, mirar Deployments en Vercel ANTES de buscar el bug en el código.
> El footer de la barra muestra los 7 chars de `VERCEL_GIT_COMMIT_SHA` (`dev` en
> local) justamente para contestar «¿estoy viendo este build?» sin adivinar.

## Qué es esto

`acaquant-web` — el frontend de **TradingAV**, plataforma quant MERVAL/ROFEX. Next.js
16 (App Router) + React 19 + Tailwind v4, deployado en Vercel.

**No tiene base de datos ni lógica de negocio propia.** Es una terminal que renderiza
lo que sirve el backend FastAPI (`api.acaquant.com`, repo hermano
`acaquant-backend`). Las **72** route handlers de `src/app/api/**` son **proxies**
hacia ese backend — inyectan auth y reenvían. Todo cálculo de negocio vive del otro
lado; si algo hay que derivar, se deriva allá.

Dos portales sobre el MISMO deploy, separados por Cloudflare Access:
- **trading.acaquant.com** — la mesa. Ve todo según su rol.
- **www.acaquant.com** — portal **INVITADO** (otro sector de la empresa): SOLO
  mercado + research, read-only. Ver "Portal invitado" abajo.

## Comandos

```bash
npm install            # node_modules NO está en el repo — instalar antes de nada
npm run dev            # dev server en :3000
npm run build          # build de producción (es la única verificación de tipos real)
npm start              # servir el build
npm run lint           # eslint (flat config, eslint 9)
npx tsc --noEmit       # typecheck aislado, sin build
```

**No hay suite de tests ni CI propio** (`.github/` solo tiene `dependabot.yml`). La
verificación antes de pushear es `npm run lint && npm run build` — el build es lo que
falla si rompiste un tipo, y Vercel lo va a correr igual.

## Convenciones que rompen cosas si se olvidan

- **`export const dynamic = "force-dynamic"` en TODA page.** Las 19 páginas lo
  tienen (recontado 2026-08-31; eran 20 hasta la baja de `/retorno`). El `layout.tsx` también, y ahí es **crítico para RBAC**: el nav se
  renderiza por usuario (`getMe()`), sin `force-dynamic` Vercel puede servirle a un
  trader el HTML cacheado de un admin con el link de MANAGER a la vista.
- **Route handlers que proxean data live**: `export const revalidate = 0` +
  `cache: "no-store"` en el `fetch`. Sin eso Next sirve una respuesta vieja de un
  endpoint que cambia cada 5s.
- **`maxDuration`** en los proxies de endpoints lentos (Manager 90s, órdenes/riesgo
  30s). El default de Vercel corta antes de que el backend conteste.
- **El proxy nunca devuelve el error como excepción**: reenvía el status y el cuerpo
  del backend tal cual, y mapea un fallo de red a 502 JSON. Un handler que tira
  rompe la vista con un error sin mensaje.
- **Alias de imports**: `@/*` → `./src/*`.
- **Commits en español**, estilo `feat/fix/refactor/docs(scope): mensaje` — mirar
  `git log`, el mensaje describe el efecto en la pantalla, no el diff.

## Arquitectura

### El camino de un request

```
browser → (Cloudflare Access) → Vercel
            ├─ src/proxy.ts            ← pre-gate por módulo + SANITIZA identidad
            ├─ page.tsx (SSR)          → lib/api.ts   (apiFetch/safeFetch) ─┐
            └─ componente cliente      → src/app/api/**/route.ts (proxy)  ──┤
                                                                            ↓
                                                          api.acaquant.com (FastAPI)
```

### Identidad y RBAC — dónde vive cada mitad

Esta es la parte que más fácil se rompe, porque el gate está en cuatro lugares y
**tres de ellos son UX; el único real es el backend**.

1. **`src/lib/cf-access.ts` — la identidad de confianza.** El header de texto plano
   `cf-access-authenticated-user-email` es **falsificable** si alguien llega al
   origin salteando Cloudflare (la URL `*.vercel.app`). El email bueno sale de
   validar el **sello firmado** (`Cf-Access-Jwt-Assertion`) con `jose`. Se activa
   solo si están `CF_ACCESS_TEAM_DOMAIN` + `CF_ACCESS_AUD` → el código deployado
   queda **inerte** hasta setear las env vars, y borrarlas revierte al instante sin
   tocar código.
2. **`src/proxy.ts`** (Next 16 renombró `middleware` a `proxy`). Hace dos cosas
   distintas y las dos importan:
   - **Sanitiza**: borra cualquier email que venga en el request entrante y setea
     SOLO el verificado. Todo route handler aguas abajo lee la identidad de ahí.
   - **Pre-gatea** por módulo (`PATH_MODULES`) para que el HTML de una página
     restringida no se vea ni por un instante. Cachea `/api/me` 30s por email;
     **fail-closed** en prod (redirect a `/`), fail-open solo en dev sin `API_URL`.
3. **`src/components/header.tsx`** — el nav filtra por `me.modules`. `modules === null`
   (backend caído / dev) muestra todo.
4. **El backend** — `require_module()` / `require_*` devuelven 403. **Este es el
   único enforcement.** Esconder una solapa no es un permiso.

> **Contrato con el backend que hay que replicar a mano:** `PATH_MODULES` de
> `proxy.ts` espeja `ENDPOINT_MODULE_PREFIXES` de `api/auth.py`, y el campo `module`
> de `NAV` en `header.tsx` espeja `core/roles.py::MODULES`. Un módulo nuevo se toca
> en los dos repos o el nav y el gate dejan de estar de acuerdo — y no falla nada,
> simplemente muestran cosas distintas.
>
> Hay capacidades que **NO son módulos** y se publican dentro de `me.modules` solo
> para que el nav las filtre igual (`mesa-dinero`, `aca`, `manager-aca`): el acceso
> real es una allowlist per-usuario server-side. **No agregarlas a `core.roles.MODULES`**
> — sería un checkbox en ROLES Y PERMISOS que no controla nada.

### Portal invitado (www.acaquant.com) — default-deny

El invitado se identifica por el **`aud` del sello firmado** (`CF_ACCESS_AUD_GUEST`),
no por un header: no es spoofeable. Cuando aplica, el frontend manda
`x-acaquant-portal: guest` y el backend fuerza el rol `invitado`.

**Regla bloqueante:** el invitado ve **mercado + research** y nada más. Cualquier cosa
del negocio de la mesa (portfolios, operaciones, manager, back-office, clientes, AuM,
P&L, ACA) **jamás** puede quedarle accesible. Ante la duda, no exponer. `useIsGuest()`
sirve para esconder pedazos de UI — es UX, el gate real es del backend.

### Capa de red del cliente — cuatro helpers con contratos distintos

| Helper | Dónde | Contrato |
|---|---|---|
| `lib/api.ts::apiFetch` / `safeFetch` | **SSR** (pages, route handlers) | Habla directo con FastAPI: mete Bearer + CF service token + identidad. `safeFetch` devuelve fallback si el backend está caído. Timeout 15s. |
| `lib/fetch-json.ts::fetchJson` | cliente, carga de vista | **TIRA** con status + detalle del backend. La vista atrapa y muestra el error. |
| `lib/fetch-json.ts::getJSON` | cliente, polls/refetch | Devuelve `null` ante cualquier fallo. **Nunca** para decidir "no hay datos": un 403/502 se ve idéntico a vacío — así se perdió una semana la tab ESTRATEGIA. |
| `lib/fetch-shared.ts::fetchShared` | listas de filtros | Dedupea en vuelo + cachea 5min. Un fallo no se cachea. |

**`lib/use-poll.ts::usePoll`** es el hook de data viva y trae tres cosas que no son
obvias: comparte el request en vuelo por URL (dos componentes polleando el mismo
endpoint mandan **un** request), **no re-parsea ni re-renderiza si el payload crudo es
idéntico** al anterior, y expone `error` aparte de `data` (un poll fallido conserva lo
que había en vez de dibujar vacío). Resetea al cambiar de `endpoint`, no de `initial`.

### Patrones de UI compartidos

- **Shells con tabs keep-alive** (`*-shell.tsx`, `trading-shell.tsx` es el modelo):
  cada tab se monta la primera vez y después se esconde con CSS. Cambiar de tab no
  re-fetchea ni pierde estado. La tab activa va en `usePersistedState`.
- **`lib/use-persisted-state.ts`** — `useState` respaldado en `sessionStorage`, para
  que los filtros sobrevivan a la navegación (App Router desmonta la vista). Solo
  elecciones del usuario, **nunca** data fetcheada. Key única por vista+campo.
- **`components/ui/informe.tsx`** — pill / panel / dato de cabecera + `fmt0/fmt2/fmtPct`.
  Es la identidad visual de "esto es un informe": dos copias empiezan a verse
  distinto sin que nadie lo decida.
- **`components/ui/slot-barra-inferior.tsx`** — portal para que una vista baje sus
  acciones secundarias al `<footer>` del root layout, definiéndolas dentro de la
  vista (cierran sobre su estado) y dibujándolas abajo.
- **`lib/fmt.ts`** — fechas es-AR parseadas **por regex, no con `new Date(iso)`**:
  `new Date("YYYY-MM-DD")` es medianoche UTC y en ART (UTC−3) mostraba el día
  anterior.
- **`lib/use-viewport-key.ts`** — `key` para remountear `ResponsiveContainer`;
  recharts a veces mide 0 y no se recupera solo.
- Export a Excel: `lib/xlsx-export.ts` (SheetJS con lazy import, tipos nativos para
  que Excel pueda sumar).

### La vista TRADING (`/trading` → tab PIVOTS)

Refactor 2026-09-01. La pantalla se parte **50 / 50** y ninguna de las dos mitades
tiene sub-columnas:

- **Izquierda**: arriba las **4** cards de pivots (2×2, con máx/mín/cierre
  editables); abajo el **RADAR**, que es UNA sola tabla con tres tabs embebidas en
  su barra de herramientas — **MOVERS ±4% · VOLUMENES ACCIONES · PIVOTES**.
- **Derecha**: **DOS charts LIVE**. Se llenan **por orden de elección**: el activo
  que elegís va al primer chart libre y, con los dos ocupados, pisa por turno
  (round-robin). Cada chart tiene ✕ para liberarlo.

Tres cosas que no son obvias y ya costaron un bug cada una en el diseño:

1. **El poll de `/pivots` pide las cards Y los tickers de los dos charts.** Un
   chart puede estar dibujando un papel que ya no está en ninguna card; si el poll
   siguiera solo a las cards, ese chart perdería niveles y VWAP en silencio.
2. **Cambiar el activo de una card que estaba graficada reemplaza EN ESE chart.**
   Si no, el chart seguiría mostrando algo que la pantalla ya no tiene en ninguna
   card.
3. **La key de localStorage subió a `-v3`** al bajar de 6 cards a 4: con la `-v2`
   un usuario viejo se traía 6 y perdía dos sin enterarse.

El modo de los niveles arranca en **DIF %** (cuánto falta hasta el nivel), no en
PRECIO. Y se fueron en el mismo cambio: la tab **ESTRATEGIA** (borrada del backend
entero), el **LIBRO** (order book — vive en OPERAR), el chart **ZONAS ADR** y toda
la data de **ADR** (la vista ADR de la tabla se apaga con el prop `soloCedear` de
`cedears-scanner-table.tsx`, que el Scanner de Renta Variable NO usa, y los KPIs
`SPY ADR` / `QQQ ADR` del toolbar). Criterio: `/trading` es la pantalla del CEDEAR
en ARS; el mundo USD del subyacente se mira en `/renta-variable` y `/research`.

### Temas

Todo el color pasa por tokens `--t-*` en `src/app/globals.css`. Oscuro es el default
(`:root`), claro se activa con `class="light"` en `<html>` y cambia el acento de
naranja terminal a azul de empresa. **No hardcodear hex en componentes** —
`bg-[var(--t-panel)]`, `text-[var(--t-text-dim)]`, etc.

### El modal del AV AGENT — la red se toca desde UN lugar

Doc del backend: **`docs/AGENT_2.0.md`**. El agente se rehízo entero el
2026-08-24 y el modal pasó de **siete tabs a TRES**:

| Tab | Qué muestra | Botones |
|---|---|---|
| **AHORA** | los hallazgos de **HOY** sin leer y sin resolver | uno: «leído» |
| **ENCONTRÓ** | lo abierto que **tiene arreglo** | ver qué haría · aplicar · no me interesa |
| **HISTORIAL** | el libro: qué escribió el agente, de qué valor a qué valor | ninguno |

Y a la **derecha, siempre visible**, el panel de HABILIDADES: las **18** (el
número manda desde `agente/catalogo.py` del backend, no de acá), cada una
con **la última hora que se ejecutó**, su estado (miró · no pudo mirar · reventó
· todavía no le tocó) y cuántos hallazgos tiene abiertos.

⚠️ **«Cuándo miró» es el único dato del agente que NO se puede derivar.** Una
corrida que no encontró nada no deja rastro en los hallazgos, así que sin esa
columna «miré y estaba todo bien» y «no corrí» se ven idénticos. Por eso el
panel va al lado de las listas y no escondido en una tab: mirar «ENCONTRÓ 0» sin
ver que cuatro habilidades no pudieron mirar es leer un verde que no significa
nada.

Se fueron VIGILANCIA (era un segundo depósito de los mismos problemas, con otro
reloj y otra tabla — la propia pantalla se lo explicaba al usuario), ¿AGUANTAN?
(su número sumaba dos cosas que no se tocan) y todo el sistema de votos.

**`src/components/agente/datos.tsx` es la ÚNICA pieza que puede importar
`@/lib/fetch-json`, y el lint lo hace estructural** (`no-restricted-imports` en
`eslint.config.mjs`). Los componentes guardan estado de **pantalla** (qué tab,
qué filtro); el estado del **servidor** tiene un dueño y un ciclo: `leer` →
`escribir` → **releer**. Tres verbos, y el verbo dice qué es la llamada:

- `leer(url)` — GET, no cambia nada.
- `calcular(url, body)` — POST que **CALCULA** (el preview de un arreglo). No
  muta lo que la pantalla dibuja, no relee.
- `escribir(url, body, relee)` — POST que **MUTA**. Declara qué recursos
  invalida y los relee al volver, **también si el backend contestó `ok: false`**.

**El front no deriva, y ningún contador se suma acá.** Todos vienen del backend,
de la misma query que dibuja su lista. El «AHORA 92» del agente viejo lo sumaba
el navegador juntando cuatro cosas de dos endpoints con frescuras distintas
(uno se refrescaba cada 20 s, el otro se cargaba una sola vez al abrir),
contadas sobre listas ya cortadas en 200 filas y leídas de otra tabla — nada de
eso se podía verificar del lado del servidor.

Un fetch suelto adentro de una tab es cómo nacieron «apliqué y los botones
volvieron» y «el informe desapareció al cambiar de tab».

**Dos reglas del BOTÓN de la barra, y las dos vienen de bugs reales:**

1. **Se dibuja SIEMPRE.** No hay condición que lo esconda. El modal viejo hacía
   `return null` cuando `/vista` fallaba, así que el agente **desaparecía de la
   barra justo cuando algo andaba mal** — y no volvía, porque nadie podía
   apretarlo para reintentar. Un monitor que se esconde cuando se rompe es
   indistinguible de uno que no existe.
2. **Los datos cargan aunque el modal esté cerrado** (poll lento de 2 min;
   20 s abierto). Si sólo cargaran al abrir, para enterarte de que hay algo
   tendrías que entrar a mirar — lo contrario de para qué existe un agente.

Y el círculo tiene **tres** estados, no dos: verde (mirando) · gris (detenido) ·
**rojo (no pude leerlo)**. «No sé cómo está» y «está tranquilo» no se pueden
dibujar igual: es la misma regla que rige adentro —una corrida que no pudo mirar
no cierra nada— aplicada a la barra.

## Variables de entorno (Vercel)

| Var | Para qué |
|---|---|
| `API_URL` | Backend FastAPI. Default `https://api.acaquant.com`. **Su ausencia es lo que marca "dev"** — sin ella el proxy deja pasar todo. |
| `API_KEY` | Bearer hacia el backend. |
| `CF_ACCESS_CLIENT_ID` / `_SECRET` | Service token para atravesar Cloudflare Access. Ojo: con service token CF **estripa** `cf-access-authenticated-user-email`, por eso se manda `x-acaquant-user-email` en paralelo (el backend lo lee con prioridad). |
| `CF_ACCESS_TEAM_DOMAIN` / `CF_ACCESS_AUD` | Activan la validación del sello firmado. Sin las dos, la validación queda inerte. |
| `CF_ACCESS_AUD_GUEST` | AUD de la app de Access de www → identifica al invitado. |

## Cambios que tocan los dos repos

El backend (`../acaquant-backend`) es un checkout paralelo, **no un submodule**. Su
`CLAUDE.md` manda para todo lo de allá — en particular `docs/MAPA_APP.md`, que es el
índice de toda la superficie (vistas, tabs, endpoints, permisos) y ahorra re-relevar
la app. Si agregás o cambiás una vista, una tab o un filtro acá, actualizá su sección
en ese doc en el mismo trabajo: el inventario de endpoints lo regenera un script, una
tab nueva no la detecta nadie.
