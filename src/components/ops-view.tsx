"use client";

// OPERACIONES → MOVIMIENTOS sobre CashFlow.Operaciones.
// Izq 50%: arriba Σbruto por operacion, abajo gráfico Σbruto por fecha (OpsBarChart,
// toolbar rango + agg + foco día + maximizar). Der 50%: Σbruto por denominacion.
// Interactivo: elegir una operacion o una denominacion filtra la otra tabla + el
// gráfico. Excluye los "Cierre" (server-side). Filtro de moneda (campo `moneda`).

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePersistedState } from "@/lib/use-persisted-state";
import { OpsBarChart, type SerieRow } from "./ops-bar-chart";

type Moneda = "ARS" | "USD" | "USD_DOL";
type Modo = "ULTIMA" | "SEMANA" | "MES" | "RANGO";

type FechaRow = { fecha: string; n: number };
type OpRow = { operacion: string; bruto: number; n: number };
type DenomRow = { denominacion: string; bruto: number; n: number };
type Meta = { n_boletos: number; ultima_ingesta: string | null };
type InstrRow = { instrumento: string; bruto: number; n: number };

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

// Etiqueta del botón de moneda y unidad mostrada. USD_DOL = volumen dolarizado
// (ARS+USD convertidos a USD con el mep de cada boleto) → la unidad sigue siendo USD.
const MONEDA_LABEL: Record<Moneda, string> = { ARS: "ARS", USD: "USD", USD_DOL: "DOLARIZAR" };
const MONEDA_UNIDAD: Record<Moneda, string> = { ARS: "ARS", USD: "USD", USD_DOL: "USD" };

