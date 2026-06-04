"use client";

// OPERACIONES → MOVIMIENTOS sobre CashFlow.Operaciones.
// Izq 50%: arriba Σbruto por operacion, abajo gráfico Σbruto por fecha (OpsBarChart,
// toolbar rango + agg + foco día + maximizar). Der 50%: Σbruto por denominacion.
// Interactivo: elegir una operacion o una denominacion filtra la otra tabla + el
// gráfico. Excluye los "Cierre" (server-side). Filtro de moneda (campo `moneda`).

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePersistedState } from "@/lib/use-persisted-state";
import { OpsBarChart, type SerieRow } from "./ops-bar-chart";

type Moneda = "ARS" | "USD";
type Modo = "ULTIMA" | "DIA" | "TODOS";

type FechaRow = { fecha: string; n: number };
type OpRow = { operacion: string; bruto: number; n: number };
type DenomRow = { denominacion: string; bruto: number; n: number };
type Meta = { n_boletos: number; ultima_ingesta: string | null };
type BoletoRow = {
  boleto: string; concertacion: string; cuenta: string; denominacion: string;
  operacion: string | null; mercado: string | null; instrumento: string | null;
  condiciones: string | null; cantidad: number | null; bruto: number | null;
};

const MESES = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];

function fmtCompact(n: number): string {
  if (n == null || Number.isNaN(n)) return "—";
  const abs = Math.abs(n), sign = n < 0 ? "-" : "";
  if (abs >= 1e9) return sign + (abs / 1e9).toFixed(2) + "B";
  if (abs >= 1e6) return sign + (abs / 1e6).toFixed(2) + "M";
  if (abs >= 1e3) return sign + (abs / 1e3).toFixed(1) + "k";
  return sign + abs.toFixed(0);
}
const fmtFechaDisplay = (s: string) => { const [y,m,d] = s.split("-").map(Number); return `${d} ${MESES[m-1]} ${y}`; };
const fmtFechaCorta = (s: string) => { const [y,m,d] = s.split("-"); return `${d}/${m}/${y.slice(-2)}`; };
function formatTime(iso: string | null): string {
  if (!iso) return "—";
  try { return new Date(new Date(iso).getTime() - 3 * 3600_000).toISOString().slice(11, 19) + " ART"; }
  catch { return "—"; }
}
async function getJSON<T>(url: string): Promise<T | null> {
  try { const r = await fetch(url, { cache: "no-store" }); return r.ok ? (await r.json()) as T : null; }
  catch { return null; }
}

