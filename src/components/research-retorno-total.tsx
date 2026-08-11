"use client";

// RENTA FIJA ARGENTINA → cuadrante RETORNO TOTAL, estilo Research (recharts).
// Reusa el MISMO endpoint/cálculo que la Home (GET /api/analitica/retorno-total):
// retorno = (precio + Σ cupones)/base − 1; "carry" mide en USD ÷ MEP. NO usa 1816.
// - Carga las 3 curvas juntas. Las 3 categorías (TASA FIJA / CER / SOBERANOS) están
//   siempre visibles y son CLICKEABLES: al tocar una se despliegan SUS bonos para
//   tildar. La selección se ACUMULA entre categorías → se comparan entre sí.
// - Carry se aplica SOLO a los peso (tasa_fija/CER); los soberanos van nativos.
// - Ventana por presets Max/6M/3M/MTD/WTD (acotada al dato más viejo del set).
import { useEffect, useMemo, useRef, useState } from "react";
import {
  CartesianGrid, Line, LineChart, ReferenceLine,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";

import { medir } from "@/lib/perf";

type Curva = "tasa_fija" | "cer" | "soberanos";
type Mode = "retorno" | "carry";
type Win = "Max" | "6M" | "3M" | "2M" | "1M" | "MTD" | "WTD";

interface HistRow { fecha: string; ticker: string; price: number | null }
interface RetornoData {
  curva: string; rows: HistRow[];
  flujos: Record<string, Array<{ fecha: string; monto: number }>>;
  mep?: Record<string, number>;
}
interface Merged {
  rows: HistRow[];
  flujos: Record<string, Array<{ fecha: string; monto: number }>>;
  mep: Record<string, number>;
  curvaOf: Record<string, Curva>;
  grupos: Record<Curva, string[]>;
}

const SEG = "flex rounded overflow-hidden border border-[var(--t-border-2)] bg-[var(--t-surface)]";
const BTN = "text-[9px] font-medium px-1.5 py-[2px] transition-colors";
const COLORES = ["#e0803c", "#2f7fe0", "#3ca37a", "#d9694e", "#b5539c", "#4bb3c9", "#c9a23a", "#6bbf59", "#8a8f98", "#5b8def", "#e05c7e", "#59a5e0", "#8fbf59", "#bf8f59"];
const CURVAS: { k: Curva; label: string }[] = [
  { k: "tasa_fija", label: "TASA FIJA" }, { k: "cer", label: "CER" }, { k: "soberanos", label: "SOBERANOS" },
];
const WINS: Win[] = ["Max", "6M", "3M", "2M", "1M", "MTD", "WTD"];

function addDays(iso: string, n: number): string {
  const d = new Date(iso.slice(0, 10) + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
const fmtDia = (iso: string, largo: boolean) => (largo ? iso.slice(2, 7) : iso.slice(5));

function desdeDeWin(win: Win, min: string, max: string): string {
  if (!max) return "";
  let d: string;
  if (win === "Max") d = min;
  else if (win === "6M") d = addDays(max, -182);
  else if (win === "3M") d = addDays(max, -91);
  else if (win === "2M") d = addDays(max, -61);
  else if (win === "1M") d = addDays(max, -30);
  else if (win === "MTD") d = max.slice(0, 8) + "01";
  else { const dt = new Date(max.slice(0, 10) + "T00:00:00Z"); d = addDays(max, -((dt.getUTCDay() + 6) % 7)); }
  return min && d < min ? min : d;
}

// Retorno total % por ticker entre [desde, hasta]. Carry NO aplica a soberanos.
function computar(m: Merged | null, desde: string, hasta: string, mode: Mode, shown: (tk: string) => boolean) {
  const vacio = { tickers: [] as string[], rows: [] as Record<string, number | string>[], resumen: [] as { tk: string; ret: number | null }[] };
  if (!m || !m.rows.length || !desde || !hasta) return vacio;
  const { rows, flujos, mep, curvaOf } = m;

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
    const carryOk = mode === "carry" && curvaOf[tk] !== "soberanos";
    let base: { fecha: string; price: number } | null = null;
    for (const pt of serie) { if (pt.fecha <= desde) base = pt; else break; }
    if (!base) base = serie.find((pt) => pt.fecha >= desde && pt.fecha <= hasta) || null;
    if (!base || base.price <= 0) continue;

    let ultimoRet: number | null = null;
    let n = 0;
    for (const pt of serie) {
      if (pt.fecha < base.fecha || pt.fecha < desde || pt.fecha > hasta) continue;
      const tot = pt.price + sumaFlujos(tk, base.fecha, pt.fecha);
      const ret = carryOk && mep[base.fecha] && mep[pt.fecha]
        ? ((tot / mep[pt.fecha]) / (base.price / mep[base.fecha]) - 1) * 100
        : (tot / base.price - 1) * 100;
      (out[pt.fecha] ??= { fecha: pt.fecha })[tk] = +ret.toFixed(3);
      ultimoRet = +ret.toFixed(3); n++;
    }
    if (n >= 2) { tickers.push(tk); resumen.push({ tk, ret: ultimoRet }); }
  }
  resumen.sort((a, b) => (b.ret ?? -1e9) - (a.ret ?? -1e9));
  const filas = Object.values(out).sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)));
  return { tickers, rows: filas, resumen };
}

