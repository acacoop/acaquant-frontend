"use client";

// RENTA FIJA ARGENTINA → cuadrante RETORNO TOTAL, estilo Research (recharts).
// Reusa el MISMO endpoint/cálculo que la Home (GET /api/analitica/retorno-total):
// retorno = (precio + Σ cupones)/base − 1; "carry" mide en USD ÷ MEP. NO usa 1816.
// - Carry SOLO para tasa_fija/cer (los soberanos ya están en USD → sin carry).
// - Rango desde/hasta libre, acotado al dato más viejo/nuevo de cada set (default 14d).
// - Dropdown de bonos (agrupado por curva) para elegir cuáles mostrar; default todos.
import { useEffect, useMemo, useRef, useState } from "react";
import {
  CartesianGrid, Line, LineChart, ReferenceLine,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";

type Curva = "tasa_fija" | "cer" | "soberanos";
type Mode = "retorno" | "carry";

interface HistRow { fecha: string; ticker: string; price: number | null }
interface RetornoData {
  curva: string; rows: HistRow[];
  flujos: Record<string, Array<{ fecha: string; monto: number }>>;
  mep?: Record<string, number>;
}

const SEG = "flex rounded-md overflow-hidden border border-[var(--t-border-2)] bg-[var(--t-surface)]";
const COLORES = ["#e0803c", "#2f7fe0", "#3ca37a", "#d9694e", "#b5539c", "#4bb3c9", "#c9a23a", "#6bbf59", "#8a8f98", "#5b8def"];
const CURVAS: { k: Curva; label: string }[] = [
  { k: "tasa_fija", label: "TASA FIJA" }, { k: "cer", label: "CER" }, { k: "soberanos", label: "SOBERANOS" },
];

function addDays(iso: string, n: number): string {
  const d = new Date(iso.slice(0, 10) + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
const fmtDia = (iso: string, largo: boolean) => (largo ? iso.slice(2, 7) : iso.slice(5));

// Retorno total % por ticker entre [desde, hasta] (misma lógica que la Home).
function computar(data: RetornoData | null, desde: string, hasta: string, mode: Mode, shown: (tk: string) => boolean) {
  const vacio = { tickers: [] as string[], rows: [] as Record<string, number | string>[], resumen: [] as { tk: string; ret: number | null }[] };
  if (!data?.rows?.length || !desde || !hasta) return vacio;
  const { rows, flujos, mep = {} } = data;

  const serieByTk: Record<string, Array<{ fecha: string; price: number }>> = {};
  for (const r of rows) { if (r.price != null && shown(r.ticker)) (serieByTk[r.ticker] ??= []).push({ fecha: r.fecha, price: r.price }); }
  for (const tk in serieByTk) serieByTk[tk].sort((a, b) => a.fecha.localeCompare(b.fecha));

  const sumaFlujos = (tk: string, d0: string, d1: string): number => {
    let s = 0;
    for (const fl of flujos[tk] || []) if (fl.fecha > d0 && fl.fecha <= d1) s += fl.monto;
    return s;
  };

  const out: Record<string, Record<string, number | string>> = {};
  const tickers: string[] = [];
  const resumen: { tk: string; ret: number | null }[] = [];

  for (const tk of Object.keys(serieByTk).sort()) {
    const serie = serieByTk[tk];
    let base: { fecha: string; price: number } | null = null;
    for (const pt of serie) { if (pt.fecha <= desde) base = pt; else break; }
    if (!base) base = serie.find((pt) => pt.fecha >= desde && pt.fecha <= hasta) || null;
    if (!base || base.price <= 0) continue;

    let ultimoRet: number | null = null;
    let n = 0;
    for (const pt of serie) {
      if (pt.fecha < base.fecha || pt.fecha < desde || pt.fecha > hasta) continue;
      const tot = pt.price + sumaFlujos(tk, base.fecha, pt.fecha);
      let ret: number;
      if (mode === "carry" && mep[base.fecha] && mep[pt.fecha]) {
        ret = ((tot / mep[pt.fecha]) / (base.price / mep[base.fecha]) - 1) * 100;
      } else {
        ret = (tot / base.price - 1) * 100;
      }
      ret = +ret.toFixed(3);
      (out[pt.fecha] ??= { fecha: pt.fecha })[tk] = ret;
      ultimoRet = ret; n++;
    }
    if (n >= 2) { tickers.push(tk); resumen.push({ tk, ret: ultimoRet }); }
  }
  resumen.sort((a, b) => (b.ret ?? -1e9) - (a.ret ?? -1e9));
  const filas = Object.values(out).sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)));
  return { tickers, rows: filas, resumen };
}

