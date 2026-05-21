"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

/**
 * COMPARAR INVERSIÓN — tab dentro de /retorno.
 * Layout: header con monto/moneda/selectores arriba; abajo grid 2 cols
 * (tabla de métricas izq, gráfico de cupones der) ocupando todo el espacio.
 */

interface BonoSeleccionable {
  id: string;
  ticker: string;
  ticker_corto: string;
  label: string;
  curva: string;
  tipo: string | null;
  moneda: "ARS" | "USD";
  vencimiento: string | null;
  meses_al_vto: number | null;
  cer_fijado: boolean;
}

interface FlujoEscalado {
  fecha: string;
  monto: number | null;
  cupon: number | null;
  amort: number | null;
  monto_por_100: number;
}

interface BonoPayload {
  id: string;
  ticker: string;
  ticker_corto: string;
  label: string;
  curva: string;
  tipo: string | null;
  moneda: "ARS" | "USD";
  vencimiento: string | null;
  meses_al_vto: number | null;
  cer_fijado: boolean;
  is_zero_coupon?: boolean | null;
  cer_emision?: number | null;
  metricas: {
    ultimo_precio: number | null;
    tea: number | null;
    tem: number | null;
    paridad: number | null;
    duration: number | null;
    mod_duration: number | null;
    convexity: number | null;
    tc_breakeven: number | null;
  };
  monto_input: number;
  monto_efectivo: number | null;
  vn_nominal: number | null;
  flujos: FlujoEscalado[];
  n_flujos: number;
}

interface CompararResp {
  a: BonoPayload;
  b: BonoPayload;
  meta: {
    monto_input: number;
    moneda_input: "ARS" | "USD";
    mep_aplicado: number | null;
    warnings: string[];
  };
}

const WARNING_LABELS: Record<string, string> = {
  cross_moneda: "Monedas distintas — la conversión usa MEP live constante.",
  sin_precio_live: "Algún bono no tiene precio live — flujos sin escalar al monto.",
  mep_faltante: "No hay MEP disponible para convertir el monto.",
  cer_proyectado_constante: "Bonos CER: los flujos futuros se proyectan con el último CER publicado constante (no proyección de inflación).",
};

const fmt = (n: number | null | undefined, dig = 2): string =>
  n == null ? "—" : n.toLocaleString("es-AR", { minimumFractionDigits: dig, maximumFractionDigits: dig });

const fmtPct = (n: number | null | undefined): string =>
  n == null ? "—" : (n * 100).toFixed(2) + "%";

const fmtMoney = (n: number | null | undefined, moneda: string): string =>
  n == null ? "—" : `${moneda === "USD" ? "US$" : "$"}${Math.round(n).toLocaleString("es-AR")}`;

function fmtFechaCorta(s: string): string {
  const d = new Date(s.slice(0, 10));
  if (isNaN(d.getTime())) return s;
  return `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}/${String(d.getUTCFullYear()).slice(2)}`;
}

function BonoSelector({
  label,
  bonos,
  selected,
  onChange,
  color,
}: {
  label: string;
  bonos: BonoSeleccionable[];
  selected: string;
  onChange: (id: string) => void;
  color: string;
}) {
  return (
    <div className="flex items-center gap-1">
      <span className="text-[9px] uppercase tracking-wide font-semibold shrink-0" style={{ color }}>
        {label}
      </span>
      <select
        value={selected}
        onChange={(e) => onChange(e.target.value)}
        className="flex-1 bg-black border border-[#2a2a2a] px-2 py-0.5 text-[10px] text-[#d0d0d0] font-mono focus:border-[#ff9900] focus:outline-none"
      >
        <option value="">— elegir bono —</option>
        {bonos.map((b) => (
          <option key={b.id} value={b.id}>
            {b.moneda} · {b.label}{b.cer_fijado ? " (CER fij.)" : ""} · {b.curva} · {b.vencimiento ?? "—"}
          </option>
        ))}
      </select>
    </div>
  );
}

