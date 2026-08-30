"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { MESES_CORTOS as MESES } from "@/lib/fmt";

// Fila del resumen agregado que arma el backend: una por (día, contraparte,
// moneda), con el grupo ya joineado. Reemplaza a bajar 2 años de ops crudas.
interface ResumenRow {
  dia: string;
  contraparte: string;
  grupo: string;
  moneda?: string;
  bruto: number;
  n: number;
}

// Operación individual — solo para el drill-down de un día puntual.
interface FlujoDoc {
  boleto?: number | string;
  concertacion: string;
  tipoOperacion?: string;
  cuenta?: string;
  denominacion?: string;
  unidad?: string;
  bruto: number;
  segmento?: string;
  contraparte?: string;
  moneda?: string;
}

const COLOR_ARS = "#094293";
const COLOR_USD = "var(--t-pos)";

function fmtCompact(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1e12) return (n / 1e12).toFixed(2) + "T";
  if (abs >= 1e9) return (n / 1e9).toFixed(2) + "B";
  if (abs >= 1e6) return (n / 1e6).toFixed(1) + "M";
  if (abs >= 1e3) return (n / 1e3).toFixed(0) + "K";
  return n.toLocaleString("es-AR", { maximumFractionDigits: 0 });
}

function fmtFull(n: number): string {
  return n.toLocaleString("es-AR", { maximumFractionDigits: 0 });
}

function mesLabel(key: string): string {
  const [y, m] = key.split("-");
  return `${MESES[parseInt(m) - 1]} ${y.slice(-2)}`;
}

