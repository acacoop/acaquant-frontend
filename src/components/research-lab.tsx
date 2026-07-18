"use client";

// Laboratorio de series/spreads (vista RESEARCH, pilar A — Market Data 1816).
// Doc madre: TRD-FX docs/VISTA_RESEARCH.md. Dos modos:
//   SPREAD  → A−B en el tiempo + percentil/z (¿caro o barato vs su historia?).
//   OVERLAY → varias series superpuestas para comparar.
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CartesianGrid, Legend, Line, LineChart, ReferenceLine,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";

interface Bono { ticker: string; denominacion?: string | null; moneda?: string | null; vencimiento?: string | null }
interface Universo { curvas: { curva: string; bonos: Bono[] }[]; total: number; campos: string[] }
interface SpreadStats { actual: number; min: number; max: number; media: number; z: number; percentil: number; n: number }

const CAMPOS = [
  { k: "tea", label: "TEA" },
  { k: "paridad", label: "Paridad" },
  { k: "precioClean", label: "Precio" },
  { k: "duration", label: "Duration" },
];
const RANGOS = [{ k: 30, label: "1M" }, { k: 90, label: "3M" }, { k: 182, label: "6M" }, { k: 3650, label: "Máx" }];
const COLORES = ["var(--t-accent)", "#e0803c", "#3ca37a", "#b5539c", "#c9b23a", "#5b8def", "#d9694e", "#6bbf59"];

const esFraccion = (c: string) => c === "tea" || c === "paridad";
function fmtVal(v: number | null | undefined, campo: string, pp = false): string {
  if (v == null || Number.isNaN(v)) return "—";
  if (esFraccion(campo)) return `${(v * 100).toFixed(2)}${pp ? " pp" : "%"}`;
  if (campo === "duration") return v.toFixed(2);
  return v.toLocaleString("es-AR", { maximumFractionDigits: 0 });
}
function desdeISO(dias: number): string {
  const d = new Date();
  d.setDate(d.getDate() - dias);
  return d.toISOString().slice(0, 10);
}

function BonoSelect({ universo, value, onChange, label }: {
  universo: Universo; value: string; onChange: (v: string) => void; label?: string;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="text-[10px] px-1.5 py-1 rounded bg-transparent border border-[var(--t-border)] text-[var(--t-text)] max-w-[130px]"
    >
      {label && <option value="">{label}</option>}
      {universo.curvas.map((g) => (
        <optgroup key={g.curva} label={g.curva}>
          {g.bonos.map((b) => <option key={b.ticker} value={b.ticker}>{b.ticker}</option>)}
        </optgroup>
      ))}
    </select>
  );
}