export function ResearchRetornoTotal() {
  const [curva, setCurva] = useState<Curva>("tasa_fija");
  const [mode, setMode] = useState<Mode>("retorno");
  const [desde, setDesde] = useState("");   // "" = default (últimos 14d del set)
  const [hasta, setHasta] = useState("");   // "" = default (dato más reciente)
  const [sel, setSel] = useState<Set<string> | null>(null);  // null = todos
  const [dropOpen, setDropOpen] = useState(false);
  const [byCurva, setByCurva] = useState<Record<string, RetornoData>>({});
  const [cargando, setCargando] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Al cambiar de curva: resetear rango (cada set tiene sus fechas) y selección.
  useEffect(() => { setDesde(""); setHasta(""); setSel(null); setDropOpen(false); }, [curva]);

  useEffect(() => {
    if (byCurva[curva]) return;
    let vivo = true;
    setCargando(true); setErr(null);
    fetch(`/api/analitica/retorno-total?curva=${encodeURIComponent(curva)}`, { cache: "no-store" })
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then((j: RetornoData) => { if (vivo) setByCurva((p) => ({ ...p, [curva]: j })); })
      .catch((e) => { if (vivo) setErr(e instanceof Error ? e.message : "error"); })
      .finally(() => { if (vivo) setCargando(false); });
    return () => { vivo = false; };
  }, [curva, byCurva]);

  const data = byCurva[curva] ?? null;
  const esSoberano = curva === "soberanos";
  const modeEff: Mode = esSoberano ? "retorno" : mode;   // soberanos: nunca carry

  // Universo de bonos y rango de fechas del set actual.
  const allTickers = useMemo(() => Array.from(new Set((data?.rows || []).map((r) => r.ticker))).sort(), [data]);
  const [minDate, maxDate] = useMemo(() => {
    const fs = (data?.rows || []).map((r) => r.fecha);
    if (!fs.length) return ["", ""];
    return [fs.reduce((a, b) => (a < b ? a : b)), fs.reduce((a, b) => (a > b ? a : b))];
  }, [data]);

  // Rango efectivo: user override, o default (últimos 14d acotado al dato más viejo).
  const hastaEff = hasta || maxDate;
  const desdeDefault = maxDate ? (() => { const d = addDays(maxDate, -14); return minDate && d < minDate ? minDate : d; })() : "";
  const desdeEff = desde || desdeDefault;

  const shown = (tk: string) => (sel ? sel.has(tk) : true);
  const { tickers, rows, resumen } = useMemo(
    () => computar(data, desdeEff, hastaEff, modeEff, shown),
    [data, desdeEff, hastaEff, modeEff, sel],  // eslint-disable-line react-hooks/exhaustive-deps
  );
  const colorOf = useMemo(() => Object.fromEntries(allTickers.map((tk, i) => [tk, COLORES[i % COLORES.length]])), [allTickers]);
  const rangoLargo = !!desdeEff && !!hastaEff && (new Date(hastaEff).getTime() - new Date(desdeEff).getTime()) / 86400000 > 200;

  // Cerrar el dropdown al clickear afuera.
  const dropRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!dropOpen) return;
    const h = (e: MouseEvent) => { if (dropRef.current && !dropRef.current.contains(e.target as Node)) setDropOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [dropOpen]);

  const toggleBono = (tk: string) => setSel((prev) => {
    const base = prev ? new Set(prev) : new Set(allTickers);
    if (base.has(tk)) base.delete(tk); else base.add(tk);
    return base;
  });
  const selCount = sel ? sel.size : allTickers.length;

  return (
    <section className="h-full min-h-0 flex flex-col bg-[var(--t-panel)] border border-[var(--t-border)] rounded-lg overflow-hidden">
      <div className="px-3 py-1.5 border-b border-[var(--t-border)] flex items-center gap-x-2 gap-y-1 flex-wrap bg-[var(--t-panel)]">
        <span className="text-[11px] font-semibold uppercase tracking-widest text-[var(--t-text)]">Retorno Total</span>
        <span className={SEG}>
          {CURVAS.map((c) => (
            <button key={c.k} type="button" onClick={() => setCurva(c.k)}
              className={`text-[10px] font-medium px-2 py-[3px] transition-colors ${curva === c.k ? "bg-[var(--t-accent)] text-white" : "text-[var(--t-text-muted)] hover:bg-[var(--t-surface-2)]"}`}>{c.label}</button>
          ))}
        </span>

        {/* Dropdown de bonos (agrupado por curva) */}
        <div className="relative" ref={dropRef}>
          <button type="button" onClick={() => setDropOpen((o) => !o)}
            className="text-[10px] font-medium px-2 py-[3px] rounded-md border border-[var(--t-border-2)] bg-[var(--t-surface)] text-[var(--t-text-muted)] hover:text-[var(--t-accent)]">
            Bonos ({selCount}/{allTickers.length}) ▾
          </button>
          {dropOpen && (
            <div className="absolute z-30 mt-1 left-0 w-52 max-h-64 overflow-auto bg-[var(--t-panel)] border border-[var(--t-border-2)] rounded-md shadow-lg">
              <div className="flex gap-1 px-2 py-1 border-b border-[var(--t-border)] sticky top-0 bg-[var(--t-panel)]">
                <button type="button" onClick={() => setSel(null)} className="text-[9px] text-[var(--t-accent)] hover:underline">Todos</button>
                <button type="button" onClick={() => setSel(new Set())} className="text-[9px] text-[var(--t-text-muted)] hover:underline">Ninguno</button>
              </div>
              <div className="px-2 py-1 text-[9px] font-semibold uppercase tracking-wide text-[var(--t-text-dim)] bg-[var(--t-surface)]/40">
                {CURVAS.find((c) => c.k === curva)?.label}
              </div>
              {allTickers.map((tk) => (
                <label key={tk} className="flex items-center gap-2 px-2 py-0.5 text-[11px] text-[var(--t-text)] hover:bg-[var(--t-surface)]/50 cursor-pointer">
                  <input type="checkbox" checked={shown(tk)} onChange={() => toggleBono(tk)} />
                  <span className="w-2 h-2 rounded-[1px]" style={{ background: colorOf[tk] }} />
                  {tk}
                </label>
              ))}
            </div>
          )}
        </div>

        {cargando && <span className="text-[9px] text-[var(--t-text-dim)]">…</span>}

        <span className="ml-auto flex items-center gap-1.5 flex-wrap">
          {!esSoberano && (
            <span className={SEG}>
              {([["retorno", "Retorno"], ["carry", "Carry USD"]] as const).map(([k, lbl]) => (
                <button key={k} type="button" onClick={() => setMode(k)}
                  className={`text-[10px] font-medium px-2 py-[3px] transition-colors ${mode === k ? "bg-[var(--t-accent)] text-white" : "text-[var(--t-text-muted)] hover:bg-[var(--t-surface-2)]"}`}>{lbl}</button>
              ))}
            </span>
          )}
          <input type="date" value={desdeEff} min={minDate || undefined} max={hastaEff || undefined}
            onChange={(e) => setDesde(e.target.value)} title="Desde"
            className="px-1 py-0.5 text-[10px] font-medium border border-[var(--t-border-2)] bg-transparent text-[var(--t-text-muted)] rounded" />
          <span className="text-[9px] text-[var(--t-text-dim)]">→</span>
          <input type="date" value={hastaEff} min={desdeEff || minDate || undefined} max={maxDate || undefined}
            onChange={(e) => setHasta(e.target.value)} title="Hasta"
            className="px-1 py-0.5 text-[10px] font-medium border border-[var(--t-border-2)] bg-transparent text-[var(--t-text-muted)] rounded" />
        </span>
      </div>

      <div className="flex-1 min-h-0 flex">
        <div className="flex-1 min-h-0 p-2">
          {rows.length === 0 ? (
            <div className="h-full flex items-center justify-center text-[10px] text-center px-4" style={{ color: err ? "var(--t-neg)" : "var(--t-text-dim)" }}>
              {err ? `Error: ${err}` : cargando ? "Cargando…" : selCount === 0 ? "Elegí algún bono en el dropdown." : "Sin datos suficientes en el rango."}
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={rows} margin={{ top: 8, right: 10, bottom: 4, left: 4 }}>
                <CartesianGrid stroke="var(--t-border)" vertical={false} />
                <XAxis dataKey="fecha" tick={{ fill: "var(--t-text-dim)", fontSize: 9 }} axisLine={{ stroke: "var(--t-border-2)" }}
                  tickLine={{ stroke: "var(--t-border-2)" }} minTickGap={44} tickFormatter={(v) => fmtDia(String(v), rangoLargo)} />
                <YAxis tick={{ fill: "var(--t-text-dim)", fontSize: 9 }} axisLine={{ stroke: "var(--t-border-2)" }}
                  tickLine={{ stroke: "var(--t-border-2)" }} width={44} domain={["auto", "auto"]} tickFormatter={(v: number) => `${v.toFixed(1)}%`} />
                <ReferenceLine y={0} stroke="var(--t-border-2)" strokeDasharray="3 3" />
                <Tooltip contentStyle={{ background: "var(--t-panel)", border: "1px solid var(--t-border-2)", fontSize: 10, borderRadius: 6, color: "var(--t-text)" }}
                  labelStyle={{ color: "var(--t-text-muted)" }} formatter={(val, name) => [`${Number(val) >= 0 ? "+" : ""}${Number(val).toFixed(2)}%`, String(name)]} />
                {tickers.map((tk) => <Line key={tk} type="monotone" dataKey={tk} stroke={colorOf[tk]} strokeWidth={1.6} dot={false} isAnimationActive={false} connectNulls />)}
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>

        {resumen.length > 0 && (
          <div className="w-[104px] shrink-0 border-l border-[var(--t-border)] overflow-y-auto">
            <div className="px-1.5 py-1 text-[9px] uppercase tracking-wide text-[var(--t-text-muted)] sticky top-0 bg-[var(--t-panel)]">{resumen.length} bonos</div>
            {resumen.map(({ tk, ret }) => (
              <div key={tk} className="w-full flex items-center gap-1.5 px-1.5 py-0.5 text-[10px] font-mono font-bold">
                <span className="w-2 h-2 shrink-0 rounded-[1px]" style={{ background: colorOf[tk] }} />
                <span className="text-[var(--t-text)] truncate flex-1 text-left">{tk}</span>
                <span style={{ color: ret == null ? "var(--t-text-muted)" : ret >= 0 ? "var(--t-pos)" : "var(--t-neg)" }}>
                  {ret == null ? "—" : `${ret >= 0 ? "+" : ""}${ret.toFixed(1)}%`}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
