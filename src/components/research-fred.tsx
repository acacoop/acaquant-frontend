"use client";

// Tab "DATOS INTERNACIONALES" (FRED) de la vista RESEARCH — doc vivo: TRD-FX
// docs/RESEARCH_FRED.md. SUB-TABS por BLOQUE. Cada bloque: chips de series + rango
// + chart. Dos capas de COMPARACIÓN (todas las vistas):
//   1) TRANSFORMACIÓN: Nivel / Base 100 (rebase al inicio) / Var % (retorno acum.).
//   2) ÍNDICE DE REFERENCIA (S&P 500 / Nasdaq / Dow) superpuesto (2º eje en Nivel).
// Algunos bloques (CUADRANTES) se parten en 2x2 —un mini-chart con su propio eje Y
// por sub-grupo— porque las escalas son demasiado distintas para un solo eje
// (ej. EEUU MACRO: inflación · empleo · actividad · expectativas). Esos arrancan
// en Base 100 (así se lee el macro).
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CartesianGrid, Legend, Line, LineChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";

interface FredSerieMeta { id: string; etiqueta: string; unidad: string | null; freq: string | null; desde: string | null; hasta: string | null }
interface FredBloques { bloques: { bloque: string; series: FredSerieMeta[] }[] }
type Transform = "nivel" | "base100" | "varpct";
type Row = Record<string, number | string>;

const SEG = "flex rounded-md overflow-hidden border border-[var(--t-border-2)] bg-[var(--t-surface)]";
const RANGOS = [{ k: 90, label: "3M" }, { k: 182, label: "6M" }, { k: 365, label: "1A" }, { k: 1825, label: "5A" }];
const TRANSFORMS: { k: Transform; label: string }[] = [
  { k: "nivel", label: "Nivel" }, { k: "base100", label: "Base 100" }, { k: "varpct", label: "Var %" },
];
const COLORES = ["#2f7fe0", "#e0803c", "#3ca37a", "#b5539c", "#c9a23a", "#5b8def", "#d9694e", "#6bbf59", "#8a8f98", "#4bb3c9"];
const REF_COLOR = "#7c3aed";

const BLOQUE_LABEL: Record<string, string> = {
  tasas_usa: "TASAS USA", commodities: "COMMODITIES", eeuu_macro: "EEUU MACRO",
  eeuu_inflacion: "EEUU INFLACIÓN", eeuu_actividad: "EEUU ACTIVIDAD", china: "CHINA", indices: "ÍNDICES BOLSA",
};
const BLOQUE_ORDEN = ["tasas_usa", "commodities", "eeuu_macro", "eeuu_inflacion", "eeuu_actividad", "china", "indices"];

// Bloques que se muestran en CUADRANTES 2x2 (cada sub-grupo su mini-chart + su eje
// Y), porque las escalas son demasiado distintas para un eje único. Editable.
const CUADRANTES: Record<string, { titulo: string; ids: string[] }[]> = {
  eeuu_macro: [
    { titulo: "INFLACIÓN", ids: ["CPIAUCSL", "CPILFESL", "PCEPILFE"] },
    { titulo: "EMPLEO", ids: ["PAYEMS", "UNRATE", "ICSA"] },
    { titulo: "ACTIVIDAD", ids: ["GDPC1", "INDPRO"] },
    { titulo: "EXPECTATIVAS", ids: ["UMCSENT", "T10YIE"] },
  ],
};

function desdeISO(dias: number): string {
  const d = new Date(); d.setDate(d.getDate() - dias); return d.toISOString().slice(0, 10);
}
function fmtValor(v: number, unidad: string | null): string {
  if (unidad === "%") return `${v.toLocaleString("es-AR", { maximumFractionDigits: 2 })}%`;
  return v.toLocaleString("es-AR", { maximumFractionDigits: v >= 1000 ? 0 : 2 });
}
function fmtEje(v: number, unidad: string | null): string {
  if (unidad === "%") return v.toLocaleString("es-AR", { maximumFractionDigits: 1 });
  if (Math.abs(v) >= 1000) return v.toLocaleString("es-AR", { maximumFractionDigits: 0 });
  return v.toLocaleString("es-AR", { maximumFractionDigits: 1 });
}
function ejeTransform(v: number, modo: Transform, unidad: string | null): string {
  return modo === "nivel" ? fmtEje(v, unidad) : modo === "base100" ? String(Math.round(v)) : `${Math.round(v)}%`;
}
function serieTransform(v: number, modo: Transform, unidad: string | null): string {
  if (modo === "base100") return v.toLocaleString("es-AR", { maximumFractionDigits: 1 });
  if (modo === "varpct") return `${v >= 0 ? "+" : ""}${v.toLocaleString("es-AR", { maximumFractionDigits: 1 })}%`;
  return fmtValor(v, unidad);
}

