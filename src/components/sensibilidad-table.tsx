"use client";

import { useEffect, useMemo, useState } from "react";

interface Escenario {
  tir: number;
  precio_1anio: number;
  retorno_total: number;
}
interface BonoRow {
  ticker: string;
  ticker_completo: string;
  fecha_vencimiento: string | null;
  precio_actual: number;
  tea_actual: number | null;
  duration: number | null;
  paridad: number | null;
  cobrado_anio: number;
  n_flujos_anio: number;
  escenarios: Escenario[];
}

const POLL_MS = 30_000;

// Color de la celda según retorno %. Gradiente verde (positivo) → rojo (negativo).
function colorRetorno(r: number): { bg: string; fg: string } {
  if (r >= 0.25) return { bg: "#0a3", fg: "#fff" };
  if (r >= 0.15) return { bg: "#0a3a", fg: "#dfd" };
  if (r >= 0.05) return { bg: "#0a32", fg: "#bdb" };
  if (r >= 0)    return { bg: "#1a1a1a", fg: "#bdb" };
  if (r >= -0.05) return { bg: "#3a1a1a", fg: "#fbb" };
  return { bg: "#a30", fg: "#fff" };
}

function fmtPct(v: number | null | undefined, d = 1): string {
  if (v === null || v === undefined || isNaN(v)) return "—";
  const sign = v > 0 ? "+" : "";
  return `${sign}${(v * 100).toFixed(d)}%`;
}

function fmtPctAbs(v: number | null | undefined, d = 2): string {
  if (v === null || v === undefined || isNaN(v)) return "—";
  return `${(v * 100).toFixed(d)}%`;
}

