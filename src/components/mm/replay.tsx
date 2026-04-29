"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Activity, AlertTriangle, Pause, Play, RotateCcw } from "lucide-react";
import type { SessionInfo, SpecTrade } from "./types";

// ============================================================
// Constantes — port de docs/mm_workstation.jsx (NO tocar sin sincronizar
// el backend service `api/services/mm.py::run_backtest_dia`).
// ============================================================
const MID_WINDOW = 20;
const HISTORY_MAX = 220;
const FILLS_MAX = 80;
const TICK_MS = 220;
const TOX_LOOKAHEAD = 30;
const SPEEDS = [10, 30, 60, 120, 300];

// ============================================================
// PURE BACKTEST — usado por el "Find sweet spot" del REPLAY (sweep
// offline sobre el día actual). Equivalente al `runBacktest` de la spec.
// ============================================================
interface BacktestParams {
  spread: number;
  quoteSize: number;
  skewIntensity: number;
  autoSkew: boolean;
  invCap: number;
}

interface BacktestResult {
  spread: number;
  totalPnL: number;
  spreadPnL: number;
  invPnL: number;
  totalFills: number;
  fillsBuy: number;
  fillsSell: number;
  maxInv: number;
  minInv: number;
  finalInv: number;
}

function runBacktest(trades: SpecTrade[], p: BacktestParams): BacktestResult {
  let cash = 0,
    inventory = 0,
    spreadPnL = 0;
  let fillsBuy = 0,
    fillsSell = 0;
  let maxInv = 0,
    minInv = 0;
  let lastMid = trades[0]?.p ?? 0;
  const midWindow: number[] = [];

  for (let i = 0; i < trades.length; i++) {
    const trade = trades[i];
    midWindow.push(trade.p);
    if (midWindow.length > MID_WINDOW) midWindow.shift();
    const mid = midWindow.reduce((a, b) => a + b, 0) / midWindow.length;

    const skewOffset =
      p.autoSkew && p.invCap > 0
        ? -(inventory / p.invCap) * p.skewIntensity * p.spread * 0.5
        : 0;
    const bid = mid - p.spread / 2 + skewOffset;
    const offer = mid + p.spread / 2 + skewOffset;

    if (trade.d === "B" && offer <= trade.p) {
      const wouldBeInv = inventory - p.quoteSize;
      if (wouldBeInv >= -p.invCap) {
        const fillSize = Math.min(p.quoteSize, trade.s);
        inventory -= fillSize;
        cash += offer * fillSize;
        spreadPnL += (offer - mid) * fillSize;
        fillsSell++;
      }
    } else if (trade.d === "S" && bid >= trade.p) {
      const wouldBeInv = inventory + p.quoteSize;
      if (wouldBeInv <= p.invCap) {
        const fillSize = Math.min(p.quoteSize, trade.s);
        inventory += fillSize;
        cash -= bid * fillSize;
        spreadPnL += (mid - bid) * fillSize;
        fillsBuy++;
      }
    }

    if (inventory > maxInv) maxInv = inventory;
    if (inventory < minInv) minInv = inventory;
    lastMid = mid;
  }

  const totalPnL = cash + inventory * lastMid;
  return {
    spread: p.spread,
    totalPnL,
    spreadPnL,
    invPnL: totalPnL - spreadPnL,
    totalFills: fillsBuy + fillsSell,
    fillsBuy,
    fillsSell,
    maxInv,
    minInv,
    finalInv: inventory,
  };
}

const SWEEP_SPREADS = [0.04, 0.05, 0.06, 0.08, 0.1, 0.12, 0.15, 0.18, 0.22, 0.27, 0.32, 0.4];

// Formatters compactos para el header session.
function fmtVN(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(0)}k`;
  return n.toFixed(0);
}

function fmtMoney(n: number): string {
  // Factor 100 BYMA ya viene aplicado por el caller (n = size × price / 100).
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}k`;
  return `$${n.toFixed(0)}`;
}

// ============================================================
// Estado mutable del simulador (vive en useRef para no causar re-renders
// por cada print procesado — patrón crítico para correr a 300x sin lag).
// ============================================================
interface SimState {
  index: number;
  cash: number;
  inventory: number;
  spreadPnL: number;
  fillsBuy: number;
  fillsSell: number;
  volTraded: number;
  midWindow: number[];
  history: { i: number; mid: number; bid: number; offer: number; price: number; ts: string }[];
  fills: { ts: string; side: "B" | "S"; px: number; size: number; idxAtFill: number }[];
  pendingFills: { side: "B" | "S"; midAtFill: number; idxAtFill: number; size: number }[];
  toxScores: number[];
  invSeries: number[];
}

