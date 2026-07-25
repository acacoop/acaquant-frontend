"use client";

import { useEffect, useMemo, useState } from "react";

// DOM (order book / profundidad) de un CEDEAR — reusa el pipeline de OPERAR:
// GET /api/operar/order-book resuelve el ticker, SUSCRIBE on-demand (202 mientras
// el motor la levanta) y devuelve {book:{bids,offers}, metrics}. La suscripción
// expira sola (TTL) → no llena la base. Por nivel: precio · nominales · cash, con
// acumulado, total por lado y desbalance.

type Level = { price: number; size: number };
type BookResp = {
  ticker?: string;
  status?: string; // "subscribing" en el 202
  book?: { bids?: Level[]; offers?: Level[] };
  metrics?: { last_price?: number | null };
};
type Fila = { price: number; size: number; cash: number; cumSize: number; cumCash: number };

const fmtPx = (n: number) => n.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtN = (n: number) => n.toLocaleString("es-AR", { maximumFractionDigits: 0 });

function acumular(levels: Level[]): Fila[] {
  let cumSize = 0;
  let cumCash = 0;
  return levels.map((l) => {
    const cash = l.price * l.size;
    cumSize += l.size;
    cumCash += cash;
    return { price: l.price, size: l.size, cash, cumSize, cumCash };
  });
}

