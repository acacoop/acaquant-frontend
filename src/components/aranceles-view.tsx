"use client";

// OPERACIONES → ARANCELES: mismo formato que Operaciones. Izq: Σ aranceles por
// nivel_3 (arriba) + gráfico (abajo, OpsBarChart). Der: Σ aranceles por cliente.
// Filtros: moneda, segmento (nivel_1), fechas. El gráfico trae la serie DIARIA
// y agrega/filtra en cliente (toolbar idéntico a OPERACIONES). Endpoint /ops/aranceles.

import { useEffect, useMemo, useState } from "react";
import { usePersistedState } from "@/lib/use-persisted-state";
import { OpsBarChart, type SerieRow } from "./ops-bar-chart";

type Moneda = "ARS" | "USD";
type Dim = "nivel3" | "operacion" | "operador";
type DimRow = { clave: string; arancel: number; n: number };
type CuentaRow = { denominacion: string; arancel: number; n: number };
type InstrRow = { instrumento: string; arancel: number; n: number };
type ArSerieRow = { periodo: string; arancel: number };
type Resp = { serie: ArSerieRow[]; por_dim: DimRow[]; por_cuenta: CuentaRow[]; por_instrumento: InstrRow[]; total: number };

const _DIMS: [Dim, string][] = [["nivel3", "NIVEL 3"], ["operacion", "OPERACIÓN"], ["operador", "OPERADOR"]];

function fmtCompact(n: number): string {
  if (n == null || Number.isNaN(n)) return "—";
  const a = Math.abs(n), s = n < 0 ? "-" : "";
  if (a >= 1e9) return s + (a / 1e9).toFixed(2) + "B";
  if (a >= 1e6) return s + (a / 1e6).toFixed(2) + "M";
  if (a >= 1e3) return s + (a / 1e3).toFixed(1) + "k";
  return s + a.toFixed(0);
}

const fmtFechaCorta = (s: string) => { const [y, m, d] = s.split("-"); return `${d}/${m}/${y.slice(-2)}`; };
// Límites de SEMANA/MES anclados en la última fecha con datos (no en hoy).
function lunesDeSemana(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const dow = dt.getUTCDay();
  dt.setUTCDate(dt.getUTCDate() - (dow === 0 ? 6 : dow - 1));
  return dt.toISOString().slice(0, 10);
}
const primerDiaMes = (iso: string) => iso.slice(0, 7) + "-01";

type Modo = "ULTIMA" | "SEMANA" | "MES" | "RANGO";

