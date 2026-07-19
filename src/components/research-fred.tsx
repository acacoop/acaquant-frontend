"use client";

// Tab "DATOS INTERNACIONALES" (FRED) de la vista RESEARCH — doc vivo: TRD-FX
// docs/RESEARCH_FRED.md. SUB-TABS por BLOQUE (arranque: TASAS USA; se suman
// COMMODITIES · EEUU MACRO · CHINA de a una). Diseño = el header único de los
// otros charts de Research. Eficiencia: el catálogo de bloques se pide UNA vez;
// cada bloque fetchea sus series en UNA request batch, lazy al abrirlo.
// A diferencia de la tab BCRA: series_id es TEXTO (ej DGS10), no int.
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CartesianGrid, Legend, Line, LineChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";

interface FredSerieMeta { id: string; etiqueta: string; unidad: string | null; freq: string | null; desde: string | null; hasta: string | null }
interface FredBloques { bloques: { bloque: string; series: FredSerieMeta[] }[] }

const SEG = "flex rounded-md overflow-hidden border border-[var(--t-border-2)] bg-[var(--t-surface)]";
const RANGOS = [{ k: 90, label: "3M" }, { k: 182, label: "6M" }, { k: 365, label: "1A" }, { k: 1825, label: "5A" }];
const COLORES = ["#2f7fe0", "#e0803c", "#3ca37a", "#b5539c", "#c9a23a", "#5b8def", "#d9694e", "#6bbf59"];

const BLOQUE_LABEL: Record<string, string> = {
  tasas_usa: "TASAS USA",
  commodities: "COMMODITIES",
  eeuu_macro: "EEUU MACRO",
  eeuu_inflacion: "EEUU INFLACIÓN",
  eeuu_actividad: "EEUU ACTIVIDAD",
  china: "CHINA",
};
const BLOQUE_ORDEN = ["tasas_usa", "commodities", "eeuu_macro", "eeuu_inflacion", "eeuu_actividad", "china"];

function desdeISO(dias: number): string {
  const d = new Date();
  d.setDate(d.getDate() - dias);
  return d.toISOString().slice(0, 10);
}

function fmtValor(v: number, unidad: string | null): string {
  if (unidad === "%") return `${v.toLocaleString("es-AR", { maximumFractionDigits: 2 })}%`;
  if (unidad === "USD/t" || unidad === "USD/bbl" || unidad === "USD/oz")
    return `${v.toLocaleString("es-AR", { maximumFractionDigits: 1 })}`;
  return v.toLocaleString("es-AR", { maximumFractionDigits: 2 });
}

function fmtEje(v: number, unidad: string | null): string {
  if (unidad === "%") return v.toLocaleString("es-AR", { maximumFractionDigits: 1 });
  return v.toLocaleString("es-AR", { maximumFractionDigits: 1 });
}