export function SensibilidadTable() {
  const [tirsInput, setTirsInput] = useState("9,10,11,12,13");
  const [horizonteDias, setHorizonteDias] = useState(365);
  const [data, setData] = useState<BonoRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastFetch, setLastFetch] = useState<string>("");

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        if (!cancelled) setLoading(true);
        const res = await fetch(
          `/api/analitica/sensibilidad-retorno?curva=soberanos&tirs=${encodeURIComponent(
            tirsInput,
          )}&horizonte_dias=${horizonteDias}`,
          { cache: "no-store" },
        );
        if (!res.ok) {
          const t = await res.text();
          throw new Error(t || `HTTP ${res.status}`);
        }
        const j = await res.json();
        if (cancelled) return;
        if (Array.isArray(j)) {
          setData(j);
          setError(null);
          setLastFetch(new Date().toLocaleTimeString("es-AR"));
        } else {
          setError(j?.error || "respuesta inesperada");
          setData([]);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    run();
    const id = setInterval(run, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [tirsInput, horizonteDias]);

  const tirs: number[] = useMemo(() => {
    if (!data.length) return [];
    return data[0].escenarios.map((e) => e.tir);
  }, [data]);

  return (
    <div className="h-full min-h-0 flex flex-col p-3 gap-3 overflow-hidden">
      {/* Controles */}
      <div className="border border-[#1a1a1a] bg-[#080808] p-3 flex items-center gap-3 shrink-0">
        <div className="flex flex-col gap-1">
          <span className="text-[10px] uppercase tracking-wide text-[#555]">
            Escenarios TIR (%)
          </span>
          <input
            type="text"
            value={tirsInput}
            onChange={(e) => setTirsInput(e.target.value)}
            placeholder="9,10,11,12,13"
            className="bg-[#0e0e0e] border border-[#2a2a2a] text-[#d0d0d0] text-[11px] px-2 py-1 font-mono focus:border-[#ff9900] outline-none w-40"
          />
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-[10px] uppercase tracking-wide text-[#555]">
            Horizonte (días)
          </span>
          <input
            type="number"
            value={horizonteDias}
            min={30}
            max={1095}
            step={30}
            onChange={(e) => setHorizonteDias(parseInt(e.target.value || "365", 10))}
            className="bg-[#0e0e0e] border border-[#2a2a2a] text-[#d0d0d0] text-[11px] px-2 py-1 font-mono focus:border-[#ff9900] outline-none w-20"
          />
        </div>
        <div className="ml-auto text-[10px] text-[#555] font-mono">
          {loading ? "actualizando…" : lastFetch ? `últ. ${lastFetch}` : ""}
        </div>
      </div>

      {error && (
        <div className="px-3 py-2 text-[11px] text-[#ff3333] bg-[#ff3333]/10 border border-[#ff3333]/30 font-mono shrink-0">
          {error}
        </div>
      )}

      {/* Tabla */}
      <div className="flex-1 min-h-0 overflow-auto border border-[#1a1a1a] bg-[#080808]">
        <table className="w-full text-[11px] font-mono border-collapse">
          <thead className="sticky top-0 bg-[#0c0c0c] z-10">
            <tr className="border-b border-[#1a1a1a] text-[10px] uppercase tracking-wide text-[#ff9900]">
              <th className="!px-2 !py-1.5 text-left">Ticker</th>
              <th className="!px-2 !py-1.5 text-right">Vto</th>
              <th className="!px-2 !py-1.5 text-right">Precio</th>
              <th className="!px-2 !py-1.5 text-right">TEA actual</th>
              <th className="!px-2 !py-1.5 text-right">Dur</th>
              <th className="!px-2 !py-1.5 text-right">Paridad</th>
              <th
                className="!px-2 !py-1.5 text-right"
                title="Cupones + amortizaciones cobrados durante el horizonte"
              >
                Carry $
              </th>
              {tirs.map((t) => (
                <th
                  key={t}
                  className="!px-2 !py-1.5 text-right border-l border-[#1a1a1a]"
                >
                  TIR {(t * 100).toFixed(0)}%
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((b) => (
              <tr
                key={b.ticker_completo}
                className="border-b border-[#111] hover:bg-[#ff9900]/5"
              >
                <td className="!px-2 !py-1 text-[#ff9900] font-semibold">
                  {b.ticker}
                </td>
                <td className="!px-2 !py-1 text-right text-[#888]">
                  {b.fecha_vencimiento || "—"}
                </td>
                <td className="!px-2 !py-1 text-right text-[#d0d0d0]">
                  {b.precio_actual.toFixed(2)}
                </td>
                <td className="!px-2 !py-1 text-right text-[#d0d0d0]">
                  {fmtPctAbs(b.tea_actual)}
                </td>
                <td className="!px-2 !py-1 text-right text-[#d0d0d0]">
                  {b.duration?.toFixed(2) ?? "—"}
                </td>
                <td className="!px-2 !py-1 text-right text-[#d0d0d0]">
                  {b.paridad ? `${b.paridad.toFixed(1)}%` : "—"}
                </td>
                <td className="!px-2 !py-1 text-right text-[#888]">
                  {b.cobrado_anio.toFixed(2)}
                </td>
                {b.escenarios.map((e) => {
                  const c = colorRetorno(e.retorno_total);
                  return (
                    <td
                      key={e.tir}
                      className="!px-2 !py-1 text-right border-l border-[#1a1a1a] font-semibold"
                      style={{ background: c.bg, color: c.fg }}
                      title={`Precio 1y: ${e.precio_1anio.toFixed(2)}`}
                    >
                      {fmtPct(e.retorno_total)}
                    </td>
                  );
                })}
              </tr>
            ))}
            {data.length === 0 && !loading && (
              <tr>
                <td
                  colSpan={7 + tirs.length}
                  className="text-center text-[#555] py-6"
                >
                  Sin bonos con precio actual + flujos válidos.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="text-[10px] text-[#555] px-1 shrink-0 leading-relaxed">
        Cada celda = retorno total a {horizonteDias} días si la TIR del bono converge al
        valor de la columna. Incluye cupones + amortizaciones cobradas durante el
        horizonte y el cambio en el precio descontado a esa TIR. Hover sobre la celda
        muestra el precio proyectado.
      </div>
    </div>
  );
}
