"use client";

// EL PANEL DEL LAB — qué gastamos y con qué modelo corremos.
//
// Va arriba del chat, plegado. Dos bloques:
//
//   GASTO   — el libro de llamadas al modelo (`ia.llamadas`). Existía desde
//             hace meses y no lo miraba nadie: cada llamada quedaba anotada con
//             sus tokens, su latencia y cuánto pegó en el caché.
//   MODELOS — qué modelo cumple cada rol, por proveedor. Se guarda en la base y
//             aplica sin deploy: el código pide un ROL (light/pro), nunca un
//             nombre, porque los nombres cambian cada pocos meses.
//
// ⚠️ **NINGÚN NÚMERO SE CALCULA ACÁ.** Los totales, el % de caché y el modelo
// en uso vienen del backend, de la misma consulta que dibuja cada lista. Es la
// regla del repo, y acá importa el doble: "con qué modelo corro" tiene una
// precedencia (elección > env > default) que vive en `core/ai.py`. Replicarla
// en el navegador daría dos respuestas que se desincronizan sin que nada falle.
import { useCallback, useEffect, useState } from "react";

import type { PanelLab, ProveedorLab } from "@/components/agente/tipos";

// Cómo se llama cada rol en la pantalla. El backend los conoce como flash/pro;
// acá se muestran con la palabra que usa el user.
const NOMBRE_ROL: Record<string, string> = { flash: "LIGHT", pro: "PRO" };

const miles = (n: number) => n.toLocaleString("es-AR");

export function PanelLabIA({ leer, guardar }: {
  leer: <T>(url: string) => Promise<T>;
  guardar: <T>(url: string, body?: unknown) => Promise<T>;
}) {
  const [abierto, setAbierto] = useState(false);
  const [p, setP] = useState<PanelLab | null>(null);
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      setP(await leer<PanelLab>("/api/agente/lab/panel"));
      setError("");
    } catch (e) {
      setError(String(e));
    } finally {
      setCargando(false);
    }
  }, [leer]);

  // Se pide recién al abrir: el panel es información de fondo, y pedirla al
  // montar la tab retrasaría el chat, que es para lo que se entra.
  useEffect(() => {
    if (!abierto || p || cargando) return;
    const id = setTimeout(() => void cargar(), 0);
    return () => clearTimeout(id);
  }, [abierto, p, cargando, cargar]);

  const g = p?.gasto;

  return (
    <div className="border border-[var(--t-border)]">
      <button
        onClick={() => setAbierto(!abierto)}
        className="w-full text-left px-2 py-1 flex items-baseline gap-2 flex-wrap hover:bg-[var(--t-surface)]"
      >
        <span className="text-[9px] uppercase tracking-widest text-[var(--t-text-dim)]">
          {abierto ? "▾" : "▸"} modelo y gasto
        </span>
        {p && (
          <span className="text-[9px] text-[var(--t-text-muted)]">
            corriendo con <b className="text-[var(--t-accent)]">{p.asistente.modelo}</b>
            {" · "}{p.asistente.proveedor}
            {g && !g.error && (
              <> · hoy {miles(g.hoy.llamadas)} llamada(s), {miles(g.hoy.tokens)} tokens</>
            )}
          </span>
        )}
      </button>

      {abierto && (
        <div className="border-t border-[var(--t-border)] p-2 flex flex-col gap-3">
          {cargando && !p && (
            <p className="text-[10px] text-[var(--t-text-muted)]">cargando…</p>
          )}
          {error && <p className="text-[10px] text-[var(--t-neg)]">{error}</p>}
          {g?.error && <p className="text-[10px] text-[var(--t-neg)]">{g.error}</p>}

          {g && !g.error && <Gasto g={g} />}
          {p?.proveedores.map((pr) => (
            <Proveedor key={pr.proveedor} pr={pr}
                       guardar={guardar} refrescar={cargar} />
          ))}
        </div>
      )}
    </div>
  );
}


