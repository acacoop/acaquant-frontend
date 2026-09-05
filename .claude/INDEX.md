# .claude/ — índice

Espejo del `.claude/` del backend, en chico. Todo lo que vive acá se versiona
(excepto `settings.local.json`). Claude descubre rules/agents solo; este índice
es para vos (humano).

## Rules (`.claude/rules/*.md` — se cargan en TODA sesión)

| Regla | Qué fija |
|---|---|
| `fable-orquesta` | Cuando el principal es Fable/Opus: **diseña y revisa**; la ejecución va a sub-agentes baratos. Qué se delega, qué no (los contratos con el backend nunca), y el informe que devuelve un sub-agente. |
| `rbac` | Identidad firmada (`cf-access.ts`), sanitización y pre-gate en `proxy.ts`, el contrato `PATH_MODULES` ↔ backend, portal invitado. Carga al tocar proxy/auth/header/`src/app/api/**`. |
| `red-cliente` | Los 4 helpers de red y sus contratos, `usePoll` y por qué el techo no es opcional, patrones de UI (shells keep-alive, `informe.tsx`, `fmt.ts`). Carga al tocar `src/lib/**` o `src/components/**`. |
| `trading` | La vista TRADING: 50/50, RADAR, dos charts, y la regla «nada auto-asigna un chart». Carga al tocar `trading*.tsx` o `src/app/trading/**`. |
| `agente` | El modal del AV AGENT: tres tabs, `datos.tsx` como único punto de red, `leer`/`calcular`/`escribir`, el botón que se dibuja SIEMPRE. Carga al tocar `components/agente/**`. |

**Techo, verificado por el hook de push `.claude/hooks/check_contexto.mjs`** (espejo
en Node del test del backend): `CLAUDE.md` raíz ≤ 200 líneas / 16 kB y **sin fechas**;
cada regla ≤ 250 líneas / 32 kB; cada `paths:` tiene que matchear un archivo que
existe; cada regla figura en esta tabla. Los techos solo bajan.

## Agents (sub-agentes — corren en contexto limpio, en Sonnet)

| Agent | Modelo | Cuándo |
|---|---|---|
| `implementador` | sonnet | Ejecuta una spec CERRADA. Si tiene un hueco, para y reporta. No commitea. |
| `pre-push-check` | sonnet | `lint` + `tsc` + `build` → GO / NO-GO. El build es lo mismo que corre Vercel. |

## Hooks (definidos en `.claude/settings.json`, scripts en `.claude/hooks/`)

| Hook | Qué hace |
|---|---|
| PreToolUse · `git push` | `check_contexto.mjs` — **BLOQUEA** el push si el CLAUDE.md raíz superó su techo, tiene fechas, o una regla apunta a un archivo que no existe. Node, no bash: tiene que correr también en Windows. |

## settings.json

- `env.CLAUDE_CODE_SUBAGENT_MODEL = sonnet` — default para cualquier sub-agente
  sin `model` propio.
- `permissions.ask` incluye `git config user.name/email`: pisar el autor es lo
  que hace que Vercel bloquee el deploy sin error visible.
- `permissions.deny` bloquea leer `.env*` y el `push --force`.
