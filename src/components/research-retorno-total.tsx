"use client";

// RENTA FIJA ARGENTINA → cuadrante RETORNO TOTAL, con el estilo de los charts de
// Research (recharts + header de chips), no el de la Home (lightweight-charts).
// Reusa el MISMO endpoint y cálculo que la Home (GET /api/analitica/retorno-total):
// retorno = (precio + Σ cupones cobrados) / precio_base − 1; en "carry" se mide en
// USD dividiendo por el MEP del día. NO usa 1816 (1816 no trae los flujos de cupón).
import { useEffect, useMemo, useState } from "react";
import {
  CartesianGrid, Legend, Line, LineChart, ReferenceLine,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";

type Curva = "tasa_fija" | "cer" | "soberanos";
type Ventana = "7D" | "14D" | "MTD";
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
const VENTANAS: Ventana[] = ["7D", "14D", "MTD"];
const MODOS: { k: Mode; label: string }[] = [{ k: "retorno", label: "Retorno" }, { k: "carry", label: "Carry USD" }];

function addDays(iso: string, n: number): string {
  const d = new Date(iso.slice(0, 10) + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function desdeForVentana(v: Ventana, last: string): string {
  if (v === "7D") return addDays(last, -7);
  if (v === "14D") return addDays(last, -14);
  return last.slice(0, 8) + "01"; // MTD
}

// Retorno total % por ticker en la ventana (misma lógica que la Home).
function computar(data: RetornoData | null, ventana: Ventana, mode: Mode) {
  const vacio = { tickers: [] as string[], rows: [] as Record<string, number | string>[], resumen: [] as { tk: string; ret: number | null }[] };
  if (!data?.rows?.length) return vacio;
  const { rows, flujos, mep = {} } = data;

  const serieByTk: Record<string, Array<{ fecha: string; price: number }>> = {};
  for (const r of rows) { if (r.price != null) (serieByTk[r.ticker] ??= []).push({ fecha: r.fecha, price: r.price }); }
  for (const tk in serieByTk) serieByTk[tk].sort((a, b) => a.fecha.localeCompare(b.fecha));

  const fechas = Array.from(new Set(rows.map((r) => r.fecha))).sort();
  const ultima = fechas.at(-1) || "";
  if (!ultima) return vacio;
  const desde = desdeForVentana(ventana, ultima);

  // Cupones: sumados por fecha exacta dentro de la ventana (desde < fecha ≤ hasta).
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
    if (!base) base = serie.find((pt) => pt.fecha >= desde && pt.fecha <= ultima) || null;
    if (!base || base.price <= 0) continue;

    let ultimoRet: number | null = null;
    let n = 0;
    for (const pt of serie) {
      if (pt.fecha < base.fecha || pt.fecha < desde || pt.fecha > ultima) continue;
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
  const [ventana, setVentana] = useState<Ventana>("7D");
  const [mode, setMode] = useState<Mode>("retorno");
  const [byCurva, setByCurva] = useState<Record<string, RetornoData>>({});
  const [cargando, setCargando] = useState(false);
  const [err, setErr] = useState<string | null>(null);

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

  const { tickers, rows, resumen } = useMemo(() => computar(byCurva[curva] ?? null, ventana, mode), [byCurva, curva, ventana, mode]);
  const colorOf = useMemo(() => Object.fromEntries(tickers.map((tk, i) => [tk, COLORES[i % COLORES.length]])), [tickers]);

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
        {cargando && <span className="text-[9px] text-[var(--t-text-dim)]">…</span>}
        <span className="ml-auto flex items-center gap-2">
          <span className={SEG}>
            {MODOS.map((m) => (
              <button key={m.k} type="button" onClick={() => setMode(m.k)}
                className={`text-[10px] font-medium px-2 py-[3px] transition-colors ${mode === m.k ? "bg-[var(--t-accent)] text-white" : "text-[var(--t-text-muted)] hover:bg-[var(--t-surface-2)]"}`}>{m.label}</button>
            ))}
          </span>
          <span className={SEG}>
            {VENTANAS.map((v) => (
              <button key={v} type="button" onClick={() => setVentana(v)}
                className={`text-[10px] font-medium px-2 py-[3px] transition-colors ${ventana === v ? "bg-[var(--t-accent)] text-white" : "text-[var(--t-text-muted)] hover:bg-[var(--t-surface-2)]"}`}>{v}</button>
            ))}
          </span>
        </span>
      </div>

      <div className="flex-1 min-h-0 flex">
        <div className="flex-1 min-h-0 p-2">
          {rows.length === 0 ? (
            <div className="h-full flex items-center justify-center text-[10px] text-center px-4" style={{ color: err ? "var(--t-neg)" : "var(--t-text-dim)" }}>
              {err ? `Error: ${err}` : cargando ? "Cargando…" : "Sin datos suficientes en la ventana."}
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={rows} margin={{ top: 8, right: 10, bottom: 4, left: 4 }}>
                <CartesianGrid stroke="var(--t-border)" vertical={false} />
                <XAxis dataKey="fecha" tick={{ fill: "var(--t-text-dim)", fontSize: 9 }} axisLine={{ stroke: "var(--t-border-2)" }}
                  tickLine={{ stroke: "var(--t-border-2)" }} minTickGap={40} tickFormatter={(v) => String(v).slice(5)} />
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

        {/* lista de retornos del período (leyenda) */}
        {resumen.length > 0 && (
          <div className="w-[104px] shrink-0 border-l border-[var(--t-border)] overflow-y-auto">
            <div className="px-1.5 py-1 text-[9px] uppercase tracking-wide text-[var(--t-text-muted)] sticky top-0 bg-[var(--t-panel)]">{ventana} · {resumen.length}</div>
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
