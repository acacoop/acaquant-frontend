"use client";

// Cuadrante FORWARDS (vista RESEARCH → tab Argentina, superior-derecho).
// La serie HISTÓRICA del forward implícito entre dos bonos (el gráfico que vive
// dentro de Forwards en Renta Fija), con el mismo diseño que Spread/Comparar:
// header único (título + curva + par A→B + rango) y el chart a full.
// Fuente: GET /api/cotizaciones/historico/forwards (mercado.mercado_hist) —
// matrix[largo][corto] en FRACCIÓN (×100 para mostrar, igual que forwards-panel).
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CartesianGrid, Line, LineChart, ReferenceLine,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";

interface ForwardHistDoc {
  curva: string;
  fecha: string;
  matrix: Record<string, Record<string, number>>;
}

const SEL = "bg-[var(--t-surface)] border border-[var(--t-border-2)] text-[var(--t-text)] rounded px-2 py-[3px] text-[10px] outline-none focus:border-[var(--t-accent)] cursor-pointer";
const SEG = "flex rounded-md overflow-hidden border border-[var(--t-border-2)] bg-[var(--t-surface)]";
const RANGOS = [{ k: 30, label: "1M" }, { k: 90, label: "3M" }, { k: 182, label: "6M" }, { k: 3650, label: "Máx" }];
const CURVAS = [{ k: "tasa_fija", label: "Tasa fija" }, { k: "cer", label: "CER" }];

function desdeISO(dias: number): string {
  const d = new Date();
  d.setDate(d.getDate() - dias);
  return d.toISOString().slice(0, 10);
}

