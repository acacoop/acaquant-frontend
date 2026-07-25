"use client";

/**
 * OPERAR → TÍTULOS Y FCI (vista consolidada).
 *
 * Reemplaza al viejo DASHBOARD (grilla de 4 cards que casi no se usaba) + la
 * vista FCI espejo. Ahora todo lo que NO es dólar MEP vive acá:
 *
 *   ┌ cuenta ─────────────────────────────────────────────────┐
 *   │ [ TÍTULOS ] [ FCI ]        │  Posición (saldos+tenencias) │
 *   │  UNA card de operación     │  Órdenes del día             │
 *   └─────────────────────────────────────────────────────────┘
 *
 * - Una sola card de títulos (antes 4). El book se muestra ENFRENTADO —bid a la
 *   izquierda, ask a la derecha, el spread al medio— que es como se lee.
 * - El toggle TÍTULOS/FCI cambia solo la columna izquierda; la cuenta, la
 *   posición y las órdenes son las mismas para las dos.
 * - Los componentes de la derecha y los hooks viven en `operar-shared`.
 */

import { useEffect, useState } from "react";
import { fmtTime } from "./dolar-mep-shared";
import { FciOperatePanel } from "./operar-fci-view";
import {
  AccountSearch,
  DerivedAccountBanner,
  OrderManagement,
  PortfolioPanel,
  cancelarOrden,
  useCuentasOperar,
  useOrdenesDia,
  usePortfolio,
} from "./operar-shared";

// ─── Tipos del book / orden ──────────────────────────────────────────────────

interface BookLevel {
  price: number;
  size: number;
}
interface OrderBookResp {
  ticker: string;
  updated_at: string | null;
  sin_puntas?: boolean;
  book?: { bids?: BookLevel[]; offers?: BookLevel[] };
  metrics?: { last_price?: number | null; closing_price?: number | null };
}
interface SymbolHit {
  ticker: string;
  ticker_corto?: string;
  underlying?: string;
}
type Plazo = "CI" | "24hs" | "48hs";
type Side = "BUY" | "SELL";
type OrderType = "LIMIT" | "MARKET";
type Tif = "DAY" | "IOC" | "FOK" | "GTC";
type BookStatus = "ready" | "subscribing" | "error";

// ─── Hook del book (una sola card) ───────────────────────────────────────────

