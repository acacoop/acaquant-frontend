"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

/**
 * COMPARAR INVERSIÓN — sub-tab de Estrategia.
 *
 * Mitad superior de la pantalla: selector A izq, tabla de métricas A vs B
 * en el centro, selector B + gráfico de cupones a la derecha. Mitad inferior
 * vacía (reservada para feature futura).
 *
 * Fase 1: universo Trading.Curvas (cer, tasa_fija, soberanos). BondsMaster
 * pendiente Fase 2 (ver memoria project-comparar-inversion-wip).
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
  flujos_cer_sin_proyectar: "Bonos CER: el gráfico muestra solo flujos con CER ya publicado, no proyectados.",
};

const fmt = (n: number | null | undefined, dig = 2): string =>
  n == null ? "—" : n.toLocaleString("es-AR", { minimumFractionDigits: dig, maximumFractionDigits: dig });

const fmtPct = (n: number | null | undefined): string =>
  n == null ? "—" : (n * 100).toFixed(2) + "%";

const fmtMoney = (n: number | null | undefined, moneda: string): string =>
  n == null ? "—" : `${moneda === "USD" ? "US$" : "$"} ${Math.round(n).toLocaleString("es-AR")}`;

function BonoSelector({
  label,
  bonos,
  selected,
  onChange,
}: {
  label: string;
  bonos: BonoSeleccionable[];
  selected: string;
  onChange: (id: string) => void;
}) {
  return (
    <div>
      <div className="text-[8px] text-[#555555] uppercase mb-0.5">{label}</div>
      <select
        value={selected}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-black border border-[#2a2a2a] px-2 py-1 text-[11px] text-[#d0d0d0] font-mono focus:border-[#ff9900] focus:outline-none"
      >
        <option value="">— elegir —</option>
        {bonos.map((b) => (
          <option key={b.id} value={b.id}>
            {b.moneda} · {b.label}{b.cer_fijado ? " (CER fijado)" : ""} · {b.curva} · {b.vencimiento ?? "—"}
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
}: {
  label: string;
  a: string;
  b: string;
}) {
  return (
    <tr className="border-b border-[#141414]">
      <td className="text-right px-2 py-1 font-mono text-[#d0d0d0] w-[35%]">{a}</td>
      <td className="text-center px-2 py-1 text-[8px] text-[#555555] uppercase tracking-wide w-[30%]">{label}</td>
      <td className="text-left px-2 py-1 font-mono text-[#d0d0d0] w-[35%]">{b}</td>
    </tr>
  );
}

export function CompararInversionView() {
  const [bonos, setBonos] = useState<BonoSeleccionable[]>([]);
  const [aId, setAId] = useState("");
  const [bId, setBId] = useState("");
  const [monto, setMonto] = useState("1000000");
  const [moneda, setMoneda] = useState<"ARS" | "USD">("ARS");
  const [data, setData] = useState<CompararResp | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Cargar universo al montar.
  useEffect(() => {
    fetch("/api/comparar/bonos", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((j) => setBonos(j as BonoSeleccionable[]))
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  // Refetch comparación cuando hay 2 bonos elegidos + monto válido.
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

  // Merge de flujos para el gráfico: union de fechas A∪B.
  const flujosMerged = useMemo(() => {
    if (!data) return [];
    const map = new Map<string, { fecha: string; A: number | null; B: number | null }>();
    for (const f of data.a.flujos) {
      map.set(f.fecha, { fecha: f.fecha, A: f.monto, B: null });
    }
    for (const f of data.b.flujos) {
      const ex = map.get(f.fecha);
      if (ex) ex.B = f.monto;
      else map.set(f.fecha, { fecha: f.fecha, A: null, B: f.monto });
    }
    return Array.from(map.values()).sort((x, y) => x.fecha.localeCompare(y.fecha));
  }, [data]);

  return (
    <div className="h-full min-h-0 flex flex-col">
      {/* Bloque superior — 50% de la altura */}
      <div className="h-1/2 min-h-0 flex flex-col p-3 gap-2 overflow-y-auto">
        {/* Header: monto + moneda */}
        <div className="flex items-end gap-2 flex-wrap shrink-0">
          <div>
            <div className="text-[8px] text-[#555555] uppercase mb-0.5">Monto a invertir</div>
            <input
              value={monto}
              onChange={(e) => setMonto(e.target.value.replace(/[^0-9]/g, ""))}
              className="w-36 bg-black border border-[#2a2a2a] px-2 py-1 text-[11px] text-[#d0d0d0] font-mono focus:border-[#ff9900] focus:outline-none"
            />
          </div>
          <div className="flex gap-1">
            {(["ARS", "USD"] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMoneda(m)}
                className={`px-2 py-1 text-[10px] font-semibold border transition-colors ${
                  moneda === m
                    ? "bg-[#ff9900] text-black border-[#ff9900]"
                    : "bg-transparent text-[#555555] border-[#2a2a2a] hover:text-[#ff9900] hover:border-[#ff9900]"
                }`}
              >
                {m}
              </button>
            ))}
          </div>
          {loading && <span className="text-[10px] text-[#555555] italic">Cargando…</span>}
          {error && <span className="text-[10px] text-[#ff7f7f] italic">{error}</span>}
        </div>

        {/* Grid 3 cols: selector A | tabla | selector B + gráfico */}
        <div className="flex-1 min-h-0 grid grid-cols-12 gap-2">
          {/* Col izq: selector A + warnings */}
          <div className="col-span-3 flex flex-col gap-2 min-h-0">
            <BonoSelector label="Bono A" bonos={bonos} selected={aId} onChange={setAId} />
            {data && (
              <div className="text-[9px] text-[#888888] font-mono border border-[#1a1a1a] bg-[#080808] px-2 py-1">
                <div className="text-[#ff9900] text-[10px] mb-0.5">{data.a.label}</div>
                <div>vto {data.a.vencimiento ?? "—"}</div>
                <div>{data.a.curva} · {data.a.moneda}</div>
                {data.a.monto_efectivo != null && (
                  <div className="mt-0.5">monto efectivo {fmtMoney(data.a.monto_efectivo, data.a.moneda)}</div>
                )}
                {data.a.vn_nominal != null && (
                  <div>VN nominal {fmt(data.a.vn_nominal, 0)}</div>
                )}
              </div>
            )}
          </div>

          {/* Col centro: tabla de métricas */}
          <div className="col-span-5 min-h-0 overflow-y-auto">
            {data ? (
              <table className="w-full text-[10px]">
                <thead>
                  <tr className="text-[#ff9900] text-[10px]">
                    <th className="text-right px-2 py-1">{data.a.label}</th>
                    <th className="text-center px-2 py-1 text-[#555555] text-[8px] uppercase">métrica</th>
                    <th className="text-left px-2 py-1">{data.b.label}</th>
                  </tr>
                </thead>
                <tbody>
                  <MetricRow label="Curva" a={data.a.curva} b={data.b.curva} />
                  <MetricRow label="Tipo" a={data.a.tipo ?? "—"} b={data.b.tipo ?? "—"} />
                  <MetricRow label="Moneda" a={data.a.moneda} b={data.b.moneda} />
                  <MetricRow label="Vencimiento" a={data.a.vencimiento ?? "—"} b={data.b.vencimiento ?? "—"} />
                  <MetricRow
                    label="Meses al vto"
                    a={data.a.meses_al_vto != null ? fmt(data.a.meses_al_vto, 1) : "—"}
                    b={data.b.meses_al_vto != null ? fmt(data.b.meses_al_vto, 1) : "—"}
                  />
                  <MetricRow
                    label="Último precio"
                    a={fmt(data.a.metricas.ultimo_precio)}
                    b={fmt(data.b.metricas.ultimo_precio)}
                  />
                  <MetricRow label="TEA" a={fmtPct(data.a.metricas.tea)} b={fmtPct(data.b.metricas.tea)} />
                  <MetricRow label="TEM" a={fmtPct(data.a.metricas.tem)} b={fmtPct(data.b.metricas.tem)} />
                  <MetricRow
                    label="Duration"
                    a={fmt(data.a.metricas.duration)}
                    b={fmt(data.b.metricas.duration)}
                  />
                  <MetricRow
                    label="Mod. Duration"
                    a={fmt(data.a.metricas.mod_duration)}
                    b={fmt(data.b.metricas.mod_duration)}
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
                  />
                </tbody>
              </table>
            ) : (
              <p className="text-[#555555] py-4 text-center">
                Elegí 2 bonos para comparar.
              </p>
            )}
          </div>

          {/* Col der: selector B + gráfico */}
          <div className="col-span-4 flex flex-col gap-2 min-h-0">
            <BonoSelector label="Bono B" bonos={bonos} selected={bId} onChange={setBId} />
            <div className="flex-1 min-h-[160px] border border-[#1a1a1a] bg-[#080808] p-1">
              {data && flujosMerged.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={flujosMerged} margin={{ top: 8, right: 8, left: 0, bottom: 4 }}>
                    <CartesianGrid stroke="#1a1a1a" strokeDasharray="2 3" />
                    <XAxis
                      dataKey="fecha"
                      tick={{ fontSize: 8, fill: "#555555" }}
                      tickFormatter={(d: string) => d.slice(2, 7)}
                    />
                    <YAxis tick={{ fontSize: 8, fill: "#555555" }} width={50} />
                    <Tooltip
                      contentStyle={{ background: "#080808", border: "1px solid #2a2a2a", fontSize: 10 }}
                      labelStyle={{ color: "#d0d0d0" }}
                    />
                    <Bar dataKey="A" fill="#ff9900" name={data.a.label} />
                    <Bar dataKey="B" fill="#3fbf6f" name={data.b.label} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-[#555555] text-center py-4 text-[10px]">
                  El gráfico aparece cuando elegís los dos bonos.
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Warnings */}
        {data && data.meta.warnings.length > 0 && (
          <div className="shrink-0 flex flex-col gap-0.5">
            {data.meta.warnings.map((w) => (
              <div key={w} className="text-[9px] text-[#ffcc66] italic">
                ⚠ {WARNING_LABELS[w] ?? w}
              </div>
            ))}
            {data.meta.mep_aplicado && (
              <div className="text-[8px] text-[#555555]">
                MEP aplicado para conversión: {fmt(data.meta.mep_aplicado, 2)}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Bloque inferior — reservado, vacío */}
      <div className="h-1/2 min-h-0 border-t border-[#1a1a1a] flex items-center justify-center">
        <span className="text-[9px] text-[#333333] italic">— reservado —</span>
      </div>
    </div>
  );
}
