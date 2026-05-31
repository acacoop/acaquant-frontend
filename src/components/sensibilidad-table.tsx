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
  cobrado_horizonte: number;
  n_flujos_horizonte: number;
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
  // Horizonte default = 365 (1 año). El input usa un string intermedio
  // para que el usuario pueda borrar y escribir sin que cada tecla
  // dispare un fetch — solo commitea al salir del campo o Enter.
  const [horizonteDias, setHorizonteDias] = useState(365);
  const [horizonteInput, setHorizonteInput] = useState("365");
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
          )}&horizonte_dias=${horizonteDias}&tipos=${encodeURIComponent(tiposParam)}`,
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
  }, [tirsInput, horizonteDias, modo, tiposParam]);

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
  // cambio de data / selección / horizonte para que el panel sea 100%
  // dinámico.
  const debug = useMemo(() => {
    if (data.length === 0) return null;
    const bono = data[effectiveIdx.bono];
    if (!bono) return null;
    const esc = bono.escenarios[effectiveIdx.esc];
    if (!esc) return null;
    const dTir = bono.tea_actual != null ? esc.tir - bono.tea_actual : null;
    // Sanity check linealizado: ΔP/P ≈ -Dur_res × ΔTIR + Carry/P.
    const durRes = bono.duration != null
      ? Math.max(bono.duration - horizonteDias / 365, 0)
      : null;
    let upsideLinear: number | null = null;
    if (durRes != null && dTir != null) {
      upsideLinear = -durRes * dTir;
      if (bono.cobrado_horizonte != null && bono.precio_actual) {
        upsideLinear += bono.cobrado_horizonte / bono.precio_actual;
      }
    }
    return { bono, esc, dTir, durRes, upsideLinear };
  }, [data, effectiveIdx, horizonteDias]);

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
      <div className="border border-[var(--t-border)] bg-[var(--t-panel)] p-3 flex items-center gap-3 shrink-0">
        <div className="flex flex-col gap-1">
          <span className="text-[10px] uppercase tracking-wide text-[var(--t-text-muted)]">
            Modo
          </span>
          <div className="flex items-center gap-1 h-[26px]">
            {(["absoluta", "relativa"] as Modo[]).map((m) => (
              <button
                key={m}
                onClick={() => setModo(m)}
                className={`px-2 h-[26px] text-[10px] font-semibold tracking-wide border ${
                  modo === m
                    ? "bg-[var(--t-accent)] text-[var(--t-on-accent)] border-[var(--t-accent)]"
                    : "bg-transparent text-[var(--t-text-muted)] border-[var(--t-border-2)] hover:text-[var(--t-accent)] hover:border-[var(--t-accent)]"
                }`}
              >
                {m === "absoluta" ? "TIR ABSOLUTA" : "TIR RELATIVA"}
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-[10px] uppercase tracking-wide text-[var(--t-text-muted)]">
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
            className="bg-[var(--t-surface)] border border-[var(--t-border-2)] text-[var(--t-text)] text-[11px] px-2 py-1 font-mono focus:border-[var(--t-accent)] outline-none w-56"
          />
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-[10px] uppercase tracking-wide text-[var(--t-text-muted)]">
            Horizonte (días)
          </span>
          <input
            type="number"
            value={horizonteInput}
            min={0}
            max={1095}
            step={30}
            onChange={(e) => setHorizonteInput(e.target.value)}
            onBlur={() => {
              const n = parseInt(horizonteInput, 10);
              if (!isNaN(n) && n >= 0 && n <= 1095) {
                setHorizonteDias(n);
                setHorizonteInput(String(n));
              } else {
                // Valor inválido → revertir visual al último válido.
                setHorizonteInput(String(horizonteDias));
              }
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
            }}
            className="bg-[var(--t-surface)] border border-[var(--t-border-2)] text-[var(--t-text)] text-[11px] px-2 py-1 font-mono focus:border-[var(--t-accent)] outline-none w-20"
            title="0 = upside instantáneo. >0 = proyecta el precio. Enter o click fuera para aplicar."
          />
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-[10px] uppercase tracking-wide text-[var(--t-text-muted)]">
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
                      ? "bg-[var(--t-accent)] text-[var(--t-on-accent)] border-[var(--t-accent)]"
                      : "bg-transparent text-[var(--t-text-muted)] border-[var(--t-border-2)] hover:text-[var(--t-accent)] hover:border-[var(--t-accent)]"
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
        <div className="ml-auto text-[10px] text-[var(--t-text-muted)] font-mono">
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
      <div className="flex-1 min-h-0 overflow-auto border border-[var(--t-border)] bg-[var(--t-panel)]">
        <table className="w-full text-[11px] font-mono border-collapse">
          <thead className="sticky top-0 bg-[var(--t-surface-2)] z-10">
            <tr className="border-b border-[var(--t-border)] text-[10px] uppercase tracking-wide text-[var(--t-accent)]">
              <th className="!px-2 !py-1.5 text-left">Ticker</th>
              <th className="!px-2 !py-1.5 text-right">Vto</th>
              <th className="!px-2 !py-1.5 text-right">Precio</th>
              <th className="!px-2 !py-1.5 text-right">TEA actual</th>
              <th className="!px-2 !py-1.5 text-right">Dur</th>
              <th className="!px-2 !py-1.5 text-right">Paridad</th>
              {colHeaders.map((h) => (
                <th
                  key={h.key}
                  className="!px-2 !py-1.5 text-right border-l border-[var(--t-border)]"
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
                className="border-b border-[var(--t-border)] hover:bg-[var(--t-accent)]/5"
              >
                <td className="!px-2 !py-1 text-[var(--t-accent)] font-semibold">
                  {b.ticker}
                </td>
                <td className="!px-2 !py-1 text-right text-[var(--t-text-dim)]">
                  {b.fecha_vencimiento || "—"}
                </td>
                <td className="!px-2 !py-1 text-right text-[var(--t-text)]">
                  {b.precio_actual.toFixed(2)}
                </td>
                <td className="!px-2 !py-1 text-right text-[var(--t-text)]">
                  {fmtPctAbs(b.tea_actual)}
                </td>
                <td className="!px-2 !py-1 text-right text-[var(--t-text)]">
                  {b.duration?.toFixed(2) ?? "—"}
                </td>
                <td className="!px-2 !py-1 text-right text-[var(--t-text)]">
                  {b.paridad ? `${b.paridad.toFixed(1)}%` : "—"}
                </td>
                {b.escenarios.map((e, i) => {
                  const upside = e.upside ?? 0;
                  const c = colorRetorno(upside);
                  const tirReal = (e.tir * 100).toFixed(2);
                  const tip = `TIR ${tirReal}% · Precio obj ${e.precio_objetivo.toFixed(2)} · click para debug`;
                  const isSelected = effectiveIdx.bono === bonoIdx && effectiveIdx.esc === i;
                  return (
                    <td
                      key={i}
                      onClick={() => setSelIdx({ bono: bonoIdx, esc: i })}
                      className={`!px-2 !py-1 text-right border-l border-[var(--t-border)] font-semibold cursor-pointer ${
                        isSelected ? "outline outline-2 outline-[var(--t-accent)] outline-offset-[-2px]" : ""
                      }`}
                      style={{ background: c.bg, color: c.fg }}
                      title={tip}
                    >
                      {fmtPct(upside)}
                    </td>
                  );
                })}
              </tr>
            ))}
            {data.length === 0 && !loading && (
              <tr>
                <td
                  colSpan={6 + colHeaders.length}
                  className="text-center text-[var(--t-text-muted)] py-6"
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
        className={`shrink-0 border border-[var(--t-border)] bg-[var(--t-panel)] text-[10px] font-mono transition-[width] duration-150 flex flex-col ${
          debugOpen ? "w-72" : "w-8"
        }`}
      >
        {!debugOpen ? (
          <button
            onClick={() => setDebugOpen(true)}
            className="flex-1 flex flex-col items-center justify-center gap-2 text-[var(--t-accent)] hover:bg-[var(--t-accent)]/10 cursor-pointer"
            title="Expandir panel de debug"
          >
            <span className="text-[11px]">◀</span>
            <span
              className="text-[10px] uppercase tracking-[0.2em] text-[var(--t-accent)]"
              style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}
            >
              DEBUG
            </span>
          </button>
        ) : (
        <div className="p-3 overflow-y-auto flex-1">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[9px] uppercase tracking-widest text-[var(--t-accent)]">
            DEBUG · celda seleccionada
          </span>
          <button
            onClick={() => setDebugOpen(false)}
            className="text-[var(--t-text-muted)] hover:text-[var(--t-accent)] text-[14px] leading-none cursor-pointer"
            title="Minimizar panel"
          >
            ▶
          </button>
        </div>
        {!debug ? (
          <div className="text-[var(--t-text-muted)] text-[11px]">
            Click en una celda de retorno para ver el desglose del cálculo.
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <div>
              <div className="flex items-baseline justify-between">
                <span className="text-[var(--t-accent)] font-semibold text-[13px]">
                  {debug.bono.ticker}
                </span>
                <span className="text-[var(--t-text-dim)]">
                  {modo === "relativa" && debug.esc.shock_pp != null
                    ? `shock ${(debug.esc.shock_pp * 100).toFixed(2)} pp`
                    : `TIR ${(debug.esc.tir * 100).toFixed(2)}%`}
                </span>
              </div>
              <div className="text-[var(--t-text-muted)] text-[9px] mt-0.5">
                Vto {debug.bono.fecha_vencimiento} · {debug.bono.tipo}
              </div>
            </div>

            <div>
              <div className="text-[9px] uppercase tracking-wide text-[var(--t-text-muted)] mb-1">
                Inputs
              </div>
              <div className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 text-[var(--t-text)]">
                <span className="text-[var(--t-text-dim)]">Precio actual</span>
                <span className="text-right">{debug.bono.precio_actual.toFixed(4)}</span>
                <span className="text-[var(--t-text-dim)]">TEA actual</span>
                <span className="text-right">{fmtPctAbs(debug.bono.tea_actual)}</span>
                <span className="text-[var(--t-text-dim)]">Duration</span>
                <span className="text-right">{debug.bono.duration?.toFixed(3) ?? "—"}</span>
                <span className="text-[var(--t-text-dim)]">Paridad</span>
                <span className="text-right">
                  {debug.bono.paridad != null ? `${debug.bono.paridad.toFixed(2)}%` : "—"}
                </span>
                <span className="text-[var(--t-text-dim)]">Horizonte</span>
                <span className="text-right">
                  {horizonteDias === 0 ? "HOY" : `${horizonteDias} días`}
                </span>
                {horizonteDias > 0 && (
                  <>
                    <span className="text-[var(--t-text-dim)]">Flujos en horiz.</span>
                    <span className="text-right">{debug.bono.n_flujos_horizonte ?? "—"}</span>
                    <span className="text-[var(--t-text-dim)]">Carry cobrado</span>
                    <span className="text-right">{debug.bono.cobrado_horizonte?.toFixed(4) ?? "—"}</span>
                  </>
                )}
              </div>
            </div>

            <div>
              <div className="text-[9px] uppercase tracking-wide text-[var(--t-text-muted)] mb-1">
                Escenario
              </div>
              <div className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 text-[var(--t-text)]">
                <span className="text-[var(--t-text-dim)]">TIR objetivo</span>
                <span className="text-right">{(debug.esc.tir * 100).toFixed(2)}%</span>
                <span className="text-[var(--t-text-dim)]">ΔTIR vs actual</span>
                <span className="text-right">
                  {debug.dTir != null
                    ? `${debug.dTir >= 0 ? "+" : ""}${(debug.dTir * 100).toFixed(2)} pp`
                    : "—"}
                </span>
                <span className="text-[var(--t-text-dim)]">Precio objetivo</span>
                <span className="text-right">{debug.esc.precio_objetivo.toFixed(4)}</span>
              </div>
            </div>

            <div>
              <div className="text-[9px] uppercase tracking-wide text-[var(--t-text-muted)] mb-1">
                Cálculo (exacto)
              </div>
              <div className="text-[var(--t-text)] leading-[1.5]">
                Retorno = (P<sub>obj</sub> + Carry) / P<sub>actual</sub> − 1
              </div>
              <div className="text-[var(--t-text-dim)] mt-1 leading-[1.5]">
                = ({debug.esc.precio_objetivo.toFixed(4)} + {(debug.bono.cobrado_horizonte ?? 0).toFixed(4)}) / {debug.bono.precio_actual.toFixed(4)} − 1
              </div>
              <div className="text-[var(--t-text-dim)] leading-[1.5]">
                = {(debug.esc.precio_objetivo + (debug.bono.cobrado_horizonte ?? 0)).toFixed(4)} / {debug.bono.precio_actual.toFixed(4)} − 1
              </div>
              <div
                className="mt-1 text-[13px] font-semibold"
                style={{ color: colorRetorno(debug.esc.upside ?? 0).bg === "#1a1a1a" ? "#bdb" : "#fff" }}
              >
                = {fmtPct(debug.esc.upside ?? 0, 2)}
              </div>
              <div className="text-[var(--t-text-muted)] text-[9px] mt-1 leading-[1.4]">
                P<sub>objetivo</sub> = PV de los flujos {horizonteDias > 0 ? "post-horizonte" : "futuros"} descontados a la TIR objetivo desde {horizonteDias > 0 ? "la fecha horizonte" : "HOY"}. Carry = cupones + amortizaciones cobradas en el horizonte.
              </div>
            </div>

            {debug.upsideLinear != null && debug.durRes != null && debug.dTir != null && debug.bono.duration != null && (
              <div>
                <div className="text-[9px] uppercase tracking-wide text-[var(--t-text-muted)] mb-1">
                  Sanity check (lineal, Fabozzi)
                </div>
                <div className="text-[var(--t-text)] leading-[1.5]">
                  ≈ −Dur<sub>res</sub> × ΔTIR{horizonteDias > 0 ? " + Carry/P" : ""}
                </div>
                {horizonteDias > 0 && (
                  <div className="text-[var(--t-text-dim)] mt-1 leading-[1.5]">
                    Dur<sub>res</sub> = {debug.bono.duration.toFixed(3)} − {(horizonteDias / 365).toFixed(3)} = {debug.durRes.toFixed(3)}
                  </div>
                )}
                <div className="text-[var(--t-text-dim)] mt-1 leading-[1.5]">
                  ≈ −{debug.durRes.toFixed(3)} × {(debug.dTir * 100).toFixed(2)} pp
                  {horizonteDias > 0 && (
                    <> + {(debug.bono.cobrado_horizonte ?? 0).toFixed(4)} / {debug.bono.precio_actual.toFixed(4)}</>
                  )}
                </div>
                <div className="text-[var(--t-text-dim)] leading-[1.5]">
                  ≈ {fmtPct(debug.upsideLinear, 2)}
                </div>
                <div className="text-[var(--t-text-muted)] text-[9px] mt-1 leading-[1.4]">
                  Diferencia vs exacto: {fmtPct((debug.esc.upside ?? 0) - debug.upsideLinear, 2)} — explicada por convexidad (siempre positiva, por eso el exacto es mejor que el lineal cuando la TIR baja y peor cuando sube).
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
      <div className="border border-[var(--t-border)] bg-[var(--t-panel)] p-3 shrink-0 grid grid-cols-1 lg:grid-cols-2 gap-3 text-[10px] font-mono">
        <div>
          <div className="text-[9px] uppercase tracking-widest text-[var(--t-accent)] mb-1">
            Cálculo — retorno total
          </div>
          <div className="text-[var(--t-text)]">
            Retorno = (P<sub>objetivo</sub> + Carry) / P<sub>actual</sub> − 1
          </div>
          <div className="text-[var(--t-text-dim)] mt-1 leading-relaxed">
            <b className="text-[var(--t-text)]">P<sub>objetivo</sub></b>: PV de los
            flujos descontados a la TIR del escenario {horizonteDias > 0
              ? `desde la fecha horizonte (${horizonteDias} días). Solo flujos posteriores al horizonte.`
              : "desde HOY. Todos los flujos futuros."}
            <br />
            <b className="text-[var(--t-text)]">P<sub>actual</sub></b>: último precio
            del MarketSnapshot (USD para tickers .D / .C).
            <br />
            <b className="text-[var(--t-text)]">Carry</b>: cupones + amortizaciones
            cobradas dentro del horizonte. Con horizonte=0 el carry es 0 y el
            cálculo colapsa al upside de precio puro.
          </div>
        </div>
        <div>
          <div className="text-[9px] uppercase tracking-widest text-[var(--t-accent)] mb-1">
            Modo activo: {modo === "absoluta" ? "TIR ABSOLUTA" : "TIR RELATIVA"}
          </div>
          <div className="text-[var(--t-text-dim)] leading-relaxed">
            {modo === "absoluta" ? (
              <>
                Las columnas son TIRs finales fijas, iguales para todos los
                bonos. Útil para ver el upside bajo escenarios definidos
                de mercado (ej. compresión a 6%, stress a 11%).
              </>
            ) : (
              <>
                Cada bono se evalúa con shifts centrados en su <b className="text-[var(--t-text)]">TEA actual</b>.
                Columna <b className="text-[var(--t-text)]">TIR actual</b> = upside 0
                (sin cambio). <b className="text-[var(--t-text)]">TIR +2%</b> = TEA
                actual + 2 puntos. Permite comparar sensibilidad apples-to-apples
                entre bonos con TEAs distintas.
              </>
            )}
            <br />
            <span className="text-[var(--t-text-muted)]">Hover sobre cualquier celda muestra TIR real + precio objetivo.</span>
          </div>
        </div>
      </div>
    </div>
  );
}