// Rebasa cada columna al PRIMER valor visible (base100: →100 · varpct: →0%).
function transformar(rows: Row[], keys: string[], modo: Transform): Row[] {
  if (modo === "nivel") return rows;
  const base: Record<string, number> = {};
  for (const k of keys) for (const r of rows) { const v = r[k]; if (typeof v === "number") { base[k] = v; break; } }
  return rows.map((r) => {
    const out: Row = { fecha: r.fecha };
    for (const k of keys) {
      const v = r[k], b = base[k];
      if (typeof v === "number" && typeof b === "number" && b !== 0) out[k] = modo === "base100" ? (v / b) * 100 : (v / b - 1) * 100;
    }
    return out;
  });
}
function hoyRawDe(rows: Row[], label: string): number | null {
  for (let i = rows.length - 1; i >= 0; i--) { const v = rows[i][label]; if (typeof v === "number") return v; }
  return null;
}
function useSeries(ids: string[], dias: number) {
  const [raw, setRaw] = useState<Row[]>([]);
  const [cargando, setCargando] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const idsKey = ids.join(",");
  const cargar = useCallback(async (labelDe: Map<string, string>) => {
    if (ids.length === 0) { setRaw([]); return; }
    setCargando(true); setErr(null);
    try {
      const qs = ids.map((i) => `ids=${encodeURIComponent(i)}`).join("&");
      const r = await fetch(`/api/research-fred/series?${qs}&desde=${desdeISO(dias)}`, { cache: "no-store" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const d = await r.json();
      const byFecha: Record<string, Row> = {};
      for (const s of d.series || []) {
        const label = labelDe.get(s.id) || String(s.id);
        for (const [fecha, valor] of s.puntos || []) (byFecha[fecha] ||= { fecha })[label] = valor;
      }
      setRaw(Object.values(byFecha).sort((x, y) => String(x.fecha).localeCompare(String(y.fecha))));
    } catch (e) { setRaw([]); setErr(`No pude cargar las series (${e instanceof Error ? e.message : "error"}).`); }
    finally { setCargando(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey, dias]);
  return { raw, cargando, err, cargar };
}

// Controles compartidos del header (transformación + rango).
function Controles({ modo, setModo, dias, setDias, extra }: {
  modo: Transform; setModo: (m: Transform) => void; dias: number; setDias: (d: number) => void; extra?: React.ReactNode;
}) {
  return (
    <span className="ml-auto flex items-center gap-2 flex-wrap">
      <span className={SEG}>
        {TRANSFORMS.map((t) => (
          <button key={t.k} type="button" onClick={() => setModo(t.k)}
            className={`text-[10px] font-medium px-2 py-[3px] transition-colors ${modo === t.k ? "bg-[var(--t-accent)] text-white" : "text-[var(--t-text-muted)] hover:bg-[var(--t-surface-2)]"}`}>{t.label}</button>
        ))}
      </span>
      {extra}
      <span className={SEG}>
        {RANGOS.map((r) => (
          <button key={r.k} type="button" onClick={() => setDias(r.k)}
            className={`text-[10px] font-medium px-2 py-[3px] transition-colors ${dias === r.k ? "bg-[var(--t-accent)] text-white" : "text-[var(--t-text-muted)] hover:bg-[var(--t-surface-2)]"}`}>{r.label}</button>
        ))}
      </span>
    </span>
  );
}

// ── Mini-chart de un cuadrante (su propio eje Y auto-escalado) ───────────────
function MiniChart({ titulo, grupo, raw, modo }: { titulo: string; grupo: FredSerieMeta[]; raw: Row[]; modo: Transform }) {
  const keys = grupo.map((s) => s.etiqueta);
  const data = useMemo(() => transformar(raw, keys, modo), [raw, keys, modo]);
  const unidadDe = (name: string) => grupo.find((s) => s.etiqueta === name)?.unidad ?? null;
  return (
    <div className="min-h-0 flex flex-col border border-[var(--t-border)] rounded-md bg-[var(--t-panel)]">
      <div className="px-2 py-1 border-b border-[var(--t-border)] flex items-center gap-x-2 gap-y-0.5 flex-wrap">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--t-text)]">{titulo}</span>
        {grupo.map((s, i) => {
          const hoy = hoyRawDe(raw, s.etiqueta);
          return (
            <span key={s.id} className="inline-flex items-center gap-1 text-[9px] text-[var(--t-text-muted)]" title={`${s.id}${s.desde ? ` · desde ${s.desde}` : ""}`}>
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: COLORES[i % COLORES.length] }} />
              {s.etiqueta}{hoy !== null && <span className="font-mono">{fmtValor(hoy, s.unidad)}</span>}
            </span>
          );
        })}
      </div>
      <div className="flex-1 min-h-0 p-1">
        {data.length === 0 ? (
          <div className="h-full flex items-center justify-center text-[9px] text-[var(--t-text-dim)]">sin datos aún</div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 4, right: 8, bottom: 2, left: 2 }}>
              <CartesianGrid stroke="var(--t-border)" vertical={false} />
              <XAxis dataKey="fecha" tick={{ fill: "var(--t-text-dim)", fontSize: 8 }} axisLine={{ stroke: "var(--t-border-2)" }}
                tickLine={{ stroke: "var(--t-border-2)" }} minTickGap={40} tickFormatter={(v) => String(v).slice(2, 7)} />
              <YAxis tick={{ fill: "var(--t-text-dim)", fontSize: 8 }} axisLine={{ stroke: "var(--t-border-2)" }}
                tickLine={{ stroke: "var(--t-border-2)" }} width={46} domain={["auto", "auto"]} tickFormatter={(v: number) => ejeTransform(v, modo, null)} />
              <Tooltip contentStyle={{ background: "var(--t-panel)", border: "1px solid var(--t-border-2)", fontSize: 10, borderRadius: 6, color: "var(--t-text)" }}
                labelStyle={{ color: "var(--t-text-muted)" }} formatter={(val, name) => [serieTransform(Number(val), modo, unidadDe(String(name))), String(name)]} />
              {keys.map((k, i) => <Line key={k} type="monotone" dataKey={k} stroke={COLORES[i % COLORES.length]} strokeWidth={1.5} dot={false} isAnimationActive={false} connectNulls />)}
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}

// ── Bloque en CUADRANTES 2x2 ─────────────────────────────────────────────────
function CuadrantesBloque({ bloque, series }: { bloque: string; series: FredSerieMeta[] }) {
  const grupos = CUADRANTES[bloque];
  const [dias, setDias] = useState(365);
  const [modo, setModo] = useState<Transform>("base100");   // el macro se lee rebaseado
  const metaById = useMemo(() => new Map(series.map((s) => [s.id, s])), [series]);
  const labelDe = useMemo(() => new Map(series.map((s) => [s.id, s.etiqueta] as const)), [series]);
  const allIds = useMemo(() => grupos.flatMap((g) => g.ids).filter((id) => metaById.has(id)), [grupos, metaById]);
  const { raw, cargando, err, cargar } = useSeries(allIds, dias);
  useEffect(() => { cargar(labelDe); }, [cargar, labelDe]);

  return (
    <section className="h-full min-h-0 flex flex-col">
      <div className="px-3 py-1.5 border-b border-[var(--t-border)] flex items-center gap-2 flex-wrap bg-[var(--t-panel)]">
        <span className="text-[11px] font-semibold uppercase tracking-widest text-[var(--t-text)]">{BLOQUE_LABEL[bloque] || bloque}</span>
        {cargando && <span className="text-[9px] text-[var(--t-text-dim)]">…</span>}
        {err && <span className="text-[9px] text-[var(--t-neg)]">{err}</span>}
        <Controles modo={modo} setModo={setModo} dias={dias} setDias={setDias} />
      </div>
      <div className="flex-1 min-h-0 p-2">
        <div className="h-full grid grid-cols-1 lg:grid-cols-2 lg:grid-rows-2 gap-2">
          {grupos.map((g) => {
            const grupo = g.ids.map((id) => metaById.get(id)).filter((s): s is FredSerieMeta => !!s);
            return grupo.length ? <MiniChart key={g.titulo} titulo={g.titulo} grupo={grupo} raw={raw} modo={modo} /> : null;
          })}
        </div>
      </div>
    </section>
  );
}

// ── Bloque de UN chart (multi-serie) con transform + índice de referencia ─────
function ChartBloque({ bloque, series, refOptions }: { bloque: string; series: FredSerieMeta[]; refOptions: FredSerieMeta[] }) {
  const [dias, setDias] = useState(365);
  const [modo, setModo] = useState<Transform>("nivel");
  const [refId, setRefId] = useState<string>("");
  const [activas, setActivas] = useState<Set<string>>(() => new Set(series.slice(0, 3).map((s) => s.id)));

  const idsActivas = useMemo(() => series.filter((s) => activas.has(s.id)).map((s) => s.id), [series, activas]);
  const unidad = series[0]?.unidad ?? null;
  const refs = useMemo(() => refOptions.filter((o) => !series.some((s) => s.id === o.id)), [refOptions, series]);
  const refMeta = useMemo(() => refs.find((o) => o.id === refId) || null, [refs, refId]);
  const labelDe = useMemo(() => {
    const m = new Map(series.map((s) => [s.id, s.etiqueta] as const));
    for (const o of refOptions) m.set(o.id, o.etiqueta);
    return m;
  }, [series, refOptions]);
  const fetchIds = useMemo(() => (refId ? [...idsActivas, refId] : idsActivas), [idsActivas, refId]);
  const { raw, cargando, err, cargar } = useSeries(fetchIds, dias);
  useEffect(() => { cargar(labelDe); }, [cargar, labelDe]);

  const toggle = (id: string) => setActivas((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const blockKeys = useMemo(() => series.filter((s) => activas.has(s.id)).map((s) => s.etiqueta), [series, activas]);
  const refLabel = refMeta?.etiqueta ?? null;
  const allKeys = useMemo(() => (refLabel ? [...blockKeys, refLabel] : blockKeys), [blockKeys, refLabel]);
  const rows = useMemo(() => transformar(raw, allKeys, modo), [raw, allKeys, modo]);
  const dobleEje = modo === "nivel" && !!refLabel;

  return (
    <section className="h-full min-h-0 flex flex-col">
      <div className="px-3 py-1.5 border-b border-[var(--t-border)] flex items-center gap-x-2 gap-y-1 flex-wrap bg-[var(--t-panel)]">
        <span className="text-[11px] font-semibold uppercase tracking-widest text-[var(--t-text)]">{BLOQUE_LABEL[bloque] || bloque}</span>
        {unidad && modo === "nivel" && <span className="text-[9px] text-[var(--t-text-dim)]">({unidad})</span>}
        {series.map((s, i) => {
          const on = activas.has(s.id);
          const hoy = on ? hoyRawDe(raw, s.etiqueta) : null;
          return (
            <button key={s.id} type="button" onClick={() => toggle(s.id)} title={s.desde ? `${s.id} · desde ${s.desde}` : `${s.id} · sin datos aún`}
              className={`inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-[2px] rounded-full border transition-colors ${on ? "bg-[var(--t-surface)] text-[var(--t-text)]" : "opacity-45 text-[var(--t-text-dim)] border-[var(--t-border-2)]"}`}
              style={on ? { borderColor: COLORES[i % COLORES.length] } : undefined}>
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: COLORES[i % COLORES.length] }} />
              {s.etiqueta}{hoy !== null && <span className="font-mono text-[9px] text-[var(--t-text-muted)]">{fmtValor(hoy, s.unidad)}</span>}
            </button>
          );
        })}
        {cargando && <span className="text-[9px] text-[var(--t-text-dim)]">…</span>}
        <Controles modo={modo} setModo={setModo} dias={dias} setDias={setDias}
          extra={refs.length > 0 ? (
            <select value={refId} onChange={(e) => setRefId(e.target.value)} title="Superponer un índice de bolsa para comparar"
              className="text-[10px] font-medium px-1.5 py-[3px] rounded-md border border-[var(--t-border-2)] bg-[var(--t-surface)] text-[var(--t-text-muted)]">
              <option value="">+ índice…</option>
              {refs.map((o) => <option key={o.id} value={o.id}>{o.etiqueta}</option>)}
            </select>
          ) : undefined} />
      </div>

      <div className="flex-1 min-h-0 p-2 bg-[var(--t-panel)]">
        {rows.length === 0 ? (
          <div className="h-full flex items-center justify-center text-[10px] text-center px-4" style={{ color: err ? "var(--t-neg)" : "var(--t-text-dim)" }}>
            {err ? err : cargando ? "Cargando…" : idsActivas.length === 0 ? "Prendé alguna serie." : "Sin datos sincronizados todavía (corré el sync de FRED en el Droplet)."}
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={rows} margin={{ top: 8, right: 14, bottom: 4, left: 4 }}>
              <CartesianGrid stroke="var(--t-border)" vertical={false} />
              <XAxis dataKey="fecha" tick={{ fill: "var(--t-text-dim)", fontSize: 9 }} axisLine={{ stroke: "var(--t-border-2)" }}
                tickLine={{ stroke: "var(--t-border-2)" }} minTickGap={48} tickFormatter={(v) => String(v).slice(2, 7)} />
              <YAxis yAxisId="left" tick={{ fill: "var(--t-text-dim)", fontSize: 9 }} axisLine={{ stroke: "var(--t-border-2)" }}
                tickLine={{ stroke: "var(--t-border-2)" }} width={54} domain={["auto", "auto"]} tickFormatter={(v: number) => ejeTransform(v, modo, unidad)} />
              {dobleEje && (
                <YAxis yAxisId="right" orientation="right" tick={{ fill: REF_COLOR, fontSize: 9 }} axisLine={{ stroke: REF_COLOR }}
                  tickLine={{ stroke: REF_COLOR }} width={50} domain={["auto", "auto"]} tickFormatter={(v: number) => fmtEje(v, "índice")} />
              )}
              <Tooltip contentStyle={{ background: "var(--t-panel)", border: "1px solid var(--t-border-2)", fontSize: 10, borderRadius: 6, color: "var(--t-text)" }}
                labelStyle={{ color: "var(--t-text-muted)" }} formatter={(val, name) => [serieTransform(Number(val), modo, name === refLabel ? "índice" : unidad), String(name)]} />
              <Legend wrapperStyle={{ fontSize: 10, color: "var(--t-text-muted)" }} />
              {blockKeys.map((k) => {
                const idx = series.findIndex((s) => s.etiqueta === k);
                return <Line key={k} yAxisId="left" type="monotone" dataKey={k} stroke={COLORES[(idx >= 0 ? idx : 0) % COLORES.length]} strokeWidth={1.7} dot={false} isAnimationActive={false} connectNulls />;
              })}
              {refLabel && (
                <Line yAxisId={dobleEje ? "right" : "left"} type="monotone" dataKey={refLabel} stroke={REF_COLOR} strokeWidth={1.7} strokeDasharray="5 3" dot={false} isAnimationActive={false} connectNulls />
              )}
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </section>
  );
}

function FredBloque(props: { bloque: string; series: FredSerieMeta[]; refOptions: FredSerieMeta[] }) {
  return CUADRANTES[props.bloque]
    ? <CuadrantesBloque bloque={props.bloque} series={props.series} />
    : <ChartBloque {...props} />;
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

  const refOptions = useMemo(() => (data?.bloques || []).find((b) => b.bloque === "indices")?.series ?? [], [data]);
  const bloques = useMemo(() => {
    const map = new Map((data?.bloques || []).map((b) => [b.bloque, b.series]));
    const ordenados = BLOQUE_ORDEN.filter((b) => map.has(b)).map((b) => ({ bloque: b, series: map.get(b)! }));
    for (const b of data?.bloques || []) if (!BLOQUE_ORDEN.includes(b.bloque)) ordenados.push(b);
    return ordenados;
  }, [data]);

  if (err || (data && bloques.length === 0)) {
    return (
      <div className="h-full flex items-center justify-center text-[11px] text-center px-6" style={{ color: err ? "var(--t-neg)" : "var(--t-text-dim)" }}>
        {err ?? "Sin series de FRED sincronizadas todavía — corré `python -m jobs.fred_research --backfill` en el Droplet."}
      </div>
    );
  }
  if (!data) return <div className="h-full flex items-center justify-center text-[10px] text-[var(--t-text-dim)]">Cargando…</div>;

  return (
    <div className="h-full flex flex-col min-h-0 p-2 gap-2">
      <div className="flex items-center gap-1 flex-wrap shrink-0">
        {bloques.map(({ bloque }) => (
          <button key={bloque} type="button" onClick={() => setSub(bloque)}
            className={`px-2.5 py-1 text-[10px] font-semibold tracking-wide border transition-colors ${sub === bloque ? "bg-[var(--t-accent)] text-[var(--t-on-accent)] border-[var(--t-accent)]" : "bg-transparent text-[var(--t-text-dim)] border-[var(--t-border-2)] hover:text-[var(--t-accent)] hover:border-[var(--t-accent)]"}`}>
            {BLOQUE_LABEL[bloque] || bloque}
          </button>
        ))}
      </div>
      <div className="flex-1 min-h-0 bg-[var(--t-panel)] border border-[var(--t-border)] rounded-lg overflow-hidden">
        {bloques.map(({ bloque, series }) =>
          visitados.has(bloque) ? (
            <div key={bloque} className={sub === bloque ? "h-full" : "hidden"}>
              <FredBloque bloque={bloque} series={series} refOptions={refOptions} />
            </div>
          ) : null,
        )}
      </div>
    </div>
  );
}
