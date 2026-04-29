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
import { Activity, Pause, Play, RotateCcw, Wifi, WifiOff } from "lucide-react";
import { InfoIcon } from "../info-icon";
import {
  FILLS_MAX,
  InventoryBox,
  Legend,
  MID_WINDOW,
  Perilla,
  QuoteBox,
  Stat,
  ToxPanel,
  TOX_LOOKAHEAD,
} from "./replay";
import { apiToSpecTrade } from "./adapter";
import type { CurvaBond, LiveSnapshot, SpecTrade } from "./types";

// ============================================================
// Modo LIVE — paper trading con data vivo del WS de Rofex (vía Mongo
// MarketSnapshot @ 1Hz + TimeSales). Mismo motor de fills que el REPLAY,
// pero los trades llegan polleando GET /api/mm/live-snapshot cada 1s.
//
// La sesión vive 100% en el navegador: refrescá la página y arranca de
// cero. No se persiste nada en Mongo.
// ============================================================

const POLL_MS = 1000;
const HISTORY_MAX = 220;

interface SimState {
  cash: number;
  inventory: number;
  spreadPnL: number;
  fillsBuy: number;
  fillsSell: number;
  volTraded: number;
  midWindow: number[];
  history: { i: number; mid: number; bid: number; offer: number; price: number; ts: string }[];
  fills: { ts: string; side: "B" | "S"; px: number; size: number; idxAtFill: number }[];
  pendingFills: { side: "B" | "S"; midAtFill: number; idxAtFill: number }[];
  toxScores: number[];
  index: number;
}

function newSimState(): SimState {
  return {
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
    index: 0,
  };
}

interface Params {
  spread: number;
  quoteSize: number;
  skewIntensity: number;
  autoSkew: boolean;
  invCap: number;
}

