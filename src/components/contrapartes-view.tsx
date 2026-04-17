"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AreaChart,
  Area,
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
const COLOR_USD = "#00cc66";
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

function niceScale(
  min: number,
  max: number,
  maxTicks = 5
): { min: number; max: number; ticks: number[] } {
  if (!isFinite(min) || !isFinite(max)) return { min: 0, max: 1, ticks: [0, 1] };
  if (min === max) {
    const d = Math.abs(min) || 1;
    return { min: min - d, max: max + d, ticks: [min - d, min, min + d] };
  }
  const range = max - min;
  const roughStep = range / Math.max(1, maxTicks - 1);
  const pow10 = Math.pow(10, Math.floor(Math.log10(roughStep)));
  const normalized = roughStep / pow10;
  const niceStep =
    normalized < 1.5 ? 1 : normalized < 3 ? 2 : normalized < 7 ? 5 : 10;
  const step = niceStep * pow10;
  const niceMin = Math.floor(min / step) * step;
  const niceMax = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let t = niceMin; t <= niceMax + step / 2; t += step)
    ticks.push(+t.toFixed(10));
  return { min: niceMin, max: niceMax, ticks };
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
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [cpSel, setCpSel] = useState<string | null>(null);
  const [monedaTabla, setMonedaTabla] = useState<string>("");

  useEffect(() => {
    if (gruposDisp.length && grupoSel.length === 0) setGrupoSel(gruposDisp);
  }, [gruposDisp, grupoSel.length]);
  useEffect(() => {
    if (monedasDisp.length && monSel.length === 0) setMonSel(monedasDisp);
  }, [monedasDisp, monSel.length]);

  const mesesAll = useMemo(() => {
    const set = new Set<string>();
    for (const f of flujos) set.add(f.concertacion.slice(0, 7));
    return Array.from(set).sort();
  }, [flujos]);

  useEffect(() => {
    if (mesesAll.length && !desde) setDesde(mesesAll[0]);
    if (mesesAll.length && !hasta) setHasta(mesesAll[mesesAll.length - 1]);
  }, [mesesAll, desde, hasta]);

  useEffect(() => {
    if (monSel.length && !monedaTabla) setMonedaTabla(monSel[0]);
    else if (monSel.length && !monSel.includes(monedaTabla))
      setMonedaTabla(monSel[0]);
  }, [monSel, monedaTabla]);

  const filtered = useMemo(() => {
    return flujos.filter((f) => {
      const mes = f.concertacion.slice(0, 7);
      if (desde && mes < desde) return false;
      if (hasta && mes > hasta) return false;
      if (f.moneda && !monSel.includes(f.moneda)) return false;
      if (grupoSel.length && grupoSel.length !== gruposDisp.length) {
        const g = f.contraparte ? grupoMap[f.contraparte] : undefined;
        if (!g || !grupoSel.includes(g)) return false;
      }
      return true;
    });
  }, [flujos, desde, hasta, monSel, grupoSel, gruposDisp.length, grupoMap]);

  // Acumulado por moneda (para los charts abajo)
  const chartDataByMoneda = useMemo(() => {
    const out: Record<string, { label: string; key: string; acum: number }[]> =
      {};
    for (const moneda of monSel) {
      const sub = filtered.filter((f) => f.moneda === moneda);
      const monthly: Record<string, number> = {};
      for (const f of sub) {
        const k = f.concertacion.slice(0, 7);
        monthly[k] = (monthly[k] || 0) + (f.bruto || 0);
      }
      const keys = Object.keys(monthly).sort();
      let acum = 0;
      out[moneda] = keys.map((k) => {
        acum += monthly[k];
        return { key: k, label: mesLabel(k), acum };
      });
    }
    return out;
  }, [filtered, monSel]);

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
  }, [monedaTabla, desde, hasta]);

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center text-[#555555] text-sm">
        Cargando…
      </div>
    );
  }
  if (error) {
    return (
      <div className="h-full flex items-center justify-center text-[#ff3333] text-sm">
        Error: {error}
      </div>
    );
  }
  if (flujos.length === 0) {
    return (
      <div className="h-full flex items-center justify-center text-[#555555] text-sm">
        Sin datos.
      </div>
    );
  }

  return (
    <div className="h-full min-h-0 flex flex-col p-3 gap-3 overflow-hidden">
      {/* Filtros */}
      <div className="border border-[#1a1a1a] bg-[#080808] p-3 shrink-0">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Labeled label="Desde">
            <select
              value={desde}
              onChange={(e) => setDesde(e.target.value)}
              className="w-full bg-[#0e0e0e] border border-[#2a2a2a] text-[#d0d0d0] text-[11px] px-2 py-1 font-mono focus:border-[#ff9900] outline-none"
            >
              {mesesAll.map((k) => (
                <option key={k} value={k}>
                  {mesLabel(k)}
                </option>
              ))}
            </select>
          </Labeled>
          <Labeled label="Hasta">
            <select
              value={hasta}
              onChange={(e) => setHasta(e.target.value)}
              className="w-full bg-[#0e0e0e] border border-[#2a2a2a] text-[#d0d0d0] text-[11px] px-2 py-1 font-mono focus:border-[#ff9900] outline-none"
            >
              {mesesAll.map((k) => (
                <option key={k} value={k}>
                  {mesLabel(k)}
                </option>
              ))}
            </select>
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
        </div>
      </div>

      {/* Fila 1: Tabla contrapartes | Tabla meses (misma altura, flex-1) */}
      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-2 gap-3 overflow-hidden">
        {/* Contrapartes */}
        <div className="border border-[#1a1a1a] bg-[#080808] overflow-hidden flex flex-col min-h-0">
          <div className="flex-1 min-h-0 overflow-y-auto">
            <table className="w-full text-[11px] font-mono">
              <thead className="sticky top-0 bg-[#080808] z-10">
                <tr className="border-b border-[#1a1a1a]">
                  <th className="!px-2 !py-1 text-left text-[#ff9900] font-semibold tracking-wide uppercase">
                    CONTRAPARTE
                    <span className="ml-1 text-[10px] text-[#555555] font-normal normal-case">
                      ({contrapartesTabla.length})
                    </span>
                  </th>
                  <th className="!px-2 !py-1 text-right text-[#ff9900] font-semibold tracking-wide uppercase">
                    BRUTO
                  </th>
                  <th className="!px-2 !py-1 text-right text-[#ff9900] font-semibold tracking-wide uppercase">
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
                      className={`cursor-pointer border-b border-[#111111] transition-colors ${
                        active
                          ? "bg-[#ff9900]/10 text-[#ff9900]"
                          : "hover:bg-[#ff9900]/5"
                      }`}
                    >
                      <td className="!px-2 !py-1 text-[#d0d0d0]">{r.cp}</td>
                      <td className="!px-2 !py-1 text-right">
                        {fmtFull(r.bruto)}
                      </td>
                      <td className="!px-2 !py-1 text-right text-[#888888]">
                        {r.share.toFixed(1)}%
                      </td>
                    </tr>
                  );
                })}
                {contrapartesTabla.length === 0 && (
                  <tr>
                    <td
                      colSpan={3}
                      className="text-center text-[#555555] py-4"
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
        <div className="border border-[#1a1a1a] bg-[#080808] overflow-hidden flex flex-col min-h-0">
          <div className="flex items-center px-3 py-1.5 border-b border-[#1a1a1a] bg-[#ff9900]/10 shrink-0">
            <span className="text-[11px] font-semibold text-[#ff9900] tracking-wide uppercase">
              MESES
            </span>
            <span className="ml-auto text-[10px] text-[#888888] truncate max-w-[60%]">
              {cpSel ? cpSel : "Consolidado"}
            </span>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto">
            <table className="w-full text-[11px] font-mono">
              <thead className="sticky top-0 bg-[#080808] z-10">
                <tr>
                  <th className="!px-2 !py-1 text-left">MES</th>
                  <th className="!px-2 !py-1 text-right">BRUTO</th>
                </tr>
              </thead>
              <tbody>
                {mesesTabla.map((r) => (
                  <tr
                    key={r.key}
                    className="border-b border-[#111111] hover:bg-[#ff9900]/5"
                  >
                    <td className="!px-2 !py-1 text-[#d0d0d0]">{r.label}</td>
                    <td className="!px-2 !py-1 text-right">
                      {fmtFull(r.bruto)}
                    </td>
                  </tr>
                ))}
                {mesesTabla.length === 0 && (
                  <tr>
                    <td
                      colSpan={2}
                      className="text-center text-[#555555] py-4"
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

      {/* Fila 2: Charts acumulados — altura fija, 1 o 2 columnas según monSel */}
      <div className="border border-[#1a1a1a] bg-[#080808] shrink-0">
        <div className="flex items-center px-3 py-1.5 border-b border-[#1a1a1a] bg-[#ff9900]/10">
          <span className="text-[11px] font-semibold text-[#ff9900] tracking-wide uppercase">
            FLUJO ACUMULADO
          </span>
        </div>
        <div
          className={`p-2 grid gap-2 ${
            monSel.length === 2 ? "grid-cols-2" : "grid-cols-1"
          }`}
        >
          {monSel.length === 0 && (
            <div className="h-[180px] flex items-center justify-center text-[#555555] text-[11px]">
              Seleccioná al menos una moneda.
            </div>
          )}
          {monSel.map((moneda) => {
            const data = chartDataByMoneda[moneda] || [];
            const hasData = data.some((d) => d.acum !== 0);
            const color = moneda === "ARS" ? COLOR_ARS : COLOR_USD;
            const vals = data.map((d) => d.acum);
            const yScale = hasData
              ? niceScale(Math.min(0, ...vals), Math.max(0, ...vals), 4)
              : { min: 0, max: 1, ticks: [0, 1] };
            return (
              <div key={moneda}>
                <div className="flex items-center px-1 pb-1 text-[10px] tracking-wide">
                  <span style={{ color }} className="font-semibold">
                    {moneda}
                  </span>
                  <span className="ml-auto text-[#888888]">
                    Acum:{" "}
                    <span style={{ color }} className="font-semibold">
                      {data.length
                        ? fmtCompact(data[data.length - 1].acum)
                        : "--"}
                    </span>
                  </span>
                </div>
                {hasData ? (
                  <div className="h-[180px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart
                        data={data}
                        margin={{ top: 4, right: 10, bottom: 20, left: 0 }}
                      >
                        <defs>
                          <linearGradient
                            id={`grad-${moneda}`}
                            x1="0"
                            y1="0"
                            x2="0"
                            y2="1"
                          >
                            <stop
                              offset="0%"
                              stopColor={color}
                              stopOpacity={0.35}
                            />
                            <stop
                              offset="100%"
                              stopColor={color}
                              stopOpacity={0.02}
                            />
                          </linearGradient>
                        </defs>
                        <XAxis
                          dataKey="label"
                          tick={{ fill: "#808080", fontSize: 9 }}
                          axisLine={{ stroke: "#2a2a2a" }}
                          tickLine={false}
                          interval={Math.max(
                            0,
                            Math.floor(data.length / 8)
                          )}
                          angle={-35}
                          textAnchor="end"
                          height={24}
                        />
                        <YAxis
                          domain={[yScale.min, yScale.max]}
                          ticks={yScale.ticks}
                          tick={{ fill: "#808080", fontSize: 9 }}
                          axisLine={{ stroke: "#2a2a2a" }}
                          tickLine={false}
                          tickFormatter={(v: number) => fmtCompact(v)}
                          width={55}
                        />
                        <Tooltip
                          contentStyle={{
                            background: "#0e0e0e",
                            border: "1px solid #2a2a2a",
                            fontSize: 11,
                            fontFamily: "JetBrains Mono, monospace",
                          }}
                          labelStyle={{ color: "#808080" }}
                          formatter={(v) => [fmtCompact(Number(v)), moneda]}
                        />
                        <Area
                          type="monotone"
                          dataKey="acum"
                          stroke={color}
                          strokeWidth={2}
                          fill={`url(#grad-${moneda})`}
                          isAnimationActive={false}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <div className="h-[180px] flex items-center justify-center text-[#555555] text-[10px]">
                    Sin datos en {moneda}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
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
      <span className="text-[10px] tracking-wide text-[#555555] uppercase">
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
          ? "bg-[#ff9900] text-black border-[#ff9900]"
          : "bg-transparent text-[#555555] border-[#2a2a2a] hover:text-[#ff9900] hover:border-[#ff9900]"
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
          ? "bg-[#ff9900] text-black border-[#ff9900]"
          : "bg-transparent text-[#888888] border-[#2a2a2a] hover:text-[#ff9900] hover:border-[#ff9900]"
      }`}
    >
      {children}
    </button>
  );
}