export function OrderBookPanel({ ticker }: { ticker: string }) {
  const [plazo, setPlazo] = useState<"CI" | "24hs">("24hs");
  const [resp, setResp] = useState<BookResp | null>(null);
  const [subscribing, setSubscribing] = useState(false);

  useEffect(() => {
    if (!ticker) return;
    let alive = true;
    const tick = async () => {
      try {
        const r = await fetch(
          `/api/operar/order-book?ticker=${encodeURIComponent(ticker)}&plazo=${plazo}`,
          { cache: "no-store" },
        );
        if (!alive) return;
        if (r.status === 202) {
          setSubscribing(true);
          return;
        }
        if (!r.ok) return;
        const j = (await r.json()) as BookResp;
        setResp(j);
        setSubscribing(false);
      } catch {
        /* transitorio */
      }
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [ticker, plazo]);

  const bids = useMemo(() => acumular((resp?.book?.bids ?? []).slice(0, 5)), [resp]);
  const offers = useMemo(() => acumular((resp?.book?.offers ?? []).slice(0, 5)), [resp]);
  const last = resp?.metrics?.last_price ?? null;

  const bidCashTot = bids.length ? bids[bids.length - 1].cumCash : 0;
  const offerCashTot = offers.length ? offers[offers.length - 1].cumCash : 0;
  const bidNomTot = bids.length ? bids[bids.length - 1].cumSize : 0;
  const offerNomTot = offers.length ? offers[offers.length - 1].cumSize : 0;
  const maxCash = Math.max(1, ...bids.map((r) => r.cash), ...offers.map((r) => r.cash));
  const totCash = bidCashTot + offerCashTot;
  const bidPct = totCash > 0 ? (bidCashTot / totCash) * 100 : 50;

  const bestBid = bids[0]?.price ?? null;
  const bestOffer = offers[0]?.price ?? null;
  const spread = bestBid != null && bestOffer != null ? bestOffer - bestBid : null;

  const hayLibro = bids.length > 0 || offers.length > 0;

  return (
    <div className="min-h-0 border border-[var(--t-border)] bg-[var(--t-panel)] flex flex-col overflow-hidden">
      {/* header */}
      <div className="flex items-center gap-2 px-2 py-1 border-b border-[var(--t-border)] shrink-0">
        <span className="text-[10px] uppercase tracking-widest text-[var(--t-accent)]">Libro</span>
        <span className="text-[9px] text-[var(--t-text-muted)] font-mono">{ticker || "—"}</span>
        <div className="flex items-center gap-0.5 ml-auto">
          {(["CI", "24hs"] as const).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPlazo(p)}
              className={
                "px-1.5 py-0.5 text-[8px] font-semibold border rounded-sm " +
                (plazo === p
                  ? "bg-[var(--t-accent)] text-[var(--t-on-accent)] border-[var(--t-accent)]"
                  : "bg-transparent text-[var(--t-text-dim)] border-[var(--t-border-2)]")
              }
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      {/* cuerpo */}
      {!ticker ? (
        <div className="flex-1 flex items-center justify-center text-[10px] text-[var(--t-text-muted)]">
          elegí una card
        </div>
      ) : !hayLibro ? (
        <div className="flex-1 flex items-center justify-center text-[10px] text-[var(--t-text-muted)] text-center px-2">
          {subscribing ? "suscribiendo… aparece en ~5s" : "sin libro (¿fuera de rueda o sin puntas?)"}
        </div>
      ) : (
        <div className="flex-1 min-h-0 overflow-y-auto flex flex-col">
          <table className="w-full text-[9px] font-mono tabular-nums">
            <thead className="text-[7px] uppercase tracking-wide text-[var(--t-text-muted)]">
              <tr>
                <th className="!px-1 text-right">Cash</th>
                <th className="!px-1 text-right">Nom</th>
                <th className="!px-1 text-right">Precio</th>
                <th className="!px-1 text-right">Nom.ac</th>
                <th className="!px-1 text-right">Cash.ac</th>
              </tr>
            </thead>
            <tbody>
              {/* OFFERS (rojo) — peor arriba, mejor abajo (cerca del spread) */}
              {[...offers].reverse().map((f, i) => (
                <Row key={`o-${i}`} f={f} maxCash={maxCash} color="var(--t-neg)" bg="rgba(220,38,38,0.16)" />
              ))}
              {/* spread / last */}
              <tr className="border-y border-[var(--t-border-2)]">
                <td colSpan={5} className="!px-1 py-[1px] text-center text-[8px] text-[var(--t-text-dim)]">
                  spread {spread != null ? fmtPx(spread) : "—"} · last{" "}
                  <b className="text-[var(--t-accent)]">{last != null ? fmtPx(last) : "—"}</b>
                </td>
              </tr>
              {/* BIDS (verde) — mejor arriba */}
              {bids.map((f, i) => (
                <Row key={`b-${i}`} f={f} maxCash={maxCash} color="var(--t-pos)" bg="rgba(16,163,74,0.16)" />
              ))}
            </tbody>
          </table>

          {/* totales + desbalance — pegado a las puntas (sin hueco negro arriba) */}
          <div className="border-t border-[var(--t-border)] px-2 py-1 shrink-0">
            <div className="flex justify-between text-[8px] text-[var(--t-text-muted)]">
              <span>
                BID <b className="text-[var(--t-pos)]">{fmtN(bidNomTot)}</b> · {fmtN(bidCashTot)}
              </span>
              <span>
                OFF <b className="text-[var(--t-neg)]">{fmtN(offerNomTot)}</b> · {fmtN(offerCashTot)}
              </span>
            </div>
            {/* barra de desbalance (verde = compradores, rojo = vendedores) */}
            <div className="mt-0.5 h-1.5 w-full flex rounded-sm overflow-hidden">
              <div style={{ width: `${bidPct}%`, backgroundColor: "var(--t-pos)" }} />
              <div style={{ width: `${100 - bidPct}%`, backgroundColor: "var(--t-neg)" }} />
            </div>
            <div className="text-[8px] text-center text-[var(--t-text-muted)]">
              desbalance {bidPct.toFixed(0)}% bid / {(100 - bidPct).toFixed(0)}% offer
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ f, maxCash, color, bg }: { f: Fila; maxCash: number; color: string; bg: string }) {
  const pct = Math.min(100, (f.cash / maxCash) * 100);
  return (
    <tr
      style={{ background: `linear-gradient(to left, ${bg} ${pct}%, transparent ${pct}%)` }}
      className="border-b border-[var(--t-border)]"
    >
      <td className="!px-1 py-[1px] text-right text-[var(--t-text-dim)]">{fmtN(f.cash)}</td>
      <td className="!px-1 py-[1px] text-right">{fmtN(f.size)}</td>
      <td className="!px-1 py-[1px] text-right font-semibold" style={{ color }}>{fmtPx(f.price)}</td>
      <td className="!px-1 py-[1px] text-right text-[var(--t-text-muted)]">{fmtN(f.cumSize)}</td>
      <td className="!px-1 py-[1px] text-right text-[var(--t-text-muted)]">{fmtN(f.cumCash)}</td>
    </tr>
  );
}