// Límites de SEMANA/MES, anclados en la fecha más reciente con datos (no en hoy:
// si el mercado no operó hoy, "actual" = la última semana/mes con operaciones).
function lunesDeSemana(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const dow = dt.getUTCDay();                       // 0=Dom … 6=Sáb
  dt.setUTCDate(dt.getUTCDate() - (dow === 0 ? 6 : dow - 1));  // retrocede al lunes
  return dt.toISOString().slice(0, 10);
}
const primerDiaMes = (iso: string) => iso.slice(0, 7) + "-01";
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
  const [mercado, setMercado] = usePersistedState<string>("ops.mercado", "");
  const [mercados, setMercados] = useState<string[]>([]);
  const [operador, setOperador] = usePersistedState<string>("ops.operador", "");
  const [operadores, setOperadores] = useState<{ operador_email: string; operador_nombre: string | null; n_cuentas?: number }[]>([]);
  const [search, setSearch] = usePersistedState<string>("ops.search", "");
  const [cuentasList, setCuentasList] = useState<{ cuenta: string; denominacion: string }[]>([]);
  const [modo, setModo] = usePersistedState<Modo>("ops.modo", "ULTIMA");
  // Rango custom (modo RANGO). Vacío = se cae al ancla (última fecha con datos).
  const [rDesde, setRDesde] = usePersistedState<string>("ops.desde", "");
  const [rHasta, setRHasta] = usePersistedState<string>("ops.hasta", "");
  const [fechas, setFechas] = useState<FechaRow[]>([]);
  const [selOp, setSelOp] = useState<string | null>(null);
  const [selDenom, setSelDenom] = useState<string | null>(null);
  const [selInstr, setSelInstr] = useState<string | null>(null);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [serie, setSerie] = useState<SerieRow[]>([]);
  const [porOp, setPorOp] = useState<OpRow[]>([]);
  const [porDenom, setPorDenom] = useState<DenomRow[]>([]);
  const [porInstr, setPorInstr] = useState<InstrRow[]>([]);
  const [total, setTotal] = useState(0);

  const fechasAsc = useMemo(() => [...fechas].map((f) => f.fecha).sort(), [fechas]);
  const fecha = fechas[0]?.fecha ?? "";   // ancla = fecha más reciente (fechas viene desc)
  const rangoFecha = useMemo(() => {
    if (!fechas.length) return { desde: "", hasta: "" };
    const ultima = fechas[0].fecha;
    if (modo === "SEMANA") return { desde: lunesDeSemana(ultima), hasta: ultima };
    if (modo === "MES")    return { desde: primerDiaMes(ultima), hasta: ultima };
    if (modo === "RANGO")  return { desde: rDesde || ultima, hasta: rHasta || ultima };
    return { desde: ultima, hasta: ultima };  // ULTIMA = solo el último día
  }, [modo, fechas, rDesde, rHasta]);

  // Editar cualquiera de los dos date inputs salta a modo RANGO, sembrando el
  // otro extremo con el valor vigente del rango actual (así no queda a medias).
  const onDesde = (v: string) => { setRHasta(rHasta || rangoFecha.hasta); setRDesde(v); setModo("RANGO"); };
  const onHasta = (v: string) => { setRDesde(rDesde || rangoFecha.desde); setRHasta(v); setModo("RANGO"); };

  const selQS = (selOp ? `&operacion=${encodeURIComponent(selOp)}` : "")
    + (selDenom ? `&denominacion=${encodeURIComponent(selDenom)}` : "")
    + (selInstr ? `&instrumento=${encodeURIComponent(selInstr)}` : "")
    + (segmento ? `&segmento=${encodeURIComponent(segmento)}` : "")
    + (mercado ? `&mercado=${encodeURIComponent(mercado)}` : "")
    + (operador ? `&operador=${encodeURIComponent(operador)}` : "");

  const cargarFechas = useCallback(async () => {
    const f = await getJSON<{ fechas: FechaRow[] }>("/api/operaciones/ops/fechas");
    setFechas(f?.fechas ?? []);
  }, []);
  useEffect(() => { cargarFechas(); }, [cargarFechas]);

  // Listas para filtros (una vez): segmentos + cuentas (buscador).
  useEffect(() => {
    (async () => {
      const s = await getJSON<{ segmentos: string[] }>("/api/operaciones/ops/segmentos");
      setSegmentos(s?.segmentos ?? []);
      const m = await getJSON<{ mercados: string[] }>("/api/operaciones/ops/mercados");
      setMercados(m?.mercados ?? []);
      const c = await getJSON<{ cuentas: { cuenta: string; denominacion: string }[] }>("/api/operaciones/ops/cuentas-list");
      setCuentasList(c?.cuentas ?? []);
      const ops = await getJSON<{ operador_email: string; operador_nombre: string | null; n_cuentas?: number }[]>("/api/operaciones/comercial/operadores");
      setOperadores(Array.isArray(ops) ? ops : []);
    })();
  }, []);

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
        modo === "ULTIMA"
          ? getJSON<{ meta: Meta }>(`/api/operaciones/ops/meta?fecha=${fecha}`)
          : Promise.resolve(null),
        getJSON<{ por_operacion: OpRow[]; por_denominacion: DenomRow[]; por_instrumento: InstrRow[]; total: number }>(
          `/api/operaciones/ops/resumen?moneda=${moneda}&desde=${rangoFecha.desde}&hasta=${rangoFecha.hasta}${selQS}`,
        ),
      ]);
      setMeta(mt?.meta ?? null);
      setPorOp(rs?.por_operacion ?? []);
      setPorDenom(rs?.por_denominacion ?? []);
      setPorInstr(rs?.por_instrumento ?? []);
      setTotal(rs?.total ?? 0);
    })();
  }, [modo, fecha, moneda, rangoFecha.desde, rangoFecha.hasta, selQS, fechas.length]);

  // Elegir una cuenta = TODO se adapta a esa cuenta. "Por operación", "Por título"
  // y el gráfico ya filtran por denominacion (backend); acá colapsamos "Por cuenta"
  // a esa sola fila para que quede a la vista (antes se perdía en el scroll).
  const denomRows = useMemo(
    () => (selDenom ? porDenom.filter((r) => r.denominacion === selDenom) : porDenom),
    [porDenom, selDenom],
  );
  const denomTotal = useMemo(
    () => (selDenom ? denomRows.reduce((a, r) => a + r.bruto, 0) : total),
    [denomRows, selDenom, total],
  );

  return (
    <div className="h-full flex flex-col min-h-0 overflow-hidden bg-[var(--t-panel)] text-[var(--t-text)]">
      {/* ── Filtros ───────────────────────────────────────────── */}
      <div className="flex items-center flex-wrap gap-2 px-4 py-2 border-b border-[var(--t-border)] shrink-0 text-[11px]">
        {(["ULTIMA","SEMANA","MES","RANGO"] as Modo[]).map((m) => (
          <Pill key={m} active={modo === m} onClick={() => setModo(m)}>{m}</Pill>
        ))}
        <div className="inline-flex items-center border border-[var(--t-border-2)] divide-x divide-[var(--t-border-2)]">
          <input type="date" value={rangoFecha.desde} max={rangoFecha.hasta || fechasAsc[fechasAsc.length - 1] || undefined}
            disabled={!fechas.length} onChange={(e) => onDesde(e.target.value)}
            className="bg-[var(--t-panel)] px-2 py-0.5 text-[12px] font-mono text-[var(--t-text)] outline-none [color-scheme:dark]" />
          <span className="px-1 text-[var(--t-text-dim)]">→</span>
          <input type="date" value={rangoFecha.hasta} min={rangoFecha.desde || undefined} max={fechasAsc[fechasAsc.length - 1] || undefined}
            disabled={!fechas.length} onChange={(e) => onHasta(e.target.value)}
            className="bg-[var(--t-panel)] px-2 py-0.5 text-[12px] font-mono text-[var(--t-text)] outline-none [color-scheme:dark]" />
        </div>
        <span className="font-mono text-[12px] text-[var(--t-accent)] mx-1">
          {modo === "ULTIMA" ? (fecha ? fmtFechaDisplay(fecha) : "—") : `${fmtFechaCorta(rangoFecha.desde)} → ${fmtFechaCorta(rangoFecha.hasta)}`}
        </span>
        <span className="text-[#333]">│</span>
        {meta && modo === "ULTIMA" && (
          <span className="text-[10px] text-[var(--t-text-muted)] uppercase tracking-wider">
            Boletos: <span className="text-[var(--t-text)] font-mono">{meta.n_boletos}</span>
            {meta.ultima_ingesta && <> · Últ. ingesta: <span className="text-[var(--t-text)] font-mono">{formatTime(meta.ultima_ingesta)}</span></>}
          </span>
        )}
        {/* Filtros cruzados activos: se ACUMULAN (cuenta + op + título). Cada chip
            se saca solo, sin borrar los otros → podés ver "qué operó tal cuenta". */}
        {selDenom && <FiltroChip label={`cuenta: ${selDenom}`} onClear={() => { setSelDenom(null); setSearch(""); }} />}
        {selOp && <FiltroChip label={`op: ${selOp}`} onClear={() => setSelOp(null)} />}
        {selInstr && <FiltroChip label={`título: ${selInstr}`} onClear={() => setSelInstr(null)} />}
        {/* Buscador por cuenta/denominación */}
        <input list="ops-cuentas" value={search}
          onChange={(e) => {
            const v = e.target.value; setSearch(v);
            const hit = cuentasList.find((c) => c.denominacion === v || c.cuenta === v);
            if (hit) setSelDenom(hit.denominacion);  // acumula con el resto de filtros
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
        {/* Filtro de mercado (campo `mercado`, ej. A3) */}
        <select value={mercado} onChange={(e) => setMercado(e.target.value)}
          className="bg-[var(--t-panel)] border border-[var(--t-border-2)] px-2 py-0.5 text-[11px] text-[var(--t-text)] outline-none [color-scheme:dark]">
          <option value="">Todos los mercados</option>
          {mercados.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
        {/* Filtro de operador (operador_email → cuentas de ese operador) */}
        <select value={operador} onChange={(e) => setOperador(e.target.value)}
          className="bg-[var(--t-panel)] border border-[var(--t-border-2)] px-2 py-0.5 text-[11px] text-[var(--t-text)] outline-none [color-scheme:dark] max-w-[200px]">
          <option value="">Todos los operadores</option>
          {operadores.map((o) => <option key={o.operador_email} value={o.operador_email}>{(o.operador_nombre || o.operador_email) + (o.n_cuentas ? ` (${o.n_cuentas})` : "")}</option>)}
        </select>
        <div className="ml-auto inline-flex border border-[var(--t-border-2)] divide-x divide-[var(--t-border-2)]">
          {(["ARS","USD","USD_DOL"] as Moneda[]).map((m) => (
            <button key={m} onClick={() => setMoneda(m)} className={"px-3 py-0.5 text-[10px] uppercase tracking-wider " + (moneda === m ? "bg-[var(--t-accent)] text-[var(--t-on-accent)]" : "text-[var(--t-text-dim)] hover:text-[var(--t-accent)]")}>{MONEDA_LABEL[m]}</button>
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
              <span className="ml-auto text-[10px] font-mono text-[var(--t-text-dim)]">Σ {fmtCompact(total)} {MONEDA_UNIDAD[moneda]}</span>
            </div>
            <div className="flex-1 min-h-0 overflow-auto">
              <table className="w-full text-[11px] font-mono tabular-nums">
                <thead className="sticky top-0 bg-[var(--t-panel)] text-[9px] uppercase tracking-widest text-[var(--t-text-muted)]">
                  <tr>
                    <th className="px-3 py-1.5 text-left border-b border-[var(--t-border)]">Operación</th>
                    <th className="px-3 py-1.5 text-right border-b border-[var(--t-border)]">Σ Bruto</th>
                    <th className="px-3 py-1.5 text-right border-b border-[var(--t-border)]">Boletos</th>
                    <th className="px-3 py-1.5 text-right border-b border-[var(--t-border)]">Prom./boleto</th>
                    <th className="px-3 py-1.5 text-right border-b border-[var(--t-border)]">%</th>
                  </tr>
                </thead>
                <tbody>
                  {porOp.map((r) => {
                    const act = selOp === r.operacion;
                    return (
                      <tr key={r.operacion} onClick={() => setSelOp(act ? null : r.operacion)}
                        className={"border-t border-[var(--t-border)] cursor-pointer " + (act ? "bg-[var(--t-accent)]/15 text-[var(--t-accent)]" : "hover:bg-[var(--t-surface-2)]")}>
                        <td className="px-3 py-1">{r.operacion}</td>
                        <td className="px-3 py-1 text-right font-semibold">{fmtCompact(r.bruto)}</td>
                        <td className="px-3 py-1 text-right text-[var(--t-text-dim)]">{r.n.toLocaleString("es-AR")}</td>
                        <td className="px-3 py-1 text-right text-[var(--t-text-dim)]">{r.n ? fmtCompact(r.bruto / r.n) : "—"}</td>
                        <td className="px-3 py-1 text-right text-[var(--t-text-dim)] w-12">{total ? ((r.bruto / total) * 100).toFixed(0) : "0"}%</td>
                      </tr>
                    );
                  })}
                  {!porOp.length && <tr><td colSpan={5} className="px-3 py-3 text-[var(--t-text-muted)]">sin datos</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
          {/* Gráfico */}
          <OpsBarChart serie={serie} fmt={fmtCompact} unidad={MONEDA_UNIDAD[moneda]} defaultAgg="DIARIO"
            focoFecha={modo === "ULTIMA" ? fecha : null}
            series={[{ key: "bruto", label: "Bruto", color: "var(--t-brand)" }]} />
        </div>

        {/* DERECHA: cuentas (arriba) + títulos (abajo) — 50/50, para ver qué se opera */}
        <div className="min-h-0 grid grid-rows-2 gap-3 overflow-hidden">
          {/* ARRIBA: por cuenta */}
          <div className="min-h-0 border border-[var(--t-border)] flex flex-col overflow-hidden">
            <div className="flex items-center px-3 py-1.5 border-b border-[var(--t-border)] bg-[var(--t-accent)]/10 shrink-0">
              <span className="text-[10px] uppercase tracking-widest text-[var(--t-accent)]">Por cuenta{selDenom ? " (filtrada)" : ""}</span>
              <span className="ml-auto text-[10px] font-mono text-[var(--t-text-dim)]">{denomRows.length} · Σ {fmtCompact(denomTotal)} {MONEDA_UNIDAD[moneda]}</span>
            </div>
            <div className="flex-1 min-h-0 overflow-auto">
              <table className="w-full text-[11px] font-mono tabular-nums">
                <thead className="sticky top-0 bg-[var(--t-panel)] text-[9px] uppercase tracking-widest text-[var(--t-text-muted)]">
                  <tr>
                    <th className="px-3 py-1.5 text-left border-b border-[var(--t-border)]">Denominación</th>
                    <th className="px-3 py-1.5 text-right border-b border-[var(--t-border)]">Σ Bruto</th>
                    <th className="px-3 py-1.5 text-right border-b border-[var(--t-border)]">N</th>
                  </tr>
                </thead>
                <tbody>
                  {denomRows.map((r) => {
                    const act = selDenom === r.denominacion;
                    return (
                      <tr key={r.denominacion} onClick={() => setSelDenom(act ? null : r.denominacion)}
                        className={"border-t border-[var(--t-border)] cursor-pointer " + (act ? "bg-[var(--t-accent)]/15 text-[var(--t-accent)]" : "hover:bg-[var(--t-surface-2)]")}>
                        <td className="px-3 py-1 truncate max-w-[320px]" title={r.denominacion}>{r.denominacion}</td>
                        <td className="px-3 py-1 text-right font-semibold">{fmtCompact(r.bruto)}</td>
                        <td className="px-3 py-1 text-right text-[var(--t-text-dim)]">{r.n}</td>
                      </tr>
                    );
                  })}
                  {!denomRows.length && <tr><td colSpan={3} className="px-3 py-3 text-[var(--t-text-muted)]">sin datos</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
          {/* ABAJO: por título (instrumento) */}
          <div className="min-h-0 border border-[var(--t-border)] flex flex-col overflow-hidden">
            <div className="flex items-center px-3 py-1.5 border-b border-[var(--t-border)] bg-[var(--t-accent)]/10 shrink-0">
              <span className="text-[10px] uppercase tracking-widest text-[var(--t-accent)]">Por título</span>
              <span className="ml-auto text-[10px] font-mono text-[var(--t-text-dim)]">{porInstr.length} · Σ {fmtCompact(total)} {MONEDA_UNIDAD[moneda]}</span>
            </div>
            <div className="flex-1 min-h-0 overflow-auto">
              <table className="w-full text-[11px] font-mono tabular-nums">
                <thead className="sticky top-0 bg-[var(--t-panel)] text-[9px] uppercase tracking-widest text-[var(--t-text-muted)]">
                  <tr>
                    <th className="px-3 py-1.5 text-left border-b border-[var(--t-border)]">Instrumento</th>
                    <th className="px-3 py-1.5 text-right border-b border-[var(--t-border)]">Σ Bruto</th>
                    <th className="px-3 py-1.5 text-right border-b border-[var(--t-border)]">N</th>
                  </tr>
                </thead>
                <tbody>
                  {porInstr.map((r) => {
                    const act = selInstr === r.instrumento;
                    return (
                      <tr key={r.instrumento} onClick={() => setSelInstr(act ? null : r.instrumento)}
                        className={"border-t border-[var(--t-border)] cursor-pointer " + (act ? "bg-[var(--t-accent)]/15 text-[var(--t-accent)]" : "hover:bg-[var(--t-surface-2)]")}>
                        <td className="px-3 py-1 truncate max-w-[320px]" title={r.instrumento}>{r.instrumento}</td>
                        <td className="px-3 py-1 text-right font-semibold">{fmtCompact(r.bruto)}</td>
                        <td className="px-3 py-1 text-right text-[var(--t-text-dim)]">{r.n}</td>
                      </tr>
                    );
                  })}
                  {!porInstr.length && <tr><td className="px-3 py-3 text-[var(--t-text-muted)]">sin datos</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function FiltroChip({ label, onClear }: { label: string; onClear: () => void }) {
  return (
    <button onClick={onClear} title="Quitar este filtro"
      className="text-[10px] text-[var(--t-accent)] border border-[var(--t-accent)] px-2 py-0.5 max-w-[220px] truncate">
      ✕ {label}
    </button>
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
