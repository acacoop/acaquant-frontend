# REGLA — Con FABLE: el modelo caro diseña, los baratos ejecutan

⚠️⚠️ **APLICA SÓLO SI LA SESIÓN PRINCIPAL CORRE CON FABLE.** Con Opus o con
cualquier otro modelo, NO: se trabaja derecho en la principal, sin repartir.
Decisión del user, y es un recorte a propósito — antes decía «o cualquier modelo
de la capa cara: Opus» y eso hacía que la regla se activara casi siempre.

⚠️ **Y EL DEFAULT ES NO DELEGAR**, porque el gatillo de esta regla es
justamente lo único que la sesión NO puede ver: el modelo que sirve un turno
puede cambiar en el medio (un fallback por sobrecarga, un cambio de modelo), y
el prompt del sistema prohíbe afirmar cuál es sin consultarlo. Entonces:

- **Ante la duda, no se delega.** Una regla que se enciende sola sobre un dato
  que no se puede verificar se enciende cuando no corresponde.
- **Se enciende si el user lo dice** («estoy en Fable», «delegá esto»), o si la
  sesión CONFIRMA el modelo con la herramienta `get_session` del servidor
  claude-code-remote y `session_context.model` es Fable.

Con la regla encendida, el principal es el ARQUITECTO: lee, decide, especifica,
revisa y le explica al usuario. La ejecución mecánica va a sub-agentes con un
modelo más barato. Doc oficial: code.claude.com/docs/en/costs («Sonnet resuelve
la mayoría de las tareas de código; reservar el modelo grande para decisiones de
arquitectura») y code.claude.com/docs/en/sub-agents.

⚠️ **El CONTRATO de abajo vale SIEMPRE que se delegue**, con Fable o porque el
user lo pidió suelto: la spec completa, el informe con output real, que el
sub-agente no commitea, y que la revisión final no se delega. Lo que cambia con
el modelo es CUÁNDO se reparte, no cómo.

## Qué se delega y a quién

| Tarea | Sub-agente |
|---|---|
| Relevar, buscar, listar («qué componente consume tal endpoint») | `Explore` (haiku, solo lectura) |
| Implementar un cambio YA especificado | `implementador` (sonnet) |
| Correr las verificaciones (lint + tsc + build) | `pre-push-check` (sonnet) |
| El mismo cambio en N archivos / N proxies | N `implementador` en paralelo |

El default de los sub-agentes SIN modelo declarado es Sonnet
(`CLAUDE_CODE_SUBAGENT_MODEL` en `settings.json` → `env`). Para subir uno a
Fable hay que pedirlo explícito: el barato es el default, el caro se justifica.

## Qué NO se delega

- **Las decisiones de diseño** y cualquier cambio que cruce los dos repos —acá
  es casi todo cambio de contrato con el backend: `PATH_MODULES` ↔
  `ENDPOINT_MODULE_PREFIXES`, `NAV.module` ↔ `core/roles.py::MODULES`. Dos
  mitades coherentes cada una consigo misma y no entre sí no fallan: muestran
  cosas distintas.
- **Lo que tiene la especificación ambigua.** Un modelo menor rellena los huecos
  suponiendo. Si la spec no se puede escribir completa, se hace en el principal.
- **La revisión final** del trabajo del sub-agente y la explicación ejecutiva.
  El ahorro real es que el modelo caro LEE 200 líneas de diff en vez de
  escribirlas.

## El contrato de delegación

1. **La spec es completa**: archivos por ruta, componente, comportamiento
   esperado, qué NO tocar, qué convención del repo aplica (`force-dynamic`,
   `revalidate = 0`, `conTecho(ms)` en polls, tokens `--t-*`, sin hex).
2. **El sub-agente devuelve tres cosas**: qué cambió, qué corrió y con qué
   resultado (output real, no «pasó»), y qué NO pudo hacer o dónde dudó.
3. **El principal lee el diff** antes de dar por cerrado. El informe del
   sub-agente no le llega al usuario: se relata verificado.
4. **Un sub-agente no commitea ni pushea.** Lo hace el principal, después de
   revisar. Y **no pisa `user.name`/`user.email`**: Vercel bloquea el deploy
   por identidad del autor.