export function ArancelesView() {
  // El arancel es un solo valor SIEMPRE en pesos (no existe arancel en USD) → sin toggle.
  const moneda: Moneda = "ARS";
  // Filtros PERSISTIDOS (claves `ar.*`): sobreviven a navegar entre rutas y
  // habilitan la navegación asistida del guía (v1.82 — el panel escribe estas
  // mismas claves; ver api/services/copiloto/navegacion.py).
  const [segmento, setSegmento] = usePersistedState<string>("ar.segmento", "");
  const [segmentos, setSegmentos] = useState<string[]>([]);
  const [operador, setOperador] = usePersistedState<string>("ar.operador", "");
  const [operadores, setOperadores] = useState<{ operador_email: string; operador_nombre: string | null }[]>([]);
  const [dim, setDim] = usePersistedState<Dim>("ar.dim", "nivel3");
  const [selDim, setSelDim] = useState<string | null>(null);
  const [selCuenta, setSelCuenta] = useState<string | null>(null);
  const [selInstr, setSelInstr] = useState<string | null>(null);
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(false);
  const [modo, setModo] = usePersistedState<Modo>("ar.modo", "ULTIMA");
  const [rDesde, setRDesde] = usePersistedState<string>("ar.desde", "");
  const [rHasta, setRHasta] = usePersistedState<string>("ar.hasta", "");
  const [fechas, setFechas] = useState<{ fecha: string }[]>([]);
  const [meta, setMeta] = useState<{ n_boletos: number } | null>(null);
  // La serie del gráfico llega acotada a ~18m (perf). Al elegir "ALL" pedimos
  // la historia completa (serie_full) — el resto de los rangos entran en 18m.
  const [serieFull, setSerieFull] = useState(false);

  const fecha = fechas[0]?.fecha ?? "";   // ancla = fecha más reciente
  // Rango de DATOS (fechas viene DESC: [0]=última, [last]=primera). Los date inputs se
  // acotan a esto — NO uno al otro (eso deadlockeaba el hasta en modo ULTIMA).
  const minFecha = fechas.length ? fechas[fechas.length - 1].fecha : undefined;
  const maxFecha = fechas.length ? fechas[0].fecha : undefined;
  const rango = useMemo(() => {
    if (!fechas.length) return { desde: "", hasta: "" };
    const ultima = fechas[0].fecha;
    if (modo === "SEMANA") return { desde: lunesDeSemana(ultima), hasta: ultima };
    if (modo === "MES")    return { desde: primerDiaMes(ultima), hasta: ultima };
    if (modo === "RANGO")  return { desde: rDesde || ultima, hasta: rHasta || ultima };
    return { desde: ultima, hasta: ultima };  // ULTIMA = solo el último día
  }, [fechas, modo, rDesde, rHasta]);

  // Editar cualquiera de los dos date inputs salta a RANGO (sembrando el otro extremo).
  const onDesde = (v: string) => { setRHasta(rHasta || rango.hasta); setRDesde(v); setModo("RANGO"); };
  const onHasta = (v: string) => { setRDesde(rDesde || rango.desde); setRHasta(v); setModo("RANGO"); };

  useEffect(() => {
    (async () => {
      try {
        // 3 requests independientes → en paralelo (antes iban encadenadas).
        const [j, s, o] = await Promise.all([
          fetch("/api/operaciones/ops/fechas", { cache: "no-store" }).then((x) => x.ok ? x.json() : null).catch(() => null),
          fetch("/api/operaciones/ops/segmentos", { cache: "no-store" }).then((x) => x.ok ? x.json() : null).catch(() => null),
          fetch("/api/operaciones/comercial/operadores", { cache: "no-store" }).then((x) => x.ok ? x.json() : null).catch(() => null),
        ]);
        setFechas(j?.fechas ?? []);
        setSegmentos(s?.segmentos ?? []);
        setOperadores(Array.isArray(o) ? o : []);
      } catch { /* */ }
    })();
  }, []);

  useEffect(() => {
    if (modo !== "ULTIMA" || !fecha) { setMeta(null); return; }
    fetch(`/api/operaciones/ops/meta?fecha=${fecha}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null)).then((j) => setMeta(j?.meta ?? null)).catch(() => setMeta(null));
  }, [fecha, modo]);

  // Serie SIEMPRE DIARIA → el toolbar del gráfico agrega/filtra en cliente (no refetch).
  useEffect(() => {
    if (!rango.desde || !rango.hasta) return;
    setLoading(true);
    // Normalizar por si quedó desde > hasta (ahora los inputs son libres dentro del rango de datos).
    const [qDesde, qHasta] = rango.desde <= rango.hasta ? [rango.desde, rango.hasta] : [rango.hasta, rango.desde];
    const qs = `moneda=${moneda}&desde=${qDesde}&hasta=${qHasta}&agg=DIARIO&dim=${dim}`
      + (segmento ? `&segmento=${encodeURIComponent(segmento)}` : "")
      + (operador ? `&operador=${encodeURIComponent(operador)}` : "")
      + (selDim ? `&sel_dim=${encodeURIComponent(selDim)}` : "")
      + (selCuenta ? `&cuenta=${encodeURIComponent(selCuenta)}` : "")
      + (selInstr ? `&instrumento=${encodeURIComponent(selInstr)}` : "")
      + (serieFull ? "&serie_full=true" : "");
    fetch(`/api/operaciones/ops/aranceles?${qs}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null)).then(setData)
      .catch(() => setData(null)).finally(() => setLoading(false));
  }, [moneda, rango.desde, rango.hasta, segmento, operador, dim, selDim, selCuenta, selInstr, serieFull]);

  const chartSerie = useMemo<SerieRow[]>(
    () => (data?.serie ?? []).map((r) => ({ fecha: r.periodo, arancel: r.arancel })),
    [data],
  );
  const total = data?.total ?? 0;
  const dimRows = data?.por_dim ?? [];
  const cuentas = data?.por_cuenta ?? [];
  const instrumentos = data?.por_instrumento ?? [];

  return (
    <div className="h-full flex flex-col min-h-0 overflow-hidden bg-[var(--t-panel)] text-[var(--t-text)]">
      {/* Filtros — modelo ÚLTIMA/DÍA/TODOS (tablas del día; gráfico histórico) */}
      <div className="flex items-center flex-wrap gap-2 px-4 py-2 border-b border-[var(--t-border)] shrink-0 text-[11px]">
        {(["ULTIMA", "SEMANA", "MES", "RANGO"] as Modo[]).map((m) => (
          <button key={m} onClick={() => setModo(m)} className={"px-2 py-0.5 border text-[11px] font-semibold " + (modo === m ? "bg-[var(--t-accent)] text-[var(--t-on-accent)] border-[var(--t-accent)]" : "text-[var(--t-text-dim)] border-[var(--t-border-2)] hover:text-[var(--t-accent)]")}>{m}</button>
        ))}
        <div className="inline-flex items-center border border-[var(--t-border-2)] divide-x divide-[var(--t-border-2)]">
          <input type="date" value={rango.desde} min={minFecha} max={maxFecha} disabled={!fechas.length}
            onChange={(e) => onDesde(e.target.value)}
            className="bg-[var(--t-panel)] px-2 py-0.5 text-[12px] font-mono text-[var(--t-text)] outline-none [color-scheme:dark]" />
          <span className="px-1 text-[var(--t-text-dim)]">→</span>
          <input type="date" value={rango.hasta} min={minFecha} max={maxFecha} disabled={!fechas.length}
            onChange={(e) => onHasta(e.target.value)}
            className="bg-[var(--t-panel)] px-2 py-0.5 text-[12px] font-mono text-[var(--t-text)] outline-none [color-scheme:dark]" />
        </div>
        <span className="font-mono text-[12px] text-[var(--t-accent)] mx-1">
          {modo === "ULTIMA" ? (fecha || "—") : `${fmtFechaCorta(rango.desde)} → ${fmtFechaCorta(rango.hasta)}`}
        </span>
        {meta && modo === "ULTIMA" && (
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
        <select value={operador} onChange={(e) => setOperador(e.target.value)}
          className="bg-[var(--t-surface)] border border-[var(--t-border-2)] text-[11px] px-2 py-0.5 outline-none [color-scheme:dark] max-w-[200px]">
          <option value="">Todos los operadores</option>
          {operadores.map((o) => <option key={o.operador_email} value={o.operador_email}>{o.operador_nombre || o.operador_email}</option>)}
        </select>
        <span className="text-[10px] uppercase tracking-wider text-[var(--t-text-muted)]">Aranceles en pesos</span>
        {(selDim || selCuenta || selInstr) && (
          <button onClick={() => { setSelDim(null); setSelCuenta(null); setSelInstr(null); }}
            className="text-[10px] text-[var(--t-accent)] border border-[var(--t-accent)] px-2 py-0.5">✕ limpiar filtros</button>
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
                <button key={k} onClick={() => { setDim(k); setSelDim(null); }}
                  className={"px-1.5 py-0.5 text-[9px] uppercase tracking-wider border " + (dim === k ? "border-[var(--t-accent)] text-[var(--t-accent)]" : "border-[var(--t-border-2)] text-[var(--t-text-dim)] hover:text-[var(--t-accent)]")}>{lbl}</button>
              ))}
              <span className="ml-auto text-[10px] font-mono text-[var(--t-text-dim)]">Σ {fmtCompact(total)} {moneda}</span>
            </div>
            <div className="flex-1 min-h-0 overflow-auto">
              <table className="w-full text-[11px] font-mono tabular-nums">
                <tbody>
                  {dimRows.map((r) => {
                    const act = selDim === r.clave;
                    return (
                      <tr key={r.clave} onClick={() => setSelDim(act ? null : r.clave)}
                        className={"border-t border-[var(--t-border)] cursor-pointer " + (act ? "bg-[var(--t-accent)]/15" : "hover:bg-[var(--t-surface-2)]")}>
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
            titulo="Aranceles"
            focoFecha={modo === "ULTIMA" ? fecha : null} onAllSelected={() => setSerieFull(true)}
            series={[{ key: "arancel", label: "Aranceles", color: "var(--t-brand)" }]} />
        </div>

        {/* DERECHA: 50% por cliente (arriba) + 50% por instrumento (abajo) */}
        <div className="min-h-0 grid grid-rows-2 gap-3 overflow-hidden">
          {/* ARRIBA: por cliente */}
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
                      <tr key={r.denominacion} onClick={() => setSelCuenta(act ? null : r.denominacion)}
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
          {/* ABAJO: por instrumento */}
          <div className="min-h-0 border border-[var(--t-border)] flex flex-col overflow-hidden">
            <div className="flex items-center px-3 py-1.5 border-b border-[var(--t-border)] bg-[var(--t-accent)]/10 shrink-0">
              <span className="text-[10px] uppercase tracking-widest text-[var(--t-accent)]">Por instrumento</span>
              <span className="ml-auto text-[10px] font-mono text-[var(--t-text-dim)]">{instrumentos.length} · Σ {fmtCompact(total)} {moneda}</span>
            </div>
            <div className="flex-1 min-h-0 overflow-auto">
              <table className="w-full text-[11px] font-mono tabular-nums">
                <thead className="sticky top-0 bg-[var(--t-panel)] text-[9px] uppercase tracking-widest text-[var(--t-text-muted)]">
                  <tr>
                    <th className="px-3 py-1.5 text-left border-b border-[var(--t-border)]">Instrumento</th>
                    <th className="px-3 py-1.5 text-right border-b border-[var(--t-border)]">Aranceles</th>
                    <th className="px-3 py-1.5 text-right border-b border-[var(--t-border)]">N</th>
                  </tr>
                </thead>
                <tbody>
                  {instrumentos.map((r) => {
                    const act = selInstr === r.instrumento;
                    return (
                      <tr key={r.instrumento} onClick={() => setSelInstr(act ? null : r.instrumento)}
                        className={"border-t border-[var(--t-border)] cursor-pointer " + (act ? "bg-[var(--t-accent)]/15" : "hover:bg-[var(--t-surface-2)]")}>
                        <td className="px-3 py-1 truncate max-w-[320px]" title={r.instrumento}>{r.instrumento}</td>
                        <td className="px-3 py-1 text-right font-semibold">{fmtCompact(r.arancel)}</td>
                        <td className="px-3 py-1 text-right text-[var(--t-text-dim)]">{r.n}</td>
                      </tr>
                    );
                  })}
                  {!instrumentos.length && <tr><td className="px-3 py-3 text-[var(--t-text-muted)]">sin datos</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