export function MMLive({ bond }: { bond: CurvaBond }) {
  // Perillas.
  const [spread, setSpread] = useState(0.1);
  const [quoteSize, setQuoteSize] = useState(20_000);
  const [skewIntensity, setSkewIntensity] = useState(1.0);
  const [autoSkew, setAutoSkew] = useState(true);
  const [invCap, setInvCap] = useState(200_000);

  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState<"idle" | "live" | "error">("idle");
  const [errMsg, setErrMsg] = useState<string | null>(null);

  // Snapshot del book (visible al user) y display batched.
  const [book, setBook] = useState<LiveSnapshot["book"]>({ bids: [], offers: [] });
  const [bookUpdatedAt, setBookUpdatedAt] = useState<string | null>(null);
  const [tradesProcessed, setTradesProcessed] = useState(0);
  const [display, setDisplay] = useState({
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
  });

  // Refs mutables.
  const sim = useRef<SimState>(newSimState());
  const cursor = useRef<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const params = useRef<Params>({ spread, quoteSize, skewIntensity, autoSkew, invCap });
  params.current = { spread, quoteSize, skewIntensity, autoSkew, invCap };

  // Reset al cambiar de bono.
  useEffect(() => {
    sim.current = newSimState();
    cursor.current = null;
    setBook({ bids: [], offers: [] });
    setBookUpdatedAt(null);
    setTradesProcessed(0);
    setRunning(false);
    setStatus("idle");
    setErrMsg(null);
    setDisplay({
      mid: 0,
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
    });
  }, [bond.ticker]);

  const processTrade = useCallback((trade: SpecTrade, p: Params) => {
    const s = sim.current;
    s.midWindow.push(trade.p);
    if (s.midWindow.length > MID_WINDOW) s.midWindow.shift();
    const mid = s.midWindow.reduce((a, b) => a + b, 0) / s.midWindow.length;

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
      s.pendingFills.push({ side: fillSide, midAtFill: mid, idxAtFill: s.index });
    }

    while (
      s.pendingFills.length > 0 &&
      s.index - s.pendingFills[0].idxAtFill >= TOX_LOOKAHEAD
    ) {
      const pending = s.pendingFills.shift()!;
      const drift = mid - pending.midAtFill;
      const adverse = pending.side === "B" ? -drift : drift;
      const halfSpread = p.spread / 2 || 1e-6;
      const sigma = adverse / halfSpread;
      s.toxScores.push(sigma);
      if (s.toxScores.length > 20) s.toxScores.shift();
    }

    // Sub-sample del history: cada 5 trades en live (vs 10 en replay) — el flujo
    // es más lento, queremos más resolución para el chart.
    if (s.index % 5 === 0) {
      s.history.push({ i: s.index, mid, bid, offer, price: trade.p, ts: trade.ts });
      if (s.history.length > HISTORY_MAX) s.history.shift();
    }

    s.index++;
    return { mid, bid, offer };
  }, []);

  // Polling loop.
  useEffect(() => {
    if (!running) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    let alive = true;

    const tick = async () => {
      try {
        const url = new URL("/api/mm/live-snapshot", window.location.origin);
        url.searchParams.set("instrumento", bond.ticker);
        if (cursor.current) url.searchParams.set("since_ts", cursor.current);
        const r = await fetch(url.toString(), { cache: "no-store" });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const snap = (await r.json()) as LiveSnapshot;
        if (!alive) return;

        cursor.current = snap.ts_now;
        setBook(snap.book);
        setBookUpdatedAt(snap.book_updated_at);
        setStatus("live");
        setErrMsg(null);

        // Procesar new_trades en orden cronológico.
        if (snap.new_trades.length > 0) {
          const p = params.current;
          let lastMid = display.mid;
          let lastBid = display.bid;
          let lastOffer = display.offer;
          for (const t of snap.new_trades) {
            const spec = apiToSpecTrade(t);
            const out = processTrade(spec, p);
            lastMid = out.mid;
            lastBid = out.bid;
            lastOffer = out.offer;
          }

          const s = sim.current;
          const toxAvg =
            s.toxScores.length > 0
              ? s.toxScores.reduce((a, b) => a + b, 0) / s.toxScores.length
              : 0;
          setTradesProcessed((n) => n + snap.new_trades.length);
          setDisplay({
            mid:        lastMid,
            bid:        lastBid,
            offer:      lastOffer,
            inventory:  s.inventory,
            cash:       s.cash,
            spreadPnL:  s.spreadPnL,
            fillsBuy:   s.fillsBuy,
            fillsSell:  s.fillsSell,
            volTraded:  s.volTraded,
            history:    [...s.history],
            fills:      [...s.fills],
            toxScore:   toxAvg,
            toxCount:   s.toxScores.length,
          });
        }
      } catch (e) {
        if (!alive) return;
        setStatus("error");
        setErrMsg(e instanceof Error ? e.message : String(e));
      }
    };

    // Primer tick inmediato; luego cada POLL_MS.
    void tick();
    intervalRef.current = setInterval(tick, POLL_MS);
    return () => {
      alive = false;
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
    // display.* en deps haría loop infinito; los leemos del closure inicial.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, bond.ticker, processTrade]);

  function handleReset() {
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = null;
    sim.current = newSimState();
    cursor.current = null;
    setRunning(false);
    setStatus("idle");
    setErrMsg(null);
    setTradesProcessed(0);
    setDisplay({
      mid: 0, bid: 0, offer: 0,
      inventory: 0, cash: 0,
      spreadPnL: 0, fillsBuy: 0, fillsSell: 0, volTraded: 0,
      history: [], fills: [], toxScore: 0, toxCount: 0,
    });
  }

  const totalPnL = display.cash + display.inventory * display.mid;
  const invPnL = totalPnL - display.spreadPnL;
  const bookMid = useMemo(() => {
    const b1 = book.bids[0]?.price ?? 0;
    const o1 = book.offers[0]?.price ?? 0;
    if (b1 > 0 && o1 > 0) return (b1 + o1) / 2;
    return display.mid;
  }, [book, display.mid]);

  return (
    <div className="h-full overflow-y-auto p-3 flex flex-col gap-3 bg-black text-[#d0d0d0]">
      {/* Header session info */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-1.5 bg-[#0a0a0a] border border-[#1a1a1a] text-[10px] font-mono">
        <span className="text-[#ff9900] font-bold">{bond.ticker_corto}</span>
        <span className="text-[#666]">{bond.ticker}</span>
        <span>
          <span className="text-[#666]">BOOK MID</span> {bookMid.toFixed(3)}
        </span>
        <span>
          <span className="text-[#666]">LAST</span>{" "}
          {bond.ultimo_precio?.toFixed(3) ?? "—"}
        </span>
        <span>
          <span className="text-[#666]">DUR</span>{" "}
          {bond.duration?.toFixed(2) ?? "—"}
        </span>
        <span>
          <span className="text-[#666]">TEA</span>{" "}
          {bond.tea ? `${(bond.tea * 100).toFixed(2)}%` : "—"}
        </span>
        <span className="ml-auto flex items-center gap-1">
          {status === "live" ? (
            <>
              <Wifi size={11} className="text-[#7fff7f]" />
              <span className="text-[#7fff7f]">LIVE</span>
            </>
          ) : status === "error" ? (
            <>
              <WifiOff size={11} className="text-[#ff7f7f]" />
              <span className="text-[#ff7f7f]" title={errMsg ?? ""}>
                ERROR
              </span>
            </>
          ) : (
            <>
              <WifiOff size={11} className="text-[#666]" />
              <span className="text-[#666]">IDLE</span>
            </>
          )}
          {bookUpdatedAt && status === "live" && (
            <span className="text-[#444] ml-1">
              · book {new Date(bookUpdatedAt).toLocaleTimeString("es-AR")}
            </span>
          )}
        </span>
      </div>

      {/* Controles */}
      <div className="flex flex-wrap items-center gap-3 px-3 py-2 bg-[#0a0a0a] border border-[#1a1a1a]">
        <button
          onClick={() => setRunning((r) => !r)}
          className="flex items-center gap-1 px-3 py-1 text-[11px] font-semibold bg-[#ff9900] text-black hover:brightness-110"
        >
          {running ? <Pause size={12} /> : <Play size={12} />}
          {running ? "STOP" : "GO LIVE"}
        </button>
        <button
          onClick={handleReset}
          className="flex items-center gap-1 px-3 py-1 text-[11px] border border-[#2a2a2a] hover:border-[#ff9900]"
        >
          <RotateCcw size={12} />
          RESET
        </button>
        <div className="ml-auto flex items-center gap-2 text-[10px] text-[#888]">
          <Activity size={12} />
          <span className="font-mono">
            {tradesProcessed} trades · poll {POLL_MS}ms
          </span>
        </div>
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
          tip="Distancia entre tu bid y tu offer. En modo LIVE, el sistema cotiza automáticamente con este spread alrededor del mid SMA(20)."
        />
        <Perilla
          label="TAMAÑO (VN)"
          value={quoteSize}
          min={1_000}
          max={100_000}
          step={1_000}
          onChange={setQuoteSize}
          display={`${(quoteSize / 1000).toFixed(0)}k`}
          tip="VN por punta. Tope superior del fill: si entra un trade más chico, fillea solo ese tamaño."
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
          tip="Cuánto inclinás bid/offer según inventory. 0x = neutro. 1x = estándar."
        />
        <div className="flex flex-col gap-1">
          <span className="text-[9px] tracking-widest text-[#666] flex items-center gap-1">
            AUTO-SKEW
            <InfoIcon tip="ON = mueve bid/offer automáticamente con el inventory." />
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
          tip="Tope máximo de posición."
        />
      </div>

      {/* PnL */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2 px-3 py-2 bg-[#0a0a0a] border border-[#1a1a1a] text-[11px] tabular-nums">
        <Stat
          label="TOTAL PnL"
          value={`$${totalPnL.toFixed(0)}`}
          color={totalPnL >= 0 ? "text-[#7fff7f]" : "text-[#ff7f7f]"}
        />
        <Stat
          label="SPREAD CAPTURED"
          value={`$${display.spreadPnL.toFixed(0)}`}
          color="text-[#7fff7f]"
        />
        <Stat
          label="INVENTORY MTM"
          value={`$${invPnL.toFixed(0)}`}
          color={invPnL >= 0 ? "text-[#7fff7f]" : "text-[#ff7f7f]"}
        />
        <Stat
          label="FILLS"
          value={`${display.fillsBuy + display.fillsSell} (${display.fillsBuy}B/${display.fillsSell}S)`}
        />
        <Stat
          label="VOL"
          value={display.volTraded.toLocaleString("es-AR", { maximumFractionDigits: 0 })}
        />
      </div>

      {/* Quote + inv + tox */}
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

      {/* Chart + book + fills tape */}
      <div className="grid grid-cols-1 md:grid-cols-[5fr_2fr_3fr] gap-2 h-[480px]">
        <div className="bg-[#0a0a0a] border border-[#1a1a1a] p-2 min-h-0 flex flex-col">
          <div className="flex items-center gap-3 text-[9px] tracking-widest text-[#666] mb-1 px-1 shrink-0">
            <span>PRICE · MID · QUOTES (LIVE)</span>
            <span className="text-[#666]">·</span>
            <Legend dot="#666" label="trade" />
            <Legend dot="#ff9900" label="mid" />
            <Legend dot="#3fbf6f" label="bid" />
            <Legend dot="#ff7f7f" label="offer" />
          </div>
          <div className="flex-1 min-h-0">
            {display.history.length === 0 ? (
              <div className="h-full flex items-center justify-center text-[#444] text-[11px]">
                Esperando trades… (apretá GO LIVE)
              </div>
            ) : (
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
            )}
          </div>
        </div>

        {/* Book ladder top-5 */}
        <div className="bg-[#0a0a0a] border border-[#1a1a1a] flex flex-col min-h-0">
          <div className="border-b border-[#1a1a1a] px-3 py-1 text-[9px] tracking-widest text-[#666] shrink-0 flex items-center gap-1">
            ORDER BOOK
            <InfoIcon tip="Top-5 del bid/offer en vivo desde Trading.MarketSnapshot. Refresca cada 1s." />
          </div>
          <div className="flex-1 overflow-y-auto min-h-0 text-[10px] font-mono tabular-nums">
            {book.bids.length === 0 && book.offers.length === 0 ? (
              <div className="text-center text-[#444] py-3">— sin book —</div>
            ) : (
              <table className="w-full">
                <thead className="text-[#666] text-[8px] tracking-widest">
                  <tr>
                    <th className="text-left px-2">SIZE</th>
                    <th className="text-right px-2">BID</th>
                    <th className="text-right px-2">OFFER</th>
                    <th className="text-right px-2">SIZE</th>
                  </tr>
                </thead>
                <tbody>
                  {[0, 1, 2, 3, 4].map((i) => {
                    const b = book.bids[i];
                    const o = book.offers[i];
                    return (
                      <tr key={i} className="border-b border-[#1a1a1a]">
                        <td className="px-2 py-0.5 text-[#666]">
                          {b ? b.size.toLocaleString("es-AR") : ""}
                        </td>
                        <td className="px-2 py-0.5 text-right text-[#3fbf6f]">
                          {b ? b.price.toFixed(3) : ""}
                        </td>
                        <td className="px-2 py-0.5 text-right text-[#ff7f7f]">
                          {o ? o.price.toFixed(3) : ""}
                        </td>
                        <td className="px-2 py-0.5 text-right text-[#666]">
                          {o ? o.size.toLocaleString("es-AR") : ""}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Fills tape */}
        <div className="bg-[#0a0a0a] border border-[#1a1a1a] flex flex-col min-h-0">
          <div className="border-b border-[#1a1a1a] px-3 py-1 text-[9px] tracking-widest text-[#666] shrink-0 flex items-center gap-1">
            FILLS TAPE
            <span className="text-[#444]">({display.fills.length})</span>
          </div>
          <div className="flex-1 overflow-y-auto min-h-0">
            {display.fills.length === 0 ? (
              <div className="text-center text-[10px] text-[#444] py-3">— sin fills —</div>
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
    </div>
  );
}