function newSimState(): SimState {
  return {
    index: 0,
    cash: 0,
    inventory: 0,
    spreadPnL: 0,
    fillsBuy: 0,
    fillsSell: 0,
    volTraded: 0,
    midWindow: [],
    history: [],
    fills: [],
    pendingFills: [],
    toxScores: [],
    invSeries: [],
  };
}

// ============================================================
// MAIN COMPONENT
// ============================================================
export function MMReplay({
  trades,
  session,
}: {
  trades: SpecTrade[];
  session: SessionInfo;
}) {
  // Perillas (state visible al user).
  const [spread, setSpread] = useState(0.1);
  const [quoteSize, setQuoteSize] = useState(20_000);
  const [skewIntensity, setSkewIntensity] = useState(1.0);
  const [autoSkew, setAutoSkew] = useState(true);
  const [invCap, setInvCap] = useState(200_000);

  // Run state.
  const [running, setRunning] = useState(false);
  const [speed, setSpeed] = useState(60);
  const [done, setDone] = useState(false);

  // Snapshot que se renderiza en pantalla (actualizado cada TICK_MS por el
  // motor — NO en cada print, sino batched).
  const [display, setDisplay] = useState({
    index: 0,
    mid: 0,
    bid: 0,
    offer: 0,
    inventory: 0,
    cash: 0,
    spreadPnL: 0,
    fillsBuy: 0,
    fillsSell: 0,
    volTraded: 0,
    history: [] as SimState["history"],
    fills: [] as SimState["fills"],
    toxScore: 0,
    toxCount: 0,
    invSeries: [] as number[],
  });

  // Sweep results.
  const [sweepResults, setSweepResults] = useState<BacktestResult[] | null>(null);

  // Refs mutables — NO causan re-render. El motor escribe acá en cada print.
  const sim = useRef<SimState>(newSimState());
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const perillas = useRef<BacktestParams>({ spread, quoteSize, skewIntensity, autoSkew, invCap });

  // Sincronizar perillas → ref cada vez que cambian. El motor lee del ref.
  perillas.current = { spread, quoteSize, skewIntensity, autoSkew, invCap };

  // Reset trades / cambio de instrumento → reset del sim.
  useEffect(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = null;
    sim.current = newSimState();
    setRunning(false);
    setDone(false);
    setDisplay({
      index: 0,
      mid: trades[0]?.p ?? 0,
      bid: 0,
      offer: 0,
      inventory: 0,
      cash: 0,
      spreadPnL: 0,
      fillsBuy: 0,
      fillsSell: 0,
      volTraded: 0,
      history: [],
      fills: [],
      toxScore: 0,
      toxCount: 0,
      invSeries: [],
    });
  }, [trades]);

  const processTrade = useCallback(
    (trade: SpecTrade, p: BacktestParams) => {
      const s = sim.current;
      s.midWindow.push(trade.p);
      if (s.midWindow.length > MID_WINDOW) s.midWindow.shift();
      const mid =
        s.midWindow.reduce((a, b) => a + b, 0) / s.midWindow.length;

      const skewOffset =
        p.autoSkew && p.invCap > 0
          ? -(s.inventory / p.invCap) * p.skewIntensity * p.spread * 0.5
          : 0;
      const bid = mid - p.spread / 2 + skewOffset;
      const offer = mid + p.spread / 2 + skewOffset;

      let didFill = false;
      let fillSide: "B" | "S" | null = null;

      if (trade.d === "B" && offer <= trade.p) {
        const wouldBeInv = s.inventory - p.quoteSize;
        if (wouldBeInv >= -p.invCap) {
          const fillSize = Math.min(p.quoteSize, trade.s);
          s.inventory -= fillSize;
          s.cash += offer * fillSize;
          s.spreadPnL += (offer - mid) * fillSize;
          s.fillsSell++;
          s.volTraded += fillSize;
          s.fills.unshift({ ts: trade.ts, side: "S", px: offer, size: fillSize, idxAtFill: s.index });
          if (s.fills.length > FILLS_MAX) s.fills.pop();
          didFill = true;
          fillSide = "S";
        }
      } else if (trade.d === "S" && bid >= trade.p) {
        const wouldBeInv = s.inventory + p.quoteSize;
        if (wouldBeInv <= p.invCap) {
          const fillSize = Math.min(p.quoteSize, trade.s);
          s.inventory += fillSize;
          s.cash -= bid * fillSize;
          s.spreadPnL += (mid - bid) * fillSize;
          s.fillsBuy++;
          s.volTraded += fillSize;
          s.fills.unshift({ ts: trade.ts, side: "B", px: bid, size: fillSize, idxAtFill: s.index });
          if (s.fills.length > FILLS_MAX) s.fills.pop();
          didFill = true;
          fillSide = "B";
        }
      }

      if (didFill && fillSide) {
        s.pendingFills.push({
          side: fillSide,
          midAtFill: mid,
          idxAtFill: s.index,
          size: 1,
        });
      }

      // Evaluar tox: pendientes que ya cumplieron TOX_LOOKAHEAD.
      while (
        s.pendingFills.length > 0 &&
        s.index - s.pendingFills[0].idxAtFill >= TOX_LOOKAHEAD
      ) {
        const pending = s.pendingFills.shift()!;
        const drift = mid - pending.midAtFill;
        // Adverso: si compró (B) y mid bajó, drift negativo es malo. Si
        // vendió (S) y mid subió, drift positivo es malo. Normalizamos
        // por medio-spread para tener un score en σ.
        const adverse = pending.side === "B" ? -drift : drift;
        const halfSpread = p.spread / 2 || 1e-6;
        const sigma = adverse / halfSpread;
        s.toxScores.push(sigma);
        if (s.toxScores.length > 20) s.toxScores.shift();
      }

      // Push history (sub-sampleado para no saturar el chart).
      if (s.index % 10 === 0) {
        s.history.push({ i: s.index, mid, bid, offer, price: trade.p, ts: trade.ts });
        if (s.history.length > HISTORY_MAX) s.history.shift();
      }

      // Inventory series para sparkline (sample cada 30 trades).
      if (s.index % 30 === 0) {
        s.invSeries.push(s.inventory);
        if (s.invSeries.length > 200) s.invSeries.shift();
      }

      s.index++;
    },
    [],
  );

  // Loop: setInterval cada TICK_MS, procesa N trades por tick (N depende
  // de speed) y al final del tick hace UN setState con el snapshot.
  useEffect(() => {
    if (!running) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }
    intervalRef.current = setInterval(() => {
      const s = sim.current;
      if (s.index >= trades.length) {
        setRunning(false);
        setDone(true);
        if (intervalRef.current) clearInterval(intervalRef.current);
        return;
      }
      const tradesPerTick = Math.max(1, Math.round(speed * (TICK_MS / 1000)));
      const limit = Math.min(s.index + tradesPerTick, trades.length);
      const p = perillas.current;
      while (s.index < limit) {
        processTrade(trades[s.index], p);
      }

      // Snapshot batched para el render.
      const lastH = s.history[s.history.length - 1];
      const toxAvg =
        s.toxScores.length > 0
          ? s.toxScores.reduce((a, b) => a + b, 0) / s.toxScores.length
          : 0;
      setDisplay({
        index: s.index,
        mid: lastH?.mid ?? 0,
        bid: lastH?.bid ?? 0,
        offer: lastH?.offer ?? 0,
        inventory: s.inventory,
        cash: s.cash,
        spreadPnL: s.spreadPnL,
        fillsBuy: s.fillsBuy,
        fillsSell: s.fillsSell,
        volTraded: s.volTraded,
        history: [...s.history],
        fills: [...s.fills],
        toxScore: toxAvg,
        toxCount: s.toxScores.length,
        invSeries: [...s.invSeries],
      });
    }, TICK_MS);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [running, speed, trades, processTrade]);

  function handleReset() {
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = null;
    sim.current = newSimState();
    setRunning(false);
    setDone(false);
    setSweepResults(null);
    setDisplay({
      index: 0,
      mid: trades[0]?.p ?? 0,
      bid: 0,
      offer: 0,
      inventory: 0,
      cash: 0,
      spreadPnL: 0,
      fillsBuy: 0,
      fillsSell: 0,
      volTraded: 0,
      history: [],
      fills: [],
      toxScore: 0,
      toxCount: 0,
      invSeries: [],
    });
  }

  function handleSweep() {
    const p = perillas.current;
    const out: BacktestResult[] = [];
    for (const sp of SWEEP_SPREADS) {
      out.push(runBacktest(trades, { ...p, spread: sp }));
    }
    setSweepResults(out);
  }

  // PnL attribution.
  const totalPnL = display.cash + display.inventory * display.mid;
  const spreadPnL = display.spreadPnL;
  const invPnL = totalPnL - spreadPnL;
  const progress = trades.length ? (display.index / trades.length) * 100 : 0;

  if (!trades.length) {
    return (
      <div className="h-full flex items-center justify-center text-[#666] text-xs">
        Sin trades para esta sesión.
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto p-3 flex flex-col gap-3 bg-black text-[#d0d0d0]">
      {/* Header session info — 1 línea compacta. Formato money con factor
         100 BYMA (size × price / 100) y abreviatura M/B según escala. */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-1.5 bg-[#0a0a0a] border border-[#1a1a1a] text-[10px] font-mono">
        <span className="text-[#ff9900] font-bold">{session.ticker}</span>
        <span className="text-[#666]">{session.date}</span>
        <span>
          <span className="text-[#666]">O</span> {session.open.toFixed(3)}
        </span>
        <span>
          <span className="text-[#666]">H</span> {session.high.toFixed(2)}
        </span>
        <span>
          <span className="text-[#666]">L</span> {session.low.toFixed(2)}
        </span>
        <span>
          <span className="text-[#666]">C</span> {session.close.toFixed(3)}
        </span>
        <span>
          <span className="text-[#666]">DUR</span> {session.duration.toFixed(2)}
        </span>
        <span>
          <span className="text-[#666]">TEA</span> {(session.tea * 100).toFixed(2)}%
        </span>
        <span>
          <span className="text-[#666]">PAR</span> {session.paridad.toFixed(2)}
        </span>
        <span>
          <span className="text-[#666]">VOL</span>{" "}
          {fmtVN(session.total_volume_vn)}
        </span>
        <span>
          <span className="text-[#666]">$</span>{" "}
          {fmtMoney(session.total_money_ars / 100)}
        </span>
        <span className="text-[#666]">{session.num_trades} trades</span>
      </div>

      {/* Controles */}
      <div className="flex flex-wrap items-center gap-3 px-3 py-2 bg-[#0a0a0a] border border-[#1a1a1a]">
        <button
          onClick={() => setRunning((r) => !r)}
          disabled={done}
          className="flex items-center gap-1 px-3 py-1 text-[11px] font-semibold bg-[#ff9900] text-black hover:brightness-110 disabled:opacity-40"
        >
          {running ? <Pause size={12} /> : <Play size={12} />}
          {running ? "PAUSE" : done ? "DONE" : "PLAY"}
        </button>
        <button
          onClick={handleReset}
          className="flex items-center gap-1 px-3 py-1 text-[11px] border border-[#2a2a2a] hover:border-[#ff9900]"
        >
          <RotateCcw size={12} />
          RESET
        </button>
        <div className="flex items-center gap-1">
          <span className="text-[9px] tracking-widest text-[#666]">SPEED</span>
          {SPEEDS.map((sp) => (
            <button
              key={sp}
              onClick={() => setSpeed(sp)}
              className={`px-2 py-0.5 text-[10px] font-mono ${
                speed === sp
                  ? "bg-[#ff9900] text-black"
                  : "border border-[#2a2a2a] text-[#888] hover:border-[#ff9900]"
              }`}
            >
              {sp}x
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2 text-[10px] text-[#888]">
          <Activity size={12} />
          <span className="font-mono">
            {display.index} / {trades.length} ({progress.toFixed(1)}%)
          </span>
        </div>
        <button
          onClick={handleSweep}
          disabled={running}
          className="px-3 py-1 text-[11px] border border-[#2a2a2a] text-[#ff9900] hover:border-[#ff9900] disabled:opacity-40"
        >
          FIND SWEET SPOT
        </button>
      </div>

      {/* Perillas */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2 px-3 py-2 bg-[#0a0a0a] border border-[#1a1a1a]">
        <Perilla
          label="SPREAD ($)"
          value={spread}
          min={0.02}
          max={0.5}
          step={0.01}
          onChange={setSpread}
          display={`$${spread.toFixed(2)}`}
          tip="Distancia entre tu bid y tu offer. Más chico (4-6c) = más fills + spread captured pero más exposición a inventory. Más ancho (20c+) = casi no fillea pero cada uno paga más."
        />
        <Perilla
          label="TAMAÑO (VN)"
          value={quoteSize}
          min={1_000}
          max={100_000}
          step={1_000}
          onChange={setQuoteSize}
          display={`${(quoteSize / 1000).toFixed(0)}k`}
          tip="Cuántos VN poner por punta. Más grande = capturás más mercado pero un fill malo te clava la posición. Más chico = inventory más manejable pero menos volumen capturado."
        />
        <Perilla
          label="SKEW INT."
          value={skewIntensity}
          min={0}
          max={3}
          step={0.1}
          onChange={setSkewIntensity}
          display={`${skewIntensity.toFixed(1)}x`}
          disabled={!autoSkew}
          tip="Cuánto se inclinan tus puntas según el inventory. 0x = sin skew (las puntas no se mueven). 1x = skew estándar. 2x = agresivo (cuando estás muy long, baja fuerte el offer para descargar)."
        />
        <div className="flex flex-col gap-1">
          <span className="text-[9px] tracking-widest text-[#666] flex items-center gap-1">
            AUTO-SKEW
            <InfoIcon tip="ON = el sistema mueve bid/offer automáticamente cuando crece el inventory (defensa activa). OFF = sistema neutro, peligroso si no manejás manual el inventory." />
          </span>
          <button
            onClick={() => setAutoSkew(!autoSkew)}
            className={`text-[11px] font-mono px-2 py-1 border ${
              autoSkew
                ? "bg-[#1f8a3e]/30 border-[#1f8a3e] text-[#7fff7f]"
                : "border-[#2a2a2a] text-[#666]"
            }`}
          >
            {autoSkew ? "ON" : "OFF"}
          </button>
        </div>
        <Perilla
          label="INV CAP (VN)"
          value={invCap}
          min={10_000}
          max={1_000_000}
          step={10_000}
          onChange={setInvCap}
          display={`${(invCap / 1000).toFixed(0)}k`}
          tip="Tope máximo de posición que el sistema permite. Si llegás al cap, deja de fillear de un lado. Más chico = más conservador (riesgo limitado, menos fills). Más grande = más agresivo."
        />
      </div>

      {/* PnL */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2 px-3 py-2 bg-[#0a0a0a] border border-[#1a1a1a] text-[11px] tabular-nums">
        <Stat
          label="TOTAL PnL"
          value={`$${totalPnL.toFixed(0)}`}
          color={totalPnL >= 0 ? "text-[#7fff7f]" : "text-[#ff7f7f]"}
          tip="PnL total = SPREAD CAPTURED + INVENTORY MTM. Es lo que te llevás si cerrás todo a mid actual. Día sano: alto y verde con inv chico. Día tóxico: spread captured grande pero inv MTM negativo se lo come."
        />
        <Stat
          label="SPREAD CAPTURED"
          value={`$${spreadPnL.toFixed(0)}`}
          color="text-[#7fff7f]"
          tip="Lo bueno: ganancia 'pura' del MM. Por cada fill ganás (offer - mid) si vendiste o (mid - bid) si compraste. Esto suma siempre — es tu edge realizado."
        />
        <Stat
          label="INVENTORY MTM"
          value={`$${invPnL.toFixed(0)}`}
          color={invPnL >= 0 ? "text-[#7fff7f]" : "text-[#ff7f7f]"}
          tip="Lo arriesgado: tu posición abierta valuada al mid actual. Si quedás long y el mercado baja, esto se vuelve negativo y se come al spread captured. Cero al final del día = MM perfecto."
        />
        <Stat
          label="FILLS"
          value={`${display.fillsBuy + display.fillsSell} (${display.fillsBuy}B/${display.fillsSell}S)`}
          tip="Cantidad total de operaciones ejecutadas. B = vos compraste (te pegaron en el bid), S = vos vendiste (te pegaron en el offer). Idealmente cerca de 50/50."
        />
        <Stat
          label="VOL"
          value={display.volTraded.toLocaleString("es-AR", { maximumFractionDigits: 0 })}
          tip="Volumen total operado en VN — la suma de tamaños de todos los fills. Indicador de cuánto mercado capturaste."
        />
      </div>

      {/* Quote + inv + chart */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
        <QuoteBox
          mid={display.mid}
          bid={display.bid}
          offer={display.offer}
          quoteSize={quoteSize}
          skewActive={autoSkew && Math.abs(display.inventory) > 0}
        />
        <InventoryBox inv={display.inventory} cap={invCap} />
        <ToxPanel score={display.toxScore} count={display.toxCount} />
      </div>

      {/* Chart (~70%) lado a lado con FILLS TAPE (~30%) — ambos a 480px */}
      <div className="grid grid-cols-1 md:grid-cols-[7fr_3fr] gap-2 h-[480px]">
        <div className="bg-[#0a0a0a] border border-[#1a1a1a] p-2 min-h-0 flex flex-col">
          <div className="flex items-center gap-3 text-[9px] tracking-widest text-[#666] mb-1 px-1 shrink-0">
            <span>PRICE · MID · QUOTES</span>
            <span className="text-[#666]">·</span>
            <Legend dot="#666" label="trade" />
            <Legend dot="#ff9900" label="mid" />
            <Legend dot="#3fbf6f" label="bid" />
            <Legend dot="#ff7f7f" label="offer" />
          </div>
          <div className="flex-1 min-h-0">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={display.history} margin={{ top: 6, right: 12, left: 4, bottom: 4 }}>
                <XAxis
                  dataKey="ts"
                  tick={{ fill: "#666", fontSize: 9 }}
                  axisLine={{ stroke: "#2a2a2a" }}
                  tickLine={false}
                  minTickGap={50}
                  tickFormatter={(v: string) => (v ? v.substring(0, 5) : "")}
                />
                <YAxis
                  domain={["dataMin - 0.1", "dataMax + 0.1"]}
                  tick={{ fill: "#666", fontSize: 9 }}
                  axisLine={false}
                  tickLine={false}
                  width={50}
                  tickFormatter={(v: number) => v.toFixed(2)}
                />
                <Tooltip
                  contentStyle={{ background: "#0a0a0a", border: "1px solid #2a2a2a", fontSize: 10 }}
                  labelFormatter={(ts) => `${ts}`}
                />
                <Line dataKey="price" stroke="#666" dot={false} isAnimationActive={false} />
                <Line dataKey="mid" stroke="#ff9900" strokeWidth={1.5} dot={false} isAnimationActive={false} />
                <Line dataKey="bid" stroke="#3fbf6f" strokeDasharray="3 3" dot={false} isAnimationActive={false} />
                <Line dataKey="offer" stroke="#ff7f7f" strokeDasharray="3 3" dot={false} isAnimationActive={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Fills tape — al lado del chart, mismo alto */}
        <div className="bg-[#0a0a0a] border border-[#1a1a1a] flex flex-col min-h-0">
          <div className="border-b border-[#1a1a1a] px-3 py-1 text-[9px] tracking-widest text-[#666] shrink-0 flex items-center gap-1">
            FILLS TAPE
            <span className="text-[#444]">({display.fills.length})</span>
            <InfoIcon tip="Cada fila es una operación que el simulador completó. B (verde) = vos compraste al bid. S (rojo) = vos vendiste al offer. Las columnas son hora, lado, precio del fill, tamaño en VN." />
          </div>
          <div className="flex-1 overflow-y-auto min-h-0">
            {display.fills.length === 0 ? (
              <div className="text-center text-[10px] text-[#444] py-3">— sin fills aún —</div>
            ) : (
              <table className="w-full text-[10px] font-mono">
                <tbody>
                  {display.fills.map((f, idx) => (
                    <tr key={idx} className="border-b border-[#1a1a1a]">
                      <td className="px-2 py-0.5 text-[#888]">{f.ts}</td>
                      <td
                        className={`px-2 py-0.5 font-bold ${
                          f.side === "B" ? "text-[#3fbf6f]" : "text-[#ff7f7f]"
                        }`}
                      >
                        {f.side}
                      </td>
                      <td className="px-2 py-0.5 text-right">{f.px.toFixed(3)}</td>
                      <td className="px-2 py-0.5 text-right text-[#666]">
                        {f.size.toLocaleString("es-AR")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      {/* Sweep results (si hay) — debajo del split chart+fills */}
      {sweepResults && (
        <SweepResults
          results={sweepResults}
          currentSpread={spread}
          onPick={setSpread}
          onClose={() => setSweepResults(null)}
        />
      )}
    </div>
  );
}

// ============================================================
// SUB-COMPONENTS
// ============================================================

function Stat({
  label,
  value,
  color,
  tip,
}: {
  label: string;
  value: string;
  color?: string;
  tip?: string;
}) {
  return (
    <div className="flex flex-col leading-tight">
      <span className="text-[8px] tracking-widest text-[#666] flex items-center gap-1">
        {label}
        {tip && <InfoIcon tip={tip} />}
      </span>
      <span className={`font-mono ${color ?? "text-[#d0d0d0]"}`}>{value}</span>
    </div>
  );
}

function Legend({ dot, label }: { dot: string; label: string }) {
  return (
    <span className="flex items-center gap-1 text-[#888]">
      <span
        className="inline-block w-2 h-2 rounded-full"
        style={{ background: dot }}
      />
      {label}
    </span>
  );
}

// Tooltip simple — `?` chiquito que al hover muestra una explicación.
// CSS-only con `group hover:block`, sin estado React.
function InfoIcon({ tip }: { tip: string }) {
  return (
    <span className="relative inline-block group cursor-help align-middle">
      <span className="text-[8px] text-[#555] hover:text-[#ff9900] border border-[#333] rounded-full px-[3px] leading-[1.2] font-mono">
        ?
      </span>
      <span className="absolute left-0 top-full mt-1 z-50 hidden group-hover:block w-[260px] bg-black border border-[#2a2a2a] p-2 text-[10px] text-[#d0d0d0] leading-relaxed shadow-xl normal-case tracking-normal whitespace-normal pointer-events-none">
        {tip}
      </span>
    </span>
  );
}

function Perilla({
  label,
  value,
  min,
  max,
  step,
  onChange,
  display,
  disabled,
  tip,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  display: string;
  disabled?: boolean;
  tip?: string;
}) {
  return (
    <div className={`flex flex-col gap-1 ${disabled ? "opacity-40" : ""}`}>
      <div className="flex justify-between items-baseline">
        <span className="text-[9px] tracking-widest text-[#666] flex items-center gap-1">
          {label}
          {tip && <InfoIcon tip={tip} />}
        </span>
        <span className="text-[11px] font-mono text-[#ff9900]">{display}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-[#ff9900]"
      />
    </div>
  );
}

function QuoteBox({
  mid,
  bid,
  offer,
  quoteSize,
  skewActive,
}: {
  mid: number;
  bid: number;
  offer: number;
  quoteSize: number;
  skewActive: boolean;
}) {
  return (
    <div className="bg-[#0a0a0a] border border-[#1a1a1a] p-2">
      <div className="flex items-center justify-between text-[9px] tracking-widest text-[#666]">
        <span className="flex items-center gap-1">
          QUOTES
          <InfoIcon tip="BID = precio al que estás dispuesto a comprar (te llenan si llega un trade SELL ≤ tu bid). MID = precio teórico (SMA de los últimos 20 prints). OFFER = precio al que estás dispuesto a vender." />
        </span>
        {skewActive && (
          <span className="text-[#ff9900] flex items-center gap-1">
            SKEW
            <InfoIcon tip="El skew está activo: tus puntas se desplazaron del mid según tu inventory. Long → bid y offer bajan (descargás). Short → suben (recomprás)." />
          </span>
        )}
      </div>
      <div className="grid grid-cols-3 gap-2 mt-1 text-[11px] font-mono tabular-nums">
        <div>
          <div className="text-[8px] text-[#666]">BID</div>
          <div className="text-[#3fbf6f]">{bid.toFixed(3)}</div>
        </div>
        <div>
          <div className="text-[8px] text-[#666]">MID</div>
          <div className="text-[#ff9900]">{mid.toFixed(3)}</div>
        </div>
        <div>
          <div className="text-[8px] text-[#666]">OFFER</div>
          <div className="text-[#ff7f7f]">{offer.toFixed(3)}</div>
        </div>
      </div>
      <div className="text-[9px] text-[#666] mt-1">size {quoteSize.toLocaleString("es-AR")}</div>
    </div>
  );
}

function InventoryBox({ inv, cap }: { inv: number; cap: number }) {
  const pct = cap > 0 ? (inv / cap) * 100 : 0;
  const color = inv > 0 ? "text-[#3fbf6f]" : inv < 0 ? "text-[#ff7f7f]" : "text-[#888]";
  return (
    <div className="bg-[#0a0a0a] border border-[#1a1a1a] p-2">
      <div className="text-[9px] tracking-widest text-[#666] flex items-center gap-1">
        INVENTORY
        <InfoIcon tip="Tu posición acumulada en VN. Positivo = long (querés que suba el mid o cerrarla rápido). Negativo = short. Cero = neutral. El % te dice cuánto del INV CAP estás usando." />
      </div>
      <div className={`text-[14px] font-mono tabular-nums ${color}`}>
        {inv.toLocaleString("es-AR", { maximumFractionDigits: 0 })}
      </div>
      <div className="text-[9px] text-[#666]">
        {pct >= 0 ? "+" : ""}
        {pct.toFixed(1)}% del cap
      </div>
      {/* Barra */}
      <div className="mt-1 h-1 bg-[#1a1a1a] relative">
        <div
          className={`absolute top-0 h-full ${
            inv >= 0 ? "bg-[#3fbf6f] left-1/2" : "bg-[#ff7f7f] right-1/2"
          }`}
          style={{ width: `${Math.min(50, Math.abs(pct) / 2)}%` }}
        />
      </div>
    </div>
  );
}

function ToxPanel({ score, count }: { score: number; count: number }) {
  const abs = Math.abs(score);
  const zone = abs > 1 ? "TOX" : abs > 0.5 ? "WATCH" : abs > 0.2 ? "NEUTRAL" : "FAVOR";
  const color =
    zone === "TOX"
      ? "text-[#ff7f7f] border-[#ff7f7f]"
      : zone === "WATCH"
      ? "text-[#ff9900] border-[#ff9900]"
      : zone === "NEUTRAL"
      ? "text-[#888] border-[#2a2a2a]"
      : "text-[#7fff7f] border-[#1f8a3e]";
  return (
    <div className={`bg-[#0a0a0a] border p-2 ${color}`}>
      <div className="flex items-center gap-1 text-[9px] tracking-widest text-[#666]">
        {zone === "TOX" && <AlertTriangle size={10} />}
        FLOW {zone}
        <InfoIcon tip="Adverse selection: ¿el mercado se mueve contra vos después de cada fill? Mide drift del mid 30 prints después de cada fill, normalizado por medio-spread (en σ). FAVOR < 0.2 = OK · NEUTRAL 0.2-0.5 · WATCH 0.5-1 = cuidado · TÓX > 1 = alguien te está cazando, ensanchá spread." />
      </div>
      <div className="text-[14px] font-mono tabular-nums">{score.toFixed(2)}σ</div>
      <div className="text-[9px] text-[#666]">{count} fills evaluados</div>
    </div>
  );
}

function SweepResults({
  results,
  currentSpread,
  onPick,
  onClose,
}: {
  results: BacktestResult[];
  currentSpread: number;
  onPick: (s: number) => void;
  onClose: () => void;
}) {
  const best = results.reduce((b, r) => (r.totalPnL > b.totalPnL ? r : b), results[0]);
  return (
    <div className="bg-[#0a0a0a] border border-[#ff9900] p-3 relative">
      <button
        onClick={onClose}
        className="absolute top-2 right-2 text-[#666] hover:text-[#ff9900] text-[14px]"
      >
        ✕
      </button>
      <div className="text-[10px] tracking-widest text-[#ff9900] mb-2">
        SWEET SPOT — sweep de {results.length} spreads sobre el día actual
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="h-[200px]">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={results}>
              <XAxis
                dataKey="spread"
                tick={{ fill: "#666", fontSize: 9 }}
                tickFormatter={(v: number) => `${(v * 100).toFixed(0)}c`}
              />
              <YAxis tick={{ fill: "#666", fontSize: 9 }} width={40} />
              <Tooltip
                contentStyle={{ background: "#0a0a0a", border: "1px solid #2a2a2a", fontSize: 10 }}
              />
              <Line
                dataKey="totalPnL"
                stroke="#ff9900"
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
              />
              <Line
                dataKey="spreadPnL"
                stroke="#3fbf6f"
                strokeDasharray="3 3"
                dot={false}
                isAnimationActive={false}
              />
              <Line
                dataKey="invPnL"
                stroke="#ff7f7f"
                strokeDasharray="3 3"
                dot={false}
                isAnimationActive={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[10px] font-mono tabular-nums">
            <thead className="text-[#666]">
              <tr>
                <th className="text-left px-1">SPREAD</th>
                <th className="text-right px-1">TOTAL</th>
                <th className="text-right px-1">SPREAD</th>
                <th className="text-right px-1">INV</th>
                <th className="text-right px-1">FILLS</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {results.map((r) => {
                const isBest = r === best;
                const isCurrent = Math.abs(r.spread - currentSpread) < 0.001;
                return (
                  <tr
                    key={r.spread}
                    className={
                      isBest
                        ? "bg-[#1f8a3e]/30"
                        : isCurrent
                        ? "bg-[#ff9900]/20"
                        : "border-b border-[#1a1a1a]"
                    }
                  >
                    <td className="px-1">{(r.spread * 100).toFixed(0)}c</td>
                    <td
                      className={`text-right px-1 ${
                        r.totalPnL >= 0 ? "text-[#7fff7f]" : "text-[#ff7f7f]"
                      }`}
                    >
                      ${r.totalPnL.toFixed(0)}
                    </td>
                    <td className="text-right px-1 text-[#7fff7f]">${r.spreadPnL.toFixed(0)}</td>
                    <td
                      className={`text-right px-1 ${
                        r.invPnL >= 0 ? "text-[#7fff7f]" : "text-[#ff7f7f]"
                      }`}
                    >
                      ${r.invPnL.toFixed(0)}
                    </td>
                    <td className="text-right px-1 text-[#888]">{r.totalFills}</td>
                    <td className="px-1 text-right">
                      <button
                        onClick={() => onPick(r.spread)}
                        className="text-[#ff9900] hover:underline"
                      >
                        →
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
