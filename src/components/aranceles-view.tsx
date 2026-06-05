"use client";

// OPERACIONES → ARANCELES: mismo formato que Operaciones. Izq: Σ aranceles por
// nivel_3 (arriba) + gráfico (abajo, OpsBarChart). Der: Σ aranceles por cliente.
// Filtros: moneda, segmento (nivel_1), fechas. El gráfico trae la serie DIARIA
// y agrega/filtra en cliente (toolbar idéntico a OPERACIONES). Endpoint /ops/aranceles.

import { useEffect, useMemo, useState } from "react";
import { OpsBarChart, type SerieRow } from "./ops-bar-chart";

type Moneda = "ARS" | "USD";
type Dim = "nivel3" | "operacion" | "operador";
type DimRow = { clave: string; arancel: number; n: number };
type CuentaRow = { denominacion: string; arancel: number; n: number };
type ArSerieRow = { periodo: string; arancel: number };
type Resp = { serie: ArSerieRow[]; por_dim: DimRow[]; por_cuenta: CuentaRow[]; total: number };

const _DIMS: [Dim, string][] = [["nivel3", "NIVEL 3"], ["operacion", "OPERACIÓN"], ["operador", "OPERADOR"]];

function fmtCompact(n: number): string {
  if (n == null || Number.isNaN(n)) return "—";
  const a = Math.abs(n), s = n < 0 ? "-" : "";
  if (a >= 1e9) return s + (a / 1e9).toFixed(2) + "B";
  if (a >= 1e6) return s + (a / 1e6).toFixed(2) + "M";
  if (a >= 1e3) return s + (a / 1e3).toFixed(1) + "k";
  return s + a.toFixed(0);
}

type Modo = "ULTIMA" | "DIA" | "TODOS";