// ── EL GASTO ──────────────────────────────────────────────────────────────
function Gasto({ g }: { g: NonNullable<PanelLab["gasto"]> }) {
  const t = g.total;
  return (
    <div className="flex flex-col gap-1">
      <p className="text-[9px] uppercase tracking-widest text-[var(--t-text-dim)]">
        últimos {g.dias} días
      </p>

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[10px]">
        <Dato k="llamadas" v={miles(t.llamadas)} />
        <Dato k="tokens in" v={miles(t.tokens_in)} />
        <Dato k="tokens out" v={miles(t.tokens_out)} />
        {/* ⚠️ El hit rate del caché. El caché cuesta una fracción del precio
            normal, así que este número es la palanca más barata que hay: subirlo
            no cambia ni una respuesta y baja la factura. */}
        <Dato k="del caché"
              v={g.cache_pct === null ? "—" : `${g.cache_pct}%`}
              destacado={g.cache_pct !== null && g.cache_pct > 0} />
        <Dato k="usd" v={t.usd === null ? "sin tarifa" : `$${t.usd}`} />
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-[10px]">
          <thead>
            <tr className="text-[var(--t-text-dim)] text-left">
              <th className="font-normal pr-3">tarea</th>
              <th className="font-normal pr-3">modelo</th>
              <th className="font-normal pr-3 text-right">llam.</th>
              <th className="font-normal pr-3 text-right">in</th>
              <th className="font-normal pr-3 text-right">out</th>
              <th className="font-normal pr-3 text-right">caché</th>
              <th className="font-normal text-right">usd</th>
            </tr>
          </thead>
          <tbody>
            {g.por_tarea.map((f) => (
              <tr key={`${f.tarea}/${f.modelo}`} className="border-t border-[var(--t-border)]">
                <td className="pr-3 text-[var(--t-text)]">{f.tarea}</td>
                <td className="pr-3 text-[var(--t-text-muted)]">{f.modelo}</td>
                <td className="pr-3 text-right tabular-nums">
                  {miles(f.llamadas)}
                  {/* Las fallidas se muestran al lado y no sumadas adentro: son
                      gasto que no produjo nada, y es lo que hay que mirar. */}
                  {f.fallidas > 0 && (
                    <span className="text-[var(--t-neg)]"> ✕{f.fallidas}</span>
                  )}
                </td>
                <td className="pr-3 text-right tabular-nums">{miles(f.tokens_in)}</td>
                <td className="pr-3 text-right tabular-nums">{miles(f.tokens_out)}</td>
                <td className="pr-3 text-right tabular-nums text-[var(--t-text-dim)]">
                  {miles(f.cache_hit)}
                </td>
                <td className="text-right tabular-nums">
                  {f.usd === null ? "—" : `$${f.usd}`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ⚠️ Sin este renglón, un "—" en la columna usd se lee como "no gastó". */}
      {g.sin_precio.length > 0 && (
        <p className="text-[9px] text-[var(--t-text-dim)]">
          Sin tarifa cargada: <b>{g.sin_precio.join(", ")}</b> — su gasto en dólares
          no se muestra. No se estima: una tarifa inventada no falla, miente.
        </p>
      )}
    </div>
  );
}

function Dato({ k, v, destacado }: { k: string; v: string; destacado?: boolean }) {
  return (
    <span>
      <span className="text-[var(--t-text-dim)]">{k} </span>
      <b className={`tabular-nums ${destacado ? "text-[var(--t-pos)]" : "text-[var(--t-text)]"}`}>
        {v}
      </b>
    </span>
  );
}


// ── UN PROVEEDOR Y SUS ROLES ──────────────────────────────────────────────
function Proveedor({ pr, guardar, refrescar }: {
  pr: ProveedorLab;
  guardar: <T>(url: string, body?: unknown) => Promise<T>;
  refrescar: () => Promise<void>;
}) {
  const [guardando, setGuardando] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);

  async function elegir(rol: string, modelo: string) {
    if (!modelo) return;
    setGuardando(rol);
    setMsg(null);
    try {
      // ⚠️ El backend PRUEBA el modelo antes de guardarlo — le da una
      // herramienta de mentira y mira si la pide. Un modelo que ignora `tools`
      // dejaría al asistente contestando de memoria, sin un solo error. Por eso
      // la prueba no es un botón acá: es parte de guardar, allá.
      const r = await guardar<{ ok: boolean; error?: string; modelo?: string }>(
        "/api/agente/lab/modelo", { proveedor: pr.proveedor, rol, modelo });
      setMsg(r.ok
        ? { ok: true, texto: `listo: ${r.modelo} probado y guardado` }
        : { ok: false, texto: r.error || "no se pudo guardar" });
      if (r.ok) await refrescar();
    } catch (e) {
      setMsg({ ok: false, texto: String(e) });
    } finally {
      setGuardando("");
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <p className="text-[9px] uppercase tracking-widest text-[var(--t-text-dim)]">
        {pr.proveedor}
        {!pr.configurado && <span className="text-[var(--t-neg)]"> · sin API key</span>}
        {!pr.usable && <span className="text-[var(--t-neg)]"> · no habilitado</span>}
      </p>

      {/* ⚠️ El motivo se ESCRIBE, no se esconde el proveedor. Si DeepSeek
          desapareciera del panel, dentro de seis meses alguien lo "arregla"
          sin saber qué está rompiendo. */}
      {pr.motivo && (
        <p className="text-[9px] text-[var(--t-neg)] leading-snug">⛔ {pr.motivo}</p>
      )}

      {Object.entries(pr.roles).map(([rol, r]) => (
        <div key={rol} className="flex flex-wrap items-center gap-2">
          <span className="text-[9px] uppercase tracking-widest text-[var(--t-text-dim)] w-12">
            {NOMBRE_ROL[rol] ?? rol}
          </span>
          <select
            value={r.elegido ?? ""}
            disabled={!pr.usable || !pr.configurado || guardando === rol}
            onChange={(e) => void elegir(rol, e.target.value)}
            className="bg-[var(--t-surface)] border border-[var(--t-border)] text-[10px] px-2 py-1 flex-1 min-w-[200px] text-[var(--t-text)] disabled:opacity-40"
          >
            <option value="">— default: {r.default} —</option>
            {pr.modelos.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
          {guardando === rol && (
            <span className="text-[9px] text-[var(--t-accent)]">probando…</span>
          )}
        </div>
      ))}

      {!pr.modelos.length && pr.configurado && pr.usable && (
        <p className="text-[9px] text-[var(--t-text-dim)]">
          No pude pedirle la lista de modelos al proveedor. Sigue corriendo con
          el default.
        </p>
      )}

      {msg && (
        <p className={`text-[9px] leading-snug ${
          msg.ok ? "text-[var(--t-pos)]" : "text-[var(--t-neg)]"}`}>
          {msg.ok ? "✔" : "✕"} {msg.texto}
        </p>
      )}
    </div>
  );
}
