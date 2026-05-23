"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Panel, fmtHoraAR } from "./ui";

type Commodity = "TRIGO" | "MAIZ" | "SOJA";
type TipoEstrategia = "put_sintetico" | "long_put";

interface LegSnapshot {
  ticker: string;
  bid: number | null;
  offer: number | null;
  last: number | null;
  vol: number | null;
  updated_at: string | null;
}

interface StrikeRow {
  strike: number;
  call: LegSnapshot | null;
  put: LegSnapshot | null;
}

interface VencimientoBlock {
  vencimiento: string;
  futuro_ticker: string | null;
  futuro_last: number | null;
  dias_a_vto: number | null;
  strikes: StrikeRow[];
}

interface PanelResp {
  commodity: Commodity;
  ts: string;
  vencimientos: VencimientoBlock[];
}

interface SimResp {
  tipo: TipoEstrategia;
  commodity: Commodity;
  vencimiento: string;
  strike: number;
  prima: number;
  prima_override: boolean;
  futuro_ticker: string | null;
  futuro_last: number;
  opcion_ticker: string | null;
  piso: number;
  diferencia_max: number;
  zona_expuesta: { desde: number; hasta: number } | null;
  curva_estrategia: { x: number; estrategia: number; futuro: number }[];
  curva_diferencias: { x: number; diferencia: number }[];
  ts: string;
}

const POLL_MS = 5_000;

function fmtPx(n: number | null | undefined, dec = 2): string {
  if (n === null || n === undefined || !isFinite(n)) return "—";
  return n.toLocaleString("es-AR", {
    minimumFractionDigits: dec,
    maximumFractionDigits: dec,
  });
}

function fmtFecha(yyyymmdd: string | null | undefined): string {
  if (!yyyymmdd || yyyymmdd.length !== 8) return yyyymmdd ?? "—";
  return `${yyyymmdd.slice(6, 8)}/${yyyymmdd.slice(4, 6)}/${yyyymmdd.slice(0, 4)}`;
}

function vtoLabel(b: VencimientoBlock): string {
  // Si el ticker del futuro existe, usar la parte legible (ej. "SOJ.ROS/NOV26").
  if (b.futuro_ticker) {
    const parts = b.futuro_ticker.split("/");
    if (parts.length === 2) return parts[1];
  }
  return fmtFecha(b.vencimiento);
}