export function ResearchLab() {
  const [uni, setUni] = useState<Universo | null>(null);
  const [modo, setModo] = useState<"spread" | "overlay">("spread");
  const [campo, setCampo] = useState("tea");
  const [dias, setDias] = useState(182);
  const [a, setA] = useState("");
  const [b, setB] = useState("");
  const [tickers, setTickers] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, number | string>[]>([]);
  const [keys, setKeys] = useState<string[]>([]);       // series a dibujar
  const [stats, setStats] = useState<SpreadStats | null>(null);
  const [cargando, setCargando] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Universo (una vez) → defaults lindos (AL30−GD30 si están).
  useEffect(() => {
    let vivo = true;
    fetch("/api/research1816/universo")
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then((u: Universo) => {
        if (!vivo) return;
        if (!u || !Array.isArray(u.curvas)) throw new Error("respuesta inesperada");
        setUni(u);
        const todos = u.curvas.flatMap((g) => g.bonos.map((x) => x.ticker));
        setA(todos.includes("AL30") ? "AL30" : (todos[0] || ""));
        setB(todos.includes("GD30") ? "GD30" : (todos[1] || ""));
        setTickers([todos.includes("AL30") ? "AL30" : todos[0], todos.includes("GD30") ? "GD30" : todos[1]].filter(Boolean));
      })
      .catch((e) => { if (vivo) setErr(`No pude cargar el universo (${e.message}). ¿El backend está actualizado (git pull + restart)?`); });
    return () => { vivo = false; };
  }, []);

  const cargar = useCallback(async () => {
    const desde = desdeISO(dias);
    setCargando(true);
    try {
      if (modo === "spread") {
        if (!a || !b) { setRows([]); setStats(null); return; }
        const r = await fetch(`/api/research1816/spread?a=${a}&b=${b}&campo=${campo}&desde=${desde}`);
        const d = await r.json();
        setRows((d.puntos || []).map((p: [string, number]) => ({ fecha: p[0], spread: p[1] })));
        setKeys(["spread"]);
        setStats(d.stats || null);
      } else {
        if (tickers.length === 0) { setRows([]); return; }
        const qs = tickers.map((t) => `tickers=${t}`).join("&");
        const r = await fetch(`/api/research1816/series?${qs}&campo=${campo}&desde=${desde}`);
        const d = await r.json();
        const byFecha: Record<string, Record<string, number | string>> = {};
        for (const s of d.series || []) {
          for (const [fecha, valor] of s.puntos || []) {
            (byFecha[fecha] ||= { fecha })[s.ticker] = valor;
          }
        }
        setRows(Object.values(byFecha).sort((x, y) => String(x.fecha).localeCompare(String(y.fecha))));
        setKeys(tickers.slice());
        setStats(null);
      }
    } catch { setRows([]); } finally { setCargando(false); }
  }, [modo, campo, dias, a, b, tickers]);

  useEffect(() => { cargar(); }, [cargar]);

  const toggleTicker = (t: string) => {
    if (!t) return;
    setTickers((prev) => prev.includes(t) ? prev.filter((x) => x !== t) : (prev.length >= 8 ? prev : [...prev, t]));
  };

  const spreadUp = esFraccion(campo);   // spread de tasas en pp
  const titulo = modo === "spread" ? `${a || "?"} − ${b || "?"}` : "comparación";

  const chart = useMemo(() => (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={rows} margin={{ top: 8, right: 12, bottom: 4, left: 4 }}>
        <CartesianGrid stroke="var(--t-border)" vertical={false} />
        <XAxis dataKey="fecha" tick={{ fill: "var(--t-text-dim)", fontSize: 9 }}
          axisLine={{ stroke: "var(--t-border-2)" }} minTickGap={40}
          tickFormatter={(v) => String(v).slice(5)} />
        <YAxis tick={{ fill: "var(--t-text-dim)", fontSize: 9 }} axisLine={{ stroke: "var(--t-border-2)" }}
          width={44} domain={["auto", "auto"]}
          tickFormatter={(v) => esFraccion(campo) ? `${(v * 100).toFixed(1)}` : (campo === "duration" ? v.toFixed(1) : String(Math.round(v)))} />
        {modo === "spread" && <ReferenceLine y={0} stroke="var(--t-text-dim)" strokeDasharray="4 4" />}
        {modo === "spread" && stats && (
          <ReferenceLine y={stats.media} stroke="var(--t-text-muted)" strokeDasharray="2 4"
            label={{ value: "media", fill: "var(--t-text-dim)", fontSize: 8, position: "insideTopRight" }} />
        )}
        <Tooltip
          contentStyle={{ background: "var(--t-surface)", border: "1px solid var(--t-border-2)", fontSize: 10, borderRadius: 6 }}
          labelStyle={{ color: "var(--t-accent)" }}
          formatter={(val, name) => [fmtVal(Number(val), campo, modo === "spread" && spreadUp), String(name)]} />
        {modo === "overlay" && <Legend wrapperStyle={{ fontSize: 10 }} />}
        {keys.map((k, i) => (
          <Line key={k} type="monotone" dataKey={k} name={k === "spread" ? titulo : k}
            stroke={COLORES[i % COLORES.length]} strokeWidth={1.6} dot={false} isAnimationActive={false} connectNulls />
        ))}
      </LineChart>
    </ResponsiveContainer>
  ), [rows, keys, campo, modo, stats, spreadUp, titulo]);

  return (
    <section className="lg:w-1/2 min-h-0 flex flex-col border border-[var(--t-border)] rounded-md">
      {/* barra de controles */}
      <div className="px-2.5 py-1.5 border-b border-[var(--t-border)] flex items-center gap-1.5 flex-wrap">
        <span className="text-[11px] uppercase tracking-widest text-[var(--t-text-muted)] mr-1">Market Data · 1816</span>
        <div className="flex rounded overflow-hidden border border-[var(--t-border)]">
          {(["spread", "overlay"] as const).map((m) => (
            <button key={m} type="button" onClick={() => setModo(m)}
              className={`text-[10px] font-semibold px-2 py-0.5 ${modo === m ? "bg-[var(--t-accent)] text-white" : "text-[var(--t-text-muted)]"}`}>
              {m === "spread" ? "Spread A−B" : "Comparar"}
            </button>
          ))}
        </div>
        <select value={campo} onChange={(e) => setCampo(e.target.value)}
          className="text-[10px] px-1.5 py-1 rounded bg-transparent border border-[var(--t-border)] text-[var(--t-text)]">
          {CAMPOS.map((c) => <option key={c.k} value={c.k}>{c.label}</option>)}
        </select>
        <div className="flex rounded overflow-hidden border border-[var(--t-border)]">
          {RANGOS.map((r) => (
            <button key={r.k} type="button" onClick={() => setDias(r.k)}
              className={`text-[10px] px-1.5 py-0.5 ${dias === r.k ? "bg-[var(--t-border-2)] text-[var(--t-text)]" : "text-[var(--t-text-dim)]"}`}>
              {r.label}
            </button>
          ))}
        </div>
        {cargando && <span className="text-[9px] text-[var(--t-text-dim)]">…</span>}
      </div>

      {/* selección de bonos */}
      {uni && (
        <div className="px-2.5 py-1.5 border-b border-[var(--t-border)] flex items-center gap-1.5 flex-wrap">
          {modo === "spread" ? (
            <>
              <BonoSelect universo={uni} value={a} onChange={setA} />
              <span className="text-[11px] text-[var(--t-text-muted)]">−</span>
              <BonoSelect universo={uni} value={b} onChange={setB} />
            </>
          ) : (
            <>
              <BonoSelect universo={uni} value="" onChange={toggleTicker} label="+ agregar bono" />
              {tickers.map((t, i) => (
                <span key={t} className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border"
                  style={{ borderColor: COLORES[i % COLORES.length], color: "var(--t-text)" }}>
                  {t}
                  <button type="button" onClick={() => toggleTicker(t)} className="text-[var(--t-text-dim)] hover:text-[var(--t-neg)]">×</button>
                </span>
              ))}
            </>
          )}
        </div>
      )}

      {/* stats de valor relativo (modo spread) */}
      {modo === "spread" && stats && (
        <div className="px-2.5 py-1 border-b border-[var(--t-border)] flex items-center gap-3 flex-wrap text-[10px] font-mono">
          <span><span className="text-[var(--t-text-muted)]">Hoy </span><span className="text-[var(--t-accent)] font-semibold">{fmtVal(stats.actual, campo, spreadUp)}</span></span>
          <span><span className="text-[var(--t-text-muted)]">percentil </span>
            <span className={stats.percentil >= 80 ? "text-[var(--t-neg)]" : stats.percentil <= 20 ? "text-[var(--t-pos)]" : "text-[var(--t-text)]"}>{stats.percentil}%</span>
          </span>
          <span><span className="text-[var(--t-text-muted)]">z </span>{stats.z}</span>
          <span className="text-[var(--t-text-dim)]">mín/máx {fmtVal(stats.min, campo, spreadUp)} / {fmtVal(stats.max, campo, spreadUp)}</span>
          <span className="text-[var(--t-text-dim)] ml-auto">
            {stats.percentil >= 80 ? "ancho vs su historia" : stats.percentil <= 20 ? "angosto vs su historia" : "en zona media"}
          </span>
        </div>
      )}

      {/* gráfico */}
      <div className="flex-1 min-h-0 p-1">
        {rows.length === 0
          ? <div className="h-full flex items-center justify-center text-[10px] text-center px-4"
                 style={{ color: err ? "var(--t-neg)" : "var(--t-text-dim)" }}>
              {err ? err : uni ? "Elegí bonos para ver la serie." : "Cargando universo…"}
            </div>
          : chart}
      </div>
    </section>
  );
}
