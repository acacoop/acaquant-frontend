---
paths:
  - "src/lib/**"
  - "src/components/**"
---
# Capa de red del cliente y patrones de UI compartidos

## Capa de red — cinco helpers con contratos distintos

| Helper | Dónde | Contrato |
|---|---|---|
| `lib/proxy-backend.ts::proxyBackend` / `proxyCatchAll` | **route handlers** (`src/app/api/**/route.ts`), los 77 | EL ÚNICO camino handler → backend. Bearer + CF service token + identidad de confianza (`trustedEmail`) + marca de invitado; **status y cuerpo del backend tal cual** (bytes crudos, un 403 llega como 403); fallo de red → 502 JSON, techo vencido → 504 JSON. **Techo 20 s en lecturas, ninguno en escrituras** (abortar un POST no deshace nada). `envolverEn` para los 4 endpoints donde el cliente espera `{clave: lista}`. Lo hace estructural el lint: un handler que lea `process.env`, llame `fetch` o importe `apiFetch` no pasa. |
| `lib/api.ts::apiFetch` / `safeFetch` | **SSR** (page.tsx / layout.tsx) | Devuelve el JSON parseado y **tira** ante un error (la page decide). Los headers salen de `backendHeaders` del helper de arriba: una sola implementación. `safeFetch` devuelve fallback si el backend está caído. Timeout 15s. |
| `lib/fetch-json.ts::fetchJson` | cliente, carga de vista | **TIRA** con status + detalle del backend. La vista atrapa y muestra el error. **Sin techo propio**: pasarle `{ signal: conTecho(ms) }` si es un GET que se repite. |
| `lib/fetch-json.ts::getJSON` | cliente, polls/refetch | Devuelve `null` ante cualquier fallo. **Nunca** para decidir "no hay datos": un 403/502 se ve idéntico a vacío — así se perdió una semana la tab ESTRATEGIA. |
| `lib/fetch-shared.ts::fetchShared` | listas de filtros | Dedupea en vuelo + cachea 5min. Un fallo no se cachea. |

**`lib/use-poll.ts::usePoll`** es el hook de data viva y trae cuatro cosas que no son
obvias: comparte el request en vuelo por URL (dos componentes polleando el mismo
endpoint mandan **un** request), **le pone un techo de 20 s a cada pedido**, **no
re-parsea ni re-renderiza si el payload crudo es idéntico** al anterior, y expone
`error` aparte de `data` (un poll fallido conserva lo que había en vez de dibujar
vacío). Resetea al cambiar de `endpoint`, no de `initial`.

> ⚠️⚠️ **EL TECHO NO ES OPCIONAL, y su ausencia fue el bug de «se tilda y con F5
> anda»** (2026-09-04, backend `docs/AGENT.md` §0.dm). El navegador **no le pone
> timeout a `fetch`**: un pedido puede quedar pendiente minutos o no volver nunca.
> Con el request compartido por URL eso era mucho peor que perder un poll — la
> promesa colgada quedaba en el mapa de «en vuelo» y **cada tick siguiente se
> colgaba de ella**, así que ese endpoint no se volvía a pedir en toda la vida de
> la pestaña. Y era invisible: una promesa que no resuelve tampoco rechaza, así
> que no marcaba ciego y la barra ni siquiera decía SIN ACTUALIZAR. Misma regla
> para cualquier poll nuevo: **`conTecho(ms)` de `lib/fetch-json.ts` en las
> LECTURAS**; en las escrituras no, que abortar un POST no deshace lo que el
> backend ya escribió.

## Patrones de UI compartidos

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

