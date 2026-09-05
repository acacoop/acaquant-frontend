# REGLA — El modelo CARO diseña, los BARATOS ejecutan

Aplica siempre que la sesión principal corra con **Fable** (o cualquier modelo de
la capa cara: Opus). El principal es el ARQUITECTO: lee, decide, especifica,
revisa y le explica al usuario. La ejecución mecánica va a sub-agentes con un
modelo más barato. Doc oficial: code.claude.com/docs/en/costs («Sonnet resuelve
la mayoría de las tareas de código; reservar el modelo grande para decisiones de
arquitectura») y code.claude.com/docs/en/sub-agents.

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
