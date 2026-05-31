"use client";

import { useEffect, useState } from "react";

// Operar un contrato de opción desde Derivados: order book L2 en vivo + ticket
// (mismos endpoints que el Operar Dashboard: /api/operar/order-book, /api/ordenes,
// /api/operar/bracket). El instrumento viene fijo (el contrato elegido en la
// chain) y la CUENTA es un campo más del ticket (no hay selector global acá).

interface BookLevel {
  price: number;
  size: number;
}
interface OrderBookResp {
  ticker?: string;
  book?: { bids?: BookLevel[]; offers?: BookLevel[] };
  metrics?: { last_price?: number | null; closing_price?: number | null };
  updated_at?: string;
}

type Side = "BUY" | "SELL";
type OrderType = "LIMIT" | "MARKET";
type Tif = "DAY" | "IOC" | "FOK" | "GTC";
type BookStatus = "ready" | "subscribing" | "error";

const CUENTA_LS_KEY = "derivados_operar_cuenta";

// El plazo va embebido en el ticker full ("... - CI" / "... - 24hs"). Lo
// extraemos para el query del book; con ticker full el backend hace match
// exacto igual.
function plazoDe(instrumento: string): "CI" | "24hs" | "48hs" {
  const suf = instrumento.split(" - ").pop()?.trim();
  if (suf === "CI" || suf === "24hs" || suf === "48hs") return suf;
  return "24hs";
}

