#!/usr/bin/env node
// PreToolUse (git push) — el contexto de Claude tiene techo.
//
// Espejo en Node de `tests/unit/test_contexto_claude.py` del backend (acá no hay
// Python ni suite de tests; sí hay Node porque es un repo Next). Antes de cada
// `git push` verifica y BLOQUEA si:
//   1. CLAUDE.md raíz supera 200 líneas / 16 kB, o tiene fechas (fecha = historia → docs).
//   2. Una regla de .claude/rules/ supera 250 líneas / 32 kB.
//   3. Un glob de `paths:` no matchea ningún archivo (la regla quedó muerta en silencio).
//   4. Una regla no figura en .claude/INDEX.md.
//   5. Un route handler de src/app/api/** rompe el trinquete del proxy (lee
//      process.env, llama fetch o importa apiFetch): corre el lint de esa
//      carpeta, que es donde vive la regla (eslint.config.mjs).
// Los techos SOLO BAJAN. Si no es un push, sale en silencio. Si algo del propio
// hook falla, deja pasar con aviso: fallar cerrado por un hook roto ya bloqueó
// todos los comandos una vez en el backend.
import { spawnSync } from "node:child_process";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const TECHO_RAIZ = [200, 16_000];
const TECHO_REGLA = [250, 32_000];
const GIT_PUSH = /\bgit\s+(-C\s+\S+\s+|--no-pager\s+)*(push|pushall)\b/;
const FECHA = /\b20\d{2}-\d{2}-\d{2}\b/g;

const salir = (payload) => { if (payload) process.stdout.write(JSON.stringify(payload)); process.exit(0); };
const allow = (msg) => salir({ hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "allow" }, systemMessage: msg });
const deny = (motivo) => salir({ hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: motivo } });

const medir = (p) => { const b = readFileSync(p); const n = b.toString("utf8").split("\n").length - (b.at(-1) === 10 ? 1 : 0); return [n, b.length]; };

// Glob mínimo: `*` (sin `/`), `**` (cualquier profundidad). Sin llaves a propósito.
function globARegex(g) {
  let re = "";
  for (let i = 0; i < g.length; i++) {
    const c = g[i];
    if (c === "*") { if (g[i + 1] === "*") { re += ".*"; i++; } else re += "[^/]*"; }
    else re += c.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
  }
  return new RegExp("^" + re + "(/.*)?$");
}
function* archivos(dir, rel = "") {
  for (const e of readdirSync(dir)) {
    if (e === "node_modules" || e === ".git" || e === ".next") continue;
    const abs = join(dir, e), r = rel ? `${rel}/${e}` : e;
    yield r;
    if (statSync(abs).isDirectory()) yield* archivos(abs, r);
  }
}
function pathsDe(texto) {
  const m = texto.match(/^---\n([\s\S]*?)\n---\n/);
  if (!m || !m[1].includes("paths:")) return [];
  return [...m[1].split("paths:")[1].matchAll(/^\s*-\s*"?([^"\n]+?)"?\s*$/gm)].map((x) => x[1].trim()).filter(Boolean);
}

function verificar() {
  const errores = [];
  const [ln, by] = medir(join(RAIZ, "CLAUDE.md"));
  if (ln > TECHO_RAIZ[0]) errores.push(`CLAUDE.md: ${ln} líneas (techo ${TECHO_RAIZ[0]})`);
  if (by > TECHO_RAIZ[1]) errores.push(`CLAUDE.md: ${by} bytes (techo ${TECHO_RAIZ[1]})`);
  const fechas = readFileSync(join(RAIZ, "CLAUDE.md"), "utf8").match(FECHA);
  if (fechas) errores.push(`CLAUDE.md tiene fechas ${[...new Set(fechas)].join(", ")}: si tiene fecha es historia → docs/`);

  const rulesDir = join(RAIZ, ".claude", "rules");
  const reglas = readdirSync(rulesDir).filter((f) => f.endsWith(".md"));
  const index = readFileSync(join(RAIZ, ".claude", "INDEX.md"), "utf8");
  const todos = [...archivos(RAIZ)];
  for (const f of reglas) {
    const p = join(rulesDir, f), texto = readFileSync(p, "utf8");
    const [l, b] = medir(p);
    if (l > TECHO_REGLA[0]) errores.push(`rules/${f}: ${l} líneas (techo ${TECHO_REGLA[0]})`);
    if (b > TECHO_REGLA[1]) errores.push(`rules/${f}: ${b} bytes (techo ${TECHO_REGLA[1]})`);
    for (const g of pathsDe(texto)) {
      if (/[{}]/.test(g)) { errores.push(`rules/${f}: el glob ${g} usa llaves; un glob por línea`); continue; }
      const re = globARegex(g);
      if (!todos.some((a) => re.test(a))) errores.push(`rules/${f}: el glob ${g} no matchea ningún archivo. ¿Se renombró? La regla quedó muerta en silencio.`);
    }
    const nombre = f.replace(/\.md$/, "");
    if (!index.includes("`" + nombre + "`")) errores.push(`rules/${f}: no figura en .claude/INDEX.md`);
  }
  // El trinquete del proxy: la regla vive en eslint.config.mjs; acá solo se corre
  // sobre los handlers para que un push no la saltee. Sin node_modules (npm
  // install pendiente) no se puede verificar → se avisa, no se bloquea.
  const lint = spawnSync(process.platform === "win32" ? "npx.cmd" : "npx",
    ["eslint", "--no-warn-ignored", "src/app/api"], { cwd: RAIZ, encoding: "utf8", shell: process.platform === "win32" });
  if (lint.error) errores.push(`trinquete del proxy sin verificar (no pude correr eslint: ${lint.error.message})`);
  else if (lint.status !== 0) errores.push(`un route handler rompe el trinquete del proxy:\n${(lint.stdout || lint.stderr || "").trim()}`);
  return errores;
}

let payload = {};
try { payload = JSON.parse(readFileSync(0, "utf8") || "{}"); } catch { salir(); }
const cmd = ["command", "cmd", "script"].map((k) => payload?.tool_input?.[k]).find((v) => typeof v === "string" && v.trim()) || "";
if (!GIT_PUSH.test(cmd)) salir();
let errores;
try { errores = verificar(); } catch (e) { allow(`Techo del contexto sin validar (el hook falló: ${e.message}).`); }
if (errores.length) deny("PUSH BLOQUEADO — falló una verificación del repo (techo del contexto, regla muerta o trinquete del proxy). Si es el techo: movelo a .claude/rules/<dominio>.md, no achiques la letra. Si es el proxy: el handler va por lib/proxy-backend.ts.\n\n- " + errores.join("\n- "));
salir();