export function OpsView() {
  // Filtros (elección del usuario) → persisten entre rutas con sessionStorage.
  const [moneda, setMoneda] = usePersistedState<Moneda>("ops.moneda", "ARS");
  const [segmento, setSegmento] = usePersistedState<string>("ops.segmento", "");
  const [segmentos, setSegmentos] = useState<string[]>([]);
  const [search, setSearch] = usePersistedState<string>("ops.search", "");
  const [cuentasList, setCuentasList] = useState<{ cuenta: string; denominacion: string }[]>([]);
  const [boletos, setBoletos] = useState<BoletoRow[]>([]);
  const [modo, setModo] = usePersistedState<Modo>("ops.modo", "ULTIMA");
  const [fechas, setFechas] = useState<FechaRow[]>([]);
  const [idx, setIdx] = useState(0);
  const [selOp, setSelOp] = useState<string | null>(null);
  const [selDenom, setSelDenom] = useState<string | null>(null);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [serie, setSerie] = useState<SerieRow[]>([]);
  const [porOp, setPorOp] = useState<OpRow[]>([]);
  const [porDenom, setPorDenom] = useState<DenomRow[]>([]);
  const [total, setTotal] = useState(0);

  const fechasAsc = useMemo(() => [...fechas].map((f) => f.fecha).sort(), [fechas]);
  const fecha = fechas[idx]?.fecha ?? "";
  const rangoFecha = useMemo(() => {
    if (!fechas.length) return { desde: "", hasta: "" };
    if (modo === "TODOS") return { desde: fechas[fechas.length - 1].fecha, hasta: fechas[0].fecha };
    return { desde: fecha, hasta: fecha };
  }, [modo, fecha, fechas]);

  const selQS = (selOp ? `&operacion=${encodeURIComponent(selOp)}` : "")
    + (selDenom ? `&denominacion=${encodeURIComponent(selDenom)}` : "")
    + (segmento ? `&segmento=${encodeURIComponent(segmento)}` : "");

  const cargarFechas = useCallback(async () => {
    const f = await getJSON<{ fechas: FechaRow[] }>("/api/operaciones/ops/fechas");
    setFechas(f?.fechas ?? []); setIdx(0);
  }, []);
  useEffect(() => { cargarFechas(); }, [cargarFechas]);
  useEffect(() => { if (modo === "ULTIMA") setIdx(0); }, [modo]);

  // Listas para filtros (una vez): segmentos + cuentas (buscador).
  useEffect(() => {
    (async () => {
      const s = await getJSON<{ segmentos: string[] }>("/api/operaciones/ops/segmentos");
      setSegmentos(s?.segmentos ?? []);
      const c = await getJSON<{ cuentas: { cuenta: string; denominacion: string }[] }>("/api/operaciones/ops/cuentas-list");
      setCuentasList(c?.cuentas ?? []);
    })();
  }, []);

  // Boletos del drill-down (cuando hay una denominación seleccionada).
  useEffect(() => {
    if (!selDenom || !fechas.length) { setBoletos([]); return; }
    (async () => {
      const d = await getJSON<{ boletos: BoletoRow[] }>(
        `/api/operaciones/ops/boletos?moneda=${moneda}&desde=${rangoFecha.desde}&hasta=${rangoFecha.hasta}`
        + `&denominacion=${encodeURIComponent(selDenom)}${segmento ? `&segmento=${encodeURIComponent(segmento)}` : ""}`,
      );
      setBoletos(d?.boletos ?? []);
    })();
  }, [selDenom, moneda, rangoFecha.desde, rangoFecha.hasta, segmento, fechas.length]);

  // Gráfico: serie por fecha (depende de moneda + selección cruzada).
  useEffect(() => {
    (async () => {
      const d = await getJSON<{ serie: SerieRow[] }>(`/api/operaciones/ops/serie?moneda=${moneda}${selQS}`);
      setSerie(d?.serie ?? []);
    })();
  }, [moneda, selQS]);

  // Meta + resumen (cross-filter) para el scope.
  useEffect(() => {
    if (!fechas.length) return;
    (async () => {
      const [mt, rs] = await Promise.all([
        modo === "TODOS" ? Promise.resolve(null)
          : getJSON<{ meta: Meta }>(`/api/operaciones/ops/meta?fecha=${fecha}`),
        getJSON<{ por_operacion: OpRow[]; por_denominacion: DenomRow[]; total: number }>(
          `/api/operaciones/ops/resumen?moneda=${moneda}&desde=${rangoFecha.desde}&hasta=${rangoFecha.hasta}${selQS}`,
        ),
      ]);
      setMeta(mt?.meta ?? null);
      setPorOp(rs?.por_operacion ?? []);
      setPorDenom(rs?.por_denominacion ?? []);
      setTotal(rs?.total ?? 0);
    })();
  }, [modo, fecha, moneda, rangoFecha.desde, rangoFecha.hasta, selQS, fechas.length]);

  // Drill abreviado: lo que operó la cuenta agrupado por instrumento (Σ bruto + n).
  const porInstrumento = useMemo(() => {
    const m = new Map<string, { instrumento: string; bruto: number; n: number }>();
    for (const b of boletos) {
      const k = b.instrumento || "—";
      const cur = m.get(k) ?? { instrumento: k, bruto: 0, n: 0 };
      cur.bruto += b.bruto ?? 0; cur.n += 1; m.set(k, cur);
    }
    return [...m.values()].sort((a, b) => b.bruto - a.bruto);
  }, [boletos]);

  const pickFecha = (picked: string) => {
    if (!picked) return;
    const snap = fechasAsc.includes(picked) ? picked : (fechasAsc.find((f) => f >= picked) ?? fechasAsc[fechasAsc.length - 1]);
    if (snap) { setModo("DIA"); setIdx(fechas.findIndex((f) => f.fecha === snap)); }
  };

  return (
    <div className="h-full flex flex-col min-h-0 overflow-hidden bg-[var(--t-panel)] text-[var(--t-text)]">
      {/* ── Filtros ───────────────────────────────────────────── */}
      <div className="flex items-center flex-wrap gap-2 px-4 py-2 border-b border-[var(--t-border)] shrink-0 text-[11px]">
        <div className="inline-flex border border-[var(--t-border-2)] divide-x divide-[var(--t-border-2)]">
          <button onClick={() => { setModo("DIA"); setIdx((i) => Math.min(i + 1, fechas.length - 1)); }} disabled={idx >= fechas.length - 1} className="px-2 py-0.5 text-[var(--t-text-dim)] hover:text-[var(--t-accent)] disabled:opacity-30">‹</button>
          <input type="date" value={fecha} min={fechasAsc[0] || undefined} max={fechasAsc[fechasAsc.length - 1] || undefined}
            disabled={!fechas.length} onChange={(e) => pickFecha(e.target.value)}
            className="bg-[var(--t-panel)] px-2 py-0.5 text-[12px] font-mono text-[var(--t-text)] outline-none [color-scheme:dark]" />
          <button onClick={() => { setModo("DIA"); setIdx((i) => Math.max(i - 1, 0)); }} disabled={idx <= 0} className="px-2 py-0.5 text-[var(--t-text-dim)] hover:text-[var(--t-accent)] disabled:opacity-30">›</button>
        </div>
        {(["ULTIMA","DIA","TODOS"] as Modo[]).map((m) => (
          <Pill key={m} active={modo === m} onClick={() => setModo(m)}>{m}</Pill>
        ))}
        <span className="font-mono text-[12px] text-[var(--t-accent)] mx-1">
          {modo === "TODOS" ? `${fmtFechaCorta(rangoFecha.desde)} → ${fmtFechaCorta(rangoFecha.hasta)}` : (fecha ? fmtFechaDisplay(fecha) : "—")}
        </span>
        <span className="text-[#333]">│</span>
        {meta && modo !== "TODOS" && (
          <span className="text-[10px] text-[var(--t-text-muted)] uppercase tracking-wider">
            Boletos: <span className="text-[var(--t-text)] font-mono">{meta.n_boletos}</span>
            {meta.ultima_ingesta && <> · Últ. ingesta: <span className="text-[var(--t-text)] font-mono">{formatTime(meta.ultima_ingesta)}</span></>}
          </span>
        )}
        {(selOp || selDenom) && (
          <button onClick={() => { setSelOp(null); setSelDenom(null); setSearch(""); }} className="text-[10px] text-[var(--t-accent)] border border-[var(--t-accent)] px-2 py-0.5">✕ filtro: {selOp || selDenom}</button>
        )}
        {/* Buscador por cuenta/denominación */}
        <input list="ops-cuentas" value={search}
          onChange={(e) => {
            const v = e.target.value; setSearch(v);
            const hit = cuentasList.find((c) => c.denominacion === v || c.cuenta === v);
            if (hit) { setSelDenom(hit.denominacion); setSelOp(null); }
          }}
          placeholder="Buscar cuenta…"
          className="bg-[var(--t-panel)] border border-[var(--t-border-2)] px-2 py-0.5 text-[11px] font-mono text-[var(--t-text)] outline-none w-[170px]" />
        <datalist id="ops-cuentas">
          {cuentasList.map((c) => <option key={c.cuenta} value={c.denominacion}>{c.cuenta}</option>)}
        </datalist>
        {/* Filtro de segmento (nivel 1) */}
        <select value={segmento} onChange={(e) => setSegmento(e.target.value)}
          className="bg-[var(--t-panel)] border border-[var(--t-border-2)] px-2 py-0.5 text-[11px] text-[var(--t-text)] outline-none [color-scheme:dark]">
          <option value="">Todos los segmentos</option>
          {segmentos.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <div className="ml-auto inline-flex border border-[var(--t-border-2)] divide-x divide-[var(--t-border-2)]">
          {(["ARS","USD"] as Moneda[]).map((m) => (
            <button key={m} onClick={() => setMoneda(m)} className={"px-3 py-0.5 text-[10px] uppercase tracking-wider " + (moneda === m ? "bg-[var(--t-accent)] text-[var(--t-on-accent)]" : "text-[var(--t-text-dim)] hover:text-[var(--t-accent)]")}>{m}</button>
          ))}
        </div>
        <button onClick={() => cargarFechas()} className="border border-[var(--t-border-2)] px-2 py-0.5 text-[10px] uppercase tracking-wider text-[var(--t-text-dim)] hover:text-[var(--t-accent)]">↻ Refresh</button>
      </div>

      {/* ── Cuerpo 50/50 ──────────────────────────────────────── */}
      <div className="flex-1 min-h-0 grid grid-cols-2 gap-3 p-3 overflow-hidden">
        {/* IZQUIERDA */}
        <div className="min-h-0 grid grid-rows-2 gap-3 overflow-hidden">
          {/* Σ por operacion */}
          <div className="min-h-0 border border-[var(--t-border)] flex flex-col overflow-hidden">
            <div className="flex items-center px-3 py-1.5 border-b border-[var(--t-border)] bg-[var(--t-accent)]/10 shrink-0">
              <span className="text-[10px] uppercase tracking-widest text-[var(--t-accent)]">Por operación</span>
              <span className="ml-auto text-[10px] font-mono text-[var(--t-text-dim)]">Σ {fmtCompact(total)} {moneda}</span>
            </div>
            <div className="flex-1 min-h-0 overflow-auto">
              <table className="w-full text-[11px] font-mono tabular-nums">
                <tbody>
                  {porOp.map((r) => {
                    const act = selOp === r.operacion;
                    return (
                      <tr key={r.operacion} onClick={() => { setSelOp(act ? null : r.operacion); setSelDenom(null); }}
                        className={"border-t border-[var(--t-border)] cursor-pointer " + (act ? "bg-[var(--t-accent)]/15 text-[var(--t-accent)]" : "hover:bg-[var(--t-surface-2)]")}>
                        <td className="px-3 py-1">{r.operacion}</td>
                        <td className="px-3 py-1 text-right font-semibold">{fmtCompact(r.bruto)}</td>
                        <td className="px-3 py-1 text-right text-[var(--t-text-dim)] w-12">{total ? ((r.bruto / total) * 100).toFixed(0) : "0"}%</td>
                      </tr>
                    );
                  })}
                  {!porOp.length && <tr><td className="px-3 py-3 text-[var(--t-text-muted)]">sin datos</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
          {/* Gráfico */}
          <OpsBarChart serie={serie} fmt={fmtCompact} unidad={moneda} defaultAgg="DIARIO"
            focoFecha={modo === "DIA" ? fecha : null}
            series={[{ key: "bruto", label: "Bruto", color: "var(--t-brand)" }]} />
        </div>

        {/* DERECHA: por denominacion, o boletos si hay una seleccionada */}
        <div className="min-h-0 border border-[var(--t-border)] flex flex-col overflow-hidden">
          {selDenom ? (
            <>
              <div className="flex items-center gap-2 px-3 py-1.5 border-b border-[var(--t-border)] bg-[var(--t-accent)]/10 shrink-0">
                <span className="text-[10px] uppercase tracking-widest text-[var(--t-accent)] truncate" title={selDenom}>Boletos · {selDenom}</span>
                <span className="ml-auto text-[10px] font-mono text-[var(--t-text-dim)]">{boletos.length}</span>
                <button onClick={() => { setSelDenom(null); setSearch(""); }} className="text-[var(--t-text-dim)] hover:text-[var(--t-accent)] text-[14px] leading-none" title="Volver">×</button>
              </div>
              <div className="flex-1 min-h-0 overflow-auto">
                <table className="w-full text-[10px] font-mono tabular-nums">
                  <thead className="sticky top-0 bg-[var(--t-panel)] text-[8px] uppercase tracking-widest text-[var(--t-text-muted)]">
                    <tr>
                      <th className="px-2 py-1 text-left border-b border-[var(--t-border)]">Instrumento</th>
                      <th className="px-2 py-1 text-right border-b border-[var(--t-border)]">Σ Bruto</th>
                      <th className="px-2 py-1 text-right border-b border-[var(--t-border)]">N</th>
                    </tr>
                  </thead>
                  <tbody>
                    {porInstrumento.map((r) => (
                      <tr key={r.instrumento} className="border-t border-[var(--t-border)] hover:bg-[var(--t-surface-2)]">
                        <td className="px-2 py-0.5 text-[var(--t-accent)] truncate max-w-[260px]" title={r.instrumento}>{r.instrumento}</td>
                        <td className="px-2 py-0.5 text-right text-[var(--t-text)] font-semibold">{fmtCompact(r.bruto)}</td>
                        <td className="px-2 py-0.5 text-right text-[var(--t-text-dim)]">{r.n}</td>
                      </tr>
                    ))}
                    {!porInstrumento.length && <tr><td className="px-3 py-3 text-[var(--t-text-muted)]">sin operaciones</td></tr>}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <div className="flex-1 min-h-0 overflow-auto">
              <table className="w-full text-[11px] font-mono tabular-nums">
                <thead className="sticky top-0 bg-[var(--t-accent)]/10 text-[9px] uppercase tracking-widest text-[var(--t-accent)]">
                  <tr>
                    <th className="px-3 py-1.5 text-left border-b border-[var(--t-border)]">Denominación</th>
                    <th className="px-3 py-1.5 text-right border-b border-[var(--t-border)]">Σ Bruto</th>
                    <th className="px-3 py-1.5 text-right border-b border-[var(--t-border)]">N</th>
                  </tr>
                </thead>
                <tbody>
                  {porDenom.map((r) => (
                    <tr key={r.denominacion} onClick={() => { setSelDenom(r.denominacion); setSelOp(null); }}
                      className="border-t border-[var(--t-border)] cursor-pointer hover:bg-[var(--t-surface-2)]">
                      <td className="px-3 py-1 truncate max-w-[320px]" title={r.denominacion}>{r.denominacion}</td>
                      <td className="px-3 py-1 text-right font-semibold">{fmtCompact(r.bruto)}</td>
                      <td className="px-3 py-1 text-right text-[var(--t-text-dim)]">{r.n}</td>
                    </tr>
                  ))}
                  {!porDenom.length && <tr><td className="px-3 py-3 text-[var(--t-text-muted)]">sin datos</td></tr>}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Pill({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick}
      className={"px-2 py-0.5 border text-[11px] font-semibold " + (active ? "bg-[var(--t-accent)] text-[var(--t-on-accent)] border-[var(--t-accent)]" : "bg-transparent text-[var(--t-text-dim)] border-[var(--t-border-2)] hover:text-[var(--t-accent)] hover:border-[var(--t-accent)]")}>
      {children}
    </button>
  );
}
