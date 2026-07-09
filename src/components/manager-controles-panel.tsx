"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

/**
 * MANAGER → CONTROLES — panel del auto-control de calidad de datos.
 *
 * Muestra lo que jobs/controles_datos detecta (el Telegram solo lleva el
 * resumen; acá está el detalle completo, incluido lo privado de clientes que
 * no va al canal). Cada control es ACCIONABLE: dice el impacto de negocio y
 * tiene un botón que te lleva a la tab del Manager donde se corrige.
 *
 * "CORRER AHORA" re-ejecuta el job en el backend (sin Telegram) y refresca.
 */

interface ControlItem {
  item: string;
  detalle: string | null;
  desde: string;          // first_seen ISO
  visto: string;          // last_seen ISO
  resuelto: string | null;
}

interface ControlGrupo {
  activos: ControlItem[];
  resueltos: ControlItem[];
}

interface ControlesResp {
  controles: Record<string, ControlGrupo>;
  totales: Record<string, number>;
}

// Metadata de presentación por control: qué impacto tiene y adónde ir a
// corregirlo (tab del Manager). El orden de esta lista es el orden del panel.
const META: {
  id: string;
  titulo: string;
  impacto: string;
  accion?: { label: string; tab: string };
}[] = [
  {
    id: "forwards_faltantes",
    titulo: "BONOS AUSENTES DE FORWARDS",
    impacto:
      "La matriz de forwards de renta fija (tasa fija / CER) queda incompleta: faltan cruces entre bonos. La causa por bono está en el detalle.",
    accion: { label: "IR A VALIDACIONES", tab: "validaciones" },
  },
  {
    id: "rf_sin_tasa",
    titulo: "RENTA FIJA COTIZANDO SIN TEA/TNA",
    impacto:
      "El bono figura en la tabla de renta fija con precio pero sin tasa — la fila queda inservible para la mesa.",
    accion: { label: "IR A VALIDACIONES", tab: "validaciones" },
  },
  {
    id: "assets_sin_cartera",
    titulo: "ASSETS SIN CARTERA",
    impacto:
      "Sin cartera la valuación no sabe qué divisor aplicar: la posición queda SIN CLASIFICAR y ensucia el AuM. Completar el campo CARTERA en Títulos → Assets.",
    accion: { label: "IR A TÍTULOS", tab: "titulos" },
  },
  {
    id: "comitentes_sin_nivel1",
    titulo: "COMITENTES ACTIVOS SIN NIVEL 1",
    impacto:
      "La cuenta queda fuera de la segmentación y de los filtros madre (Tablero Comercial, Control Comercial). Completar nivel 1 en Clientes.",
    accion: { label: "IR A CLIENTES", tab: "clientes" },
  },
  {
    id: "contrapartes_pendientes",
    titulo: "CUENTAS DE CONTRAPARTES SIN DAR DE ALTA",
    impacto:
      "El conciliador de Aunesa encontró cuentas que matchean una contraparte conocida y no están dadas de alta: sus tenencias/operaciones se cuentan como de clientes (inflan AuM y vistas comerciales).",
    accion: { label: "IR A CONTRAPARTES", tab: "contrapartes" },
  },
];

function hoyISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function diasDesde(iso: string): number {
  const d = new Date(iso.slice(0, 10) + "T00:00:00Z").getTime();
  return Math.max(0, Math.floor((Date.now() - d) / 86_400_000));
}

function fmtFecha(iso: string | null): string {
  if (!iso) return "—";
  const t = iso.slice(0, 10);
  return `${t.slice(8, 10)}/${t.slice(5, 7)}/${t.slice(2, 4)}`;
}

function EdadBadge({ desde }: { desde: string }) {
  const esHoy = desde.slice(0, 10) === hoyISO();
  const dias = diasDesde(desde);
  if (esHoy) {
    return (
      <span className="px-1.5 py-0.5 text-[9px] font-bold tracking-wider bg-[var(--t-accent)] text-[var(--t-on-accent)]">
        NUEVO HOY
      </span>
    );
  }
  const color = dias >= 7 ? "var(--t-neg)" : "var(--t-text-dim)";
  return (
    <span className="text-[10px] font-mono" style={{ color }}>
      hace {dias}d
    </span>
  );
}

