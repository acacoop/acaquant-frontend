---
paths:
  - "src/components/agente/**"
  - "src/app/api/agente/**"
---
# El modal del AV AGENT — la red se toca desde UN lugar

## El modal del AV AGENT — la red se toca desde UN lugar

Doc del backend: **`docs/AGENT_2.0.md`**. El agente se rehízo entero el
2026-08-24 y el modal pasó de **siete tabs a TRES**:

| Tab | Qué muestra | Botones |
|---|---|---|
| **AHORA** | los hallazgos de **HOY** sin leer y sin resolver | uno: «leído» |
| **ENCONTRÓ** | lo abierto que **tiene arreglo** | ver qué haría · aplicar · no me interesa |
| **HISTORIAL** | el libro: qué escribió el agente, de qué valor a qué valor | ninguno |

Y a la **derecha, siempre visible**, el panel de HABILIDADES: las **25** (el
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

**El texto de un aviso viene en DOS campos, y el front no elige cuál es mejor.**
`que_hacer` es el determinista que escribe el detector; `ia_texto` es el que
redactó el modelo con la evidencia adelante (backend `agente/redactar.py`,
`AGENT.md` §0.dm). Se dibuja el del modelo con una marca `ia` y la hora, y el
determinista queda en el `title` para poder comparar los dos sin gastar
pixeles. Si `ia_texto` viene vacío —sin key, sin presupuesto, o el backend
rechazó lo que escribió porque inventaba un número— se dibuja el de siempre:
**la fila nunca queda muda**. Los dos vienen resueltos del backend; acá no hay
ninguna decisión.

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