export function ArancelesView() {
  const [moneda, setMoneda] = useState<Moneda>("ARS");
  const [segmento, setSegmento] = useState("");
  const [segmentos, setSegmentos] = useState<string[]>([]);
  const [dim, setDim] = useState<Dim>("nivel3");
  const [selN3, setSelN3] = useState<string | null>(null);
  const [selCuenta, setSelCuenta] = useState<string | null>(null);
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(false);
  const [modo, setModo] = useState<Modo>("ULTIMA");
  const [fechas, setFechas] = useState<{ fecha: string }[]>([]);
  const [idx, setIdx] = useState(0);
  const [meta, setMeta] = useState<{ n_boletos: number } | null>(null);
  // La serie del gráfico llega acotada a ~18m (perf). Al elegir "ALL" pedimos
  // la historia completa (serie_full) — el resto de los rangos entran en 18m.
  const [serieFull, setSerieFull] = useState(false);

  const fecha = fechas[idx]?.fecha ?? "";
  const rango = useMemo(() => {
    if (!fechas.length) return { desde: "", hasta: "" };
    if (modo === "TODOS") return { desde: fechas[fechas.length - 1].fecha, hasta: fechas[0].fecha };
    return { desde: fecha, hasta: fecha };
  }, [fechas, modo, fecha]);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/operaciones/ops/fechas", { cache: "no-store" });
        const j = r.ok ? await r.json() : null;
        setFechas(j?.fechas ?? []);
        const s = await fetch("/api/operaciones/ops/segmentos", { cache: "no-store" }).then((x) => x.ok ? x.json() : null).catch(() => null);
        setSegmentos(s?.segmentos ?? []);
      } catch { /* */ }
    })();
  }, []);

  useEffect(() => { if (modo === "ULTIMA") setIdx(0); }, [modo]);

  useEffect(() => {
    if (modo === "TODOS" || !fecha) { setMeta(null); return; }
    fetch(`/api/operaciones/ops/meta?fecha=${fecha}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null)).then((j) => setMeta(j?.meta ?? null)).catch(() => setMeta(null));
  }, [fecha, modo]);

  // Serie SIEMPRE DIARIA → el toolbar del gráfico agrega/filtra en cliente (no refetch).
  useEffect(() => {
    if (!rango.desde || !rango.hasta) return;
    setLoading(true);
    const qs = `moneda=${moneda}&desde=${rango.desde}&hasta=${rango.hasta}&agg=DIARIO&dim=${dim}`
      + (segmento ? `&segmento=${encodeURIComponent(segmento)}` : "")
      + (selN3 ? `&nivel3=${encodeURIComponent(selN3)}` : "")
      + (selCuenta ? `&cuenta=${encodeURIComponent(selCuenta)}` : "")
      + (serieFull ? "&serie_full=true" : "");
    fetch(`/api/operaciones/ops/aranceles?${qs}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null)).then(setData)
      .catch(() => setData(null)).finally(() => setLoading(false));
  }, [moneda, rango.desde, rango.hasta, segmento, dim, selN3, selCuenta, serieFull]);

  const chartSerie = useMemo<SerieRow[]>(
    () => (data?.serie ?? []).map((r) => ({ fecha: r.periodo, arancel: r.arancel })),
    [data],
  );
  const total = data?.total ?? 0;
  const dimRows = data?.por_dim ?? [];
  const cuentas = data?.por_cuenta ?? [];

  return (
    <div className="h-full flex flex-col min-h-0 overflow-hidden bg-[var(--t-panel)] text-[var(--t-text)]">
      {/* Filtros — modelo ÚLTIMA/DÍA/TODOS (tablas del día; gráfico histórico) */}
      <div className="flex items-center flex-wrap gap-2 px-4 py-2 border-b border-[var(--t-border)] shrink-0 text-[11px]">
        <div className="inline-flex border border-[var(--t-border-2)] divide-x divide-[var(--t-border-2)]">
          <button onClick={() => { setModo("DIA"); setIdx((i) => Math.min(i + 1, fechas.length - 1)); }} disabled={idx >= fechas.length - 1} className="px-2 py-0.5 text-[var(--t-text-dim)] hover:text-[var(--t-accent)] disabled:opacity-30">‹</button>
          <button onClick={() => { setModo("DIA"); setIdx((i) => Math.max(i - 1, 0)); }} disabled={idx <= 0} className="px-2 py-0.5 text-[var(--t-text-dim)] hover:text-[var(--t-accent)] disabled:opacity-30">›</button>
        </div>
        {(["ULTIMA", "DIA", "TODOS"] as Modo[]).map((m) => (
          <button key={m} onClick={() => setModo(m)} className={"px-2 py-0.5 border text-[11px] font-semibold " + (modo === m ? "bg-[var(--t-accent)] text-[var(--t-on-accent)] border-[var(--t-accent)]" : "text-[var(--t-text-dim)] border-[var(--t-border-2)] hover:text-[var(--t-accent)]")}>{m}</button>
        ))}
        <span className="font-mono text-[12px] text-[var(--t-accent)] mx-1">
          {modo === "TODOS" ? "histórico" : (fecha || "—")}
        </span>
        {meta && modo !== "TODOS" && (
          <><span className="text-[#333]">│</span>
          <span className="text-[10px] text-[var(--t-text-muted)] uppercase tracking-wider">
            Boletos: <span className="text-[var(--t-text)] font-mono">{meta.n_boletos}</span>
          </span></>
        )}
        <select value={segmento} onChange={(e) => setSegmento(e.target.value)}
          className="bg-[var(--t-surface)] border border-[var(--t-border-2)] text-[11px] px-2 py-0.5 outline-none [color-scheme:dark]">
          <option value="">Todos los segmentos</option>
          {segmentos.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <div className="inline-flex border border-[var(--t-border-2)] divide-x divide-[var(--t-border-2)]">
          {(["ARS", "USD"] as Moneda[]).map((m) => (
            <button key={m} onClick={() => setMoneda(m)} className={"px-3 py-0.5 text-[10px] uppercase tracking-wider " + (moneda === m ? "bg-[var(--t-accent)] text-[var(--t-on-accent)]" : "text-[var(--t-text-dim)] hover:text-[var(--t-accent)]")}>{m}</button>
          ))}
        </div>
        {(selN3 || selCuenta) && (
          <button onClick={() => { setSelN3(null); setSelCuenta(null); }} className="text-[10px] text-[var(--t-accent)] border border-[var(--t-accent)] px-2 py-0.5">✕ {selN3 || selCuenta}</button>
        )}
        <span className="ml-auto text-[10px] font-mono text-[var(--t-text-dim)]">
          TOTAL: <span className="text-[var(--t-text)] font-semibold">{fmtCompact(total)} {moneda}</span>{loading ? " · cargando…" : ""}
        </span>
      </div>

      {/* Cuerpo 50/50 */}
      <div className="flex-1 min-h-0 grid grid-cols-2 gap-3 p-3 overflow-hidden">
        {/* IZQUIERDA: nivel_3 (arriba) + gráfico (abajo) — tamaños FIJOS */}
        <div className="min-h-0 grid grid-rows-2 gap-3 overflow-hidden">
          <div className="min-h-0 border border-[var(--t-border)] flex flex-col overflow-hidden">
            <div className="flex items-center gap-1 px-3 py-1.5 border-b border-[var(--t-border)] bg-[var(--t-accent)]/10 shrink-0">
              <span className="text-[10px] uppercase tracking-widest text-[var(--t-text-muted)] mr-1">Por</span>
              {_DIMS.map(([k, lbl]) => (
                <button key={k} onClick={() => { setDim(k); setSelN3(null); setSelCuenta(null); }}
                  className={"px-1.5 py-0.5 text-[9px] uppercase tracking-wider border " + (dim === k ? "border-[var(--t-accent)] text-[var(--t-accent)]" : "border-[var(--t-border-2)] text-[var(--t-text-dim)] hover:text-[var(--t-accent)]")}>{lbl}</button>
              ))}
              <span className="ml-auto text-[10px] font-mono text-[var(--t-text-dim)]">Σ {fmtCompact(total)} {moneda}</span>
            </div>
            <div className="flex-1 min-h-0 overflow-auto">
              <table className="w-full text-[11px] font-mono tabular-nums">
                <tbody>
                  {dimRows.map((r) => {
                    // El cross-filter (selN3 → filtra "por cliente") solo aplica en NIVEL 3.
                    const clickable = dim === "nivel3";
                    const act = clickable && selN3 === r.clave;
                    return (
                      <tr key={r.clave} onClick={clickable ? () => { setSelN3(act ? null : r.clave); setSelCuenta(null); } : undefined}
                        className={"border-t border-[var(--t-border)] " + (clickable ? "cursor-pointer " : "") + (act ? "bg-[var(--t-accent)]/15" : clickable ? "hover:bg-[var(--t-surface-2)]" : "")}>
                        <td className="px-3 py-1 truncate max-w-[220px]" title={r.clave}>{r.clave}</td>
                        <td className="px-3 py-1 text-right font-semibold">{fmtCompact(r.arancel)}</td>
                        <td className="px-3 py-1 text-right text-[var(--t-text-dim)] w-12">{total ? ((r.arancel / total) * 100).toFixed(0) : "0"}%</td>
                      </tr>
                    );
                  })}
                  {!dimRows.length && <tr><td className="px-3 py-3 text-[var(--t-text-muted)]">sin datos</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
          <OpsBarChart serie={chartSerie} fmt={fmtCompact} unidad={moneda} defaultAgg="MENSUAL"
            focoFecha={modo === "DIA" ? fecha : null} onAllSelected={() => setSerieFull(true)}
            series={[{ key: "arancel", label: "Aranceles", color: "var(--t-brand)" }]} />
        </div>

        {/* DERECHA: por cliente */}
        <div className="min-h-0 border border-[var(--t-border)] flex flex-col overflow-hidden">
          <div className="flex items-center px-3 py-1.5 border-b border-[var(--t-border)] bg-[var(--t-accent)]/10 shrink-0">
            <span className="text-[10px] uppercase tracking-widest text-[var(--t-accent)]">Por cliente</span>
            <span className="ml-auto text-[10px] font-mono text-[var(--t-text-dim)]">{cuentas.length} · Σ {fmtCompact(total)} {moneda}</span>
          </div>
          <div className="flex-1 min-h-0 overflow-auto">
            <table className="w-full text-[11px] font-mono tabular-nums">
              <thead className="sticky top-0 bg-[var(--t-panel)] text-[9px] uppercase tracking-widest text-[var(--t-text-muted)]">
                <tr>
                  <th className="px-3 py-1.5 text-left border-b border-[var(--t-border)]">Cliente</th>
                  <th className="px-3 py-1.5 text-right border-b border-[var(--t-border)]">Aranceles</th>
                  <th className="px-3 py-1.5 text-right border-b border-[var(--t-border)]">N</th>
                </tr>
              </thead>
              <tbody>
                {cuentas.map((r) => {
                  const act = selCuenta === r.denominacion;
                  return (
                    <tr key={r.denominacion} onClick={() => { setSelCuenta(act ? null : r.denominacion); setSelN3(null); }}
                      className={"border-t border-[var(--t-border)] cursor-pointer " + (act ? "bg-[var(--t-accent)]/15" : "hover:bg-[var(--t-surface-2)]")}>
                      <td className="px-3 py-1 truncate max-w-[320px]" title={r.denominacion}>{r.denominacion}</td>
                      <td className="px-3 py-1 text-right font-semibold">{fmtCompact(r.arancel)}</td>
                      <td className="px-3 py-1 text-right text-[var(--t-text-dim)]">{r.n}</td>
                    </tr>
                  );
                })}
                {!cuentas.length && <tr><td className="px-3 py-3 text-[var(--t-text-muted)]">sin datos</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