export function ControlesPanel({ goTo }: { goTo: (tab: string) => void }) {
  const [data, setData] = useState<ControlesResp | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [lastAt, setLastAt] = useState<string>("");
  const [running, setRunning] = useState(false);
  const [runMsg, setRunMsg] = useState<string | null>(null);
  const [verResueltos, setVerResueltos] = useState<Record<string, boolean>>({});
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // No setea loading=true acá (regla set-state-in-effect): loading arranca true
  // en el estado inicial y el refresh manual es rápido — solo se apaga al final.
  const cargar = useCallback(async () => {
    try {
      const res = await fetch("/api/manager/controles?resueltos_dias=7", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json: ControlesResp = await res.json();
      setData(json);
      setErr(null);
      setLastAt(new Date().toLocaleTimeString("es-AR", { hour12: false }));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // fetch inicial: cargar() es async y solo setea estado tras el await —
    // el linter traza dentro del callback y lo marca igual (falso positivo,
    // mismo patrón preexistente en el resto de las vistas).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void cargar();
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [cargar]);

  async function correrAhora() {
    try {
      setRunning(true);
      setRunMsg("Corriendo controles…");
      const res = await fetch("/api/manager/jobs/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tipo: "controles_datos" }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const { job_id } = await res.json();
      pollRef.current = setInterval(async () => {
        try {
          const st = await fetch(`/api/manager/jobs/${job_id}`, { cache: "no-store" });
          if (!st.ok) return;
          const j = await st.json();
          if (j.status === "running") return;
          if (pollRef.current) clearInterval(pollRef.current);
          setRunning(false);
          setRunMsg(j.status === "done" ? "Controles actualizados ✓" : `Falló: ${(j.result || "").slice(0, 120)}`);
          void cargar();
          setTimeout(() => setRunMsg(null), 6000);
        } catch {
          /* siguiente tick */
        }
      }, 3000);
    } catch (e) {
      setRunning(false);
      setRunMsg(`No se pudo lanzar: ${e instanceof Error ? e.message : "error"}`);
    }
  }

  const totalActivos = useMemo(
    () => META.reduce((s, m) => s + (data?.controles[m.id]?.activos.length ?? 0), 0),
    [data],
  );
  const totalNuevosHoy = useMemo(
    () =>
      META.reduce(
        (s, m) =>
          s +
          (data?.controles[m.id]?.activos.filter((i) => i.desde.slice(0, 10) === hoyISO()).length ?? 0),
        0,
      ),
    [data],
  );

  return (
    <div className="h-full flex flex-col min-h-0 overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-[var(--t-border)] bg-[var(--t-panel)] shrink-0">
        <span className="text-[9px] font-semibold text-[var(--t-text-muted)] tracking-widest">
          CONTROLES DE DATOS
        </span>
        <span className="text-[10px] font-mono text-[var(--t-text-dim)]">
          {totalActivos} anomalías activas
          {totalNuevosHoy > 0 && (
            <span className="text-[var(--t-accent)]"> · ▲{totalNuevosHoy} nuevas hoy</span>
          )}
        </span>
        <div className="ml-auto flex items-center gap-2">
          {runMsg && <span className="text-[10px] font-mono text-[var(--t-text-dim)]">{runMsg}</span>}
          <button
            onClick={() => void correrAhora()}
            disabled={running}
            className="px-2 py-0.5 text-[10px] font-semibold border border-[var(--t-accent)] text-[var(--t-accent)] hover:bg-[var(--t-accent)] hover:text-[var(--t-on-accent)] disabled:opacity-40 transition-colors"
          >
            {running ? "CORRIENDO…" : "▶ CORRER AHORA"}
          </button>
          <button
            onClick={() => void cargar()}
            className="px-2 py-0.5 text-[10px] border border-[var(--t-border-2)] text-[var(--t-text-dim)] hover:text-[var(--t-accent)] hover:border-[var(--t-accent)]"
            title={lastAt ? `Última carga ${lastAt}` : ""}
          >
            ↻
          </button>
        </div>
      </div>

      {/* Cuerpo */}
      <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-3">
        {loading && !data && (
          <div className="text-center text-[var(--t-text-muted)] text-[11px] py-8">Cargando…</div>
        )}
        {err && (
          <div className="text-center text-[var(--t-neg)] text-[11px] py-8">Error: {err}</div>
        )}
        {data &&
          META.map((m) => {
            const g = data.controles[m.id] ?? { activos: [], resueltos: [] };
            const nuevosHoy = g.activos.filter((i) => i.desde.slice(0, 10) === hoyISO()).length;
            const ok = g.activos.length === 0;
            const abierto = verResueltos[m.id] ?? false;
            return (
              <div key={m.id} className="border border-[var(--t-border)] bg-[var(--t-panel)]">
                {/* Header del control */}
                <div className="flex items-center gap-2 px-3 py-1.5 border-b border-[var(--t-border)] bg-[var(--t-accent)]/5 flex-wrap">
                  <span className="text-[13px]">{ok ? "✅" : "⚠️"}</span>
                  <span className="text-[10px] font-semibold tracking-widest text-[var(--t-text)]">
                    {m.titulo}
                  </span>
                  <span className="text-[11px] font-mono font-bold" style={{ color: ok ? "var(--t-pos)" : "var(--t-accent)" }}>
                    {g.activos.length}
                  </span>
                  {nuevosHoy > 0 && (
                    <span className="text-[10px] font-mono text-[var(--t-accent)]">▲{nuevosHoy} hoy</span>
                  )}
                  {g.resueltos.length > 0 && (
                    <button
                      onClick={() => setVerResueltos((p) => ({ ...p, [m.id]: !abierto }))}
                      className="text-[10px] font-mono text-[var(--t-pos)] hover:underline"
                    >
                      ▼{g.resueltos.length} resueltos (7d) {abierto ? "▲" : "▾"}
                    </button>
                  )}
                  {m.accion && !ok && (
                    <button
                      onClick={() => goTo(m.accion!.tab)}
                      className="ml-auto px-2 py-0.5 text-[9px] font-semibold tracking-wider border border-[var(--t-accent)] text-[var(--t-accent)] hover:bg-[var(--t-accent)] hover:text-[var(--t-on-accent)] transition-colors"
                    >
                      {m.accion.label} →
                    </button>
                  )}
                </div>
                {/* Impacto */}
                <div className="px-3 py-1.5 text-[10px] text-[var(--t-text-dim)] border-b border-[var(--t-border)]">
                  {m.impacto}
                </div>
                {/* Activos */}
                {g.activos.length > 0 ? (
                  <table className="w-full text-[11px] font-mono">
                    <thead className="text-[9px] uppercase tracking-widest text-[var(--t-text-muted)]">
                      <tr className="border-b border-[var(--t-border)]">
                        <th className="!px-3 !py-1 text-left w-[220px]">Item</th>
                        <th className="!px-2 !py-1 text-left">Detalle</th>
                        <th className="!px-2 !py-1 text-right w-[110px]">Desde</th>
                      </tr>
                    </thead>
                    <tbody>
                      {g.activos.map((i) => (
                        <tr key={i.item} className="border-b border-[var(--t-border)] hover:bg-[var(--t-accent)]/5">
                          <td className="!px-3 !py-1 text-[var(--t-text)] font-semibold truncate max-w-[220px]" title={i.item}>
                            {i.item}
                          </td>
                          <td className="!px-2 !py-1 text-[var(--t-text-dim)]">{i.detalle ?? "—"}</td>
                          <td className="!px-2 !py-1 text-right whitespace-nowrap" title={`primera vez ${fmtFecha(i.desde)}`}>
                            <EdadBadge desde={i.desde} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div className="px-3 py-2 text-[10px] text-[var(--t-pos)]">Sin anomalías. ✓</div>
                )}
                {/* Resueltos (colapsable) */}
                {abierto && g.resueltos.length > 0 && (
                  <div className="border-t border-[var(--t-border)]">
                    {g.resueltos.map((i) => (
                      <div key={i.item} className="flex items-center gap-2 px-3 py-0.5 text-[10px] font-mono text-[var(--t-text-muted)]">
                        <span className="text-[var(--t-pos)]">✓</span>
                        <span className="line-through truncate">{i.detalle ?? i.item}</span>
                        <span className="ml-auto whitespace-nowrap">resuelto {fmtFecha(i.resuelto)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
      </div>
    </div>
  );
}
