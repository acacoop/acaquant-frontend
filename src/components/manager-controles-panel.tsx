"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

/**
 * OBSERVABILIDAD → CONTROLES — auto-control de calidad de datos.
 *
 * UNA sola tabla con sub-tabs por control (los que tienen anomalías llevan "!").
 * Al entrar, si la última corrida del job tiene más de 60 min, se re-ejecuta
 * sola en background y refresca — no hace falta apretar nada. Cada control
 * explica su impacto y tiene un botón que navega a la tab del Manager donde
 * se corrige.
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
  ultima_corrida: string | null;
}

// Metadata por control: label corto (sub-tab), impacto y adónde ir a corregir.
const META: {
  id: string;
  label: string;
  titulo: string;
  impacto: string;
  accion?: { label: string; tab: string };
}[] = [
  {
    id: "forwards_faltantes",
    label: "FORWARDS",
    titulo: "Bonos ausentes de forwards (tasa fija / CER)",
    impacto:
      "La matriz de forwards de renta fija queda incompleta: faltan cruces entre bonos. La causa por bono está en el detalle.",
    accion: { label: "IR A VALIDACIONES", tab: "validaciones" },
  },
  {
    id: "rf_sin_tasa",
    label: "RF SIN TASA",
    titulo: "Renta fija cotizando sin TEA/TNA",
    impacto:
      "El bono figura en la tabla de renta fija con precio pero sin tasa — la fila queda inservible para la mesa.",
    accion: { label: "IR A VALIDACIONES", tab: "validaciones" },
  },
  {
    id: "assets_sin_cartera",
    label: "CARTERAS",
    titulo: "Assets sin cartera",
    impacto:
      "Sin cartera la valuación no sabe qué divisor aplicar: la posición queda SIN CLASIFICAR y ensucia el AuM. Completar CARTERA en Títulos → Assets.",
    accion: { label: "IR A TÍTULOS", tab: "titulos" },
  },
  {
    id: "simbolos_cuarentena",
    label: "ROFEX",
    titulo: "Símbolos rechazados por ROFEX (en cuarentena)",
    impacto:
      "ROFEX respondió 'Product don't exist' y el símbolo quedó excluido de las suscripciones (se reintenta solo a los 7 días). La causa de fondo suele ser un ticker mal cargado o un bono vencido en el master — corregirlo en Títulos es el fix definitivo.",
    accion: { label: "IR A TÍTULOS", tab: "titulos" },
  },
  {
    id: "comitentes_sin_nivel1",
    label: "NIVEL 1",
    titulo: "Comitentes activos sin nivel 1",
    impacto:
      "La cuenta queda fuera de la segmentación y de los filtros madre (Tablero Comercial, Control Comercial). Completar nivel 1 en Clientes.",
    accion: { label: "IR A CLIENTES", tab: "clientes" },
  },
  {
    id: "contrapartes_pendientes",
    label: "CONTRAPARTES",
    titulo: "Cuentas de contrapartes sin dar de alta",
    impacto:
      "El conciliador de Aunesa encontró cuentas que matchean una contraparte conocida y no están dadas de alta: sus tenencias/operaciones inflan AuM y vistas comerciales.",
    accion: { label: "IR A CONTRAPARTES", tab: "contrapartes" },
  },
];

const STALE_MIN = 60; // si la última corrida tiene más de esto, auto-ejecutar al entrar

function hoyISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function parseTs(s: string | null): number | null {
  if (!s) return null;
  // Postgres ::text: "2026-07-09 16:55:03.123+00" → ISO parseable.
  const iso = s.replace(" ", "T").replace(/\+00(:00)?$/, "Z");
  const t = new Date(iso).getTime();
  return Number.isFinite(t) ? t : null;
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

function fmtHace(ts: number | null): string {
  if (ts == null) return "nunca";
  const min = Math.floor((Date.now() - ts) / 60_000);
  if (min < 1) return "recién";
  if (min < 60) return `hace ${min}m`;
  if (min < 60 * 24) return `hace ${Math.floor(min / 60)}h`;
  return `hace ${Math.floor(min / 1440)}d`;
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
  const [running, setRunning] = useState(false);
  const [runMsg, setRunMsg] = useState<string | null>(null);
  const [sel, setSel] = useState<string>(META[0].id);
  const [verResueltos, setVerResueltos] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoRef = useRef(false); // auto-run: 1 sola vez por montaje

  const cargar = useCallback(async (): Promise<ControlesResp | null> => {
    try {
      const res = await fetch("/api/manager/controles?resueltos_dias=7", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json: ControlesResp = await res.json();
      setData(json);
      setErr(null);
      return json;
    } catch (e) {
      setErr(e instanceof Error ? e.message : "error");
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const correr = useCallback(
    async (auto: boolean) => {
      if (pollRef.current) clearInterval(pollRef.current);
      try {
        setRunning(true);
        setRunMsg(auto ? "⟳ datos viejos — actualizando automáticamente…" : "Corriendo controles…");
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
    },
    [cargar],
  );

  useEffect(() => {
    // Al entrar: cargar lo persistido (siempre hay resultados previos del cron)
    // y, si la última corrida está vieja, re-ejecutar sola en background.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void cargar().then((json) => {
      if (!json || autoRef.current) return;
      const ts = parseTs(json.ultima_corrida);
      const staleMs = STALE_MIN * 60_000;
      if (ts == null || Date.now() - ts > staleMs) {
        autoRef.current = true;
        void correr(true);
      }
    });
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [cargar, correr]);

  const grupoSel: ControlGrupo = data?.controles[sel] ?? { activos: [], resueltos: [] };
  const metaSel = META.find((m) => m.id === sel)!;
  const totalActivos = useMemo(
    () => META.reduce((s, m) => s + (data?.controles[m.id]?.activos.length ?? 0), 0),
    [data],
  );
  const ultimaTs = parseTs(data?.ultima_corrida ?? null);

  return (
    <div className="h-full flex flex-col min-h-0 overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-[var(--t-border)] bg-[var(--t-panel)] shrink-0 flex-wrap">
        <span className="text-[9px] font-semibold text-[var(--t-text-muted)] tracking-widest">CONTROLES</span>
        <span className="text-[10px] font-mono text-[var(--t-text-dim)]">
          {totalActivos} anomalías · actualizado {fmtHace(ultimaTs)}
        </span>
        <div className="ml-auto flex items-center gap-2">
          {runMsg && <span className="text-[10px] font-mono text-[var(--t-accent)]">{runMsg}</span>}
          <button
            onClick={() => void correr(false)}
            disabled={running}
            className="px-2 py-0.5 text-[10px] font-semibold border border-[var(--t-accent)] text-[var(--t-accent)] hover:bg-[var(--t-accent)] hover:text-[var(--t-on-accent)] disabled:opacity-40 transition-colors"
          >
            {running ? "CORRIENDO…" : "▶ CORRER AHORA"}
          </button>
        </div>
      </div>

      {/* Sub-tabs por control (! donde hay anomalías) */}
      <div className="flex items-center gap-1 px-3 py-1.5 border-b border-[var(--t-border)] bg-[var(--t-panel)] shrink-0 flex-wrap">
        {META.map((m) => {
          const n = data?.controles[m.id]?.activos.length ?? 0;
          const active = sel === m.id;
          return (
            <button
              key={m.id}
              onClick={() => {
                setSel(m.id);
                setVerResueltos(false);
              }}
              className={`px-2 py-0.5 text-[10px] font-semibold tracking-wide border transition-colors ${
                active
                  ? "bg-[var(--t-accent)] text-[var(--t-on-accent)] border-[var(--t-accent)]"
                  : "bg-transparent text-[var(--t-text-muted)] border-[var(--t-border-2)] hover:text-[var(--t-accent)] hover:border-[var(--t-accent)]"
              }`}
            >
              {m.label}
              {n > 0 && (
                <span className={`ml-1 font-bold ${active ? "" : "text-[var(--t-neg)]"}`}>! {n}</span>
              )}
            </button>
          );
        })}
      </div>

      {/* Impacto + acción del control seleccionado */}
      <div className="flex items-center gap-3 px-3 py-1.5 border-b border-[var(--t-border)] bg-[var(--t-accent)]/5 shrink-0 flex-wrap">
        <span className="text-[10px] text-[var(--t-text-dim)] flex-1 min-w-[280px]">
          <span className="font-semibold text-[var(--t-text)]">{metaSel.titulo}. </span>
          {metaSel.impacto}
        </span>
        {grupoSel.resueltos.length > 0 && (
          <button
            onClick={() => setVerResueltos((v) => !v)}
            className="text-[10px] font-mono text-[var(--t-pos)] hover:underline whitespace-nowrap"
          >
            ✓ {grupoSel.resueltos.length} resueltos (7d) {verResueltos ? "▲" : "▾"}
          </button>
        )}
        {metaSel.accion && (
          <button
            onClick={() => goTo(metaSel.accion!.tab)}
            className="px-2 py-0.5 text-[9px] font-semibold tracking-wider border border-[var(--t-accent)] text-[var(--t-accent)] hover:bg-[var(--t-accent)] hover:text-[var(--t-on-accent)] transition-colors whitespace-nowrap"
          >
            {metaSel.accion.label} →
          </button>
        )}
      </div>

      {/* LA tabla */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {loading && !data && (
          <div className="text-center text-[var(--t-text-muted)] text-[11px] py-8">Cargando…</div>
        )}
        {err && <div className="text-center text-[var(--t-neg)] text-[11px] py-8">Error: {err}</div>}
        {data && !verResueltos && grupoSel.activos.length === 0 && (
          <div className="text-center text-[var(--t-pos)] text-[11px] py-8">Sin anomalías en este control. ✓</div>
        )}
        {data && !verResueltos && grupoSel.activos.length > 0 && (
          <table className="w-full text-[11px] font-mono">
            <thead className="sticky top-0 bg-[var(--t-panel)] z-10 text-[9px] uppercase tracking-widest text-[var(--t-text-muted)]">
              <tr className="border-b border-[var(--t-border)]">
                <th className="!px-3 !py-1 text-left w-[240px]">Item</th>
                <th className="!px-2 !py-1 text-left">Detalle</th>
                <th className="!px-2 !py-1 text-right w-[110px]">Desde</th>
              </tr>
            </thead>
            <tbody>
              {grupoSel.activos.map((i) => (
                <tr key={i.item} className="border-b border-[var(--t-border)] hover:bg-[var(--t-accent)]/5">
                  <td className="!px-3 !py-1 text-[var(--t-text)] font-semibold truncate max-w-[240px]" title={i.item}>
                    {i.item}
                  </td>
                  <td className="!px-2 !py-1 text-[var(--t-text-dim)]">{i.detalle ?? "—"}</td>
                  <td
                    className="!px-2 !py-1 text-right whitespace-nowrap"
                    title={`primera vez ${fmtFecha(i.desde)}`}
                  >
                    <EdadBadge desde={i.desde} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {data && verResueltos && (
          <table className="w-full text-[11px] font-mono">
            <thead className="sticky top-0 bg-[var(--t-panel)] z-10 text-[9px] uppercase tracking-widest text-[var(--t-text-muted)]">
              <tr className="border-b border-[var(--t-border)]">
                <th className="!px-3 !py-1 text-left">Resuelto (últimos 7 días)</th>
                <th className="!px-2 !py-1 text-right w-[130px]">Fecha</th>
              </tr>
            </thead>
            <tbody>
              {grupoSel.resueltos.map((i) => (
                <tr key={i.item} className="border-b border-[var(--t-border)]">
                  <td className="!px-3 !py-1 text-[var(--t-text-muted)]">
                    <span className="text-[var(--t-pos)] mr-1">✓</span>
                    <span className="line-through">{i.detalle ?? i.item}</span>
                  </td>
                  <td className="!px-2 !py-1 text-right text-[var(--t-text-dim)]">{fmtFecha(i.resuelto)}</td>
                </tr>
              ))}
              {grupoSel.resueltos.length === 0 && (
                <tr>
                  <td colSpan={2} className="text-center text-[var(--t-text-muted)] py-4">
                    Sin resueltos recientes.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