function MetricRow({
  label,
  a,
  b,
  highlight,
}: {
  label: string;
  a: string;
  b: string;
  highlight?: boolean;
}) {
  return (
    <tr className={highlight ? "bg-[#0e0e0e]" : ""}>
      <td className="text-right px-2 py-0.5 font-mono text-[#d0d0d0] whitespace-nowrap">{a}</td>
      <td className="text-center px-2 py-0.5 text-[8px] text-[#555555] uppercase tracking-wide whitespace-nowrap">{label}</td>
      <td className="text-left px-2 py-0.5 font-mono text-[#d0d0d0] whitespace-nowrap">{b}</td>
    </tr>
  );
}

const COLOR_A = "#ff9900";
const COLOR_B = "#3fbf6f";

export function CompararInversionView() {
  const [bonos, setBonos] = useState<BonoSeleccionable[]>([]);
  const [aId, setAId] = useState("");
  const [bId, setBId] = useState("");
  const [monto, setMonto] = useState("1000000");
  const [moneda, setMoneda] = useState<"ARS" | "USD">("ARS");
  // Modo del gráfico: "renta" = solo cupones (default, así no los aplasta el
  // bullet de amortización); "total" = cupón + capital apilados.
  const [modoChart, setModoChart] = useState<"renta" | "total">("renta");
  const [data, setData] = useState<CompararResp | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/comparar/bonos", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((j) => setBonos(j as BonoSeleccionable[]))
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  useEffect(() => {
    if (!aId || !bId) {
      setData(null);
      return;
    }
    const m = Number(monto);
    if (!m || m <= 0) {
      setData(null);
      return;
    }
    setLoading(true);
    setError(null);
    const qs = `a=${encodeURIComponent(aId)}&b=${encodeURIComponent(bId)}&monto=${m}&moneda=${moneda}`;
    fetch(`/api/comparar?${qs}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((j) => setData(j as CompararResp))
      .catch((e) => {
        setData(null);
        setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => setLoading(false));
  }, [aId, bId, monto, moneda]);

  // Agrupamos flujos por mes para que cupones con fechas distintas pero del
  // mismo mes aparezcan juntos. Según modo: cupón (renta) o cupón+amort (total).
  const flujosMerged = useMemo(() => {
    if (!data) return [];
    const pick = (f: FlujoEscalado): number =>
      modoChart === "renta" ? (f.cupon ?? 0) : (f.monto ?? 0);
    const map = new Map<string, { mes: string; A: number; B: number }>();
    for (const f of data.a.flujos) {
      const mes = f.fecha.slice(0, 7);
      const ex = map.get(mes) ?? { mes, A: 0, B: 0 };
      ex.A += pick(f);
      map.set(mes, ex);
    }
    for (const f of data.b.flujos) {
      const mes = f.fecha.slice(0, 7);
      const ex = map.get(mes) ?? { mes, A: 0, B: 0 };
      ex.B += pick(f);
      map.set(mes, ex);
    }
    return Array.from(map.values()).sort((x, y) => x.mes.localeCompare(y.mes));
  }, [data, modoChart]);

  return (
    <div className="h-full min-h-0 flex flex-col p-2 gap-2">
      {/* Toolbar: monto + moneda + selectores */}
      <div className="border border-[#1a1a1a] bg-[#080808] p-2 shrink-0 flex items-end gap-3 flex-wrap">
        <div>
          <div className="text-[8px] text-[#555555] uppercase mb-0.5">Monto a invertir</div>
          <div className="flex items-stretch">
            <input
              value={monto}
              onChange={(e) => setMonto(e.target.value.replace(/[^0-9]/g, ""))}
              className="w-32 bg-black border border-[#2a2a2a] px-2 py-0.5 text-[11px] text-[#d0d0d0] font-mono focus:border-[#ff9900] focus:outline-none"
            />
            <div className="flex">
              {(["ARS", "USD"] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setMoneda(m)}
                  className={`px-2 py-0.5 text-[10px] font-semibold border-y border-r transition-colors ${
                    moneda === m
                      ? "bg-[#ff9900] text-black border-[#ff9900]"
                      : "bg-transparent text-[#555555] border-[#2a2a2a] hover:text-[#ff9900]"
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="flex-1 min-w-[260px] flex flex-col gap-1">
          <BonoSelector label="A" bonos={bonos} selected={aId} onChange={setAId} color={COLOR_A} />
          <BonoSelector label="B" bonos={bonos} selected={bId} onChange={setBId} color={COLOR_B} />
        </div>
        {loading && <span className="text-[10px] text-[#555555] italic">cargando…</span>}
        {error && <span className="text-[10px] text-[#ff7f7f] italic">{error}</span>}
      </div>

      {/* Cuerpo: tabla izq + gráfico der */}
      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[420px_1fr] gap-2">
        {/* Tabla de métricas */}
        <div className="border border-[#1a1a1a] bg-[#080808] min-h-0 overflow-y-auto">
          {data ? (
            <table className="w-full text-[11px]">
              <thead className="sticky top-0 bg-[#080808] z-10">
                <tr>
                  <th className="text-right px-2 py-1 font-semibold text-[11px]" style={{ color: COLOR_A }}>
                    {data.a.label}
                  </th>
                  <th className="text-center px-2 py-1 text-[8px] uppercase text-[#555555]">métrica</th>
                  <th className="text-left px-2 py-1 font-semibold text-[11px]" style={{ color: COLOR_B }}>
                    {data.b.label}
                  </th>
                </tr>
              </thead>
              <tbody>
                <MetricRow label="Curva" a={data.a.curva} b={data.b.curva} />
                <MetricRow label="Tipo" a={data.a.tipo ?? "—"} b={data.b.tipo ?? "—"} highlight />
                <MetricRow label="Moneda" a={data.a.moneda} b={data.b.moneda} />
                <MetricRow
                  label="Vencimiento"
                  a={data.a.vencimiento ?? "—"}
                  b={data.b.vencimiento ?? "—"}
                  highlight
                />
                <MetricRow
                  label="Meses al vto"
                  a={data.a.meses_al_vto != null ? fmt(data.a.meses_al_vto, 1) : "—"}
                  b={data.b.meses_al_vto != null ? fmt(data.b.meses_al_vto, 1) : "—"}
                />
                <MetricRow
                  label="Último precio"
                  a={fmt(data.a.metricas.ultimo_precio)}
                  b={fmt(data.b.metricas.ultimo_precio)}
                  highlight
                />
                <MetricRow label="TEA" a={fmtPct(data.a.metricas.tea)} b={fmtPct(data.b.metricas.tea)} />
                <MetricRow
                  label="TEM"
                  a={fmtPct(data.a.metricas.tem)}
                  b={fmtPct(data.b.metricas.tem)}
                  highlight
                />
                <MetricRow
                  label="Duration"
                  a={fmt(data.a.metricas.duration)}
                  b={fmt(data.b.metricas.duration)}
                />
                <MetricRow
                  label="Mod. Duration"
                  a={fmt(data.a.metricas.mod_duration)}
                  b={fmt(data.b.metricas.mod_duration)}
                  highlight
                />
                <MetricRow
                  label="Paridad"
                  a={fmt(data.a.metricas.paridad)}
                  b={fmt(data.b.metricas.paridad)}
                />
                <MetricRow
                  label="Convexity"
                  a={fmt(data.a.metricas.convexity)}
                  b={fmt(data.b.metricas.convexity)}
                  highlight
                />
                <MetricRow
                  label="TC Breakeven"
                  a={fmt(data.a.metricas.tc_breakeven)}
                  b={fmt(data.b.metricas.tc_breakeven)}
                />
                <MetricRow
                  label="N° cupones"
                  a={String(data.a.n_flujos)}
                  b={String(data.b.n_flujos)}
                  highlight
                />
                <MetricRow
                  label="Monto efectivo"
                  a={fmtMoney(data.a.monto_efectivo, data.a.moneda)}
                  b={fmtMoney(data.b.monto_efectivo, data.b.moneda)}
                />
                <MetricRow
                  label="VN nominal"
                  a={data.a.vn_nominal != null ? fmt(data.a.vn_nominal, 0) : "—"}
                  b={data.b.vn_nominal != null ? fmt(data.b.vn_nominal, 0) : "—"}
                  highlight
                />
              </tbody>
            </table>
          ) : (
            <div className="h-full flex items-center justify-center text-[#555555] text-[11px]">
              Elegí 2 bonos para comparar
            </div>
          )}
        </div>

        {/* Gráfico */}
        <div className="border border-[#1a1a1a] bg-[#080808] min-h-0 flex flex-col">
          <div className="flex items-center gap-2 px-2 pt-1.5 shrink-0">
            <span className="text-[9px] text-[#ff9900] tracking-widest">
              FLUJOS / MES
            </span>
            <div className="flex gap-1">
              <button
                onClick={() => setModoChart("renta")}
                className={`px-1.5 py-0.5 text-[9px] font-semibold border transition-colors ${
                  modoChart === "renta"
                    ? "bg-[#ff9900] text-black border-[#ff9900]"
                    : "bg-transparent text-[#555555] border-[#2a2a2a] hover:text-[#ff9900]"
                }`}
              >
                RENTA
              </button>
              <button
                onClick={() => setModoChart("total")}
                className={`px-1.5 py-0.5 text-[9px] font-semibold border transition-colors ${
                  modoChart === "total"
                    ? "bg-[#ff9900] text-black border-[#ff9900]"
                    : "bg-transparent text-[#555555] border-[#2a2a2a] hover:text-[#ff9900]"
                }`}
              >
                TOTAL
              </button>
            </div>
            <span className="text-[8px] text-[#555555]">
              {modoChart === "renta" ? "solo cupones" : "cupón + amortización"} · {data?.meta.moneda_input ?? moneda}
            </span>
          </div>
          <div className="flex-1 min-h-0 p-1">
            {data && flujosMerged.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={flujosMerged} margin={{ top: 8, right: 16, left: 8, bottom: 18 }}>
                  <CartesianGrid stroke="#1a1a1a" strokeDasharray="2 3" vertical={false} />
                  <XAxis
                    dataKey="mes"
                    tick={{ fontSize: 9, fill: "#808080" }}
                    axisLine={{ stroke: "#2a2a2a" }}
                    tickLine={false}
                    angle={-35}
                    textAnchor="end"
                    height={36}
                  />
                  <YAxis
                    tick={{ fontSize: 9, fill: "#808080" }}
                    axisLine={{ stroke: "#2a2a2a" }}
                    tickLine={false}
                    width={70}
                    tickFormatter={(v: number) =>
                      v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}M` :
                      v >= 1_000 ? `${(v / 1_000).toFixed(0)}k` :
                      v.toFixed(0)
                    }
                  />
                  <Tooltip
                    contentStyle={{
                      background: "#0e0e0e",
                      border: "1px solid #2a2a2a",
                      fontSize: 11,
                      fontFamily: "JetBrains Mono, monospace",
                    }}
                    labelStyle={{ color: "#ff9900" }}
                    formatter={(v, name) => [fmt(Number(v), 0), String(name)]}
                    labelFormatter={(v) => fmtFechaCorta(`${v}-01`).slice(3)}
                  />
                  <Legend
                    verticalAlign="top"
                    align="right"
                    height={18}
                    wrapperStyle={{ fontSize: 10 }}
                  />
                  <Bar dataKey="A" fill={COLOR_A} name={data.a.label} />
                  <Bar dataKey="B" fill={COLOR_B} name={data.b.label} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-[#555555] text-[11px]">
                El gráfico aparece cuando elegís los dos bonos.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Warnings */}
      {data && (data.meta.warnings.length > 0 || data.meta.mep_aplicado != null) && (
        <div className="shrink-0 flex flex-wrap gap-x-3 gap-y-0.5">
          {data.meta.warnings.map((w) => (
            <span key={w} className="text-[9px] text-[#ffcc66]">
              ⚠ {WARNING_LABELS[w] ?? w}
            </span>
          ))}
          {data.meta.mep_aplicado != null && (
            <span className="text-[9px] text-[#555555]">
              MEP aplicado: {fmt(data.meta.mep_aplicado, 2)}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
