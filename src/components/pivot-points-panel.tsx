"use client";

import { useEffect, useState } from "react";
import type { PivotData, PivotFrame } from "@/lib/types-scanner";

/**
 * Panel de Pivot Points para el ticker seleccionado en el Scanner.
 * Muestra los 4 timeframes (DIARIO / SEMANAL / MENSUAL / ANUAL) con sus
 * 7 niveles cada uno (R3/R2/R1/PP/S1/S2/S3) + la distancia % del último
 * close a cada nivel.
 *
 * Si no hay ticker seleccionado, muestra placeholder.
 * Re-fetcha cuando cambia el ticker (no polea — los pivots son del
 * período PREVIO, no cambian intraday).
 */

type TFKey = "diario" | "semanal" | "mensual" | "anual";

const TF_ORDER: { key: TFKey; label: string }[] = [
  { key: "diario",  label: "DIARIO"  },
  { key: "semanal", label: "SEMANAL" },
  { key: "mensual", label: "MENSUAL" },
  { key: "anual",   label: "ANUAL"   },
];

export function PivotPointsPanel({ ticker }: { ticker: string | null }) {
  const [data, setData] = useState<PivotData | null>(null);
  const [tf, setTf] = useState<TFKey>("diario");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!ticker) {
      setData(null);
      return;
    }
    let alive = true;
    setLoading(true);
    fetch(`/api/scanner/pivot/${encodeURIComponent(ticker)}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (alive) {
          setData(j as PivotData | null);
          setLoading(false);
        }
      })
      .catch(() => {
        if (alive) {
          setData(null);
          setLoading(false);
        }
      });
    return () => {
      alive = false;
    };
  }, [ticker]);

  if (!ticker) {
    return (
      <p className="text-[#555555] text-xs py-4 text-center">
        Seleccioná un ticker en la tabla
      </p>
    );
  }
  if (loading) {
    return <p className="text-[#555555] text-xs py-4 text-center">Cargando…</p>;
  }
  if (!data) {
    return <p className="text-[#555555] text-xs py-4 text-center">Sin data</p>;
  }

  const frame: PivotFrame | null = data.frames[tf];

  return (
    <div className="h-full flex flex-col min-h-0 text-[10px]">
      {/* Tabs de timeframe */}
      <div className="flex items-center gap-1 mb-2 shrink-0">
        {TF_ORDER.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setTf(key)}
            className={`px-2 py-0.5 text-[10px] font-semibold tracking-wide border transition-colors ${
              tf === key
                ? "bg-[#ff9900] text-black border-[#ff9900]"
                : "bg-transparent text-[#555555] border-[#2a2a2a] hover:text-[#ff9900] hover:border-[#ff9900]"
            }`}
          >
            {label}
          </button>
        ))}
        <span className="ml-auto text-[#808080]">
          {data.ticker} · last{" "}
          <span className="text-[#d0d0d0] font-mono">
            {data.last !== null ? `$${data.last.toFixed(2)}` : "--"}
          </span>
        </span>
      </div>

      {/* Tabla de niveles */}
      {!frame ? (
        <p className="text-[#555555] text-xs py-4 text-center">
          Sin data para {tf.toUpperCase()} (probable: ticker arrancó después del rango)
        </p>
      ) : (
        <div className="flex-1 min-h-0 overflow-y-auto">
          <div className="text-[#555555] text-[9px] mb-1 tabular-nums">
            Rango: {fmtFecha(frame.fecha_desde)} → {fmtFecha(frame.fecha_hasta)} ({frame.n_velas} ruedas) ·
            H={frame.h.toFixed(2)} L={frame.l.toFixed(2)} C={frame.c.toFixed(2)}
          </div>
          <table className="w-full">
            <thead>
              <tr className="text-[#707070]">
                <th className="!px-1 text-left">NIVEL</th>
                <th className="!px-1 text-right">PRECIO</th>
                <th className="!px-1 text-right">vs LAST</th>
              </tr>
            </thead>
            <tbody>
              <Row label="R3" value={frame.levels.r3} last={data.last} color="resistance" />
              <Row label="R2" value={frame.levels.r2} last={data.last} color="resistance" />
              <Row label="R1" value={frame.levels.r1} last={data.last} color="resistance" />
              <Row label="PP" value={frame.levels.pp} last={data.last} color="pivot" />
              <Row label="S1" value={frame.levels.s1} last={data.last} color="support" />
              <Row label="S2" value={frame.levels.s2} last={data.last} color="support" />
              <Row label="S3" value={frame.levels.s3} last={data.last} color="support" />
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Row({
  label,
  value,
  last,
  color,
}: {
  label: string;
  value: number;
  last: number | null;
  color: "resistance" | "pivot" | "support";
}) {
  const dist = last !== null && last > 0 ? ((last / value) - 1) * 100 : null;
  const labelColor =
    color === "resistance"
      ? "text-[#ff3333]"
      : color === "support"
      ? "text-[#00cc66]"
      : "text-[#ff9900]";
  return (
    <tr>
      <td className={`!px-1 font-semibold ${labelColor}`}>{label}</td>
      <td className="!px-1 text-right tabular-nums font-semibold">
        {value.toFixed(2)}
      </td>
      <td
        className={`!px-1 text-right tabular-nums ${
          dist === null
            ? "text-[#555555]"
            : dist >= 0
            ? "text-[#00cc66]"
            : "text-[#ff3333]"
        }`}
      >
        {dist !== null
          ? `${dist >= 0 ? "+" : ""}${dist.toFixed(2)}%`
          : "--"}
      </td>
    </tr>
  );
}

function fmtFecha(iso: string): string {
  const s = iso.slice(0, 10);
  if (s.length !== 10) return s;
  return `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(2, 4)}`;
}
