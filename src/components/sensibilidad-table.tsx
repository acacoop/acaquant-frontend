"use client";

import { useEffect, useMemo, useState } from "react";

interface Escenario {
  tir: number;
  shock_pp: number | null;
  precio_1anio: number;
  retorno_total: number;
}

type Modo = "absoluta" | "relativa";
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
  const [modo, setModo] = useState<Modo>("absoluta");
  const [tirsAbs, setTirsAbs] = useState("4,5,6,7,8,9,10,11");
  const [tirsRel, setTirsRel] = useState("-4,-3,-2,-1,0,1,2,3,4");
  const [horizonteDias, setHorizonteDias] = useState(365);
  const [data, setData] = useState<BonoRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastFetch, setLastFetch] = useState<string>("");

  const tirsInput = modo === "absoluta" ? tirsAbs : tirsRel;

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        if (!cancelled) setLoading(true);
        const res = await fetch(
          `/api/analitica/sensibilidad-retorno?curva=soberanos&modo=${modo}&tirs=${encodeURIComponent(
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
  }, [tirsInput, horizonteDias, modo]);

  // En absoluta las columnas son TIRs absolutas (las mismas para todos
  // los bonos). En relativa son shocks pp (también iguales para todos).
  const colHeaders: { key: string; label: string }[] = useMemo(() => {
    if (!data.length) return [];
    return data[0].escenarios.map((e) => {
      if (modo === "relativa" && e.shock_pp != null) {
        const s = e.shock_pp * 100;
        const sign = s > 0 ? "+" : "";
        const label = s === 0 ? "TIR actual" : `TIR ${sign}${s.toFixed(0)}%`;
        return { key: `${s}`, label };
      }
      return { key: `${e.tir}`, label: `TIR ${(e.tir * 100).toFixed(0)}%` };
    });
  }, [data, modo]);

  return (
    <div className="h-full min-h-0 flex flex-col p-3 gap-3 overflow-hidden">
      {/* Controles */}
      <div className="border border-[#1a1a1a] bg-[#080808] p-3 flex items-center gap-3 shrink-0">
        <div className="flex flex-col gap-1">
          <span className="text-[10px] uppercase tracking-wide text-[#555]">
            Modo
          </span>
          <div className="flex items-center gap-1 h-[26px]">
            {(["absoluta", "relativa"] as Modo[]).map((m) => (
              <button
                key={m}
                onClick={() => setModo(m)}
                className={`px-2 h-[26px] text-[10px] font-semibold tracking-wide border ${
                  modo === m
                    ? "bg-[#ff9900] text-black border-[#ff9900]"
                    : "bg-transparent text-[#555] border-[#2a2a2a] hover:text-[#ff9900] hover:border-[#ff9900]"
                }`}
              >
                {m === "absoluta" ? "TIR ABSOLUTA" : "TIR RELATIVA"}
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-[10px] uppercase tracking-wide text-[#555]">
            {modo === "absoluta" ? "TIRs (%)" : "Shocks de TIR (%) centrados en TEA"}
          </span>
          <input
            type="text"
            value={tirsInput}
            onChange={(e) =>
              modo === "absoluta"
                ? setTirsAbs(e.target.value)
                : setTirsRel(e.target.value)
            }
            placeholder={modo === "absoluta" ? "4,5,6,7,8,9,10,11" : "-4,-3,-2,-1,0,1,2,3,4"}
            className="bg-[#0e0e0e] border border-[#2a2a2a] text-[#d0d0d0] text-[11px] px-2 py-1 font-mono focus:border-[#ff9900] outline-none w-56"
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
              {colHeaders.map((h) => (
                <th
                  key={h.key}
                  className="!px-2 !py-1.5 text-right border-l border-[#1a1a1a]"
                >
                  {h.label}
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
                {b.escenarios.map((e, i) => {
                  const c = colorRetorno(e.retorno_total);
                  // Tooltip: muestra TIR final + precio proyectado, útil
                  // sobre todo en modo relativo donde el header no dice
                  // la TIR absoluta sino el shock pp.
                  const tirReal = (e.tir * 100).toFixed(2);
                  const tip = `TIR ${tirReal}% · Precio 1y ${e.precio_1anio.toFixed(2)}`;
                  return (
                    <td
                      key={i}
                      className="!px-2 !py-1 text-right border-l border-[#1a1a1a] font-semibold"
                      style={{ background: c.bg, color: c.fg }}
                      title={tip}
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
                  colSpan={6 + colHeaders.length}
                  className="text-center text-[#555] py-6"
                >
                  Sin bonos con precio actual + flujos válidos.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Leyenda compacta — siempre visible, explica la fórmula y la
           interpretación del modo activo. Sustituye el "debug" individual
           por un único bloque genérico al pie de la vista. */}
      <div className="border border-[#1a1a1a] bg-[#0a0a0a] p-3 shrink-0 grid grid-cols-1 lg:grid-cols-2 gap-3 text-[10px] font-mono">
        <div>
          <div className="text-[9px] uppercase tracking-widest text-[#ff9900] mb-1">
            Cálculo
          </div>
          <div className="text-[#d0d0d0]">
            Retorno = (Precio<sub>1y</sub> + Carry) / Precio<sub>actual</sub> − 1
          </div>
          <div className="text-[#888] mt-1 leading-relaxed">
            <b className="text-[#d0d0d0]">Precio<sub>1y</sub></b>: PV de flujos
            remanentes (post horizonte) descontados a la TIR del escenario.
            <br />
            <b className="text-[#d0d0d0]">Carry</b>: cupones + amortizaciones
            cobrados durante los próximos {horizonteDias} días.
            <br />
            <b className="text-[#d0d0d0]">Precio<sub>actual</sub></b>: último
            precio del MarketSnapshot (USD para tickers .D / .C).
          </div>
        </div>
        <div>
          <div className="text-[9px] uppercase tracking-widest text-[#ff9900] mb-1">
            Modo activo: {modo === "absoluta" ? "TIR ABSOLUTA" : "TIR RELATIVA"}
          </div>
          <div className="text-[#888] leading-relaxed">
            {modo === "absoluta" ? (
              <>
                Las columnas son TIRs finales fijas, iguales para todos los
                bonos. Útil para ver el retorno bajo escenarios definidos
                de mercado (ej. compresión a 6%, stress a 11%).
              </>
            ) : (
              <>
                Cada bono se evalúa con shifts centrados en su <b className="text-[#d0d0d0]">TEA actual</b>.
                Columna <b className="text-[#d0d0d0]">TIR actual</b> = carry
                puro sin cambio de TIR. <b className="text-[#d0d0d0]">TIR +2%</b> = TEA
                actual + 2 puntos. Permite comparar sensibilidad apples-to-apples
                entre bonos con TEAs distintas.
              </>
            )}
            <br />
            <span className="text-[#555]">Hover sobre cualquier celda muestra TIR real + precio proyectado.</span>
          </div>
        </div>
      </div>
    </div>
  );
}