// Rediseño 2026-08-15 (docs/RENTA_FIJA.md §0, paso 4): este gráfico VIVE ahora
// en la tab FORWARDS de renta fija, una instancia por curva. Se movió en vez de
// copiarse — dos gráficos de forwards que se van separando con cada arreglo es
// justo el problema que trajo el resto del rediseño.
//
// `curvaFija` lo usa la tab (la curva la manda la columna, izq tasa fija / der
// CER); sin la prop se comporta como siempre, con su propio selector.
//
// De yapa resuelve perf: este componente pide `historico/forwards` FILTRADO por
// curva y rango, mientras la vista de renta fija lo traía entero — 3.751 KB, el
// 80% del peso de la pantalla, para dibujar una línea.
export function ResearchForwards({ curvaFija }: { curvaFija?: string } = {}) {
  const [curvaInterna, setCurva] = useState<string>("tasa_fija");
  const curva = curvaFija ?? curvaInterna;
  const [dias, setDias] = useState(3650);   // default Máx (pedido del user)
  const [docs, setDocs] = useState<ForwardHistDoc[]>([]);
  const [largo, setLargo] = useState("");
  const [corto, setCorto] = useState("");
  const [cargando, setCargando] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    setErr(null);
    try {
      const r = await fetch(
        `/api/cotizaciones/historico/forwards?curva=${curva}&desde=${desdeISO(dias)}`,
        { cache: "no-store" },
      );
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const d: ForwardHistDoc[] = await r.json();
      setDocs((Array.isArray(d) ? d : []).sort((a, b) => a.fecha.localeCompare(b.fecha)));
    } catch (e) {
      setDocs([]);
      setErr(`No pude cargar los forwards (${e instanceof Error ? e.message : "error"}).`);
    } finally {
      setCargando(false);
    }
  }, [curva, dias]);

  useEffect(() => { cargar(); }, [cargar]);

  // Pares CON DATOS en la historia cargada: {largo → set(cortos con ≥1 punto)}.
  // El selector solo ofrece cruces que EXISTEN → nunca "sin historia para ese
  // par" (pedido del user: siempre hay cruce).
  const paresConDatos = useMemo(() => {
    const m = new Map<string, Set<string>>();
    for (const doc of docs) {
      for (const [a, fila] of Object.entries(doc.matrix || {})) {
        for (const [b, v] of Object.entries(fila || {})) {
          if (v == null) continue;
          if (!m.has(a)) m.set(a, new Set());
          m.get(a)!.add(b);
        }
      }
    }
    return m;
  }, [docs]);

  const tickers = useMemo(
    () => Array.from(paresConDatos.keys()),
    [paresConDatos],
  );
  const cortosDe = useMemo(
    () => Array.from(paresConDatos.get(largo) ?? []),
    [paresConDatos, largo],
  );

  // Defaults/validación: A = uno con cruces; B = siempre uno válido PARA ese A.
  useEffect(() => {
    if (!tickers.length) return;
    const a = tickers.includes(largo) ? largo : tickers[0];
    if (a !== largo) setLargo(a);
    const bs = Array.from(paresConDatos.get(a) ?? []);
    if (bs.length && !bs.includes(corto)) setCorto(bs[0]);
  }, [tickers, paresConDatos, largo, corto]);

  const rows = useMemo(() => {
    if (!largo || !corto || largo === corto) return [];
    return docs
      .map((doc) => {
        const v = doc.matrix?.[largo]?.[corto];
        return v == null ? null : { fecha: doc.fecha.slice(0, 10), fwd: +(v * 100).toFixed(3) };
      })
      .filter((x): x is { fecha: string; fwd: number } => x !== null);
  }, [docs, largo, corto]);

  const hoy = rows.length ? rows[rows.length - 1].fwd : null;
  const media = rows.length ? rows.reduce((s, r) => s + r.fwd, 0) / rows.length : null;

  return (
    <section className="h-full min-h-0 flex flex-col bg-[var(--t-panel)] border border-[var(--t-border)] rounded-lg overflow-hidden">
      {/* HEADER ÚNICO — mismo diseño que Spread/Comparar */}
      <div className="px-3 py-1.5 border-b border-[var(--t-border)] flex items-center gap-x-2 gap-y-1 flex-wrap bg-[var(--t-panel)]">
        {!curvaFija && (
          <span className="text-[11px] font-semibold uppercase tracking-widest text-[var(--t-text)]">Forwards</span>
        )}
        {!curvaFija && (
          <span className={SEG}>
            {CURVAS.map((c) => (
              <button key={c.k} type="button" onClick={() => setCurva(c.k)}
                className={`text-[10px] font-semibold px-2 py-[3px] transition-colors ${curva === c.k ? "bg-[var(--t-accent)] text-white" : "text-[var(--t-text-muted)] hover:bg-[var(--t-surface-2)]"}`}>
                {c.label}
              </button>
            ))}
          </span>
        )}
        {tickers.length > 0 && (
          <span className="flex items-center gap-1">
            <select value={largo} onChange={(e) => setLargo(e.target.value)} className={`${SEL} max-w-[110px] font-semibold`}>
              {tickers.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            <span className="text-[13px] font-bold text-[var(--t-text-muted)]">→</span>
            {/* B solo ofrece los cruces que EXISTEN para el A elegido */}
            <select value={corto} onChange={(e) => setCorto(e.target.value)} className={`${SEL} max-w-[110px] font-semibold`}>
              {cortosDe.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </span>
        )}
        {hoy !== null && (
          <span className="flex items-baseline gap-x-2 text-[10px] font-mono">
            <span><span className="text-[var(--t-text-muted)]">hoy </span><span className="text-[12px] font-bold text-[var(--t-accent)]">{hoy.toFixed(2)}%</span></span>
            {media !== null && <span className="text-[var(--t-text-dim)]">media {media.toFixed(2)}%</span>}
          </span>
        )}
        {cargando && <span className="text-[9px] text-[var(--t-text-dim)]">…</span>}
        <span className={`${SEG} ml-auto`}>
          {RANGOS.map((r) => (
            <button key={r.k} type="button" onClick={() => setDias(r.k)}
              className={`text-[10px] font-medium px-2 py-[3px] transition-colors ${dias === r.k ? "bg-[var(--t-accent)] text-white" : "text-[var(--t-text-muted)] hover:bg-[var(--t-surface-2)]"}`}>
              {r.label}
            </button>
          ))}
        </span>
      </div>

      {/* gráfico */}
      <div className="flex-1 min-h-0 p-2 bg-[var(--t-panel)]">
        {rows.length === 0 ? (
          <div className="h-full flex items-center justify-center text-[10px] text-center px-4"
               style={{ color: err ? "var(--t-neg)" : "var(--t-text-dim)" }}>
            {err ? err : cargando ? "Cargando…" : largo === corto ? "Elegí dos bonos distintos." : "Sin historia para ese par en el rango."}
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={rows} margin={{ top: 8, right: 14, bottom: 4, left: 4 }}>
              <CartesianGrid stroke="var(--t-border)" vertical={false} />
              <XAxis dataKey="fecha" tick={{ fill: "var(--t-text-dim)", fontSize: 9 }}
                axisLine={{ stroke: "var(--t-border-2)" }} tickLine={{ stroke: "var(--t-border-2)" }}
                minTickGap={44} tickFormatter={(v) => String(v).slice(5)} />
              <YAxis tick={{ fill: "var(--t-text-dim)", fontSize: 9 }} axisLine={{ stroke: "var(--t-border-2)" }}
                tickLine={{ stroke: "var(--t-border-2)" }} width={42} domain={["auto", "auto"]}
                tickFormatter={(v: number) => v.toFixed(1)} />
              {media !== null && (
                <ReferenceLine y={media} stroke="var(--t-text-dim)" strokeDasharray="2 4"
                  label={{ value: "media", fill: "var(--t-text-dim)", fontSize: 8, position: "insideTopRight" }} />
              )}
              <Tooltip
                contentStyle={{ background: "var(--t-panel)", border: "1px solid var(--t-border-2)", fontSize: 10, borderRadius: 6, color: "var(--t-text)" }}
                labelStyle={{ color: "var(--t-text-muted)" }}
                formatter={(val) => [`${Number(val).toFixed(3)}%`, `${largo}→${corto}`]} />
              <Line type="monotone" dataKey="fwd" stroke="#2f7fe0" strokeWidth={1.8}
                dot={false} isAnimationActive={false} connectNulls />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </section>
  );
}
