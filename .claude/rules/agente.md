---
paths:
  - "src/components/agente/**"
  - "src/app/api/agente/**"
---
# El modal del AV AGENT — la red se toca desde UN lugar

## El modal del AV AGENT — la red se toca desde UN lugar

Doc del backend: **`docs/AGENT.md`** (parte A = cómo funciona; parte B = el
diario). El agente se rehízo entero el 2026-08-24 y el modal pasó de siete tabs
a **TRES pantallas de trabajo más tres de lectura**:

| Tab | Qué muestra | Botones |
|---|---|---|
| **AHORA** | los hallazgos de **HOY** sin leer y sin resolver | ✓ leído · **✕ silenciar** |
| **ENCONTRÓ** | lo abierto que **tiene arreglo** | ver qué haría · aplicar · no me interesa |
| **PATRONES** | **lo que pasa SIEMPRE**: el ranking de crónicos, activos e históricos aparte | ninguno |
| **HISTORIAL** | el libro: qué escribió el agente, de qué valor a qué valor | ninguno |
| **HABILIDADES** | qué sabe hacer y **cuándo miró cada cosa**, en tres lecturas: LISTA · MAPA·DOMINIO · MAPA·RITMO | correr una |
| **LAB** | el ASISTENTE, en TRES sub-tabs (cuál está abierta vive en `modal.tsx`, porque AHORA manda a la segunda): **CONVERSACIONES** (guardadas en el backend: lista, retomar, borrar; preguntar en castellano y ver el ciclo: qué agentes atendieron, qué herramienta pidió, qué le volvió) · **DIAGNÓSTICOS** (arriba el interruptor **AUTOMÁTICO**, que nace apagado: prendido, el daemon del AV AGENT encola solo con topes y se ve «hoy N de M»; apagado, sólo a pedido. Debajo, una fila por corrida de EL DIAGNÓSTICO, creada sola al encolarse, con estado, hallazgo, causa → acción y tokens; clic abre su ciclo; cancelar; «diagnosticar de nuevo». Se relee sola mientras hay uno en curso) · **MODELO Y GASTO** (gasto por tarea, hit rate del caché, con qué proveedor/modelo corre **cada tarea** —una fila = una cosa que corre, no un `proveedor × rol`—, tarifas, y la línea de runs: ok / fallidos / atascados / p95) | nueva · retomar · borrar · preguntar · prender/apagar el automático · abrir un diagnóstico · cancelar · elegir modelo por tarea |

⚠️ **HABILIDADES es una TAB PROPIA, no un panel al costado.** Lo dice el
comentario del `modal.tsx` y hay que respetarlo: lo que el agente sabe hacer y
cuándo miró cada cosa no es un accesorio de la lista de hoy. **Cuántas son lo
dice `agente/catalogo.py` del backend, no este archivo** — acá había un número
escrito a mano y quedó viejo sin que nada fallara (del lado del backend eso lo
congela `test_ningun_conteo_de_habilidades_quedo_viejo`).

⚠️ **El MAPA no es un grafo, y no puede serlo** (backend `AGENT.md` §0.ev). El
dibujo que hace Google ADK de un agente tiene flechas porque ahí hay FLUJO —
uno le pasa la posta al siguiente. Las habilidades **no se hablan entre sí**:
dibujarles flechas sería copiar la forma sin tener la estructura. Son dos
lecturas de la misma tabla, con la misma llamada y sin un solo campo nuevo:
agrupadas por dominio, o por ritmo. Contestan lo que la lista no —**qué NO se
está mirando**— y para eso está la grilla dominio × ventana, donde una celda
vacía es una combinación que hoy no cubre nadie. **El color significa UNA cosa:
salud**; el dominio va por posición o etiqueta y la clase va en la FORMA
(relleno = tiene arreglo, contorno = solo avisa). Los dominios y las ventanas
salen de los datos: con la lista hardcodeada, una habilidad declarada podría no
aparecer y el mapa mentiría en silencio.

⚠️ **«Cuándo miró» es el único dato del agente que NO se puede derivar.** Una
corrida que no encontró nada no deja rastro en los hallazgos, así que sin esa
columna «miré y estaba todo bien» y «no corrí» se ven idénticos. Por eso la tab
existe: mirar «ENCONTRÓ 0» sin ver que cuatro habilidades no pudieron mirar es
leer un verde que no significa nada.

⚠️ **Y PATRONES contesta la pregunta que ninguna otra tab hace**: un job que no
escribió HOY y uno que no escribe TODOS LOS DÍAS se ven idénticos en AHORA — y
al primero se lo relanza, al segundo relanzarlo lo TAPA. El badge cuenta los
ACTIVOS (lo que ya se cortó no es trabajo) y lo cuenta el backend.

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
`AGENT.md` §0.dn). Se dibuja el del modelo con una marca `ia` y la hora, y el
determinista queda en el `title` para poder comparar los dos sin gastar
pixeles. Si `ia_texto` viene vacío —sin key, sin presupuesto, o el backend
rechazó lo que escribió porque inventaba un número— se dibuja el de siempre:
**la fila nunca queda muda**. Los dos vienen resueltos del backend; acá no hay
ninguna decisión.

⚠️ **✓ y ✕ NO son lo mismo, y que faltara el segundo dejó a AHORA sin salida.**
`✓ leído` saca la fila de la pantalla **y nada más**: el detector la vuelve a
crear en la pasada siguiente. `✕` silencia el PROBLEMA (habilidad + sujeto +
regla) para que no vuelva a nacer, y es reversible. El botón vivía sólo en
ENCONTRÓ —justo donde las filas SÍ tienen arreglo—, así que los avisos, que son
la mayoría de AHORA, no tenían forma de callarse (backend `AGENT.md` §0.dr).

**Los arreglos que PIDEN DATOS traen su listado, y cuál se dibuja lo dice el
backend** (`preview.listado`), no una lista de ids acá:

| `listado` | componente | por qué pide datos |
|---|---|---|
| `filas` (+`opciones`) | `listado-ficha` | el VALOR no lo sabe el sistema: se completa |
| `cedears` | `listado-cedears` | el sistema sabe escribirlo todo, no sabe **cuáles** |
| `ons` | `listado-ons` | idem — 1816 publica muchas más de las que la mesa sigue |

⚠️ **Al aplicar se dibuja el RASTRO, y ninguno de sus pasos lo inventa el
front**: vienen en `pasos` del backend, con ✔/✖ y lo que de verdad pasó. Un alta
hace siete cosas y antes devolvía una frase, así que «el bono se escribió pero la
especie no» se leía como éxito (`AGENT.md` §0.dx). Es la contracara del
pre-flight: uno muestra lo que VA a hacer, el otro lo que HIZO.

⚠️ **«↻ mirar ahora» muestra lo que devuelve la pasada.** El backend fuerza el
RITMO y nunca la VENTANA, y contesta quién quedó afuera por la rueda. Antes se
tiraba ese resultado y «corrieron 12» y «no le tocaba a ninguna» se veían
idénticos: un botón mudo (`AGENT.md` §0.dz).

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