export function DerivadosOperar({
  instrumento,
  last: lastLive,
}: {
  instrumento: string;
  last?: number;
}) {
  const [book, setBook] = useState<OrderBookResp | null>(null);
  const [status, setStatus] = useState<BookStatus>("ready");
  const [bookErr, setBookErr] = useState<string | null>(null);

  const [side, setSide] = useState<Side>("BUY");
  const [orderType, setOrderType] = useState<OrderType>("LIMIT");
  const [tif, setTif] = useState<Tif>("DAY");
  const [price, setPrice] = useState("");
  const [size, setSize] = useState("");
  const [priceExit, setPriceExit] = useState("");
  const [account, setAccount] = useState("");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);

  // Recordamos la última cuenta usada para no retipearla cada vez.
  useEffect(() => {
    const saved = typeof window !== "undefined" ? localStorage.getItem(CUENTA_LS_KEY) : null;
    if (saved) setAccount(saved);
  }, []);

  // Polling del book (1s) para el instrumento fijo. Reset al cambiar contrato.
  useEffect(() => {
    if (!instrumento) return;
    let alive = true;
    const plazo = plazoDe(instrumento);
    async function fetchBook() {
      try {
        const r = await fetch(
          `/api/operar/order-book?ticker=${encodeURIComponent(instrumento)}&plazo=${plazo}`,
          { cache: "no-store" },
        );
        if (!alive) return;
        if (r.status === 200) {
          setBook(await r.json());
          setStatus("ready");
          setBookErr(null);
        } else if (r.status === 202) {
          setStatus("subscribing");
          setBookErr(null);
        } else {
          setBook(null);
          const j = await r.json().catch(() => ({}));
          setStatus("error");
          setBookErr(j.detail ?? `HTTP ${r.status}`);
        }
      } catch {
        /* retry next tick */
      }
    }
    fetchBook();
    const id = setInterval(fetchBook, 1000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [instrumento]);

  const bids = book?.book?.bids ?? [];
  const offers = book?.book?.offers ?? [];
  const last = book?.metrics?.last_price ?? lastLive ?? null;
  const close = book?.metrics?.closing_price ?? null;
  const fullTicker = book?.ticker ?? instrumento;

  function pickFromBook(s: Side, px: number, sz: number) {
    setSide(s);
    setOrderType("LIMIT");
    setPrice(px.toFixed(2));
    setSize(String(sz));
  }

  async function ejecutar() {
    const cuenta = account.trim();
    if (!cuenta) return setResult({ ok: false, msg: "Completá la cuenta" });
    if (!size || parseInt(size, 10) <= 0) return setResult({ ok: false, msg: "Nominales > 0" });
    if (orderType === "LIMIT" && !price) return setResult({ ok: false, msg: "Falta precio" });

    const usaBracket = priceExit.trim() !== "";
    if (usaBracket) {
      if (orderType !== "LIMIT") return setResult({ ok: false, msg: "Bracket requiere LIMIT" });
      if (parseFloat(priceExit) <= 0) return setResult({ ok: false, msg: "Precio de salida inválido" });
    }

    if (typeof window !== "undefined") localStorage.setItem(CUENTA_LS_KEY, cuenta);
    setSending(true);
    setResult(null);
    // Clave de idempotencia: invisible, anti doble orden por reenvío.
    const clientOrderId = crypto.randomUUID();
    try {
      let r: Response;
      if (usaBracket) {
        r = await fetch("/api/operar/bracket", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ticker: fullTicker,
            side,
            size: parseInt(size, 10),
            price_entry: parseFloat(price),
            price_exit: parseFloat(priceExit),
            tif,
            account: cuenta,
            client_order_id: clientOrderId,
          }),
        });
      } else {
        const body: Record<string, unknown> = {
          ticker: fullTicker,
          side,
          size: parseInt(size, 10),
          order_type: orderType,
          tif,
          account: cuenta,
          client_order_id: clientOrderId,
        };
        if (orderType === "LIMIT") body.price = parseFloat(price);
        r = await fetch("/api/ordenes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      }
      const j = await r.json().catch(() => ({}));
      if (r.ok) {
        setResult({
          ok: true,
          msg: usaBracket
            ? `Bracket OK · entrada ${j.entry_cl_ord_id ?? ""} · salida @ ${priceExit}`
            : `OK ${j.cl_ord_id ?? ""}`,
        });
        if (usaBracket) setPriceExit("");
      } else {
        setResult({ ok: false, msg: j.detail ?? `HTTP ${r.status}` });
      }
    } catch (e) {
      setResult({ ok: false, msg: e instanceof Error ? e.message : "error" });
    } finally {
      setSending(false);
      setTimeout(() => setResult(null), 8000);
    }
  }

  const sideBg = side === "BUY" ? "bg-[#0d1d0d]" : "bg-[#1d0d0d]";

  return (
    <div className="h-full min-h-0 flex flex-col">
      {/* Last / prev */}
      <div className="flex items-baseline gap-2 px-2 py-1 border-b border-[var(--t-border)] shrink-0">
        <span className="text-[9px] text-[var(--t-text-muted)]">last</span>
        <span className="text-[var(--t-accent)] font-bold tabular-nums text-[13px]">
          {last !== null ? last.toFixed(2) : "—"}
        </span>
        {close !== null && <span className="text-[9px] text-[var(--t-text-muted)]">prev {close.toFixed(2)}</span>}
        <span className="ml-auto text-[8px] text-[var(--t-text-muted)]">{plazoDe(instrumento)}</span>
      </div>

      {status === "subscribing" && (
        <div className="px-2 py-1 text-[9px] text-[#ffe066] border-b border-[var(--t-border)] bg-[#1a1608] flex items-center gap-2 shrink-0">
          <span className="inline-block w-2 h-2 rounded-full bg-[#ffe066] animate-pulse" />
          suscribiendo… el motor lo levanta en ~5s
        </div>
      )}
      {status === "error" && bookErr && (
        <div className="px-2 py-1 text-[9px] text-[#f87171] border-b border-[var(--t-border)] bg-[#1a0d0d] shrink-0">
          {bookErr}
        </div>
      )}

      {/* Book L2 */}
      <div className="overflow-y-auto shrink-0">
        <table className="w-full text-[11px] font-mono tabular-nums">
          <thead className="text-[9px] text-[var(--t-text-muted)] tracking-wider">
            <tr>
              <th className="text-left px-1 py-0.5">BID SZ</th>
              <th className="text-right px-1 py-0.5">BID</th>
              <th className="text-left px-1 py-0.5">ASK</th>
              <th className="text-right px-1 py-0.5">ASK SZ</th>
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 5 }).map((_, i) => {
              const b = bids[i];
              const a = offers[i];
              return (
                <tr key={i} className="border-t border-[var(--t-border)]">
                  <td className="px-1 py-0.5 text-[var(--t-text-dim)]">
                    {b?.size != null ? b.size.toLocaleString("es-AR") : "—"}
                  </td>
                  <td
                    className={`px-1 py-0.5 text-right ${
                      b ? "text-[#7fff7f] cursor-pointer hover:bg-[#0d2d0d]" : "text-[var(--t-text-muted)]"
                    }`}
                    onClick={() => b && pickFromBook("SELL", b.price, b.size)}
                    title={b ? "Click: vender al bid" : ""}
                  >
                    {b ? b.price.toFixed(2) : "—"}
                  </td>
                  <td
                    className={`px-1 py-0.5 ${
                      a ? "text-[#ff7f7f] cursor-pointer hover:bg-[#2d0d0d]" : "text-[var(--t-text-muted)]"
                    }`}
                    onClick={() => a && pickFromBook("BUY", a.price, a.size)}
                    title={a ? "Click: comprar al ask" : ""}
                  >
                    {a ? a.price.toFixed(2) : "—"}
                  </td>
                  <td className="px-1 py-0.5 text-right text-[var(--t-text-dim)]">
                    {a?.size != null ? a.size.toLocaleString("es-AR") : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Ticket */}
      <div className={`mt-auto p-2 border-t border-[var(--t-border)] ${sideBg}`}>
        <div className="flex gap-0.5 mb-1">
          {(["BUY", "SELL"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setSide(s)}
              className={`flex-1 px-2 py-0.5 text-[10px] font-bold border ${
                s === side
                  ? s === "BUY"
                    ? "bg-[#4ade80] text-black border-[#4ade80]"
                    : "bg-[#f87171] text-black border-[#f87171]"
                  : "bg-transparent text-[var(--t-text-dim)] border-[var(--t-border-2)]"
              }`}
            >
              {s}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-1 mb-1 text-[10px]">
          <select
            value={orderType}
            onChange={(e) => setOrderType(e.target.value as OrderType)}
            className="bg-[var(--t-panel)] border border-[var(--t-border-2)] px-1 py-0.5 focus:border-[var(--t-accent)] outline-none"
          >
            <option value="LIMIT">LIMIT</option>
            <option value="MARKET">MARKET</option>
          </select>
          <select
            value={tif}
            onChange={(e) => setTif(e.target.value as Tif)}
            className="bg-[var(--t-panel)] border border-[var(--t-border-2)] px-1 py-0.5 focus:border-[var(--t-accent)] outline-none"
          >
            <option value="DAY">DAY</option>
            <option value="IOC">IOC</option>
            <option value="FOK">FOK</option>
            <option value="GTC">GTC</option>
          </select>
        </div>

        <div className="grid grid-cols-2 gap-1 mb-1 text-[10px]">
          <input
            value={price}
            placeholder="precio"
            disabled={orderType === "MARKET"}
            onChange={(e) => setPrice(e.target.value)}
            className="bg-[var(--t-panel)] border border-[var(--t-border-2)] px-1 py-0.5 tabular-nums focus:border-[var(--t-accent)] outline-none disabled:opacity-40"
          />
          <input
            value={size}
            placeholder="nominales"
            onChange={(e) => setSize(e.target.value)}
            className="bg-[var(--t-panel)] border border-[var(--t-border-2)] px-1 py-0.5 tabular-nums focus:border-[var(--t-accent)] outline-none"
          />
        </div>

        <div className="mb-1 text-[10px]">
          <input
            value={priceExit}
            placeholder="precio salida (bracket — opcional)"
            disabled={orderType === "MARKET"}
            onChange={(e) => setPriceExit(e.target.value)}
            className={`w-full bg-[var(--t-panel)] border px-1 py-0.5 tabular-nums focus:border-[var(--t-accent)] outline-none disabled:opacity-40 ${
              priceExit.trim() !== "" ? "border-[var(--t-accent)] text-[var(--t-accent)]" : "border-[var(--t-border-2)]"
            }`}
            title="Cuando la entrada se llene, manda automáticamente la salida LIMIT a este precio (side opuesto, mismo size)"
          />
        </div>

        <div className="mb-1 text-[10px]">
          <input
            value={account}
            placeholder="cuenta (ej. 805)"
            onChange={(e) => setAccount(e.target.value)}
            className={`w-full bg-[var(--t-panel)] border px-1 py-0.5 tabular-nums focus:border-[var(--t-accent)] outline-none ${
              account.trim() === "" ? "border-[#f87171]/50" : "border-[var(--t-border-2)]"
            }`}
            title="Cuenta comitente sobre la que se manda la orden"
          />
        </div>

        <button
          onClick={ejecutar}
          disabled={sending || !account.trim() || !fullTicker}
          className="w-full px-2 py-1 bg-[var(--t-accent)] text-black font-bold text-[11px] tracking-wide border border-[var(--t-accent)] hover:bg-[#ffaa20] disabled:opacity-30 disabled:cursor-not-allowed"
        >
          {sending ? "…" : priceExit.trim() !== "" ? `EJECUTAR BRACKET ${side}` : `EJECUTAR ${side}`}
        </button>

        {result && (
          <div className={`mt-1 text-[9px] ${result.ok ? "text-[#4ade80]" : "text-[#f87171]"}`}>
            {result.msg}
          </div>
        )}
      </div>
    </div>
  );
}
