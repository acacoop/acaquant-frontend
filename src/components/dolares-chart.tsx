"use client";

import { useEffect, useMemo, useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";

const POLL_MS = 60_000;   // daily close: refresh 1 min alcanza

interface SeriePunto {
  ts: string;     // "YYYY-MM-DD"
  valor: number;
}

interface DolaresResp {
  mep: SeriePunto[];
  ccl: SeriePunto[];
  oficial: SeriePunto[];
}

// Una fila por fecha, con los 3 valores. Si una serie no tiene dato ese
// día, queda null y la línea CONECTA por encima (connectNulls=true) — así
// no hay cortes los fines de semana ni feriados.
interface FilaFecha {
  fecha: string;        // YYYY-MM-DD
  fechaLabel: string;   // dd/mm
  mep: number | null;
  ccl: number | null;
  oficial: number | null;
}

function fmtPrice(v: number | null | undefined): string {
  if (v === null || v === undefined) return "—";
  return v.toLocaleString("es-AR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function fechaCorta(yyyymmdd: string): string {
  // "2026-04-27" → "27/04"
  if (yyyymmdd.length < 10) return yyyymmdd;
  return `${yyyymmdd.slice(8, 10)}/${yyyymmdd.slice(5, 7)}`;
}

function mergePorFecha(resp: DolaresResp): FilaFecha[] {
  const map = new Map<string, FilaFecha>();
  const upsert = (campo: "mep" | "ccl" | "oficial", arr: SeriePunto[]) => {
    for (const p of arr) {
      const fecha = p.ts.slice(0, 10);
      let row = map.get(fecha);
      if (!row) {
        row = {
          fecha,
          fechaLabel: fechaCorta(fecha),
          mep: null,
          ccl: null,
          oficial: null,
        };
        map.set(fecha, row);
      }
      row[campo] = p.valor;
    }
  };
  upsert("mep", resp.mep);
  upsert("ccl", resp.ccl);
  upsert("oficial", resp.oficial);
  return Array.from(map.values()).sort((a, b) => a.fecha.localeCompare(b.fecha));
}

function ultimoValor(arr: SeriePunto[]): number | null {
  if (arr.length === 0) return null;
  return arr[arr.length - 1].valor;
}

interface Props {
  /** Si viene un label conocido ("DOLAR MEP", "DOLAR CCL", "DOLAR OFICIAL")
      se usa para highlight visual. Cualquier otro valor (incluyendo "ARGY")
      no resalta ninguna serie. */
  selectedTicker?: string | null;
}

export function DolaresChart({ selectedTicker }: Props) {
  const [data, setData] = useState<DolaresResp | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function fetchData() {
      try {
        const res = await fetch(
          "/api/dolares-historico?ventana_dias=30",
          { cache: "no-store" },
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const j: DolaresResp = await res.json();
        if (cancelled) return;
        setData(j);
        setError(null);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    }
    fetchData();
    const iv = setInterval(fetchData, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(iv);
    };
  }, []);

  const filas = useMemo(() => (data ? mergePorFecha(data) : []), [data]);

  const ultMep = data ? ultimoValor(data.mep) : null;
  const ultCcl = data ? ultimoValor(data.ccl) : null;
  const ultOficial = data ? ultimoValor(data.oficial) : null;
  const brechaMep = ultMep && ultOficial ? ((ultMep / ultOficial - 1) * 100) : null;

  // Highlight según selección (engrosa la línea correspondiente).
  const highlight: "mep" | "ccl" | "oficial" | null =
    selectedTicker === "DOLAR MEP"      ? "mep"
    : selectedTicker === "DOLAR CCL"    ? "ccl"
    : selectedTicker === "DOLAR OFICIAL" ? "oficial"
    : null;

  if (error && filas.length === 0) {
    return (
      <div className="h-full flex items-center justify-center text-[#ff3333] font-mono text-xs">
        Error: {error}
      </div>
    );
  }

  if (!data || filas.length === 0) {
    return (
      <div className="h-full flex items-center justify-center text-[#888888] font-mono text-xs">
        Esperando datos del histórico de dólares…
      </div>
    );
  }

  return (
    <div className="h-full w-full flex flex-col bg-[#080808]">
      {/* Header con últimos valores y brecha */}
      <div className="px-3 py-2 border-b border-[#1a1a1a] flex flex-wrap items-baseline gap-x-4 gap-y-1 font-mono text-[11px]">
        <span className="text-[#d0d0d0] font-semibold">DÓLARES (ARGY)</span>
        <span className="text-[#888888]">
          MEP{" "}
          <span className="text-[#00cc66] tabular-nums">{fmtPrice(ultMep)}</span>
        </span>
        <span className="text-[#888888]">
          CCL{" "}
          <span className="text-[#4488ff] tabular-nums">{fmtPrice(ultCcl)}</span>
        </span>
        <span className="text-[#888888]">
          Oficial{" "}
          <span className="text-[#ffcc00] tabular-nums">{fmtPrice(ultOficial)}</span>
        </span>
        {brechaMep !== null && (
          <span className="text-[#888888]">
            Brecha MEP–Of{" "}
            <span
              className="tabular-nums"
              style={{ color: brechaMep >= 0 ? "#00cc66" : "#ff3333" }}
            >
              {brechaMep >= 0 ? "+" : ""}{brechaMep.toFixed(1)}%
            </span>
          </span>
        )}
        <span className="ml-auto text-[#555555] text-[9px]">
          últimos {filas.length} días · close diario
        </span>
      </div>

      <div className="flex-1 min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={filas}
            margin={{ top: 16, right: 32, bottom: 24, left: 48 }}
          >
            <CartesianGrid stroke="#161616" strokeDasharray="2 4" />
            <XAxis
              dataKey="fechaLabel"
              tick={{ fill: "#888888", fontSize: 10, fontFamily: "monospace" }}
              stroke="#1a1a1a"
              minTickGap={20}
            />
            <YAxis
              tick={{ fill: "#888888", fontSize: 10, fontFamily: "monospace" }}
              stroke="#1a1a1a"
              tickFormatter={fmtPrice}
              domain={["dataMin - 10", "dataMax + 10"]}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "#0e0e0e",
                border: "1px solid #1a1a1a",
                fontFamily: "monospace",
                fontSize: 11,
              }}
              labelStyle={{ color: "#d0d0d0" }}
              cursor={{ stroke: "#333333", strokeDasharray: "3 3" }}
              formatter={(value, name) => {
                if (typeof value !== "number") return ["—", String(name)];
                return [fmtPrice(value), String(name)];
              }}
            />
            <Legend
              wrapperStyle={{ fontFamily: "monospace", fontSize: 10 }}
              iconType="line"
            />
            <Line
              type="monotone"
              dataKey="mep"
              name="MEP"
              stroke="#00cc66"
              strokeWidth={highlight === "mep" ? 2.5 : 1.5}
              dot={false}
              isAnimationActive={false}
              connectNulls
            />
            <Line
              type="monotone"
              dataKey="ccl"
              name="CCL"
              stroke="#4488ff"
              strokeWidth={highlight === "ccl" ? 2.5 : 1.5}
              dot={false}
              isAnimationActive={false}
              connectNulls
            />
            <Line
              type="monotone"
              dataKey="oficial"
              name="Oficial"
              stroke="#ffcc00"
              strokeWidth={highlight === "oficial" ? 2.5 : 1.5}
              dot={false}
              isAnimationActive={false}
              connectNulls
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