export function DerivadosAgroEstrategias({
  commodity,
  setHeaderExtras,
}: {
  commodity: Commodity;
  setHeaderExtras: (n: ReactNode) => void;
}) {
  const [panel, setPanel] = useState<PanelResp | null>(null);
  const [vencimiento, setVencimiento] = useState<string | null>(null);
  // El poll (effect con deps [commodity]) lee el vencimiento elegido por ref,
  // no del closure — si no, congela el valor inicial y pisa la selección del
  // usuario en cada tick (stale closure).
  const vencimientoRef = useRef(vencimiento);
  vencimientoRef.current = vencimiento;
  const [tipo, setTipo] = useState<TipoEstrategia>("put_sintetico");
  const [strike, setStrike] = useState<number | null>(null);
  const [primaOverride, setPrimaOverride] = useState<string>("");
  const [sim, setSim] = useState<SimResp | null>(null);
  const [simError, setSimError] = useState<string | null>(null);
  const [loadingPanel, setLoadingPanel] = useState(false);
  const [lastAt, setLastAt] = useState<number>(0);
  const [chartView, setChartView] = useState<"estrategia" | "diferencias">(
    "estrategia",
  );

  // Carga + polling del panel de opciones por commodity.
  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | null = null;

    async function tick() {
      try {
        const res = await fetch(`/api/derivados-agro/opciones/${commodity}`, {
          cache: "no-store",
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data: PanelResp = await res.json();
        if (!alive) return;
         
        setPanel(data);
         
        setLastAt(Date.now());
        if (data.vencimientos.length > 0) {
          const stillThere = data.vencimientos.some(
            (v) => v.vencimiento === vencimientoRef.current,
          );
          if (!stillThere) {
             
            setVencimiento(data.vencimientos[0].vencimiento);
          }
        } else {
           
          setVencimiento(null);
        }
      } catch {
        // silencio: las desconexiones temporales son normales (Atlas pausa, etc.)
      } finally {
        if (alive) timer = setTimeout(tick, POLL_MS);
      }
    }

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoadingPanel(true);
    tick().finally(() => alive && setLoadingPanel(false));
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [commodity]);

  // Vencimiento bloque actual.
  const vtoBlock = useMemo(
    () => panel?.vencimientos.find((v) => v.vencimiento === vencimiento) ?? null,
    [panel, vencimiento],
  );

  // Strikes disponibles para el tipo seleccionado.
  const strikesParaTipo = useMemo(() => {
    if (!vtoBlock) return [];
    return vtoBlock.strikes
      .filter((s) => (tipo === "put_sintetico" ? s.call : s.put))
      .map((s) => ({
        strike: s.strike,
        prima: tipo === "put_sintetico" ? s.call?.last ?? null : s.put?.last ?? null,
        opcion: tipo === "put_sintetico" ? s.call : s.put,
      }));
  }, [vtoBlock, tipo]);

  // Default strike: el ATM más cercano CON last_price (priorizamos los que
  // se pueden simular automáticamente). Fallback al ATM sin importar last
  // cuando ningún strike tiene precio.
  useEffect(() => {
    if (!vtoBlock || strikesParaTipo.length === 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setStrike(null);
      return;
    }
    const F = vtoBlock.futuro_last;
    const conLast = strikesParaTipo.filter((s) => s.prima != null && s.prima > 0);
    const pool = conLast.length > 0 ? conLast : strikesParaTipo;
    if (F == null) {
       
      setStrike(pool[0].strike);
      return;
    }
    let best = pool[0].strike;
    let bestDist = Math.abs(best - F);
    for (const s of pool) {
      const d = Math.abs(s.strike - F);
      if (d < bestDist) {
        best = s.strike;
        bestDist = d;
      }
    }
     
    setStrike(best);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vencimiento, tipo, vtoBlock?.futuro_last, strikesParaTipo.length]);

  // Reset prima_override cuando cambia el strike/tipo/vencimiento.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPrimaOverride("");
  }, [strike, tipo, vencimiento, commodity]);

  // Strike actualmente seleccionado: ¿tiene last_price? Lo usamos para
  // decidir si llamar al simulador automáticamente o pedir prima_override.
  const strikeSeleccionado = useMemo(
    () => strikesParaTipo.find((s) => s.strike === strike) ?? null,
    [strikesParaTipo, strike],
  );
  const strikeTieneLast =
    strikeSeleccionado?.prima != null && strikeSeleccionado.prima > 0;
  const overrideNum = parseFloat(primaOverride);
  const overrideValido = isFinite(overrideNum) && overrideNum > 0;
  const puedeSimular = strike != null && (strikeTieneLast || overrideValido);

  // Llamada al simulador. Si el strike no tiene last y no hay override,
  // limpiamos el sim y mostramos un mensaje pidiendo la prima.
  useEffect(() => {
    if (!vtoBlock || strike == null) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSim(null);
       
      setSimError(null);
      return;
    }
    if (!puedeSimular) {
       
      setSim(null);
       
      setSimError(null);
      return;
    }
    let alive = true;
    const payload: Record<string, unknown> = {
      commodity,
      vencimiento: vtoBlock.vencimiento,
      tipo,
      strike,
    };
    if (overrideValido) {
      payload.prima_override = overrideNum;
    }
    (async () => {
      try {
        const res = await fetch("/api/derivados-agro/estrategia/simular", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          cache: "no-store",
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          if (alive) {
            setSim(null);
            setSimError(err?.detail ?? err?.error ?? `HTTP ${res.status}`);
          }
          return;
        }
        const data: SimResp = await res.json();
        if (alive) {
          setSim(data);
          setSimError(null);
        }
      } catch (e) {
        if (alive) {
          setSim(null);
          setSimError(e instanceof Error ? e.message : "error");
        }
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [commodity, vtoBlock?.vencimiento, tipo, strike, primaOverride, puedeSimular]);

  const ultimoDisplay = lastAt > 0 ? fmtHoraAR(lastAt) : "—";
  const futuro = vtoBlock?.futuro_last ?? null;

  // Inyecto extras (VTO selector + futuro + últ. act) en la fila del shell.
  useEffect(() => {
    setHeaderExtras(
      <>
        <span className="text-[10px] text-[#808080] tracking-wide">VTO</span>
        <select
          value={vencimiento ?? ""}
          onChange={(e) => setVencimiento(e.target.value || null)}
          disabled={!panel || panel.vencimientos.length === 0}
          className="bg-[#0e0e0e] border border-[#2a2a2a] text-[#d0d0d0] text-[11px] px-2 py-0.5 font-mono focus:border-[#ff9900] outline-none"
        >
          {panel?.vencimientos.map((v) => (
            <option key={v.vencimiento} value={v.vencimiento}>
              {vtoLabel(v)} — {fmtFecha(v.vencimiento)}
            </option>
          ))}
        </select>
        <span className="text-[10px] text-[#808080] tracking-wide ml-2">FUT</span>
        <span className="text-[#ff9900] font-mono text-[11px]">{fmtPx(futuro)}</span>
        {vtoBlock?.dias_a_vto != null && (
          <span className="text-[9px] text-[#555]">({vtoBlock.dias_a_vto}d)</span>
        )}
        <span className="text-[10px] text-[#555] ml-3">
          {loadingPanel ? "CARGANDO…" : `ÚLT ${ultimoDisplay}`}
        </span>
      </>,
    );
    return () => setHeaderExtras(null);
  }, [
    vencimiento, panel, futuro, vtoBlock?.dias_a_vto,
    loadingPanel, ultimoDisplay, setHeaderExtras,
  ]);

  return (
    <div className="h-full min-h-0 p-3 flex flex-col gap-3">
      {/* Layout: izquierda panel opciones (full height), derecha simulador compacto arriba + gráficos lado a lado abajo */}
      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[1fr_1.5fr] gap-3">
        {/* Panel de opciones */}
        <div className="min-h-0 overflow-auto">
          <Panel title={`PANEL DE OPCIONES — ${commodity}`} fill expandable>
            <PanelOpciones block={vtoBlock} futuro={futuro} />
          </Panel>
        </div>

        {/* Simulador + gráficos */}
        <div className="min-h-0 flex flex-col gap-3">
          {/* Tira compacta: form + KPIs inline */}
          <div className="border border-[#1a1a1a] bg-[#080808] p-2 flex flex-col gap-1.5 shrink-0">
            <SimuladorForm
              tipo={tipo}
              setTipo={setTipo}
              strike={strike}
              setStrike={setStrike}
              strikes={strikesParaTipo}
              primaOverride={primaOverride}
              setPrimaOverride={setPrimaOverride}
              sim={sim}
              error={simError}
              strikeTieneLast={strikeTieneLast}
              puedeSimular={puedeSimular}
            />
          </div>

          {sim && (
            <div className="flex-1 min-h-0">
              <Panel
                title={
                  chartView === "estrategia"
                    ? "ESTRATEGIA VS FUTURO"
                    : "DIFERENCIAS (margin calls)"
                }
                fill
                expandable
                actions={
                  <div className="flex gap-0.5">
                    <ChartToggleBtn
                      active={chartView === "estrategia"}
                      onClick={() => setChartView("estrategia")}
                    >
                      Estrategia
                    </ChartToggleBtn>
                    <ChartToggleBtn
                      active={chartView === "diferencias"}
                      onClick={() => setChartView("diferencias")}
                    >
                      Diferencias
                    </ChartToggleBtn>
                  </div>
                }
              >
                <div className="w-full h-full min-h-[220px] py-1">
                  <ResponsiveContainer width="100%" height="100%">
                    {chartView === "estrategia" ? (
                      <LineChart
                        data={sim.curva_estrategia}
                        margin={{ top: 8, right: 16, bottom: 4, left: 8 }}
                      >
                        <CartesianGrid stroke="#1a1a1a" />
                        <XAxis
                          dataKey="x"
                          tick={{ fill: "#666", fontSize: 10 }}
                          stroke="#2a2a2a"
                        />
                        <YAxis
                          tick={{ fill: "#666", fontSize: 10 }}
                          stroke="#2a2a2a"
                        />
                        <Tooltip
                          contentStyle={{
                            background: "#080808",
                            border: "1px solid #2a2a2a",
                            fontSize: 11,
                          }}
                          labelFormatter={(v) =>
                            `Futuro: ${fmtPx(Number(v))}`
                          }
                          formatter={(v, name) => [
                            fmtPx(Number(v)),
                            name === "estrategia" ? "Estrategia" : "Futuro",
                          ]}
                        />
                        <Legend
                          wrapperStyle={{ fontSize: 10, color: "#a0a0a0" }}
                        />
                        <ReferenceLine
                          y={sim.piso}
                          stroke="#4ade80"
                          strokeDasharray="3 3"
                          label={{
                            value: `Piso ${fmtPx(sim.piso)}`,
                            fill: "#4ade80",
                            fontSize: 10,
                            position: "insideTopLeft",
                          }}
                        />
                        <Line
                          type="monotone"
                          dataKey="estrategia"
                          stroke="#3b82f6"
                          strokeWidth={2}
                          dot={false}
                          name="estrategia"
                        />
                        <Line
                          type="monotone"
                          dataKey="futuro"
                          stroke="#f87171"
                          strokeWidth={1.5}
                          strokeDasharray="4 3"
                          dot={false}
                          name="futuro"
                        />
                      </LineChart>
                    ) : (
                      <LineChart
                        data={sim.curva_diferencias}
                        margin={{ top: 8, right: 16, bottom: 4, left: 8 }}
                      >
                        <CartesianGrid stroke="#1a1a1a" />
                        <XAxis
                          dataKey="x"
                          tick={{ fill: "#666", fontSize: 10 }}
                          stroke="#2a2a2a"
                        />
                        <YAxis
                          tick={{ fill: "#666", fontSize: 10 }}
                          stroke="#2a2a2a"
                        />
                        <Tooltip
                          contentStyle={{
                            background: "#080808",
                            border: "1px solid #2a2a2a",
                            fontSize: 11,
                          }}
                          labelFormatter={(v) =>
                            `Futuro: ${fmtPx(Number(v))}`
                          }
                          formatter={(v) => [fmtPx(Number(v)), "Diferencia"]}
                        />
                        <ReferenceLine y={0} stroke="#555" />
                        <Line
                          type="monotone"
                          dataKey="diferencia"
                          stroke="#3b82f6"
                          strokeWidth={2}
                          dot={false}
                        />
                      </LineChart>
                    )}
                  </ResponsiveContainer>
                </div>
              </Panel>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ChartToggleBtn({
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
      className={`text-[9px] tracking-wide uppercase px-1.5 py-0.5 border ${
        active
          ? "bg-[#3b82f6]/10 text-[#3b82f6] border-[#3b82f6]"
          : "text-[#808080] border-[#2a2a2a] hover:text-[#d0d0d0]"
      }`}
    >
      {children}
    </button>
  );
}

function PanelOpciones({
  block,
  futuro,
}: {
  block: VencimientoBlock | null;
  futuro: number | null;
}) {
  if (!block || block.strikes.length === 0) {
    return (
      <div className="px-3 py-4 text-center text-[#666] text-[11px]">
        Sin opciones cargadas para este vencimiento
      </div>
    );
  }
  return (
    <table className="w-full text-[10px] font-mono">
      <thead className="text-[9px] text-[#808080] uppercase tracking-wide bg-[#0a0a0a] sticky top-0 z-10">
        <tr>
          <th colSpan={3} className="text-center px-2 py-1 border-b border-[#1a1a1a] text-[#4ade80]">
            CALL
          </th>
          <th className="text-center px-2 py-1 border-b border-[#1a1a1a]">
            STRIKE
          </th>
          <th colSpan={3} className="text-center px-2 py-1 border-b border-[#1a1a1a] text-[#f87171]">
            PUT
          </th>
        </tr>
        <tr>
          <th className="text-right px-2 py-1 border-b border-[#1a1a1a]">Bid</th>
          <th className="text-right px-2 py-1 border-b border-[#1a1a1a]">Ofer</th>
          <th className="text-right px-2 py-1 border-b border-[#1a1a1a]">Últ</th>
          <th className="text-center px-2 py-1 border-b border-[#1a1a1a]">—</th>
          <th className="text-right px-2 py-1 border-b border-[#1a1a1a]">Bid</th>
          <th className="text-right px-2 py-1 border-b border-[#1a1a1a]">Ofer</th>
          <th className="text-right px-2 py-1 border-b border-[#1a1a1a]">Últ</th>
        </tr>
      </thead>
      <tbody>
        {block.strikes.map((s) => {
          const isAtm =
            futuro != null &&
            Math.abs(s.strike - futuro) ===
              Math.min(
                ...block.strikes.map((x) => Math.abs(x.strike - futuro)),
              );
          return (
            <tr
              key={s.strike}
              className={`border-b border-[#101010] ${
                isAtm ? "bg-[#ff9900]/10" : "hover:bg-[#0d0d0d]"
              }`}
            >
              <td className="px-2 py-0.5 text-right text-[#a0a0a0]">
                {fmtPx(s.call?.bid)}
              </td>
              <td className="px-2 py-0.5 text-right text-[#a0a0a0]">
                {fmtPx(s.call?.offer)}
              </td>
              <td className="px-2 py-0.5 text-right text-[#d0d0d0] font-semibold">
                {fmtPx(s.call?.last)}
              </td>
              <td
                className={`px-2 py-0.5 text-center font-semibold ${
                  isAtm ? "text-[#ff9900]" : "text-[#d0d0d0]"
                }`}
              >
                {fmtPx(s.strike, 0)}
              </td>
              <td className="px-2 py-0.5 text-right text-[#a0a0a0]">
                {fmtPx(s.put?.bid)}
              </td>
              <td className="px-2 py-0.5 text-right text-[#a0a0a0]">
                {fmtPx(s.put?.offer)}
              </td>
              <td className="px-2 py-0.5 text-right text-[#d0d0d0] font-semibold">
                {fmtPx(s.put?.last)}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function SimuladorForm({
  tipo,
  setTipo,
  strike,
  setStrike,
  strikes,
  primaOverride,
  setPrimaOverride,
  sim,
  error,
  strikeTieneLast,
  puedeSimular,
}: {
  tipo: TipoEstrategia;
  setTipo: (t: TipoEstrategia) => void;
  strike: number | null;
  setStrike: (s: number | null) => void;
  strikes: { strike: number; prima: number | null }[];
  primaOverride: string;
  setPrimaOverride: (s: string) => void;
  sim: SimResp | null;
  error: string | null;
  strikeTieneLast: boolean;
  puedeSimular: boolean;
}) {
  return (
    <div className="p-2 flex flex-col gap-2">
      {/* Una sola fila horizontal: Tipo + Strike + Prima */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-0.5">
          <button
            onClick={() => setTipo("put_sintetico")}
            className={`text-[10px] tracking-wide uppercase px-2 py-1 border ${
              tipo === "put_sintetico"
                ? "bg-[#3b82f6]/10 text-[#3b82f6] border-[#3b82f6]"
                : "text-[#808080] border-[#2a2a2a] hover:text-[#d0d0d0]"
            }`}
            title="Vender futuro + Comprar call"
          >
            Put sint.
          </button>
          <button
            onClick={() => setTipo("long_put")}
            className={`text-[10px] tracking-wide uppercase px-2 py-1 border ${
              tipo === "long_put"
                ? "bg-[#3b82f6]/10 text-[#3b82f6] border-[#3b82f6]"
                : "text-[#808080] border-[#2a2a2a] hover:text-[#d0d0d0]"
            }`}
            title="Comprar put"
          >
            Long put
          </button>
        </div>

        <div className="flex items-center gap-1">
          <span className="text-[9px] text-[#808080] uppercase">K</span>
          <select
            value={strike ?? ""}
            onChange={(e) =>
              setStrike(e.target.value ? Number(e.target.value) : null)
            }
            disabled={strikes.length === 0}
            className="bg-[#0e0e0e] border border-[#2a2a2a] text-[#d0d0d0] text-[11px] px-1.5 py-0.5 font-mono focus:border-[#ff9900] outline-none"
          >
            {strikes.map((s) => (
              <option key={s.strike} value={s.strike}>
                {s.strike} {s.prima != null ? `(${fmtPx(s.prima)})` : "(—)"}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-1">
          <span className="text-[9px] text-[#808080] uppercase">Prima</span>
          <input
            type="number"
            step="0.01"
            min="0"
            placeholder={
              sim?.prima != null && !sim.prima_override
                ? `${fmtPx(sim.prima)}`
                : strikeTieneLast
                ? "(último)"
                : "manual"
            }
            value={primaOverride}
            onChange={(e) => setPrimaOverride(e.target.value)}
            className={`bg-[#0e0e0e] border ${
              !strikeTieneLast && !primaOverride
                ? "border-[#ff9900]/60"
                : "border-[#2a2a2a]"
            } text-[#d0d0d0] text-[11px] px-1.5 py-0.5 font-mono focus:border-[#ff9900] outline-none w-20`}
          />
          <span className="text-[9px] text-[#555]">USD</span>
        </div>
      </div>

      {/* Resultado */}
      {error ? (
        <div className="border border-[#f87171]/30 bg-[#f87171]/5 px-2 py-1.5 text-[10px] text-[#f87171]">
          {error}
        </div>
      ) : sim ? (
        <ResultCard sim={sim} />
      ) : !puedeSimular && strike != null ? (
        <div className="border border-[#ff9900]/30 bg-[#ff9900]/5 px-2 py-1.5 text-[10px] text-[#ff9900]">
          Strike sin último operado — ingresá prima manual (bid/offer del panel).
        </div>
      ) : (
        <div className="text-[10px] text-[#666] italic">Seleccioná un strike…</div>
      )}
    </div>
  );
}

function ResultCard({ sim }: { sim: SimResp }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] font-mono">
      <KpiInline label="PISO" value={`USD ${fmtPx(sim.piso)}`} color="#4ade80" />
      <KpiInline
        label="PRIMA"
        value={`USD ${fmtPx(sim.prima)}`}
        sub={sim.prima_override ? "manual" : "últ"}
        color="#a0a0a0"
      />
      <KpiInline
        label="DIF MAX"
        value={
          sim.diferencia_max > 0
            ? `USD ${fmtPx(sim.diferencia_max)}`
            : "0"
        }
        color={sim.diferencia_max > 0 ? "#f87171" : "#4ade80"}
      />
      <KpiInline
        label="ZONA"
        value={
          sim.zona_expuesta
            ? `${fmtPx(sim.zona_expuesta.desde)}→${fmtPx(sim.zona_expuesta.hasta)}`
            : "—"
        }
        color="#a0a0a0"
      />
    </div>
  );
}

function KpiInline({
  label,
  value,
  color,
  sub,
}: {
  label: string;
  value: string;
  color: string;
  sub?: string;
}) {
  return (
    <div className="flex items-baseline gap-1">
      <span className="text-[9px] text-[#808080] uppercase tracking-wide">
        {label}
      </span>
      <span className="font-semibold" style={{ color }}>
        {value}
      </span>
      {sub && <span className="text-[8px] text-[#555]">({sub})</span>}
    </div>
  );
}
