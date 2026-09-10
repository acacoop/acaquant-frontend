---
paths:
  - "src/components/trading*.tsx"
  - "src/components/tradingview-chart.tsx"
  - "src/app/trading/**"
  - "src/lib/types-trading.ts"
---
# La vista TRADING (/trading → tab PIVOTS)

## La vista TRADING (`/trading` → tab PIVOTS)

Refactor 2026-09-01. La pantalla se parte **50 / 50** y ninguna de las dos mitades
tiene sub-columnas:

- **Izquierda**: arriba las **4** cards de pivots (2×2, con máx/mín/cierre
  editables); abajo el **RADAR**, que es UNA sola tabla con tres tabs embebidas en
  su barra de herramientas — **MOVERS ±4% · VOLUMENES ACCIONES · PIVOTES**.
- **Derecha**: **DOS charts LIVE**. Cada card tiene los botones **1** y **2** en su
  cabecera: vos decidís a qué chart mandarla. Click en el número prendido = lo
  saca. Cada chart además tiene ✕ para liberarlo.

**⚠️ NADA auto-asigna un chart, y es la corrección de un error real.** La primera
versión llenaba "por orden de elección" (primer chart libre → round-robin) con el
click en la card ENTERA. Resultado, en palabras de la mesa: *«cada click que hacés
hace algo y te rompe todo»* — tocabas una card para leerla y te reemplazaba el
chart que estabas mirando, porque con los dos ocupados el round-robin pisa a
alguien sí o sí. **Una pantalla de trading no puede cambiar sola lo que mostrás.**
Hoy los charts los tocan SOLO esos botones (y el ✕). El click en el radar carga
el papel en una card y nada más.

Tres cosas más que no son obvias:

1. **El poll de `/pivots` pide las cards Y los tickers de los dos charts.** Un
   chart puede estar dibujando un papel que ya no está en ninguna card; si el poll
   siguiera solo a las cards, ese chart perdería niveles y VWAP en silencio.
2. **Cambiar el activo de una card que estaba graficada reemplaza EN ESE chart** —
   único caso en que una card mueve un chart sola, y no es sorpresa: cambiaste esa
   card a propósito. Si no, el chart seguiría mostrando algo que la pantalla ya no
   tiene en ninguna card.
3. **La key de localStorage subió a `-v3`** al bajar de 6 cards a 4: con la `-v2`
   un usuario viejo se traía 6 y perdía dos sin enterarse.

El modo de los niveles arranca en **DIF %** (cuánto falta hasta el nivel), no en
PRECIO. Y se fueron en el mismo cambio: la tab **ESTRATEGIA** (borrada del backend
entero), el **LIBRO** (order book — vive en OPERAR), el chart **ZONAS ADR** y toda
la data de **ADR** (la vista ADR de la tabla, que desde el 2026-09-10 ya no
existe en `cedears-scanner-table.tsx` para nadie: la tabla es SOLO CEDEAR, y el
radar la usa en modo `compact`; y los KPIs `SPY ADR` / `QQQ ADR` del toolbar). Criterio: `/trading` es la pantalla del CEDEAR
en ARS; el mundo USD del subyacente se mira en `/renta-variable` y `/research`.

