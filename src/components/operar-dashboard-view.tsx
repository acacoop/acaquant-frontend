"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ACCOUNT_DEFAULT_FALLBACK,
  CuentaDescubierta,
  fmtTime,
} from "./dolar-mep-shared";

// ─── Tipos ───────────────────────────────────────────────────────────────────

interface BookLevel {
  price: number;
  size: number;
}

interface OrderBookResp {
  ticker: string;
  updated_at: string | null;
  book?: {
    bids?: BookLevel[];
    offers?: BookLevel[];
  };
  metrics?: {
    last_price?: number | null;
    open_price?: number | null;
    high_price?: number | null;
    low_price?: number | null;
    closing_price?: number | null;
  };
}

interface SymbolHit {
  ticker: string;
  ticker_corto?: string;
  underlying?: string;
}

interface OrderDia {
  cl_ord_id?: string;
  ticker?: string;
  side?: "BUY" | "SELL";
  size?: number;
  order_type?: "LIMIT" | "MARKET";
  price?: number;
  tif?: string;
  status?: string;
  cum_qty?: number;
  leaves_qty?: number;
  avg_px?: number;
  account?: string;
  created_at?: string;
  reject_reason?: string | null;
}

interface CardCfg {
  id: string;          // uuid local
  tickerCorto: string; // lo que ve el user
  // fullTicker se descubre desde la respuesta del book.
}

type Side = "BUY" | "SELL";
type OrderType = "LIMIT" | "MARKET";
type Tif = "DAY" | "IOC" | "FOK" | "GTC";

interface FormState {
  side: Side;
  order_type: OrderType;
  price: string;
  size: string;
  tif: Tif;
}

const CARDS_LS_KEY = "trd-fx-operar-cards";
const ACCOUNT_LS_KEY = "trd-fx-operar-account";

const DEFAULT_CARDS: CardCfg[] = [
  { id: "default-al30", tickerCorto: "AL30" },
  { id: "default-gd30", tickerCorto: "GD30" },
];

function loadCards(): CardCfg[] {
  if (typeof window === "undefined") return DEFAULT_CARDS;
  try {
    const raw = window.localStorage.getItem(CARDS_LS_KEY);
    if (!raw) return DEFAULT_CARDS;
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr) || arr.length === 0) return DEFAULT_CARDS;
    return arr.filter((c) => c && typeof c.id === "string" && typeof c.tickerCorto === "string");
  } catch {
    return DEFAULT_CARDS;
  }
}

