# .claude/ — índice

Espejo del `.claude/` del backend, en chico. Todo lo que vive acá se versiona
(excepto `settings.local.json`). Claude descubre rules/agents solo; este índice
es para vos (humano).

## Rules (`.claude/rules/*.md` — se cargan en TODA sesión)

| Regla | Qué fija |
|---|---|
| `fable-orquesta` | Cuando el principal es Fable/Opus: **diseña y revisa**; la ejecución va a sub-agentes baratos. Qué se delega, qué no (los contratos con el backend nunca), y el informe que devuelve un sub-agente. |

## Agents (sub-agentes — corren en contexto limpio, en Sonnet)

| Agent | Modelo | Cuándo |
|---|---|---|
| `implementador` | sonnet | Ejecuta una spec CERRADA. Si tiene un hueco, para y reporta. No commitea. |
| `pre-push-check` | sonnet | `lint` + `tsc` + `build` → GO / NO-GO. El build es lo mismo que corre Vercel. |

## settings.json

- `env.CLAUDE_CODE_SUBAGENT_MODEL = sonnet` — default para cualquier sub-agente
  sin `model` propio.
- `permissions.ask` incluye `git config user.name/email`: pisar el autor es lo
  que hace que Vercel bloquee el deploy sin error visible.
- `permissions.deny` bloquea leer `.env*` y el `push --force`.