function useOrderBook(tickerParam: string, plazo: Plazo, pollMs = 1000) {
  const [book, setBook] = useState<OrderBookResp | null>(null);
  const [status, setStatus] = useState<BookStatus>("ready");
  const [error, setError] = useState<string | null>(null);
  const [subInfo, setSubInfo] = useState<{ edad: number | null } | null>(null);

  useEffect(() => {
    if (!tickerParam) {
      setBook(null);
      setStatus("ready");
      setError(null);
      return;
    }
    let alive = true;
    async function fetchBook() {
      try {
        const r = await fetch(
          `/api/operar/order-book?ticker=${encodeURIComponent(tickerParam)}&plazo=${plazo}`,
          { cache: "no-store" },
        );
        if (!alive) return;
        if (r.status === 200) {
          setBook(await r.json());
          setStatus("ready");
          setError(null);
        } else if (r.status === 202) {
          // El motor lo levanta en ~5s. `fila_edad_s` distingue "recién pedido"
          // de "el motor no está corriendo y esto no va a llegar".
          const j = await r.json().catch(() => ({}));
          setStatus("subscribing");
          setSubInfo({ edad: j.fila_edad_s ?? null });
          setError(null);
        } else {
          setBook(null);
          const j = await r.json().catch(() => ({}));
          setStatus("error");
          setError(j.detail ?? `HTTP ${r.status}`);
        }
      } catch {
        /* reintenta al próximo tick */
      }
    }
    void fetchBook();
    const id = setInterval(fetchBook, pollMs);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [tickerParam, plazo, pollMs]);

  return { book, status, error, subInfo };
}

// ─── Buscador de ticker ──────────────────────────────────────────────────────

function TickerSearch({
  value,
  onPick,
}: {
  value: string;
  onPick: (corto: string, full: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState(value);
  const [hits, setHits] = useState<SymbolHit[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setQ(value);
  }, [value]);

  useEffect(() => {
    if (!open || q.length < 2) {
      setHits([]);
      return;
    }
    let alive = true;
    setLoading(true);
    const id = setTimeout(async () => {
      try {
        const r = await fetch(`/api/ordenes/symbols?q=${encodeURIComponent(q)}&limit=20`, {
          cache: "no-store",
        });
        if (alive && r.ok) setHits(await r.json());
      } catch {
        /* ignore */
      } finally {
        if (alive) setLoading(false);
      }
    }, 200);
    return () => {
      alive = false;
      clearTimeout(id);
    };
  }, [q, open]);

  // Lo más parecido a lo escrito, primero: match exacto → empieza con → resto;
  // a igual cercanía, el ticker más corto y plazo 24hs > CI > 48hs.
  const qUp = q.trim().toUpperCase();
  const cortoDe = (h: SymbolHit) =>
    (h.ticker_corto || h.ticker.split(" - ")[2] || h.ticker).toUpperCase();
  const plazoRank = (h: SymbolHit) => {
    const p = h.ticker.split(" - ")[3];
    return p === "24hs" ? 0 : p === "CI" ? 1 : p === "48hs" ? 2 : 3;
  };
  const sortedHits = [...hits].sort((a, b) => {
    const ca = cortoDe(a);
    const cb = cortoDe(b);
    const score = (c: string) => (c === qUp ? 0 : c.startsWith(qUp) ? 1 : 2);
    if (score(ca) !== score(cb)) return score(ca) - score(cb);
    if (ca.length !== cb.length) return ca.length - cb.length;
    if (plazoRank(a) !== plazoRank(b)) return plazoRank(a) - plazoRank(b);
    return ca.localeCompare(cb);
  });

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
        className="bg-[var(--t-surface)] border border-[var(--t-border-2)] rounded px-2.5 py-1 text-[12px] w-[150px] font-mono uppercase focus:border-[var(--t-accent)] outline-none"
      />
      {open && q.length >= 2 && (
        <div className="absolute top-full left-0 mt-1 bg-[var(--t-surface)] border border-[var(--t-border-2)] rounded shadow-lg z-30 max-h-[220px] overflow-y-auto min-w-[280px] text-[10px]">
          {loading && sortedHits.length === 0 ? (
            <div className="px-2 py-2 text-[var(--t-text-muted)]">buscando…</div>
          ) : sortedHits.length === 0 ? (
            <div className="px-2 py-2 text-[var(--t-text-muted)]">sin resultados</div>
          ) : (
            sortedHits.map((h) => {
              const corto = h.ticker_corto || h.ticker.split(" - ")[2] || h.ticker;
              return (
                <div
                  key={h.ticker}
                  onMouseDown={() => onPick(corto, h.ticker)}
                  className="px-2.5 py-1 hover:bg-[var(--t-border)] cursor-pointer font-mono flex items-center gap-2"
                >
                  <span className="text-[var(--t-text)]">{corto}</span>
                  <span className="text-[var(--t-text-muted)] text-[9px]">{h.ticker}</span>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

// ─── Card de operación de TÍTULOS ────────────────────────────────────────────

interface TituloState {
  corto: string;
  full: string;
  plazo: Plazo;
}

function TituloOperatePanel({
  account,
  seed,
  onExecuted,
}: {
  account: string;
  seed?: string;
  onExecuted: () => void;
}) {
  const [sel, setSel] = useState<TituloState>({ corto: seed ?? "", full: "", plazo: "24hs" });
  const { book, status, error, subInfo } = useOrderBook(sel.full || sel.corto, sel.plazo);

  const bids = book?.book?.bids ?? [];
  const offers = book?.book?.offers ?? [];
  const last = book?.metrics?.last_price ?? null;
  const close = book?.metrics?.closing_price ?? null;
  const fullTicker = book?.ticker ?? sel.full ?? "";
  const spread = bids[0] && offers[0] ? offers[0].price - bids[0].price : null;

  // form
  const [side, setSide] = useState<Side>("BUY");
  const [orderType, setOrderType] = useState<OrderType>("LIMIT");
  const [tif, setTif] = useState<Tif>("DAY");
  const [price, setPrice] = useState("");
  const [size, setSize] = useState("");
  const [priceExit, setPriceExit] = useState("");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);

  function pickTicker(corto: string, full: string) {
    const parts = full.split(" - ");
    const p = parts.length === 4 ? parts[3] : null;
    setSel({
      corto,
      full,
      plazo: p === "CI" || p === "24hs" || p === "48hs" ? p : "24hs",
    });
    setResult(null);
  }

  function changePlazo(p: Plazo) {
    // Reescribe el último segmento del full para no volver a buscar.
    let full = sel.full;
    const parts = full.split(" - ");
    if (parts.length === 4) {
      parts[3] = p;
      full = parts.join(" - ");
    }
    setSel((s) => ({ ...s, plazo: p, full }));
  }

  function pickFromBook(s: Side, p: number, sz: number) {
    setSide(s);
    setOrderType("LIMIT");
    // Respetar la precisión real del instrumento (bonos USD/futuros cotizan con
    // 3+ decimales): toFixed(8)+Number quita relleno sin truncar el precio real.
    setPrice(String(Number(p.toFixed(8))));
    setSize(String(sz));
  }

  async function ejecutar() {
    if (!fullTicker) return setResult({ ok: false, msg: "Elegí un ticker" });
    if (!account) return setResult({ ok: false, msg: "Elegí una cuenta arriba" });
    if (!size || parseInt(size, 10) <= 0) return setResult({ ok: false, msg: "Nominales > 0" });
    if (orderType === "LIMIT" && !price) return setResult({ ok: false, msg: "Falta precio" });

    const usaBracket = priceExit.trim() !== "";
    if (usaBracket) {
      if (orderType !== "LIMIT")
        return setResult({ ok: false, msg: "Bracket requiere entrada LIMIT (no MARKET)" });
      if (parseFloat(priceExit) <= 0)
        return setResult({ ok: false, msg: "Precio de salida inválido" });
    }

    setSending(true);
    setResult(null);
    const clientOrderId = crypto.randomUUID(); // idempotencia: anti doble orden
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
            account,
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
          account,
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
            ? `Bracket OK · salida @ ${priceExit}`
            : `Orden enviada · ${j.cl_ord_id ?? ""}`,
        });
        setPriceExit("");
        onExecuted();
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

  const buy = side === "BUY";

  return (
    <div className="border border-[var(--t-border)] rounded bg-[var(--t-panel)] flex flex-col min-h-0 h-full overflow-hidden">
      {/* Header: ticker + plazo + last */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-[var(--t-border)] shrink-0">
        <TickerSearch value={sel.corto} onPick={pickTicker} />
        <select
          value={sel.plazo}
          onChange={(e) => changePlazo(e.target.value as Plazo)}
          className="bg-[var(--t-surface)] border border-[var(--t-border-2)] rounded px-1.5 py-1 text-[11px] focus:border-[var(--t-accent)] outline-none"
          title="Plazo de liquidación · CI = hoy, 24hs = mañana"
        >
          <option value="CI">CI</option>
          <option value="24hs">24hs</option>
          {sel.plazo === "48hs" && <option value="48hs">48hs</option>}
        </select>
        <div className="flex items-baseline gap-2 ml-auto">
          <span className="text-[9px] text-[var(--t-text-muted)]">último</span>
          <span className="text-[var(--t-accent)] font-bold tabular-nums text-[15px]">
            {last !== null ? last.toFixed(2) : "—"}
          </span>
          {close !== null && (
            <span className="text-[9px] text-[var(--t-text-muted)]">prev {close.toFixed(2)}</span>
          )}
        </div>
      </div>

      {/* Estado */}
      {status === "subscribing" && (
        <div className="px-3 py-1.5 text-[10px] text-[#ffe066] border-b border-[var(--t-border)] bg-[var(--t-tint-amber)] flex items-center gap-2">
          <span className="inline-block w-2 h-2 rounded-full bg-[#ffe066] animate-pulse" />
          {subInfo?.edad != null && subInfo.edad > 180
            ? `suscribiendo… (sin refresco hace ${Math.round(subInfo.edad / 60)} min — ¿el motor está corriendo?)`
            : "suscribiendo… el motor lo levanta en ~5s"}
        </div>
      )}
      {status === "error" && error && (
        <div className="px-3 py-1.5 text-[10px] text-[var(--t-neg)] border-b border-[var(--t-border)] bg-[var(--t-tint-red)]">
          {error}
        </div>
      )}
      {status === "ready" && book?.sin_puntas && (
        <div className="px-3 py-1.5 text-[10px] text-[var(--t-text-dim)] border-b border-[var(--t-border)] bg-[var(--t-surface)]">
          Sin puntas ahora (mercado cerrado o papel sin oferta). Podés mandar una orden límite.
        </div>
      )}

      {/* Book enfrentado: BID a la izquierda, ASK a la derecha, spread al medio */}
      {sel.corto ? (
        <div className="shrink-0 border-b border-[var(--t-border)]">
          <div className="grid grid-cols-2 text-[9px] text-[var(--t-text-muted)] tracking-wider px-3 pt-2">
            <span className="text-left text-[var(--t-pos)]">COMPRA (bid)</span>
            <span className="text-right text-[var(--t-neg)]">VENTA (ask)</span>
          </div>
          <div className="px-3 py-1">
            {Array.from({ length: 5 }).map((_, i) => {
              const b = bids[i];
              const a = offers[i];
              return (
                <div key={i} className="grid grid-cols-2 gap-2 font-mono tabular-nums text-[11px]">
                  {/* Bid: size a la izquierda, precio pegado al centro */}
                  <button
                    disabled={!b}
                    onClick={() => b && pickFromBook("SELL", b.price, b.size)}
                    title={b ? "vender al bid" : ""}
                    className={`flex items-center justify-between px-2 py-0.5 rounded-sm ${
                      b
                        ? "text-[var(--t-pos)] hover:bg-[var(--t-tint-green)] cursor-pointer"
                        : "text-[var(--t-text-muted)] cursor-default"
                    }`}
                  >
                    <span className="text-[var(--t-text-dim)] text-[10px]">
                      {b?.size != null ? b.size.toLocaleString("es-AR") : ""}
                    </span>
                    <span className="font-semibold">{b ? b.price.toFixed(2) : "—"}</span>
                  </button>
                  {/* Ask: precio pegado al centro, size a la derecha */}
                  <button
                    disabled={!a}
                    onClick={() => a && pickFromBook("BUY", a.price, a.size)}
                    title={a ? "comprar al ask" : ""}
                    className={`flex items-center justify-between px-2 py-0.5 rounded-sm ${
                      a
                        ? "text-[var(--t-neg)] hover:bg-[var(--t-tint-red)] cursor-pointer"
                        : "text-[var(--t-text-muted)] cursor-default"
                    }`}
                  >
                    <span className="font-semibold">{a ? a.price.toFixed(2) : "—"}</span>
                    <span className="text-[var(--t-text-dim)] text-[10px]">
                      {a?.size != null ? a.size.toLocaleString("es-AR") : ""}
                    </span>
                  </button>
                </div>
              );
            })}
          </div>
          {spread !== null && (
            <div className="text-center text-[9px] text-[var(--t-text-muted)] pb-1.5">
              spread {spread.toFixed(2)}
            </div>
          )}
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center text-[11px] text-[var(--t-text-dim)] px-4 text-center">
          Buscá un título arriba para ver su book y operarlo.
        </div>
      )}

      {/* Formulario de orden */}
      {sel.corto && (
        <div
          className={`mt-auto p-3 border-t border-[var(--t-border)] ${
            buy ? "bg-[var(--t-tint-green)]" : "bg-[var(--t-tint-red)]"
          }`}
        >
          <div className="flex gap-1 mb-2">
            {(["BUY", "SELL"] as const).map((s) => (
              <button
                key={s}
                onClick={() => setSide(s)}
                className={`flex-1 px-2 py-1 text-[11px] font-bold rounded border ${
                  s === side
                    ? s === "BUY"
                      ? "bg-[#4ade80] text-black border-[#4ade80]"
                      : "bg-[#f87171] text-black border-[#f87171]"
                    : "bg-transparent text-[var(--t-text-dim)] border-[var(--t-border-2)]"
                }`}
              >
                {s === "BUY" ? "COMPRAR" : "VENDER"}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-1.5 mb-1.5 text-[11px]">
            <select
              value={orderType}
              onChange={(e) => setOrderType(e.target.value as OrderType)}
              className="bg-[var(--t-panel)] border border-[var(--t-border-2)] rounded px-1.5 py-1 focus:border-[var(--t-accent)] outline-none"
            >
              <option value="LIMIT">LÍMITE</option>
              <option value="MARKET">MERCADO</option>
            </select>
            <select
              value={tif}
              onChange={(e) => setTif(e.target.value as Tif)}
              className="bg-[var(--t-panel)] border border-[var(--t-border-2)] rounded px-1.5 py-1 focus:border-[var(--t-accent)] outline-none"
              title="Vigencia · DAY = hasta el cierre, IOC/FOK = inmediata, GTC = hasta cancelar"
            >
              <option value="DAY">DAY</option>
              <option value="IOC">IOC</option>
              <option value="FOK">FOK</option>
              <option value="GTC">GTC</option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-1.5 mb-1.5 text-[11px]">
            <input
              value={price}
              placeholder="precio"
              disabled={orderType === "MARKET"}
              // coma decimal AR ("1234,56"): normalizar al tipear, no al enviar
              onChange={(e) => setPrice(e.target.value.replace(",", "."))}
              className="bg-[var(--t-panel)] border border-[var(--t-border-2)] rounded px-1.5 py-1 tabular-nums focus:border-[var(--t-accent)] outline-none disabled:opacity-40"
            />
            <input
              value={size}
              placeholder="nominales"
              onChange={(e) => setSize(e.target.value.replace(",", "."))}
              className="bg-[var(--t-panel)] border border-[var(--t-border-2)] rounded px-1.5 py-1 tabular-nums focus:border-[var(--t-accent)] outline-none"
            />
          </div>

          <input
            value={priceExit}
            placeholder="precio salida (bracket — opcional)"
            disabled={orderType === "MARKET"}
            onChange={(e) => setPriceExit(e.target.value.replace(",", "."))}
            title="Cuando la entrada se llene, manda automáticamente la salida al lado opuesto a este precio"
            className={`w-full mb-2 bg-[var(--t-panel)] border rounded px-1.5 py-1 text-[11px] tabular-nums focus:border-[var(--t-accent)] outline-none disabled:opacity-40 ${
              priceExit.trim() !== ""
                ? "border-[var(--t-accent)] text-[var(--t-accent)]"
                : "border-[var(--t-border-2)]"
            }`}
          />

          <button
            onClick={ejecutar}
            disabled={sending || !account || !fullTicker}
            className="w-full px-2 py-1.5 bg-[var(--t-accent)] text-[var(--t-on-accent)] font-bold text-[12px] tracking-wide rounded border border-[var(--t-accent)] hover:brightness-110 disabled:opacity-30 disabled:cursor-not-allowed"
          >
            {sending
              ? "…"
              : priceExit.trim() !== ""
                ? `ENVIAR BRACKET ${buy ? "COMPRA" : "VENTA"}`
                : `ENVIAR ${buy ? "COMPRA" : "VENTA"}`}
          </button>

          {result && (
            <div
              className={`mt-1.5 text-[10px] ${
                result.ok ? "text-[var(--t-pos)]" : "text-[var(--t-neg)]"
              }`}
            >
              {result.msg}
            </div>
          )}
          {book?.updated_at && (
            <div className="mt-1 text-[8px] text-[var(--t-text-muted)]">
              book {fmtTime(book.updated_at)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Vista consolidada ───────────────────────────────────────────────────────

type Modo = "titulos" | "fci";

export function OperarTitulosFciView() {
  const { cuentas, account, setAccount, accountNombre, derivedAccount, setDerivedAccount } =
    useCuentasOperar();
  const [modo, setModo] = useState<Modo>("titulos");
  const [tickerSeed, setTickerSeed] = useState<string | undefined>();
  const [fciSeed, setFciSeed] = useState<string | undefined>();

  const { orders, refresh } = useOrdenesDia(account);
  const { saldo, detailed, refresh: refreshPortfolio } = usePortfolio(account);

  // Deep-link desde Valuaciones: ?ticker= abre TÍTULOS con el papel; ?fci= abre FCI.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const p = new URLSearchParams(window.location.search);
    const tk = p.get("ticker");
    const fci = p.get("fci");
    if (fci) {
      setModo("fci");
      setFciSeed(fci);
    } else if (tk) {
      setModo("titulos");
      setTickerSeed(tk);
    }
  }, []);

  const afterExec = () => {
    void refresh();
    void refreshPortfolio();
  };

  return (
    <div className="h-full flex flex-col gap-2 p-2 bg-[var(--t-bg)] min-h-0 overflow-hidden">
      {/* Toolbar: cuenta */}
      <div className="flex items-center gap-2 px-3 py-1.5 border border-[var(--t-border)] rounded bg-[var(--t-panel)] shrink-0">
        <span className="text-[10px] tracking-wider text-[var(--t-text-dim)]">CUENTA</span>
        <AccountSearch value={account} cuentas={cuentas} onPick={setAccount} />
      </div>

      {derivedAccount && (
        <DerivedAccountBanner
          derivedAccount={derivedAccount}
          cuentas={cuentas}
          onClose={() => setDerivedAccount(null)}
        />
      )}

      {/* Split: izquierda = operación (títulos/fci), derecha = posición + órdenes */}
      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-2 gap-2">
        {/* Izquierda */}
        <div className="min-h-0 flex flex-col gap-2">
          <div className="flex items-center gap-1 shrink-0">
            {(["titulos", "fci"] as const).map((m) => (
              <button
                key={m}
                onClick={() => setModo(m)}
                className={`px-3 py-1 text-[11px] font-semibold tracking-wide rounded border transition-colors ${
                  modo === m
                    ? "bg-[var(--t-accent)] text-[var(--t-on-accent)] border-[var(--t-accent)]"
                    : "bg-transparent text-[var(--t-text-dim)] border-[var(--t-border-2)] hover:text-[var(--t-accent)] hover:border-[var(--t-accent)]"
                }`}
              >
                {m === "titulos" ? "TÍTULOS" : "FCI"}
              </button>
            ))}
          </div>
          <div className="flex-1 min-h-0">
            {modo === "titulos" ? (
              <TituloOperatePanel account={account} seed={tickerSeed} onExecuted={afterExec} />
            ) : (
              <FciOperatePanel account={account} initialFundQuery={fciSeed} onExecuted={afterExec} />
            )}
          </div>
        </div>

        {/* Derecha: posición arriba, órdenes abajo */}
        <div className="min-h-0 grid grid-rows-2 gap-2">
          <div className="min-h-0 overflow-hidden">
            <PortfolioPanel
              account={account}
              accountNombre={accountNombre}
              saldo={saldo}
              detailed={detailed}
              refresh={refreshPortfolio}
            />
          </div>
          <div className="min-h-0 overflow-hidden">
            <OrderManagement
              orders={orders}
              refresh={refresh}
              onCancel={(id, prop) => cancelarOrden(id, prop, refresh)}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