// ── Un BLOQUE (sub-tab): chips de series + rango + chart multi-serie ─────────
function FredBloque({ bloque, series }: { bloque: string; series: FredSerieMeta[] }) {
  const [dias, setDias] = useState(365);
  // default: 3 series prendidas (menos ruido)
  const [activas, setActivas] = useState<Set<string>>(
    () => new Set(series.slice(0, 3).map((s) => s.id)),
  );
  const [rows, setRows] = useState<Record<string, number | string>[]>([]);
  const [cargando, setCargando] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const idsActivas = useMemo(() => series.filter((s) => activas.has(s.id)).map((s) => s.id), [series, activas]);
  const unidad = series[0]?.unidad ?? null;  // los bloques son homogéneos por diseño (seed)
  const metaDe = useMemo(() => new Map(series.map((s) => [s.id, s])), [series]);

  const cargar = useCallback(async () => {
    if (idsActivas.length === 0) { setRows([]); return; }
    setCargando(true);
    setErr(null);
    try {
      const qs = idsActivas.map((i) => `ids=${encodeURIComponent(i)}`).join("&");
      const r = await fetch(`/api/research-fred/series?${qs}&desde=${desdeISO(dias)}`, { cache: "no-store" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const d = await r.json();
      const byFecha: Record<string, Record<string, number | string>> = {};
      for (const s of d.series || []) {
        const label = metaDe.get(s.id)?.etiqueta || String(s.id);
        for (const [fecha, valor] of s.puntos || []) {
          (byFecha[fecha] ||= { fecha })[label] = valor;
        }
      }
      setRows(Object.values(byFecha).sort((x, y) => String(x.fecha).localeCompare(String(y.fecha))));
    } catch (e) {
      setRows([]);
      setErr(`No pude cargar las series (${e instanceof Error ? e.message : "error"}).`);
    } finally { setCargando(false); }
  }, [idsActivas, dias, metaDe]);

  useEffect(() => { cargar(); }, [cargar]);

  const toggle = (id: string) =>
    setActivas((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });

  const keys = useMemo(() => series.filter((s) => activas.has(s.id)).map((s) => s.etiqueta), [series, activas]);
  const hoyDe = (label: string): number | null => {
    for (let i = rows.length - 1; i >= 0; i--) {
      const v = rows[i][label];
      if (typeof v === "number") return v;
    }
    return null;
  };

  return (
    <section className="h-full min-h-0 flex flex-col">
      {/* header único — mismo diseño que los charts de Argentina/BCRA */}
      <div className="px-3 py-1.5 border-b border-[var(--t-border)] flex items-center gap-x-2 gap-y-1 flex-wrap bg-[var(--t-panel)]">
        <span className="text-[11px] font-semibold uppercase tracking-widest text-[var(--t-text)]">
          {BLOQUE_LABEL[bloque] || bloque}
        </span>
        {unidad && <span className="text-[9px] text-[var(--t-text-dim)]">({unidad})</span>}
        {series.map((s, i) => {
          const on = activas.has(s.id);
          const hoy = on ? hoyDe(s.etiqueta) : null;
          return (
            <button key={s.id} type="button" onClick={() => toggle(s.id)}
              title={s.desde ? `${s.id} · historia desde ${s.desde}` : `${s.id} · sin datos sincronizados aún`}
              className={`inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-[2px] rounded-full border transition-colors ${
                on ? "bg-[var(--t-surface)] text-[var(--t-text)]" : "opacity-45 text-[var(--t-text-dim)] border-[var(--t-border-2)]"
              }`}
              style={on ? { borderColor: COLORES[i % COLORES.length] } : undefined}>
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: COLORES[i % COLORES.length] }} />
              {s.etiqueta}
              {hoy !== null && <span className="font-mono text-[9px] text-[var(--t-text-muted)]">{fmtValor(hoy, unidad)}</span>}
            </button>
          );
        })}
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

      {/* chart */}
      <div className="flex-1 min-h-0 p-2 bg-[var(--t-panel)]">
        {rows.length === 0 ? (
          <div className="h-full flex items-center justify-center text-[10px] text-center px-4"
               style={{ color: err ? "var(--t-neg)" : "var(--t-text-dim)" }}>
            {err ? err : cargando ? "Cargando…"
              : idsActivas.length === 0 ? "Prendé alguna serie."
              : "Sin datos sincronizados todavía (corré el sync de FRED en el Droplet)."}
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={rows} margin={{ top: 8, right: 14, bottom: 4, left: 4 }}>
              <CartesianGrid stroke="var(--t-border)" vertical={false} />
              <XAxis dataKey="fecha" tick={{ fill: "var(--t-text-dim)", fontSize: 9 }}
                axisLine={{ stroke: "var(--t-border-2)" }} tickLine={{ stroke: "var(--t-border-2)" }}
                minTickGap={48} tickFormatter={(v) => String(v).slice(2, 7)} />
              <YAxis tick={{ fill: "var(--t-text-dim)", fontSize: 9 }} axisLine={{ stroke: "var(--t-border-2)" }}
                tickLine={{ stroke: "var(--t-border-2)" }} width={54} domain={["auto", "auto"]}
                tickFormatter={(v: number) => fmtEje(v, unidad)} />
              <Tooltip
                contentStyle={{ background: "var(--t-panel)", border: "1px solid var(--t-border-2)", fontSize: 10, borderRadius: 6, color: "var(--t-text)" }}
                labelStyle={{ color: "var(--t-text-muted)" }}
                formatter={(val, name) => [fmtValor(Number(val), unidad), String(name)]} />
              <Legend wrapperStyle={{ fontSize: 10, color: "var(--t-text-muted)" }} />
              {keys.map((k) => {
                const idx = series.findIndex((s) => s.etiqueta === k);
                return (
                  <Line key={k} type="monotone" dataKey={k}
                    stroke={COLORES[(idx >= 0 ? idx : 0) % COLORES.length]} strokeWidth={1.7}
                    dot={false} isAnimationActive={false} connectNulls />
                );
              })}
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </section>
  );
}

// ── La tab FRED: sub-tabs por bloque (keep-alive) ────────────────────────────
export function ResearchFred() {
  const [data, setData] = useState<FredBloques | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [sub, setSub] = useState<string>("tasas_usa");
  const [visitados, setVisitados] = useState<Set<string>>(() => new Set(["tasas_usa"]));
  if (!visitados.has(sub)) setVisitados(new Set(visitados).add(sub));

  useEffect(() => {
    let vivo = true;
    fetch("/api/research-fred/bloques")
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then((d: FredBloques) => { if (vivo) setData(d); })
      .catch((e) => { if (vivo) setErr(`No pude cargar los bloques de FRED (${e.message}).`); });
    return () => { vivo = false; };
  }, []);

  const bloques = useMemo(() => {
    const map = new Map((data?.bloques || []).map((b) => [b.bloque, b.series]));
    const ordenados = BLOQUE_ORDEN.filter((b) => map.has(b)).map((b) => ({ bloque: b, series: map.get(b)! }));
    // bloques que no estén en el orden conocido, al final
    for (const b of data?.bloques || []) if (!BLOQUE_ORDEN.includes(b.bloque)) ordenados.push(b);
    return ordenados;
  }, [data]);

  if (err || (data && bloques.length === 0)) {
    return (
      <div className="h-full flex items-center justify-center text-[11px] text-center px-6"
           style={{ color: err ? "var(--t-neg)" : "var(--t-text-dim)" }}>
        {err ?? "Sin series de FRED sincronizadas todavía — corré `python -m jobs.fred_research --backfill` en el Droplet."}
      </div>
    );
  }
  if (!data) {
    return <div className="h-full flex items-center justify-center text-[10px] text-[var(--t-text-dim)]">Cargando…</div>;
  }

  return (
    <div className="h-full flex flex-col min-h-0 p-2 gap-2">
      <div className="flex items-center gap-1 flex-wrap shrink-0">
        {bloques.map(({ bloque }) => (
          <button key={bloque} type="button" onClick={() => setSub(bloque)}
            className={`px-2.5 py-1 text-[10px] font-semibold tracking-wide border transition-colors ${
              sub === bloque
                ? "bg-[var(--t-accent)] text-[var(--t-on-accent)] border-[var(--t-accent)]"
                : "bg-transparent text-[var(--t-text-dim)] border-[var(--t-border-2)] hover:text-[var(--t-accent)] hover:border-[var(--t-accent)]"
            }`}>
            {BLOQUE_LABEL[bloque] || bloque}
          </button>
        ))}
      </div>
      <div className="flex-1 min-h-0 bg-[var(--t-panel)] border border-[var(--t-border)] rounded-lg overflow-hidden">
        {bloques.map(({ bloque, series }) =>
          visitados.has(bloque) ? (
            <div key={bloque} className={sub === bloque ? "h-full" : "hidden"}>
              <FredBloque bloque={bloque} series={series} />
            </div>
          ) : null,
        )}
      </div>
    </div>
  );
}
