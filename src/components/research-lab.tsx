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
const COLORES = ["#2f7fe0", "#e0803c", "#3ca37a", "#b5539c", "#c9a23a", "#5b8def", "#d9694e", "#6bbf59"];

// Estilos base tomados del sistema de la app (globals.css): superficies e inputs
// temáticos → claro y oscuro. bg-[var(--t-surface)] evita el select blanco en dark.
const SEL = "bg-[var(--t-surface)] border border-[var(--t-border-2)] text-[var(--t-text)] rounded px-2 py-[3px] text-[10px] outline-none focus:border-[var(--t-accent)] cursor-pointer";
const SEG = "flex rounded-md overflow-hidden border border-[var(--t-border-2)] bg-[var(--t-surface)]";

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
    <select value={value} onChange={(e) => onChange(e.target.value)} className={`${SEL} max-w-[128px] font-semibold`}>
      {label && <option value="">{label}</option>}
      {universo.curvas.map((g) => (
        <optgroup key={g.curva} label={g.curva}>
          {g.bonos.map((b) => <option key={b.ticker} value={b.ticker}>{b.ticker}</option>)}
        </optgroup>
      ))}
    </select>
  );
}

export function ResearchLab({ modoFijo }: { modoFijo?: "spread" | "overlay" } = {}) {
  const [uni, setUni] = useState<Universo | null>(null);
  const [modoLibre, setModoLibre] = useState<"spread" | "overlay">("spread");
  // Con `modoFijo` el panel es SOLO spread o SOLO overlay (cuadrantes de la tab
  // Argentina); sin él conserva el toggle (modo standalone).
  const modo = modoFijo ?? modoLibre;
  const setModo = setModoLibre;
  const [campo, setCampo] = useState("tea");
  const [dias, setDias] = useState(182);
  const [a, setA] = useState("");
  const [b, setB] = useState("");
  const [tickers, setTickers] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, number | string>[]>([]);
  const [keys, setKeys] = useState<string[]>([]);
  const [stats, setStats] = useState<SpreadStats | null>(null);
  const [cargando, setCargando] = useState(false);
  const [err, setErr] = useState<string | null>(null);

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
      .catch((e) => { if (vivo) setErr(`No pude cargar el universo (${e.message}). ¿El backend está actualizado?`); });
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

  const spreadUp = esFraccion(campo);
  const titulo = modo === "spread" ? `${a || "?"} − ${b || "?"}` : "comparación";
  const pctColor = (p: number) => p >= 80 ? "var(--t-neg)" : p <= 20 ? "var(--t-pos)" : "var(--t-text)";

  const chart = useMemo(() => (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={rows} margin={{ top: 8, right: 14, bottom: 4, left: 4 }}>
        <CartesianGrid stroke="var(--t-border)" vertical={false} />
        <XAxis dataKey="fecha" tick={{ fill: "var(--t-text-dim)", fontSize: 9 }}
          axisLine={{ stroke: "var(--t-border-2)" }} tickLine={{ stroke: "var(--t-border-2)" }}
          minTickGap={44} tickFormatter={(v) => String(v).slice(5)} />
        <YAxis tick={{ fill: "var(--t-text-dim)", fontSize: 9 }} axisLine={{ stroke: "var(--t-border-2)" }}
          tickLine={{ stroke: "var(--t-border-2)" }} width={42} domain={["auto", "auto"]}
          tickFormatter={(v) => esFraccion(campo) ? `${(v * 100).toFixed(1)}` : (campo === "duration" ? v.toFixed(1) : String(Math.round(v)))} />
        {modo === "spread" && <ReferenceLine y={0} stroke="var(--t-border-2)" strokeDasharray="4 4" />}
        {modo === "spread" && stats && (
          <ReferenceLine y={stats.media} stroke="var(--t-text-dim)" strokeDasharray="2 4"
            label={{ value: "media", fill: "var(--t-text-dim)", fontSize: 8, position: "insideTopRight" }} />
        )}
        <Tooltip
          contentStyle={{ background: "var(--t-panel)", border: "1px solid var(--t-border-2)", fontSize: 10, borderRadius: 6, color: "var(--t-text)" }}
          labelStyle={{ color: "var(--t-text-muted)" }} itemStyle={{ padding: 0 }}
          formatter={(val, name) => [fmtVal(Number(val), campo, modo === "spread" && spreadUp), String(name)]} />
        {modo === "overlay" && <Legend wrapperStyle={{ fontSize: 10, color: "var(--t-text-muted)" }} />}
        {keys.map((k, i) => (
          <Line key={k} type="monotone" dataKey={k} name={k === "spread" ? titulo : k}
            stroke={COLORES[i % COLORES.length]} strokeWidth={1.8} dot={false} isAnimationActive={false} connectNulls />
        ))}
      </LineChart>
    </ResponsiveContainer>
  ), [rows, keys, campo, modo, stats, spreadUp, titulo]);

  return (
    <section className="h-full min-h-0 flex flex-col bg-[var(--t-panel)] border border-[var(--t-border)] rounded-lg overflow-hidden">
      {/* HEADER ÚNICO — título + selección + stats + campo/rango, todo al mismo
          nivel (pedido del user 2026-07-18: más espacio para el chart) */}
      <div className="px-3 py-1.5 border-b border-[var(--t-border)] flex items-center gap-x-2 gap-y-1 flex-wrap bg-[var(--t-panel)]">
        <span className="text-[11px] font-semibold uppercase tracking-widest text-[var(--t-text)] mr-1">
          {modoFijo === "spread" ? "Spread A−B" : modoFijo === "overlay" ? "Comparar" : "Market Data"}
        </span>
        {!modoFijo && (
          <div className={SEG}>
            {(["spread", "overlay"] as const).map((m) => (
              <button key={m} type="button" onClick={() => setModo(m)}
                className={`text-[10px] font-semibold px-2.5 py-[3px] transition-colors ${modo === m ? "bg-[var(--t-accent)] text-white" : "text-[var(--t-text-muted)] hover:bg-[var(--t-surface-2)]"}`}>
                {m === "spread" ? "Spread A−B" : "Comparar"}
              </button>
            ))}
          </div>
        )}
        {/* selección de bonos — inline, al nivel del título (más alto para el chart) */}
        {uni && (modo === "spread" ? (
          <span className="flex items-center gap-1">
            <BonoSelect universo={uni} value={a} onChange={setA} />
            <span className="text-[13px] font-bold text-[var(--t-text-muted)]">−</span>
            <BonoSelect universo={uni} value={b} onChange={setB} />
          </span>
        ) : (
          <>
            <BonoSelect universo={uni} value="" onChange={toggleTicker} label="+ bono" />
            {tickers.map((t, i) => (
              <span key={t} className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-[2px] rounded-full bg-[var(--t-surface)] border"
                style={{ borderColor: COLORES[i % COLORES.length], color: "var(--t-text)" }}>
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: COLORES[i % COLORES.length] }} />
                {t}
                <button type="button" onClick={() => toggleTicker(t)} className="text-[var(--t-text-dim)] hover:text-[var(--t-neg)]">×</button>
              </span>
            ))}
          </>
        ))}

        {/* stats de valor relativo — inline (modo spread) */}
        {modo === "spread" && stats && (
          <span className="flex items-baseline gap-x-2 flex-wrap text-[10px] font-mono">
            <span><span className="text-[var(--t-text-muted)]">hoy </span><span className="text-[12px] font-bold text-[var(--t-accent)]">{fmtVal(stats.actual, campo, spreadUp)}</span></span>
            <span><span className="text-[var(--t-text-muted)]">pct </span><span className="font-bold" style={{ color: pctColor(stats.percentil) }}>{stats.percentil}%</span></span>
            <span><span className="text-[var(--t-text-muted)]">z </span><span className="text-[var(--t-text)]">{stats.z}</span></span>
            <span className="text-[var(--t-text-dim)]">{fmtVal(stats.min, campo, spreadUp)}→{fmtVal(stats.max, campo, spreadUp)}</span>
            <span className="font-sans font-semibold" style={{ color: pctColor(stats.percentil) }}>
              {stats.percentil >= 80 ? "ancho" : stats.percentil <= 20 ? "angosto" : "zona media"}
            </span>
          </span>
        )}
        {cargando && <span className="text-[9px] text-[var(--t-text-dim)]">…</span>}

        {/* campo + rango, a la derecha */}
        <span className="ml-auto flex items-center gap-1.5">
          <select value={campo} onChange={(e) => setCampo(e.target.value)} className={SEL}>
            {CAMPOS.map((c) => <option key={c.k} value={c.k}>{c.label}</option>)}
          </select>
          <span className={SEG}>
            {RANGOS.map((r) => (
              <button key={r.k} type="button" onClick={() => setDias(r.k)}
                className={`text-[10px] font-medium px-2 py-[3px] transition-colors ${dias === r.k ? "bg-[var(--t-accent)] text-white" : "text-[var(--t-text-muted)] hover:bg-[var(--t-surface-2)]"}`}>
                {r.label}
              </button>
            ))}
          </span>
        </span>
      </div>

      {/* gráfico */}
      <div className="flex-1 min-h-0 p-2 bg-[var(--t-panel)]">
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
