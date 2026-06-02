"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

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

interface ContraparteDoc {
  cuenta?: string;
  id_cuenta?: string;
  nombre?: string;
  grupo?: string;
}

const COLOR_ARS = "#094293";
const COLOR_USD = "var(--t-pos)";
const MESES = [
  "Ene",
  "Feb",
  "Mar",
  "Abr",
  "May",
  "Jun",
  "Jul",
  "Ago",
  "Sep",
  "Oct",
  "Nov",
  "Dic",
];

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
  const [flujos, setFlujos] = useState<FlujoDoc[]>([]);
  const [contrapartes, setContrapartes] = useState<ContraparteDoc[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const res = await fetch("/api/contrapartes", { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        if (cancelled) return;
        setFlujos(Array.isArray(json.flujos) ? json.flujos : []);
        setContrapartes(
          Array.isArray(json.contrapartes) ? json.contrapartes : []
        );
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

  // Map contraparte.nombre → grupo (Fondos / ALYC / Bancos / …)
  const grupoMap = useMemo(() => {
    const m: Record<string, string> = {};
    for (const c of contrapartes) {
      if (c.nombre && c.grupo) m[c.nombre] = c.grupo;
    }
    return m;
  }, [contrapartes]);

  const gruposDisp = useMemo(
    () =>
      Array.from(
        new Set(contrapartes.map((c) => c.grupo).filter(Boolean) as string[])
      ).sort(),
    [contrapartes]
  );
  const monedasDisp = useMemo(
    () =>
      Array.from(
        new Set(flujos.map((f) => f.moneda).filter(Boolean) as string[])
      ).sort(),
    [flujos]
  );

  const [grupoSel, setGrupoSel] = useState<string[]>([]);
  const [monSel, setMonSel] = useState<string[]>([]);
  const [dia, setDia] = useState<string>(""); // vacío = rango; si hay valor = solo ese día (detalle)
  const [cpSel, setCpSel] = useState<string | null>(null);
  const [monedaTabla, setMonedaTabla] = useState<string>("");
  const [chartMoneda, setChartMoneda] = useState<"ARS" | "USD">("ARS");
  const [aggCp, setAggCp] = useState<"DIARIO" | "MENSUAL">("MENSUAL");

  useEffect(() => {
    if (gruposDisp.length && grupoSel.length === 0) setGrupoSel(gruposDisp);
  }, [gruposDisp, grupoSel.length]);
  useEffect(() => {
    if (monedasDisp.length && monSel.length === 0) setMonSel(monedasDisp);
  }, [monedasDisp, monSel.length]);

  // Fechas únicas (YYYY-MM-DD) ordenadas ASC. Base del DualRange.
  const diasAll = useMemo(() => {
    const set = new Set<string>();
    for (const f of flujos) set.add(f.concertacion.slice(0, 10));
    return Array.from(set).sort();
  }, [flujos]);

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
    return flujos.filter((f) => {
      const dd = f.concertacion.slice(0, 10);
      if (desde && dd < desde) return false;
      if (hasta && dd > hasta) return false;
      if (f.moneda && !monSel.includes(f.moneda)) return false;
      if (grupoSel.length && grupoSel.length !== gruposDisp.length) {
        const g = f.contraparte ? grupoMap[f.contraparte] : undefined;
        if (!g || !grupoSel.includes(g)) return false;
      }
      return true;
    });
  }, [flujos, desde, hasta, monSel, grupoSel, gruposDisp.length, grupoMap]);

  // Operaciones del día seleccionado, ordenadas por |bruto| DESC — las más
  // grandes primero, para ver dónde se concentra el flujo del día.
  const opsDelDia = useMemo(() => {
    if (!dia) return [];
    return [...filtered].sort((a, b) => {
      return Math.abs(b.bruto || 0) - Math.abs(a.bruto || 0);
    });
  }, [filtered, dia]);

  // Σ volumen por moneda y por bucket (día o mes) — barras (NO acumulado).
  const chartDataByMoneda = useMemo(() => {
    const out: Record<string, { label: string; key: string; bruto: number }[]> = {};
    for (const moneda of monSel) {
      const sub = filtered.filter((f) => f.moneda === moneda);
      const buckets: Record<string, number> = {};
      for (const f of sub) {
        const k = aggCp === "MENSUAL" ? f.concertacion.slice(0, 7) : f.concertacion.slice(0, 10);
        buckets[k] = (buckets[k] || 0) + (f.bruto || 0);
      }
      out[moneda] = Object.keys(buckets).sort().map((k) => ({
        key: k,
        label: aggCp === "MENSUAL" ? mesLabel(k) : k.slice(5),  // DD-MM corto
        bruto: buckets[k],
      }));
    }
    return out;
  }, [filtered, monSel, aggCp]);

  // Tabla de contrapartes (moneda seleccionada)
  const contrapartesTabla = useMemo(() => {
    const sub = filtered.filter((f) => f.moneda === monedaTabla);
    const agg: Record<string, number> = {};
    for (const f of sub) {
      const k = f.contraparte || "—";
      agg[k] = (agg[k] || 0) + (f.bruto || 0);
    }
    const total = Object.values(agg).reduce((a, b) => a + b, 0);
    return Object.entries(agg)
      .map(([cp, bruto]) => ({
        cp,
        bruto,
        share: total ? (bruto / total) * 100 : 0,
      }))
      .sort((a, b) => b.bruto - a.bruto);
  }, [filtered, monedaTabla]);

  // Meses: por defecto consolidado (todas las contrapartes) — o de la contraparte seleccionada
  const mesesTabla = useMemo(() => {
    const sub = filtered.filter(
      (f) =>
        f.moneda === monedaTabla && (cpSel ? f.contraparte === cpSel : true)
    );
    const monthly: Record<string, number> = {};
    for (const f of sub) {
      const k = f.concertacion.slice(0, 7);
      monthly[k] = (monthly[k] || 0) + (f.bruto || 0);
    }
    return Object.entries(monthly)
      .map(([k, bruto]) => ({ key: k, label: mesLabel(k), bruto }))
      .sort((a, b) => (a.key < b.key ? 1 : -1));
  }, [filtered, cpSel, monedaTabla]);

  useEffect(() => {
    setCpSel(null);
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
  if (flujos.length === 0) {
    return (
      <div className="h-full flex items-center justify-center text-[var(--t-text-muted)] text-sm">
        Sin datos.
      </div>
    );
  }

  return (
    <div className="h-full min-h-0 flex flex-col p-3 gap-3 overflow-hidden">
      {/* Filtros */}
      <div className="border border-[var(--t-border)] bg-[var(--t-panel)] p-3 space-y-2 shrink-0">
        <div className="flex items-end gap-3 flex-wrap">
          <Labeled label="Desde">
            <input
              type="date" value={desde} min={minDia} max={hasta || maxDia}
              onChange={(e) => setDesde(e.target.value)}
              className="bg-[var(--t-surface)] border border-[var(--t-border-2)] text-[var(--t-text)] text-[11px] px-2 py-1 font-mono focus:border-[var(--t-accent)] outline-none [color-scheme:dark]"
            />
          </Labeled>
          <Labeled label="Hasta">
            <input
              type="date" value={hasta} min={desde || minDia} max={maxDia}
              onChange={(e) => setHasta(e.target.value)}
              className="bg-[var(--t-surface)] border border-[var(--t-border-2)] text-[var(--t-text)] text-[11px] px-2 py-1 font-mono focus:border-[var(--t-accent)] outline-none [color-scheme:dark]"
            />
          </Labeled>
          <Labeled label="Día (detalle)">
            <div className="flex items-center gap-1">
              <input
                type="date" value={dia} min={minDia} max={maxDia}
                onChange={(e) => setDia(e.target.value)}
                className="bg-[var(--t-surface)] border border-[var(--t-border-2)] text-[var(--t-text)] text-[11px] px-2 py-1 font-mono focus:border-[var(--t-accent)] outline-none [color-scheme:dark]"
              />
              {dia && (
                <button onClick={() => setDia("")} title="Limpiar día"
                  className="px-2 py-1 text-[10px] border border-[var(--t-border-2)] text-[var(--t-text-muted)] hover:text-[var(--t-accent)]">✕</button>
              )}
            </div>
          </Labeled>
          <Labeled label="Grupo">
            <div className="flex items-center gap-1 h-[26px] flex-wrap">
              {gruposDisp.map((g) => (
                <Chip
                  key={g}
                  active={grupoSel.includes(g)}
                  onClick={() =>
                    setGrupoSel((prev) =>
                      prev.includes(g)
                        ? prev.filter((x) => x !== g)
                        : [...prev, g]
                    )
                  }
                >
                  {g}
                </Chip>
              ))}
            </div>
          </Labeled>
          <Labeled label="Moneda">
            <div className="flex items-center gap-1 h-[26px]">
              {monedasDisp.map((m) => (
                <Chip
                  key={m}
                  active={monSel.includes(m)}
                  onClick={() =>
                    setMonSel((prev) =>
                      prev.includes(m)
                        ? prev.filter((x) => x !== m)
                        : [...prev, m]
                    )
                  }
                >
                  {m}
                </Chip>
              ))}
            </div>
          </Labeled>
          <Labeled label="Total filtrado">
            <div className="h-[26px] flex items-center text-[11px] font-mono text-[var(--t-text)]">
              {filtered.length} ops
            </div>
          </Labeled>
        </div>
      </div>

      {/* Si hay día específico: tabla de operaciones del día. Si no: contrapartes + meses. */}
      {dia ? (
        <div className="flex-1 min-h-0 border border-[var(--t-border)] bg-[var(--t-panel)] overflow-hidden flex flex-col">
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
                  <tr
                    key={`${o.boleto ?? ""}-${i}`}
                    className="border-b border-[var(--t-border)] hover:bg-[var(--t-accent)]/5"
                  >
                    <td className="!px-2 !py-1 text-[var(--t-text-dim)]">
                      {o.boleto ?? "—"}
                    </td>
                    <td className="!px-2 !py-1 text-[var(--t-text)]">
                      {o.tipoOperacion ?? "—"}
                    </td>
                    <td className="!px-2 !py-1 text-[var(--t-text)] truncate max-w-[180px]">
                      {o.cuenta ?? "—"}
                    </td>
                    <td className="!px-2 !py-1 text-[var(--t-text)]">
                      {o.contraparte ?? "—"}
                    </td>
                    <td className="!px-2 !py-1 text-[var(--t-text-dim)]">
                      {o.segmento ?? "—"}
                    </td>
                    <td className="!px-2 !py-1 text-[var(--t-text-dim)] truncate max-w-[260px]">
                      {o.unidad ?? "—"}
                    </td>
                    <td className="!px-2 !py-1 text-right text-[var(--t-text)]">
                      {fmtFull(o.bruto ?? 0)}
                    </td>
                    <td className="!px-2 !py-1 text-[var(--t-accent)]">
                      {o.moneda ?? ""}
                    </td>
                  </tr>
                ))}
                {opsDelDia.length === 0 && (
                  <tr>
                    <td colSpan={8} className="text-center text-[var(--t-text-muted)] py-4">
                      Sin operaciones en este día.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
      /* Fila 1: Tabla contrapartes | Tabla meses (misma altura, flex-1) */
      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-2 gap-3 overflow-hidden">
        {/* Contrapartes */}
        <div className="border border-[var(--t-border)] bg-[var(--t-panel)] overflow-hidden flex flex-col min-h-0">
          <div className="flex-1 min-h-0 overflow-y-auto">
            <table className="w-full text-[11px] font-mono">
              <thead className="sticky top-0 bg-[var(--t-panel)] z-10">
                <tr className="border-b border-[var(--t-border)]">
                  <th className="!px-2 !py-1 text-left text-[var(--t-accent)] font-semibold tracking-wide uppercase">
                    CONTRAPARTE
                    <span className="ml-1 text-[10px] text-[var(--t-text-muted)] font-normal normal-case">
                      ({contrapartesTabla.length})
                    </span>
                  </th>
                  <th className="!px-2 !py-1 text-right text-[var(--t-accent)] font-semibold tracking-wide uppercase">
                    BRUTO
                  </th>
                  <th className="!px-2 !py-1 text-right text-[var(--t-accent)] font-semibold tracking-wide uppercase">
                    <div className="flex items-center justify-end gap-1">
                      <span>%</span>
                      <span className="ml-1 flex items-center gap-1">
                        {monSel.map((m) => (
                          <MiniChip
                            key={m}
                            active={monedaTabla === m}
                            onClick={() => setMonedaTabla(m)}
                          >
                            {m}
                          </MiniChip>
                        ))}
                      </span>
                    </div>
                  </th>
                </tr>
              </thead>
              <tbody>
                {contrapartesTabla.map((r) => {
                  const active = cpSel === r.cp;
                  return (
                    <tr
                      key={r.cp}
                      onClick={() => setCpSel(active ? null : r.cp)}
                      className={`cursor-pointer border-b border-[var(--t-border)] transition-colors ${
                        active
                          ? "bg-[var(--t-accent)]/10 text-[var(--t-accent)]"
                          : "hover:bg-[var(--t-accent)]/5"
                      }`}
                    >
                      <td className="!px-2 !py-1 text-[var(--t-text)]">{r.cp}</td>
                      <td className="!px-2 !py-1 text-right">
                        {fmtFull(r.bruto)}
                      </td>
                      <td className="!px-2 !py-1 text-right text-[var(--t-text-dim)]">
                        {r.share.toFixed(1)}%
                      </td>
                    </tr>
                  );
                })}
                {contrapartesTabla.length === 0 && (
                  <tr>
                    <td
                      colSpan={3}
                      className="text-center text-[var(--t-text-muted)] py-4"
                    >
                      Sin datos
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Meses */}
        <div className="border border-[var(--t-border)] bg-[var(--t-panel)] overflow-hidden flex flex-col min-h-0">
          <div className="flex items-center px-3 py-1.5 border-b border-[var(--t-border)] bg-[var(--t-accent)]/10 shrink-0">
            <span className="text-[11px] font-semibold text-[var(--t-accent)] tracking-wide uppercase">
              MESES
            </span>
            <span className="ml-auto text-[10px] text-[var(--t-text-dim)] truncate max-w-[60%]">
              {cpSel ? cpSel : "Consolidado"}
            </span>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto">
            <table className="w-full text-[11px] font-mono">
              <thead className="sticky top-0 bg-[var(--t-panel)] z-10">
                <tr>
                  <th className="!px-2 !py-1 text-left">MES</th>
                  <th className="!px-2 !py-1 text-right">BRUTO</th>
                </tr>
              </thead>
              <tbody>
                {mesesTabla.map((r) => (
                  <tr
                    key={r.key}
                    className="border-b border-[var(--t-border)] hover:bg-[var(--t-accent)]/5"
                  >
                    <td className="!px-2 !py-1 text-[var(--t-text)]">{r.label}</td>
                    <td className="!px-2 !py-1 text-right">
                      {fmtFull(r.bruto)}
                    </td>
                  </tr>
                ))}
                {mesesTabla.length === 0 && (
                  <tr>
                    <td
                      colSpan={2}
                      className="text-center text-[var(--t-text-muted)] py-4"
                    >
                      Sin meses
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      )}

      {/* Fila 2: Charts acumulados — solo en modo rango. Con un día específico
           el chart muestra un solo punto y no aporta; la tabla alcanza. */}
      {!dia && (
      <div className="border border-[var(--t-border)] bg-[var(--t-panel)] shrink-0">
        <div className="flex items-center gap-2 px-3 py-1.5 border-b border-[var(--t-border)] bg-[var(--t-accent)]/10">
          <span className="text-[11px] font-semibold text-[var(--t-accent)] tracking-wide uppercase">
            VOLUMEN OPERADO
          </span>
          {/* Toggle DIARIO/MENSUAL */}
          <div className="ml-auto inline-flex border border-[var(--t-border-2)] divide-x divide-[var(--t-border-2)]">
            {(["DIARIO", "MENSUAL"] as const).map((a) => (
              <button key={a} onClick={() => setAggCp(a)}
                className={"px-2 py-0.5 text-[9px] uppercase tracking-wider " + (aggCp === a
                  ? "bg-[var(--t-accent)] text-[var(--t-on-accent)]"
                  : "bg-[var(--t-panel)] text-[var(--t-text-dim)] hover:text-[var(--t-accent)]")}>{a}</button>
            ))}
          </div>
          {/* Toggle ARS/USD */}
          <div className="inline-flex border border-[var(--t-border-2)] divide-x divide-[var(--t-border-2)]">
            {(["ARS", "USD"] as const).map((m) => (
              <button key={m} onClick={() => setChartMoneda(m)}
                className={"px-3 py-0.5 text-[10px] uppercase tracking-wider " + (chartMoneda === m
                  ? "bg-[var(--t-accent)] text-[var(--t-on-accent)]"
                  : "bg-[var(--t-panel)] text-[var(--t-text-dim)] hover:text-[var(--t-accent)]")}>{m}</button>
            ))}
          </div>
        </div>
        <div className="p-2 wm-corner">
          {(() => {
            const data = chartDataByMoneda[chartMoneda] || [];
            const hasData = data.some((d) => d.bruto !== 0);
            const color = chartMoneda === "ARS" ? COLOR_ARS : COLOR_USD;
            const totalVol = data.reduce((a, d) => a + d.bruto, 0);
            if (!hasData) {
              return (
                <div className="h-[200px] flex items-center justify-center text-[var(--t-text-muted)] text-[11px]">
                  Sin datos en {chartMoneda} para este rango.
                </div>
              );
            }
            return (
              <>
                <div className="flex items-center px-1 pb-1 text-[10px] tracking-wide">
                  <span className="ml-auto text-[var(--t-text-dim)]">
                    Total: <span style={{ color }} className="font-semibold">{fmtCompact(totalVol)} {chartMoneda}</span>
                  </span>
                </div>
                <div className="h-[200px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data} margin={{ top: 4, right: 10, bottom: 20, left: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--t-border)" />
                      <XAxis dataKey="label" tick={{ fill: "var(--t-text-dim)", fontSize: 9 }}
                        axisLine={{ stroke: "var(--t-border-2)" }} tickLine={false}
                        interval={Math.max(0, Math.floor(data.length / 12))} angle={-35} textAnchor="end" height={24} />
                      <YAxis tick={{ fill: "var(--t-text-dim)", fontSize: 9 }} axisLine={{ stroke: "var(--t-border-2)" }}
                        tickLine={false} tickFormatter={(v: number) => fmtCompact(v)} width={55}
                        domain={[0, (max: number) => Math.ceil((max || 1) * 1.15)]} />
                      <Tooltip contentStyle={{ background: "var(--t-surface)", border: "1px solid var(--t-border-2)", fontSize: 11, fontFamily: "JetBrains Mono, monospace" }}
                        labelStyle={{ color: "var(--t-text-dim)" }} formatter={(v) => [fmtCompact(Number(v)), chartMoneda]} />
                      <Bar dataKey="bruto" fill={color} isAnimationActive={false} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </>
            );
          })()}
        </div>
      </div>
      )}
    </div>
  );
}

function Labeled({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1 min-w-0">
      <span className="text-[10px] tracking-wide text-[var(--t-text-muted)] uppercase">
        {label}
      </span>
      {children}
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
