"use client";

import { useEffect, useMemo, useState } from "react";

interface Escenario {
  tir: number;
  shock_pp: number | null;
  precio_objetivo: number;
  upside: number;
}

type Modo = "absoluta" | "relativa";
type Tipo = "globales" | "bonares";
const TIPOS_DISPONIBLES: Tipo[] = ["globales", "bonares"];

interface BonoRow {
  ticker: string;
  ticker_completo: string;
  tipo: string | null;
  fecha_vencimiento: string | null;
  precio_actual: number;
  tea_actual: number | null;
  duration: number | null;
  paridad: number | null;
  escenarios: Escenario[];
}

const POLL_MS = 300_000; // 5 min

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
  // Default solo globales — el usuario activa bonares manualmente.
  const [tipos, setTipos] = useState<Tipo[]>(["globales"]);
  const [data, setData] = useState<BonoRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastFetch, setLastFetch] = useState<string>("");
  // Celda seleccionada para el panel de debug. Default a la primera celda
  // del primer bono cuando llega data. Clamping abajo si cambia la shape.
  const [selIdx, setSelIdx] = useState<{ bono: number; esc: number }>({ bono: 0, esc: 0 });
  const [debugOpen, setDebugOpen] = useState(true);

  const tirsInput = modo === "absoluta" ? tirsAbs : tirsRel;
  const tiposParam = tipos.slice().sort().join(",");

  const toggleTipo = (t: Tipo) => {
    setTipos((prev) => {
      if (prev.includes(t)) {
        // No permitimos dejar la selección vacía (la API traería todos).
        if (prev.length === 1) return prev;
        return prev.filter((x) => x !== t);
      }
      return [...prev, t];
    });
  };

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        if (!cancelled) setLoading(true);
        const res = await fetch(
          `/api/analitica/sensibilidad-retorno?curva=soberanos&modo=${modo}&tirs=${encodeURIComponent(
            tirsInput,
          )}&tipos=${encodeURIComponent(tiposParam)}`,
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
  }, [tirsInput, modo, tiposParam]);

  // Clamping derivado (no state) para que la celda seleccionada sobreviva
  // cambios de shape sin violar react-hooks/set-state-in-effect.
  const effectiveIdx = useMemo(() => {
    if (data.length === 0) return { bono: 0, esc: 0 };
    const maxBono = data.length - 1;
    const maxEsc = (data[0]?.escenarios.length ?? 1) - 1;
    return {
      bono: Math.min(Math.max(selIdx.bono, 0), maxBono),
      esc:  Math.min(Math.max(selIdx.esc, 0),  maxEsc),
    };
  }, [data, selIdx]);

  // Desglose del cálculo para la celda seleccionada. Recomputa con cada
  // cambio de data / selección para que el panel sea 100% dinámico.
  const debug = useMemo(() => {
    if (data.length === 0) return null;
    const bono = data[effectiveIdx.bono];
    if (!bono) return null;
    const esc = bono.escenarios[effectiveIdx.esc];
    if (!esc) return null;
    const dTir = bono.tea_actual != null ? esc.tir - bono.tea_actual : null;
    // Sanity check linealizado: ΔP/P ≈ -Duration × ΔTIR. Usa la duration
    // actual (sin restar horizonte porque el upside es instantáneo).
    const upsideLinear = (bono.duration != null && dTir != null)
      ? -bono.duration * dTir
      : null;
    return { bono, esc, dTir, upsideLinear };
  }, [data, effectiveIdx]);

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
            Tipos
          </span>
          <div className="flex items-center gap-1 h-[26px]">
            {TIPOS_DISPONIBLES.map((t) => {
              const active = tipos.includes(t);
              return (
                <button
                  key={t}
                  onClick={() => toggleTipo(t)}
                  className={`px-2 h-[26px] text-[10px] font-semibold tracking-wide border ${
                    active
                      ? "bg-[#ff9900] text-black border-[#ff9900]"
                      : "bg-transparent text-[#555] border-[#2a2a2a] hover:text-[#ff9900] hover:border-[#ff9900]"
                  }`}
                  title={
                    active && tipos.length === 1
                      ? "Necesitás al menos 1 tipo activo"
                      : ""
                  }
                >
                  {t.toUpperCase()}
                </button>
              );
            })}
          </div>
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

      {/* Tabla + panel de debug lateral */}
      <div className="flex-1 min-h-0 flex gap-3 overflow-hidden">
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
            {data.map((b, bonoIdx) => (
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
                  const c = colorRetorno(e.upside);
                  // Tooltip: TIR final + precio objetivo. En modo relativo
                  // el header muestra el shock pp, acá sumamos la TIR real.
                  const tirReal = (e.tir * 100).toFixed(2);
                  const tip = `TIR ${tirReal}% · Precio obj ${e.precio_objetivo.toFixed(2)} · click para debug`;
                  const isSelected = effectiveIdx.bono === bonoIdx && effectiveIdx.esc === i;
                  return (
                    <td
                      key={i}
                      onClick={() => setSelIdx({ bono: bonoIdx, esc: i })}
                      className={`!px-2 !py-1 text-right border-l border-[#1a1a1a] font-semibold cursor-pointer ${
                        isSelected ? "outline outline-2 outline-[#ff9900] outline-offset-[-2px]" : ""
                      }`}
                      style={{ background: c.bg, color: c.fg }}
                      title={tip}
                    >
                      {fmtPct(e.upside)}
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

      {/* Panel de debug lateral — colapsable. Cerrado = rail con label
          vertical clickeable. Abierto = panel con detalle. */}
      <aside
        className={`shrink-0 border border-[#1a1a1a] bg-[#0a0a0a] text-[10px] font-mono transition-[width] duration-150 flex flex-col ${
          debugOpen ? "w-72" : "w-8"
        }`}
      >
        {!debugOpen ? (
          <button
            onClick={() => setDebugOpen(true)}
            className="flex-1 flex flex-col items-center justify-center gap-2 text-[#ff9900] hover:bg-[#ff9900]/10 cursor-pointer"
            title="Expandir panel de debug"
          >
            <span className="text-[11px]">◀</span>
            <span
              className="text-[10px] uppercase tracking-[0.2em] text-[#ff9900]"
              style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}
            >
              DEBUG
            </span>
          </button>
        ) : (
        <div className="p-3 overflow-y-auto flex-1">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[9px] uppercase tracking-widest text-[#ff9900]">
            DEBUG · celda seleccionada
          </span>
          <button
            onClick={() => setDebugOpen(false)}
            className="text-[#555] hover:text-[#ff9900] text-[14px] leading-none cursor-pointer"
            title="Minimizar panel"
          >
            ▶
          </button>
        </div>
        {!debug ? (
          <div className="text-[#555] text-[11px]">
            Click en una celda de retorno para ver el desglose del cálculo.
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <div>
              <div className="flex items-baseline justify-between">
                <span className="text-[#ff9900] font-semibold text-[13px]">
                  {debug.bono.ticker}
                </span>
                <span className="text-[#888]">
                  {modo === "relativa" && debug.esc.shock_pp != null
                    ? `shock ${(debug.esc.shock_pp * 100).toFixed(2)} pp`
                    : `TIR ${(debug.esc.tir * 100).toFixed(2)}%`}
                </span>
              </div>
              <div className="text-[#555] text-[9px] mt-0.5">
                Vto {debug.bono.fecha_vencimiento} · {debug.bono.tipo}
              </div>
            </div>

            <div>
              <div className="text-[9px] uppercase tracking-wide text-[#555] mb-1">
                Inputs
              </div>
              <div className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 text-[#d0d0d0]">
                <span className="text-[#888]">Precio actual</span>
                <span className="text-right">{debug.bono.precio_actual.toFixed(4)}</span>
                <span className="text-[#888]">TEA actual</span>
                <span className="text-right">{fmtPctAbs(debug.bono.tea_actual)}</span>
                <span className="text-[#888]">Duration</span>
                <span className="text-right">{debug.bono.duration?.toFixed(3) ?? "—"}</span>
                <span className="text-[#888]">Paridad</span>
                <span className="text-right">
                  {debug.bono.paridad != null ? `${debug.bono.paridad.toFixed(2)}%` : "—"}
                </span>
              </div>
            </div>

            <div>
              <div className="text-[9px] uppercase tracking-wide text-[#555] mb-1">
                Escenario
              </div>
              <div className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 text-[#d0d0d0]">
                <span className="text-[#888]">TIR objetivo</span>
                <span className="text-right">{(debug.esc.tir * 100).toFixed(2)}%</span>
                <span className="text-[#888]">ΔTIR vs actual</span>
                <span className="text-right">
                  {debug.dTir != null
                    ? `${debug.dTir >= 0 ? "+" : ""}${(debug.dTir * 100).toFixed(2)} pp`
                    : "—"}
                </span>
                <span className="text-[#888]">Precio objetivo</span>
                <span className="text-right">{debug.esc.precio_objetivo.toFixed(4)}</span>
              </div>
            </div>

            <div>
              <div className="text-[9px] uppercase tracking-wide text-[#555] mb-1">
                Cálculo (exacto)
              </div>
              <div className="text-[#d0d0d0] leading-[1.5]">
                Upside = P<sub>objetivo</sub> / P<sub>actual</sub> − 1
              </div>
              <div className="text-[#888] mt-1 leading-[1.5]">
                = {debug.esc.precio_objetivo.toFixed(4)} / {debug.bono.precio_actual.toFixed(4)} − 1
              </div>
              <div
                className="mt-1 text-[13px] font-semibold"
                style={{ color: colorRetorno(debug.esc.upside).bg === "#1a1a1a" ? "#bdb" : "#fff" }}
              >
                = {fmtPct(debug.esc.upside, 2)}
              </div>
              <div className="text-[#555] text-[9px] mt-1 leading-[1.4]">
                P<sub>objetivo</sub> = PV de los flujos futuros descontados a la TIR objetivo desde HOY. Capital-only, sin carry.
              </div>
            </div>

            {debug.upsideLinear != null && debug.dTir != null && debug.bono.duration != null && (
              <div>
                <div className="text-[9px] uppercase tracking-wide text-[#555] mb-1">
                  Sanity check (lineal, Fabozzi)
                </div>
                <div className="text-[#d0d0d0] leading-[1.5]">
                  ≈ −Duration × ΔTIR
                </div>
                <div className="text-[#888] mt-1 leading-[1.5]">
                  ≈ −{debug.bono.duration.toFixed(3)} × {(debug.dTir * 100).toFixed(2)} pp
                </div>
                <div className="text-[#888] leading-[1.5]">
                  ≈ {fmtPct(debug.upsideLinear, 2)}
                </div>
                <div className="text-[#555] text-[9px] mt-1 leading-[1.4]">
                  Diferencia vs exacto: {fmtPct(debug.esc.upside - debug.upsideLinear, 2)} — explicada por convexidad (siempre positiva, por eso el exacto es mejor que el lineal cuando la TIR baja y peor cuando sube).
                </div>
              </div>
            )}
          </div>
        )}
        </div>
        )}
      </aside>
      </div>

      {/* Leyenda compacta — siempre visible, explica la fórmula y la
           interpretación del modo activo. */}
      <div className="border border-[#1a1a1a] bg-[#0a0a0a] p-3 shrink-0 grid grid-cols-1 lg:grid-cols-2 gap-3 text-[10px] font-mono">
        <div>
          <div className="text-[9px] uppercase tracking-widest text-[#ff9900] mb-1">
            Cálculo — Upside de precio (capital-only)
          </div>
          <div className="text-[#d0d0d0]">
            Upside = Precio<sub>objetivo</sub> / Precio<sub>actual</sub> − 1
          </div>
          <div className="text-[#888] mt-1 leading-relaxed">
            <b className="text-[#d0d0d0]">Precio<sub>objetivo</sub></b>: PV de
            los flujos futuros descontados a la TIR del escenario, desde HOY.
            <br />
            <b className="text-[#d0d0d0]">Precio<sub>actual</sub></b>: último
            precio del MarketSnapshot (USD para tickers .D / .C).
            <br />
            Upside <b className="text-[#d0d0d0]">negativo</b> si TIR objetivo &gt;
            TEA actual (el bono debe caer para rendir más). Upside{" "}
            <b className="text-[#d0d0d0]">positivo</b> si TIR objetivo &lt; TEA
            actual. No incluye carry ni paso del tiempo.
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
                bonos. Útil para ver el upside bajo escenarios definidos
                de mercado (ej. compresión a 6%, stress a 11%).
              </>
            ) : (
              <>
                Cada bono se evalúa con shifts centrados en su <b className="text-[#d0d0d0]">TEA actual</b>.
                Columna <b className="text-[#d0d0d0]">TIR actual</b> = upside 0
                (sin cambio). <b className="text-[#d0d0d0]">TIR +2%</b> = TEA
                actual + 2 puntos. Permite comparar sensibilidad apples-to-apples
                entre bonos con TEAs distintas.
              </>
            )}
            <br />
            <span className="text-[#555]">Hover sobre cualquier celda muestra TIR real + precio objetivo.</span>
          </div>
        </div>
      </div>
    </div>
  );
}