export function ResearchRetornoTotal() {
  const [mode, setMode] = useState<Mode>("retorno");
  const [win, setWin] = useState<Win>("3M");
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [openCat, setOpenCat] = useState<Curva | null>(null);
  const [m, setM] = useState<Merged | null>(null);
  const [cargando, setCargando] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    setCargando(true); setErr(null);
    Promise.all(CURVAS.map((c) =>
      fetch(`/api/analitica/retorno-total?curva=${c.k}`, { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
        .then((j: RetornoData) => ({ curva: c.k, j })),
    )).then((res) => {
      if (!vivo) return;
      const merged: Merged = { rows: [], flujos: {}, mep: {}, curvaOf: {}, grupos: { tasa_fija: [], cer: [], soberanos: [] } };
      for (const { curva, j } of res) {
        merged.rows.push(...(j.rows || []));
        Object.assign(merged.flujos, j.flujos || {});
        Object.assign(merged.mep, j.mep || {});
        for (const tk of new Set((j.rows || []).map((r) => r.ticker))) {
          merged.curvaOf[tk] = curva; merged.grupos[curva].push(tk);
        }
      }
      for (const k of Object.keys(merged.grupos) as Curva[]) merged.grupos[k].sort();
      setM(merged);
      setSel(new Set(merged.grupos.tasa_fija));   // default: todos los de tasa fija
    }).catch((e) => { if (vivo) setErr(e instanceof Error ? e.message : "error"); })
      .finally(() => { if (vivo) setCargando(false); });
    return () => { vivo = false; };
  }, []);

  const allBonds = useMemo(() => (m ? Object.values(m.grupos).flat() : []), [m]);
  const [minDate, maxDate] = useMemo(() => {
    const fs = (m?.rows || []).map((r) => r.fecha);
    if (!fs.length) return ["", ""];
    return [fs.reduce((a, b) => (a < b ? a : b)), fs.reduce((a, b) => (a > b ? a : b))];
  }, [m]);
  const desde = desdeDeWin(win, minDate, maxDate);
  const colorOf = useMemo(() => Object.fromEntries(allBonds.map((tk, i) => [tk, COLORES[i % COLORES.length]])), [allBonds]);

  const shown = (tk: string) => sel.has(tk);
  // Instrumentado (apagado por default, ver lib/perf.ts): `computar` es la
  // fórmula de RETORNO TOTAL con cupones y carry vía MEP, que hoy vive solo
  // acá. Se mide antes de decidir si se porta a renta_fija.py — ojo que se
  // re-ejecuta con CADA cambio de filtro, no una sola vez.
  const { tickers, rows, resumen } = useMemo(
    () => medir("retorno total (computar)", () => computar(m, desde, maxDate, mode, shown)),
    [m, desde, maxDate, mode, sel],  // eslint-disable-line react-hooks/exhaustive-deps
  );
  const rangoLargo = !!desde && !!maxDate && (new Date(maxDate).getTime() - new Date(desde).getTime()) / 86400000 > 200;

  const catsRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!openCat) return;
    const h = (e: MouseEvent) => { if (catsRef.current && !catsRef.current.contains(e.target as Node)) setOpenCat(null); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [openCat]);

  const toggleBono = (tk: string) => setSel((prev) => {
    const n = new Set(prev);
    if (n.has(tk)) n.delete(tk); else n.add(tk);
    return n;
  });
  const setGrupo = (c: Curva, on: boolean) => setSel((prev) => {
    const n = new Set(prev);
    for (const tk of m?.grupos[c] || []) { if (on) n.add(tk); else n.delete(tk); }
    return n;
  });
  const selCountOf = (c: Curva) => (m?.grupos[c] || []).filter((tk) => sel.has(tk)).length;

  return (
    <section className="h-full min-h-0 flex flex-col bg-[var(--t-panel)] border border-[var(--t-border)] rounded-lg overflow-hidden">
      <div className="pl-2 pr-6 py-1 border-b border-[var(--t-border)] flex items-center gap-1.5 flex-wrap bg-[var(--t-panel)]">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--t-text)] whitespace-nowrap">Retorno Total</span>

        {/* 3 categorías clickeables — cada una despliega sus bonos */}
        <div className="flex items-center gap-1" ref={catsRef}>
          {CURVAS.map((c) => {
            const n = selCountOf(c.k);
            const total = (m?.grupos[c.k] || []).length;
            const activa = openCat === c.k;
            return (
              <div key={c.k} className="relative">
                <button type="button" onClick={() => setOpenCat(activa ? null : c.k)}
                  className={`text-[9px] font-semibold px-1.5 py-[2px] rounded border transition-colors whitespace-nowrap ${activa ? "border-[var(--t-accent)] text-[var(--t-accent)]" : n > 0 ? "border-[var(--t-border-2)] text-[var(--t-text)]" : "border-[var(--t-border-2)] text-[var(--t-text-dim)]"}`}>
                  {c.label} ({n}/{total}) ▾
                </button>
                {activa && (
                  <div className="absolute z-30 mt-1 left-0 w-52 max-h-56 overflow-auto bg-[var(--t-panel)] border border-[var(--t-border-2)] rounded-md shadow-lg">
                    <div className="flex gap-2 px-2 py-1 border-b border-[var(--t-border)] sticky top-0 bg-[var(--t-panel)]">
                      <button type="button" onClick={() => setGrupo(c.k, true)} className="text-[9px] text-[var(--t-accent)] hover:underline">Todos</button>
                      <button type="button" onClick={() => setGrupo(c.k, false)} className="text-[9px] text-[var(--t-text-muted)] hover:underline">Ninguno</button>
                    </div>
                    {total === 0 ? (
                      <div className="px-2 py-2 text-[10px] text-[var(--t-text-dim)]">Sin bonos.</div>
                    ) : (m?.grupos[c.k] || []).map((tk) => (
                      <label key={tk} className="flex items-center gap-2 px-2 py-0.5 text-[11px] text-[var(--t-text)] hover:bg-[var(--t-surface)]/50 cursor-pointer">
                        <input type="checkbox" checked={sel.has(tk)} onChange={() => toggleBono(tk)} />
                        <span className="w-2 h-2 rounded-[1px]" style={{ background: colorOf[tk] }} />
                        {tk}
                      </label>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {cargando && <span className="text-[9px] text-[var(--t-text-dim)]">…</span>}

        <span className="ml-auto flex items-center gap-1.5">
          <span className={SEG} title="Carry USD solo afecta a los peso (tasa fija / CER); los soberanos van nativos">
            {([["retorno", "Ret"], ["carry", "Carry"]] as const).map(([k, lbl]) => (
              <button key={k} type="button" onClick={() => setMode(k)}
                className={`${BTN} ${mode === k ? "bg-[var(--t-accent)] text-white" : "text-[var(--t-text-muted)] hover:bg-[var(--t-surface-2)]"}`}>{lbl}</button>
            ))}
          </span>
          <span className={SEG}>
            {WINS.map((w) => (
              <button key={w} type="button" onClick={() => setWin(w)}
                className={`${BTN} ${win === w ? "bg-[var(--t-accent)] text-white" : "text-[var(--t-text-muted)] hover:bg-[var(--t-surface-2)]"}`}>{w}</button>
            ))}
          </span>
        </span>
      </div>

      <div className="flex-1 min-h-0 flex">
        <div className="flex-1 min-h-0 p-2">
          {rows.length === 0 ? (
            <div className="h-full flex items-center justify-center text-[10px] text-center px-4" style={{ color: err ? "var(--t-neg)" : "var(--t-text-dim)" }}>
              {err ? `Error: ${err}` : cargando ? "Cargando…" : sel.size === 0 ? "Tocá una categoría y elegí bonos." : "Sin datos suficientes en el rango."}
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