export function ContrapartesView() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filas, setFilas] = useState<ResumenRow[]>([]);
  const [gruposDisp, setGruposDisp] = useState<string[]>([]);
  const [monedasDisp, setMonedasDisp] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const res = await fetch("/api/contrapartes", { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        if (cancelled) return;
        setFilas(Array.isArray(json.filas) ? json.filas : []);
        setGruposDisp(Array.isArray(json.grupos) ? json.grupos : []);
        setMonedasDisp(Array.isArray(json.monedas) ? json.monedas : []);
        setError(null);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // contraparte → grupo, derivado del resumen (para filtrar el drill-down diario).
  const grupoMap = useMemo(() => {
    const m: Record<string, string> = {};
    for (const r of filas) {
      if (r.contraparte && r.grupo) m[r.contraparte] = r.grupo;
    }
    return m;
  }, [filas]);

  const [grupoSel, setGrupoSel] = useState<string[]>([]);
  const [monSel, setMonSel] = useState<string[]>([]);
  const [dia, setDia] = useState<string>(""); // vacío = rango; si hay valor = solo ese día (detalle)
  const [cpSel, setCpSel] = useState<string | null>(null);
  const [mesSel, setMesSel] = useState<string | null>(null); // mes elegido → cross-filter
  const [monedaTabla, setMonedaTabla] = useState<string>("");
  const [chartMoneda, setChartMoneda] = useState<"ARS" | "USD">("ARS");
  const [aggCp, setAggCp] = useState<"DIARIO" | "MENSUAL">("MENSUAL");

  useEffect(() => {
    if (gruposDisp.length && grupoSel.length === 0) setGrupoSel(gruposDisp);
  }, [gruposDisp, grupoSel.length]);
  useEffect(() => {
    if (monedasDisp.length && monSel.length === 0) setMonSel(monedasDisp);
  }, [monedasDisp, monSel.length]);

  // Fechas únicas (YYYY-MM-DD) ordenadas ASC. Base del rango de fechas.
  const diasAll = useMemo(() => {
    const set = new Set<string>();
    for (const r of filas) set.add(r.dia);
    return Array.from(set).sort();
  }, [filas]);

  // Rango por inputs de fecha (calendario). Default = todo el universo.
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  useEffect(() => {
    if (diasAll.length) {
      setDesde((d) => d || diasAll[0]);
      setHasta((h) => h || diasAll[diasAll.length - 1]);
    }
  }, [diasAll]);
  const minDia = diasAll[0];
  const maxDia = diasAll[diasAll.length - 1];

  useEffect(() => {
    if (monSel.length && !monedaTabla) setMonedaTabla(monSel[0]);
    else if (monSel.length && !monSel.includes(monedaTabla))
      setMonedaTabla(monSel[0]);
  }, [monSel, monedaTabla]);

  const filtered = useMemo(() => {
    return filas.filter((r) => {
      if (desde && r.dia < desde) return false;
      if (hasta && r.dia > hasta) return false;
      if (r.moneda && !monSel.includes(r.moneda)) return false;
      if (grupoSel.length && grupoSel.length !== gruposDisp.length) {
        if (!r.grupo || !grupoSel.includes(r.grupo)) return false;
      }
      return true;
    });
  }, [filas, desde, hasta, monSel, grupoSel, gruposDisp.length]);

  // Drill-down de un día: las operaciones individuales se piden on-demand al
  // backend SOLO para ese día (el resumen agregado no las trae). Antes se
  // mostraban todas las ops del rango (bug) — ahora la tabla es realmente del día.
  const [opsDia, setOpsDia] = useState<FlujoDoc[]>([]);
  const [opsDiaLoading, setOpsDiaLoading] = useState(false);
  useEffect(() => {
    if (!dia) {
      setOpsDia([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        setOpsDiaLoading(true);
        const res = await fetch(`/api/contrapartes?dia=${dia}`, { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        if (!cancelled) setOpsDia(Array.isArray(json.ops) ? json.ops : []);
      } catch {
        if (!cancelled) setOpsDia([]);
      } finally {
        if (!cancelled) setOpsDiaLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [dia]);

  // Operaciones del día seleccionado (respetan moneda/grupo), ordenadas por
  // |bruto| DESC — las más grandes primero, para ver dónde se concentra el flujo.
  const opsDelDia = useMemo(() => {
    if (!dia) return [];
    return opsDia
      .filter((f) => {
        if (f.moneda && !monSel.includes(f.moneda)) return false;
        if (grupoSel.length && grupoSel.length !== gruposDisp.length) {
          const g = f.contraparte ? grupoMap[f.contraparte] : undefined;
          if (!g || !grupoSel.includes(g)) return false;
        }
        return true;
      })
      .sort((a, b) => Math.abs(b.bruto || 0) - Math.abs(a.bruto || 0));
  }, [opsDia, dia, monSel, grupoSel, gruposDisp.length, grupoMap]);

  // Σ volumen por moneda y por bucket (día o mes) — barras (NO acumulado).
  // Respeta la contraparte seleccionada (cross-filter): si hay cpSel, el gráfico
  // muestra solo esa contraparte.
  const chartDataByMoneda = useMemo(() => {
    const out: Record<string, { label: string; key: string; bruto: number }[]> = {};
    for (const moneda of monSel) {
      const sub = filtered.filter((r) => r.moneda === moneda && (cpSel ? r.contraparte === cpSel : true));
      const buckets: Record<string, number> = {};
      for (const r of sub) {
        const k = aggCp === "MENSUAL" ? r.dia.slice(0, 7) : r.dia;
        buckets[k] = (buckets[k] || 0) + (r.bruto || 0);
      }
      out[moneda] = Object.keys(buckets).sort().map((k) => ({
        key: k,
        label: aggCp === "MENSUAL" ? mesLabel(k) : k.slice(5),  // DD-MM corto
        bruto: buckets[k],
      }));
    }
    return out;
  }, [filtered, monSel, aggCp, cpSel]);

  // Tabla de contrapartes (moneda seleccionada). Respeta el mes elegido en la
  // tabla MESES (cross-filter): si hay mesSel, solo cuenta ese mes.
  const contrapartesTabla = useMemo(() => {
    const sub = filtered.filter(
      (r) => r.moneda === monedaTabla && (mesSel ? r.dia.slice(0, 7) === mesSel : true)
    );
    const agg: Record<string, number> = {};
    for (const r of sub) {
      const k = r.contraparte || "—";
      agg[k] = (agg[k] || 0) + (r.bruto || 0);
    }
    const total = Object.values(agg).reduce((a, b) => a + b, 0);
    return Object.entries(agg)
      .map(([cp, bruto]) => ({
        cp,
        bruto,
        share: total ? (bruto / total) * 100 : 0,
      }))
      .sort((a, b) => b.bruto - a.bruto);
  }, [filtered, monedaTabla, mesSel]);

  // Meses: por defecto consolidado (todas las contrapartes) — o de la contraparte seleccionada
  const mesesTabla = useMemo(() => {
    const sub = filtered.filter(
      (r) =>
        r.moneda === monedaTabla && (cpSel ? r.contraparte === cpSel : true)
    );
    const monthly: Record<string, number> = {};
    for (const r of sub) {
      const k = r.dia.slice(0, 7);
      monthly[k] = (monthly[k] || 0) + (r.bruto || 0);
    }
    return Object.entries(monthly)
      .map(([k, bruto]) => ({ key: k, label: mesLabel(k), bruto }))
      .sort((a, b) => (a.key < b.key ? 1 : -1));
  }, [filtered, cpSel, monedaTabla]);

  useEffect(() => {
    setCpSel(null);
    setMesSel(null);
  }, [monedaTabla, desde, hasta, dia]);

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center text-[var(--t-text-muted)] text-sm">
        Cargando…
      </div>
    );
  }
  if (error) {
    return (
      <div className="h-full flex items-center justify-center text-[var(--t-neg)] text-sm">
        Error: {error}
      </div>
    );
  }
  if (filas.length === 0) {
    return (
      <div className="h-full flex items-center justify-center text-[var(--t-text-muted)] text-sm">
        Sin datos.
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col min-h-0 overflow-hidden bg-[var(--t-panel)] text-[var(--t-text)]">
      {/* Filtros — barra compacta (desde/hasta calendario + grupo + moneda) */}
      <div className="flex items-center flex-wrap gap-3 px-4 py-2 border-b border-[var(--t-border)] shrink-0 text-[11px]">
        <label className="flex items-center gap-1">
          <span className="text-[9px] uppercase tracking-widest text-[var(--t-text-muted)]">Desde</span>
          <input type="date" value={desde} min={minDia} max={hasta || maxDia}
            onChange={(e) => setDesde(e.target.value)}
            className="bg-[var(--t-surface)] border border-[var(--t-border-2)] text-[var(--t-text)] text-[11px] px-2 py-0.5 font-mono outline-none [color-scheme:dark]" />
        </label>
        <label className="flex items-center gap-1">
          <span className="text-[9px] uppercase tracking-widest text-[var(--t-text-muted)]">Hasta</span>
          <input type="date" value={hasta} min={desde || minDia} max={maxDia}
            onChange={(e) => setHasta(e.target.value)}
            className="bg-[var(--t-surface)] border border-[var(--t-border-2)] text-[var(--t-text)] text-[11px] px-2 py-0.5 font-mono outline-none [color-scheme:dark]" />
        </label>
        <label className="flex items-center gap-1">
          <span className="text-[9px] uppercase tracking-widest text-[var(--t-text-muted)]">Día</span>
          <input type="date" value={dia} min={minDia} max={maxDia}
            onChange={(e) => setDia(e.target.value)}
            className="bg-[var(--t-surface)] border border-[var(--t-border-2)] text-[var(--t-text)] text-[11px] px-2 py-0.5 font-mono outline-none [color-scheme:dark]" />
          {dia && (
            <button onClick={() => setDia("")} title="Limpiar día"
              className="px-1.5 py-0.5 text-[10px] border border-[var(--t-border-2)] text-[var(--t-text-muted)] hover:text-[var(--t-accent)]">✕</button>
          )}
        </label>
        <div className="flex items-center gap-1 flex-wrap">
          {gruposDisp.map((g) => (
            <Chip key={g} active={grupoSel.includes(g)}
              onClick={() => setGrupoSel((prev) => prev.includes(g) ? prev.filter((x) => x !== g) : [...prev, g])}>
              {g}
            </Chip>
          ))}
        </div>
        <div className="flex items-center gap-1">
          {monedasDisp.map((m) => (
            <Chip key={m} active={monSel.includes(m)}
              onClick={() => setMonSel((prev) => prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m])}>
              {m}
            </Chip>
          ))}
        </div>
        {mesSel && (
          <button onClick={() => setMesSel(null)} className="text-[10px] text-[var(--t-accent)] border border-[var(--t-accent)] px-2 py-0.5">✕ {mesLabel(mesSel)}</button>
        )}
        <span className="ml-auto text-[10px] font-mono text-[var(--t-text-dim)]">
          {filtered.reduce((s, r) => s + (r.n || 0), 0)} ops
        </span>
      </div>

      {/* Cuerpo */}
      <div className="flex-1 min-h-0 p-3 overflow-hidden">
      {dia ? (
        /* Día específico: tabla de operaciones del día (ancho completo) */
        <div className="h-full border border-[var(--t-border)] overflow-hidden flex flex-col">
          <div className="flex items-center px-3 py-1.5 border-b border-[var(--t-border)] bg-[var(--t-accent)]/10 shrink-0">
            <span className="text-[11px] font-semibold text-[var(--t-accent)] tracking-wide uppercase">
              OPERACIONES · {dia}
            </span>
            <span className="ml-2 text-[10px] text-[var(--t-text-muted)]">
              ({opsDelDia.length} ops, orden |bruto| ↓)
            </span>
            <span className="ml-auto text-[10px] text-[var(--t-text-dim)]">
              Total bruto:{" "}
              <span className="text-[var(--t-accent)] font-semibold">
                {fmtFull(opsDelDia.reduce((s, o) => s + (o.bruto || 0), 0))}
              </span>
            </span>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto">
            <table className="w-full text-[11px] font-mono">
              <thead className="sticky top-0 bg-[var(--t-panel)] z-10">
                <tr className="border-b border-[var(--t-border)] text-left text-[var(--t-accent)] uppercase tracking-wide">
                  <th className="!px-2 !py-1">Boleto</th>
                  <th className="!px-2 !py-1">Tipo</th>
                  <th className="!px-2 !py-1">Cuenta</th>
                  <th className="!px-2 !py-1">Contraparte</th>
                  <th className="!px-2 !py-1">Segmento</th>
                  <th className="!px-2 !py-1">Unidad</th>
                  <th className="!px-2 !py-1 text-right">Bruto</th>
                  <th className="!px-2 !py-1">Mon</th>
                </tr>
              </thead>
              <tbody>
                {opsDelDia.map((o, i) => (
                  <tr key={`${o.boleto ?? ""}-${i}`}
                    className="border-b border-[var(--t-border)] hover:bg-[var(--t-accent)]/5">
                    <td className="!px-2 !py-1 text-[var(--t-text-dim)]">{o.boleto ?? "—"}</td>
                    <td className="!px-2 !py-1 text-[var(--t-text)]">{o.tipoOperacion ?? "—"}</td>
                    <td className="!px-2 !py-1 text-[var(--t-text)] truncate max-w-[180px]">{o.cuenta ?? "—"}</td>
                    <td className="!px-2 !py-1 text-[var(--t-text)]">{o.contraparte ?? "—"}</td>
                    <td className="!px-2 !py-1 text-[var(--t-text-dim)]">{o.segmento ?? "—"}</td>
                    <td className="!px-2 !py-1 text-[var(--t-text-dim)] truncate max-w-[260px]">{o.unidad ?? "—"}</td>
                    <td className="!px-2 !py-1 text-right text-[var(--t-text)]">{fmtFull(o.bruto ?? 0)}</td>
                    <td className="!px-2 !py-1 text-[var(--t-accent)]">{o.moneda ?? ""}</td>
                  </tr>
                ))}
                {opsDelDia.length === 0 && (
                  <tr><td colSpan={8} className="text-center text-[var(--t-text-muted)] py-4">
                    {opsDiaLoading ? "Cargando…" : "Sin operaciones en este día."}
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* 50/50: izq = contrapartes (arriba) + gráfico (abajo); der = meses */
        <div className="h-full grid grid-cols-2 gap-3 overflow-hidden">
          {/* IZQUIERDA */}
          <div className="min-h-0 grid grid-rows-2 gap-3 overflow-hidden">
            {/* Contrapartes — header propio (no se pisa con el título) */}
            <div className="min-h-0 border border-[var(--t-border)] flex flex-col overflow-hidden">
              <div className="flex items-center gap-2 px-3 py-1.5 border-b border-[var(--t-border)] bg-[var(--t-accent)]/10 shrink-0">
                <span className="text-[10px] uppercase tracking-widest text-[var(--t-accent)]">
                  Contrapartes <span className="text-[var(--t-text-muted)] normal-case">({contrapartesTabla.length})</span>
                </span>
                {mesSel && <span className="text-[9px] font-mono text-[var(--t-text-dim)]">· {mesLabel(mesSel)}</span>}
                <span className="ml-auto flex items-center gap-1">
                  {monSel.map((m) => (
                    <MiniChip key={m} active={monedaTabla === m} onClick={() => setMonedaTabla(m)}>{m}</MiniChip>
                  ))}
                </span>
              </div>
              <div className="flex-1 min-h-0 overflow-y-auto">
                <table className="w-full text-[11px] font-mono tabular-nums">
                  <thead className="sticky top-0 bg-[var(--t-panel)] z-10 text-[9px] uppercase tracking-widest text-[var(--t-text-muted)]">
                    <tr className="border-b border-[var(--t-border)]">
                      <th className="!px-2 !py-1 text-left">Contraparte</th>
                      <th className="!px-2 !py-1 text-right">Bruto</th>
                      <th className="!px-2 !py-1 text-right">%</th>
                    </tr>
                  </thead>
                  <tbody>
                    {contrapartesTabla.map((r) => {
                      const active = cpSel === r.cp;
                      return (
                        <tr key={r.cp} onClick={() => setCpSel(active ? null : r.cp)}
                          className={`cursor-pointer border-b border-[var(--t-border)] transition-colors ${
                            active ? "bg-[var(--t-accent)]/10 text-[var(--t-accent)]" : "hover:bg-[var(--t-accent)]/5"}`}>
                          <td className="!px-2 !py-1 text-[var(--t-text)]">{r.cp}</td>
                          <td className="!px-2 !py-1 text-right">{fmtFull(r.bruto)}</td>
                          <td className="!px-2 !py-1 text-right text-[var(--t-text-dim)]">{r.share.toFixed(1)}%</td>
                        </tr>
                      );
                    })}
                    {contrapartesTabla.length === 0 && (
                      <tr><td colSpan={3} className="text-center text-[var(--t-text-muted)] py-4">Sin datos</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Gráfico — 50% inferior de la mitad izquierda */}
            <div className="min-h-0 border border-[var(--t-border)] flex flex-col overflow-hidden">
              <div className="flex items-center flex-wrap gap-2 px-3 py-1.5 border-b border-[var(--t-border)] shrink-0">
                <span className="text-[10px] uppercase tracking-widest text-[var(--t-accent)]">Volumen operado</span>
                {(() => {
                  const dd = chartDataByMoneda[chartMoneda] || [];
                  const totalVol = dd.reduce((a, d) => a + d.bruto, 0);
                  return (
                    <span className="text-[10px] font-mono">
                      <span className="text-[var(--t-text-muted)] uppercase tracking-wider">Total: </span>
                      <span className="text-[var(--t-accent)] font-semibold">{fmtCompact(totalVol)} {chartMoneda}</span>
                    </span>
                  );
                })()}
                <div className="ml-auto inline-flex border border-[var(--t-border-2)] divide-x divide-[var(--t-border-2)]">
                  {(["DIARIO", "MENSUAL"] as const).map((a) => (
                    <button key={a} onClick={() => setAggCp(a)}
                      className={"px-2 py-0.5 text-[9px] uppercase tracking-wider " + (aggCp === a
                        ? "bg-[var(--t-accent)] text-[var(--t-on-accent)]"
                        : "text-[var(--t-text-dim)] hover:text-[var(--t-accent)]")}>{a}</button>
                  ))}
                </div>
                <div className="inline-flex border border-[var(--t-border-2)] divide-x divide-[var(--t-border-2)]">
                  {(["ARS", "USD"] as const).map((m) => (
                    <button key={m} onClick={() => setChartMoneda(m)}
                      className={"px-3 py-0.5 text-[10px] uppercase tracking-wider " + (chartMoneda === m
                        ? "bg-[var(--t-accent)] text-[var(--t-on-accent)]"
                        : "text-[var(--t-text-dim)] hover:text-[var(--t-accent)]")}>{m}</button>
                  ))}
                </div>
              </div>
              <div className="flex-1 min-h-0 p-2 wm-corner">
                {(() => {
                  const data = chartDataByMoneda[chartMoneda] || [];
                  const hasData = data.some((d) => d.bruto !== 0);
                  const color = chartMoneda === "ARS" ? COLOR_ARS : COLOR_USD;
                  if (!hasData) {
                    return (
                      <div className="h-full flex items-center justify-center text-[var(--t-text-muted)] text-[11px]">
                        Sin datos en {chartMoneda} para este rango.
                      </div>
                    );
                  }
                  return (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={data} margin={{ top: 4, right: 10, bottom: 4, left: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--t-border)" />
                        <XAxis dataKey="label" tick={{ fill: "var(--t-text-dim)", fontSize: 9 }}
                          axisLine={{ stroke: "var(--t-border-2)" }} tickLine={false}
                          interval={Math.max(0, Math.floor(data.length / 12))} angle={-35} textAnchor="end" height={24} />
                        <YAxis tick={{ fill: "var(--t-text-dim)", fontSize: 9 }} axisLine={{ stroke: "var(--t-border-2)" }}
                          tickLine={false} tickFormatter={(v: number) => fmtCompact(v)} width={55}
                          domain={[0, (max: number) => Math.ceil((max || 1) * 1.15)]} />
                        <Tooltip contentStyle={{ background: "var(--t-surface)", border: "1px solid var(--t-border-2)", fontSize: 11, fontFamily: "JetBrains Mono, monospace" }}
                          labelStyle={{ color: "var(--t-text-dim)" }} formatter={(v) => [fmtCompact(Number(v)), chartMoneda]} />
                        <Bar dataKey="bruto" isAnimationActive={false} maxBarSize={48}>
                          {data.map((d, i) => (
                            <Cell key={i} fill={mesSel && !d.key.startsWith(mesSel) ? "var(--t-border-2)" : color} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  );
                })()}
              </div>
            </div>
          </div>

          {/* DERECHA: meses (clic en un mes filtra contrapartes + gráfico) */}
          <div className="min-h-0 border border-[var(--t-border)] flex flex-col overflow-hidden">
            <div className="flex items-center px-3 py-1.5 border-b border-[var(--t-border)] bg-[var(--t-accent)]/10 shrink-0">
              <span className="text-[10px] uppercase tracking-widest text-[var(--t-accent)]">Meses</span>
              <span className="ml-auto text-[10px] text-[var(--t-text-dim)] truncate max-w-[60%]">
                {cpSel ? cpSel : "Consolidado"}
              </span>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto">
              <table className="w-full text-[11px] font-mono tabular-nums">
                <thead className="sticky top-0 bg-[var(--t-panel)] z-10 text-[9px] uppercase tracking-widest text-[var(--t-text-muted)]">
                  <tr>
                    <th className="!px-2 !py-1 text-left">Mes</th>
                    <th className="!px-2 !py-1 text-right">Bruto</th>
                  </tr>
                </thead>
                <tbody>
                  {mesesTabla.map((r) => {
                    const active = mesSel === r.key;
                    return (
                      <tr key={r.key} onClick={() => setMesSel(active ? null : r.key)}
                        className={`cursor-pointer border-b border-[var(--t-border)] transition-colors ${
                          active ? "bg-[var(--t-accent)]/10 text-[var(--t-accent)]" : "hover:bg-[var(--t-accent)]/5"}`}>
                        <td className="!px-2 !py-1 text-[var(--t-text)]">{r.label}</td>
                        <td className="!px-2 !py-1 text-right">{fmtFull(r.bruto)}</td>
                      </tr>
                    );
                  })}
                  {mesesTabla.length === 0 && (
                    <tr><td colSpan={2} className="text-center text-[var(--t-text-muted)] py-4">Sin meses</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
      </div>
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-2 h-[26px] text-[10px] font-semibold tracking-wide border transition-colors ${
        active
          ? "bg-[var(--t-accent)] text-[var(--t-on-accent)] border-[var(--t-accent)]"
          : "bg-transparent text-[var(--t-text-muted)] border-[var(--t-border-2)] hover:text-[var(--t-accent)] hover:border-[var(--t-accent)]"
      }`}
    >
      {children}
    </button>
  );
}

function MiniChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-1.5 h-[18px] text-[9px] font-semibold tracking-wide border transition-colors ${
        active
          ? "bg-[var(--t-accent)] text-[var(--t-on-accent)] border-[var(--t-accent)]"
          : "bg-transparent text-[var(--t-text-dim)] border-[var(--t-border-2)] hover:text-[var(--t-accent)] hover:border-[var(--t-accent)]"
      }`}
    >
      {children}
    </button>
  );
}