function saveCards(cards: CardCfg[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(CARDS_LS_KEY, JSON.stringify(cards));
}

function uid(): string {
  return Math.random().toString(36).slice(2, 10);
}

// ─── Hooks ───────────────────────────────────────────────────────────────────

function useOrderBook(tickerCorto: string, pollMs = 1000) {
  const [book, setBook] = useState<OrderBookResp | null>(null);
  useEffect(() => {
    if (!tickerCorto) return;
    let alive = true;
    async function fetchBook() {
      try {
        const r = await fetch(
          `/api/operar/order-book?ticker=${encodeURIComponent(tickerCorto)}`,
          { cache: "no-store" },
        );
        if (!alive) return;
        if (r.ok) setBook(await r.json());
        else setBook(null);
      } catch {
        // retry next tick
      }
    }
    fetchBook();
    const id = setInterval(fetchBook, pollMs);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [tickerCorto, pollMs]);
  return book;
}

function useOrdenesDia(pollMs = 4000) {
  const [orders, setOrders] = useState<OrderDia[]>([]);
  const [lastFetch, setLastFetch] = useState<number>(0);

  const fetchNow = useCallback(async () => {
    try {
      const r = await fetch("/api/ordenes/dia", { cache: "no-store" });
      if (r.ok) {
        setOrders(await r.json());
        setLastFetch(Date.now());
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    void fetchNow();
    const id = setInterval(fetchNow, pollMs);
    return () => clearInterval(id);
  }, [fetchNow, pollMs]);

  return { orders, lastFetch, refresh: fetchNow };
}

// ─── Componentes ─────────────────────────────────────────────────────────────

function TickerSearch({
  value,
  onPick,
}: {
  value: string;
  onPick: (corto: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState(value);
  const [hits, setHits] = useState<SymbolHit[]>([]);

  useEffect(() => {
    setQ(value);
  }, [value]);

  useEffect(() => {
    if (!open || q.length < 2) {
      setHits([]);
      return;
    }
    let alive = true;
    const id = setTimeout(async () => {
      try {
        const r = await fetch(
          `/api/ordenes/symbols?q=${encodeURIComponent(q)}&limit=20`,
          { cache: "no-store" },
        );
        if (alive && r.ok) setHits(await r.json());
      } catch {
        // ignore
      }
    }, 200);
    return () => {
      alive = false;
      clearTimeout(id);
    };
  }, [q, open]);

  return (
    <div className="relative">
      <input
        value={q}
        onChange={(e) => {
          setQ(e.target.value.toUpperCase());
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 200)}
        placeholder="ticker"
        className="bg-black border border-[#2a2a2a] px-2 py-0.5 text-[11px] w-[110px] font-mono uppercase focus:border-[#ff9900] outline-none"
      />
      {open && hits.length > 0 && (
        <div className="absolute top-full left-0 mt-0.5 bg-[#0d0d0d] border border-[#2a2a2a] z-20 max-h-[200px] overflow-y-auto min-w-[200px] text-[10px]">
          {hits.map((h) => {
            const corto =
              h.ticker_corto ||
              h.ticker.split(" - ")[2] ||
              h.ticker;
            return (
              <div
                key={h.ticker}
                onMouseDown={() => onPick(corto)}
                className="px-2 py-0.5 hover:bg-[#1a1a1a] cursor-pointer font-mono"
              >
                <span className="text-[#d0d0d0]">{corto}</span>
                <span className="text-[#666] ml-2">{h.ticker}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function OperarCard({
  cfg,
  onChangeTicker,
  onRemove,
  account,
  onExecuted,
}: {
  cfg: CardCfg;
  onChangeTicker: (corto: string) => void;
  onRemove: () => void;
  account: string;
  onExecuted: () => void;
}) {
  const book = useOrderBook(cfg.tickerCorto);
  const bids = book?.book?.bids ?? [];
  const offers = book?.book?.offers ?? [];
  const last = book?.metrics?.last_price ?? null;
  const close = book?.metrics?.closing_price ?? null;
  const fullTicker = book?.ticker ?? "";

  const [form, setForm] = useState<FormState>({
    side: "BUY",
    order_type: "LIMIT",
    price: "",
    size: "",
    tif: "DAY",
  });
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);

  function pickFromBook(side: Side, price: number, size: number) {
    setForm((f) => ({
      ...f,
      side,
      order_type: "LIMIT",
      price: price.toFixed(2),
      size: String(size),
    }));
  }

  async function ejecutar() {
    if (!fullTicker) {
      setResult({ ok: false, msg: "Ticker no resolvió" });
      return;
    }
    if (!account) {
      setResult({ ok: false, msg: "Elegí cuenta arriba" });
      return;
    }
    if (!form.size || parseInt(form.size, 10) <= 0) {
      setResult({ ok: false, msg: "Nominales > 0" });
      return;
    }
    if (form.order_type === "LIMIT" && !form.price) {
      setResult({ ok: false, msg: "Falta precio" });
      return;
    }
    setSending(true);
    setResult(null);
    try {
      const body: Record<string, unknown> = {
        ticker: fullTicker,
        side: form.side,
        size: parseInt(form.size, 10),
        order_type: form.order_type,
        tif: form.tif,
        account,
      };
      if (form.order_type === "LIMIT") body.price = parseFloat(form.price);
      const r = await fetch("/api/ordenes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await r.json().catch(() => ({}));
      if (r.ok) {
        setResult({ ok: true, msg: `OK ${j.cl_ord_id ?? ""}` });
        onExecuted();
      } else {
        setResult({ ok: false, msg: j.detail ?? `HTTP ${r.status}` });
      }
    } catch (e) {
      setResult({
        ok: false,
        msg: e instanceof Error ? e.message : "error",
      });
    } finally {
      setSending(false);
      setTimeout(() => setResult(null), 8000);
    }
  }

  const sideBg =
    form.side === "BUY" ? "bg-[#0d1d0d]" : "bg-[#1d0d0d]";

  return (
    <div className="border border-[#1a1a1a] bg-[#080808] flex flex-col min-w-[280px]">
      {/* Header */}
      <div className="flex items-center justify-between px-2 py-1 border-b border-[#1a1a1a]">
        <TickerSearch value={cfg.tickerCorto} onPick={onChangeTicker} />
        <div className="flex items-baseline gap-2 ml-2 flex-1 justify-end">
          <span className="text-[9px] text-[#666]">last</span>
          <span className="text-[#ff9900] font-bold tabular-nums text-[13px]">
            {last !== null ? last.toFixed(2) : "—"}
          </span>
          {close !== null && (
            <span className="text-[9px] text-[#555]">
              prev {close.toFixed(2)}
            </span>
          )}
        </div>
        <button
          onClick={onRemove}
          className="ml-2 text-[#555] hover:text-[#f87171] text-[14px] leading-none"
          title="Cerrar panel"
        >
          ×
        </button>
      </div>

      {/* Book */}
      <table className="w-full text-[11px] font-mono tabular-nums">
        <thead className="text-[9px] text-[#666] tracking-wider">
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
              <tr key={i} className="border-t border-[#101010]">
                <td className="px-1 py-0.5 text-[#888]">
                  {b?.size != null ? b.size.toLocaleString("es-AR") : "—"}
                </td>
                <td
                  className={`px-1 py-0.5 text-right ${
                    b
                      ? "text-[#7fff7f] cursor-pointer hover:bg-[#0d2d0d]"
                      : "text-[#555]"
                  }`}
                  onClick={() => b && pickFromBook("SELL", b.price, b.size)}
                  title={b ? "Click: vender al bid" : ""}
                >
                  {b ? b.price.toFixed(2) : "—"}
                </td>
                <td
                  className={`px-1 py-0.5 ${
                    a
                      ? "text-[#ff7f7f] cursor-pointer hover:bg-[#2d0d0d]"
                      : "text-[#555]"
                  }`}
                  onClick={() => a && pickFromBook("BUY", a.price, a.size)}
                  title={a ? "Click: comprar al ask" : ""}
                >
                  {a ? a.price.toFixed(2) : "—"}
                </td>
                <td className="px-1 py-0.5 text-right text-[#888]">
                  {a?.size != null ? a.size.toLocaleString("es-AR") : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* Form embedded */}
      <div className={`mt-auto p-2 border-t border-[#1a1a1a] ${sideBg}`}>
        <div className="flex gap-0.5 mb-1">
          {(["BUY", "SELL"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setForm((f) => ({ ...f, side: s }))}
              className={`flex-1 px-2 py-0.5 text-[10px] font-bold border ${
                s === form.side
                  ? s === "BUY"
                    ? "bg-[#4ade80] text-black border-[#4ade80]"
                    : "bg-[#f87171] text-black border-[#f87171]"
                  : "bg-transparent text-[#888] border-[#2a2a2a]"
              }`}
            >
              {s}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-1 mb-1 text-[10px]">
          <select
            value={form.order_type}
            onChange={(e) =>
              setForm((f) => ({ ...f, order_type: e.target.value as OrderType }))
            }
            className="bg-black border border-[#2a2a2a] px-1 py-0.5 focus:border-[#ff9900] outline-none"
          >
            <option value="LIMIT">LIMIT</option>
            <option value="MARKET">MARKET</option>
          </select>
          <select
            value={form.tif}
            onChange={(e) =>
              setForm((f) => ({ ...f, tif: e.target.value as Tif }))
            }
            className="bg-black border border-[#2a2a2a] px-1 py-0.5 focus:border-[#ff9900] outline-none"
          >
            <option value="DAY">DAY</option>
            <option value="IOC">IOC</option>
            <option value="FOK">FOK</option>
            <option value="GTC">GTC</option>
          </select>
        </div>

        <div className="grid grid-cols-2 gap-1 mb-1 text-[10px]">
          <input
            value={form.price}
            placeholder="precio"
            disabled={form.order_type === "MARKET"}
            onChange={(e) =>
              setForm((f) => ({ ...f, price: e.target.value }))
            }
            className="bg-black border border-[#2a2a2a] px-1 py-0.5 tabular-nums focus:border-[#ff9900] outline-none disabled:opacity-40"
          />
          <input
            value={form.size}
            placeholder="nominales"
            onChange={(e) =>
              setForm((f) => ({ ...f, size: e.target.value }))
            }
            className="bg-black border border-[#2a2a2a] px-1 py-0.5 tabular-nums focus:border-[#ff9900] outline-none"
          />
        </div>

        <button
          onClick={ejecutar}
          disabled={sending || !account || !fullTicker}
          className="w-full px-2 py-1 bg-[#ff9900] text-black font-bold text-[11px] tracking-wide border border-[#ff9900] hover:bg-[#ffaa20] disabled:opacity-30 disabled:cursor-not-allowed"
        >
          {sending ? "…" : `EJECUTAR ${form.side}`}
        </button>

        {result && (
          <div
            className={`mt-1 text-[9px] ${
              result.ok ? "text-[#4ade80]" : "text-[#f87171]"
            }`}
          >
            {result.msg}
          </div>
        )}

        <div className="mt-1 text-[8px] text-[#555]">
          {book?.updated_at ? `book ${fmtTime(book.updated_at)}` : "—"}
        </div>
      </div>
    </div>
  );
}

function OrderManagement({
  orders,
  refresh,
  onCancel,
}: {
  orders: OrderDia[];
  refresh: () => void;
  onCancel: (cl_ord_id: string) => Promise<void>;
}) {
  const activas = useMemo(
    () =>
      orders.filter(
        (o) =>
          o.status === "NEW" ||
          o.status === "PARTIALLY_FILLED" ||
          o.status === "PENDING_NEW" ||
          o.status === "PENDING_CANCEL",
      ),
    [orders],
  );

  const restantes = useMemo(
    () => orders.filter((o) => !activas.includes(o)),
    [orders, activas],
  );

  return (
    <div className="border border-[#1a1a1a] bg-[#080808]">
      <div className="flex items-center justify-between px-2 py-1 border-b border-[#1a1a1a]">
        <span className="text-[11px] tracking-wide text-[#d0d0d0] font-semibold">
          ÓRDENES DEL DÍA
        </span>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-[#888]">
            {activas.length} activas · {restantes.length} cerradas
          </span>
          <button
            onClick={refresh}
            className="text-[#888] hover:text-[#ff9900] text-[12px] leading-none"
            title="Refrescar"
          >
            ↻
          </button>
        </div>
      </div>

      {orders.length === 0 ? (
        <div className="px-2 py-3 text-[10px] text-[#555] text-center">
          Sin órdenes hoy
        </div>
      ) : (
        <table className="w-full text-[10px] font-mono tabular-nums">
          <thead className="text-[9px] text-[#666] tracking-wider bg-[#0a0a0a]">
            <tr>
              <th className="text-left px-2 py-1">HORA</th>
              <th className="text-left px-2 py-1">TICKER</th>
              <th className="text-left px-2 py-1">SIDE</th>
              <th className="text-left px-2 py-1">TIPO</th>
              <th className="text-right px-2 py-1">PRECIO</th>
              <th className="text-right px-2 py-1">QTY</th>
              <th className="text-right px-2 py-1">EXEC</th>
              <th className="text-left px-2 py-1">STATUS</th>
              <th className="text-left px-2 py-1">CUENTA</th>
              <th className="px-2 py-1" />
            </tr>
          </thead>
          <tbody>
            {[...activas, ...restantes].map((o) => {
              const corto =
                o.ticker?.split(" - ")[2] ?? o.ticker ?? "?";
              const isActive = activas.includes(o);
              return (
                <tr
                  key={o.cl_ord_id ?? Math.random()}
                  className="border-t border-[#101010] hover:bg-[#0d0d0d]"
                >
                  <td className="px-2 py-0.5 text-[#888]">
                    {o.created_at ? fmtTime(o.created_at) : "—"}
                  </td>
                  <td className="px-2 py-0.5 text-[#d0d0d0]">{corto}</td>
                  <td
                    className={`px-2 py-0.5 font-semibold ${
                      o.side === "BUY" ? "text-[#7fff7f]" : "text-[#ff7f7f]"
                    }`}
                  >
                    {o.side ?? "—"}
                  </td>
                  <td className="px-2 py-0.5 text-[#aaa]">
                    {o.order_type ?? "—"}
                  </td>
                  <td className="px-2 py-0.5 text-right text-[#d0d0d0]">
                    {o.price != null ? o.price.toFixed(2) : "—"}
                  </td>
                  <td className="px-2 py-0.5 text-right text-[#d0d0d0]">
                    {o.size?.toLocaleString("es-AR") ?? "—"}
                  </td>
                  <td className="px-2 py-0.5 text-right text-[#888]">
                    {o.cum_qty?.toLocaleString("es-AR") ?? "—"}
                  </td>
                  <td className={`px-2 py-0.5 ${statusColor(o.status)}`}>
                    {o.status ?? "—"}
                    {o.reject_reason && (
                      <span
                        className="text-[#888] ml-1 truncate inline-block max-w-[140px]"
                        title={o.reject_reason}
                      >
                        ({o.reject_reason})
                      </span>
                    )}
                  </td>
                  <td className="px-2 py-0.5 text-[#888]">
                    {o.account ?? "—"}
                  </td>
                  <td className="px-2 py-0.5">
                    {isActive && o.cl_ord_id && (
                      <button
                        onClick={() => onCancel(o.cl_ord_id!)}
                        className="text-[9px] text-[#f87171] hover:underline"
                      >
                        cancelar
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

function statusColor(s?: string): string {
  if (!s) return "text-[#888]";
  if (s === "FILLED") return "text-[#7fff7f]";
  if (s === "REJECTED" || s === "CANCELLED" || s === "EXPIRED")
    return "text-[#ff7f7f]";
  if (s === "NEW" || s === "PARTIALLY_FILLED" || s === "PENDING_NEW")
    return "text-[#ffe066]";
  return "text-white";
}

// ─── Vista principal ─────────────────────────────────────────────────────────

export function OperarDashboardView() {
  const [cards, setCards] = useState<CardCfg[]>(loadCards);
  const [cuentas, setCuentas] = useState<CuentaDescubierta[]>([]);
  const [account, setAccount] = useState<string>(ACCOUNT_DEFAULT_FALLBACK);
  const { orders, refresh } = useOrdenesDia();

  // Persistir cards en LS.
  useEffect(() => {
    saveCards(cards);
  }, [cards]);

  // Cuentas + restore LS.
  useEffect(() => {
    let alive = true;
    async function fetchCuentas() {
      try {
        const r = await fetch("/api/risk/account/listado", {
          cache: "no-store",
        });
        if (!alive || !r.ok) return;
        const list = (await r.json()) as CuentaDescubierta[];
        setCuentas(list);
        const persisted =
          typeof window !== "undefined"
            ? window.localStorage.getItem(ACCOUNT_LS_KEY)
            : null;
        if (persisted && list.some((c) => c.account_id === persisted)) {
          setAccount(persisted);
        }
      } catch {
        // ignore
      }
    }
    void fetchCuentas();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (account && typeof window !== "undefined") {
      window.localStorage.setItem(ACCOUNT_LS_KEY, account);
    }
  }, [account]);

  function addCard() {
    setCards((cs) => [...cs, { id: uid(), tickerCorto: "AL30" }]);
  }

  function removeCard(id: string) {
    setCards((cs) => cs.filter((c) => c.id !== id));
  }

  function changeTicker(id: string, corto: string) {
    setCards((cs) =>
      cs.map((c) => (c.id === id ? { ...c, tickerCorto: corto } : c)),
    );
  }

  async function cancelOrder(cl_ord_id: string) {
    try {
      await fetch(`/api/ordenes/${encodeURIComponent(cl_ord_id)}`, {
        method: "DELETE",
      });
    } catch {
      // ignore
    } finally {
      void refresh();
    }
  }

  return (
    <div className="h-full flex flex-col gap-2 p-2 bg-black min-h-0 overflow-auto">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-2 py-1 border border-[#1a1a1a] bg-[#080808] shrink-0">
        <span className="text-[10px] tracking-wider text-[#888]">CUENTA</span>
        <select
          value={account}
          onChange={(e) => setAccount(e.target.value)}
          className="bg-black border border-[#2a2a2a] px-2 py-0.5 text-[11px] focus:border-[#ff9900] outline-none"
        >
          <option value="">— elegir —</option>
          {cuentas.map((c) => (
            <option key={c.account_id} value={c.account_id}>
              {c.account_id}
            </option>
          ))}
        </select>
        <button
          onClick={addCard}
          className="ml-auto px-2 py-0.5 text-[10px] font-semibold tracking-wide border border-[#ff9900] text-[#ff9900] hover:bg-[#ff9900] hover:text-black"
        >
          + AGREGAR PANEL
        </button>
      </div>

      {/* Cards row */}
      <div className="flex gap-2 overflow-x-auto pb-1 shrink-0">
        {cards.length === 0 ? (
          <div className="border border-[#1a1a1a] bg-[#080808] p-4 text-[10px] text-[#666] text-center w-full">
            Sin paneles. Click en "+ AGREGAR PANEL" para arrancar.
          </div>
        ) : (
          cards.map((c) => (
            <OperarCard
              key={c.id}
              cfg={c}
              account={account}
              onChangeTicker={(corto) => changeTicker(c.id, corto)}
              onRemove={() => removeCard(c.id)}
              onExecuted={refresh}
            />
          ))
        )}
      </div>

      {/* Order management */}
      <div className="flex-1 min-h-0">
        <OrderManagement
          orders={orders}
          refresh={refresh}
          onCancel={cancelOrder}
        />
      </div>
    </div>
  );
}
