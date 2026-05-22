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
  external?: boolean;  // true si vino solo del broker (otra plataforma)
  proprietary?: string;  // requerido para cancelar — viene del backend
}

interface CardCfg {
  id: string;          // uuid local
  tickerCorto: string; // lo que ve el user
  fullTicker?: string; // si el user picó del autocomplete, lo guardamos
  plazo?: "CI" | "24hs" | "48hs"; // default 24hs
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

// v2: layout 50/50 con 4 slots de book de base (arrancan vacíos). El bump
// de versión resetea el LS viejo (2 cards AL30/GD30) al nuevo default.
const CARDS_LS_KEY = "trd-fx-operar-cards-v2";
const ACCOUNT_LS_KEY = "trd-fx-operar-account";

// 4 books de base, siempre presentes aunque estén vacíos. removeCard no baja
// de este piso (limpia el ticker en vez de eliminar el slot).
const MIN_CARDS = 4;

const DEFAULT_CARDS: CardCfg[] = [
  { id: "slot-1", tickerCorto: "" },
  { id: "slot-2", tickerCorto: "" },
  { id: "slot-3", tickerCorto: "" },
  { id: "slot-4", tickerCorto: "" },
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

type BookStatus = "ready" | "subscribing" | "error";

function useOrderBook(
  tickerCorto: string,
  fullTicker: string | undefined,
  plazo: "CI" | "24hs" | "48hs",
  pollMs = 1000,
) {
  const [book, setBook] = useState<OrderBookResp | null>(null);
  const [status, setStatus] = useState<BookStatus>("ready");
  const [error, setError] = useState<string | null>(null);
  // Si tenemos fullTicker (el user picó del autocomplete) lo usamos
  // directo: el backend hace match exacto contra MarketSnapshot. Si no,
  // mandamos corto + plazo y el backend lo resuelve.
  const tickerParam = fullTicker || tickerCorto;
  useEffect(() => {
    if (!tickerParam) return;
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
          // Subscribing — el motor lo va a levantar en ~5s. Mantenemos el
          // book viejo (si había) y mostramos spinner.
          setStatus("subscribing");
          setError(null);
        } else {
          setBook(null);
          const j = await r.json().catch(() => ({}));
          setStatus("error");
          setError(j.detail ?? `HTTP ${r.status}`);
        }
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
  }, [tickerParam, plazo, pollMs]);
  return { book, status, error };
}

function useOrdenesDia(account: string, pollMs = 4000) {
  const [orders, setOrders] = useState<OrderDia[]>([]);
  const [lastFetch, setLastFetch] = useState<number>(0);

  const fetchNow = useCallback(async () => {
    if (!account) {
      setOrders([]);
      return;
    }
    try {
      const r = await fetch(
        `/api/ordenes/dia?account=${encodeURIComponent(account)}`,
        { cache: "no-store" },
      );
      if (r.ok) {
        setOrders(await r.json());
        setLastFetch(Date.now());
      }
    } catch {
      // ignore
    }
  }, [account]);

  useEffect(() => {
    void fetchNow();
    const id = setInterval(fetchNow, pollMs);
    return () => clearInterval(id);
  }, [fetchNow, pollMs]);

  return { orders, lastFetch, refresh: fetchNow };
}

// ─── Portfolio: saldos + tenencias por cuenta ────────────────────────────────

interface MonedaSaldo {
  available: number | null;
  consumed: number | null;
}

interface SaldoResp {
  account: string;
  rueda: "CI" | "24hs";
  saldo_ars: number | null;
  saldo_usd_d: number | null;
  movimiento_ars: number | null;
  movimiento_usd_d: number | null;
  monedas?: Record<string, MonedaSaldo>;
  last_calc?: string | null;
}

// Shape real de pyRofex.get_detailed_position:
// {
//   status: "OK",
//   detailedPosition: {
//     account, totalMarketValue, lastCalculation,
//     report: {
//       BOND: { AO28: { detailedPositions: [...], instrumentMarketValue, ... } },
//       NEGOTIABLE_OBLIGATION: { ... },
//       CEDEAR: { ... },
//       ...
//     }
//   }
// }

interface PyRofexPositionEntry {
  symbolReference?: string;
  tradingSymbol?: string;
  contractType?: string;
  marketPrice?: number;
  marketValue?: number;
  totalCurrentSize?: number;
  buyCurrentSize?: number;
  sellCurrentSize?: number;
  currency?: string;
  settlType?: number;
}

interface PyRofexInstrumentBucket {
  detailedPositions?: PyRofexPositionEntry[];
  instrumentMarketValue?: number;
  instrumentCurrentSize?: number;
}

interface DetailedResp {
  status?: string;
  detailedPosition?: {
    account?: string;
    totalMarketValue?: number;
    lastCalculation?: number;
    report?: Record<string, Record<string, PyRofexInstrumentBucket>>;
  };
}

interface TenenciaFlat {
  ticker: string;
  tipo: string;
  size: number;
  price: number | null;
  marketValue: number | null;
  currency: string;
}

function usePortfolio(account: string, pollMs = 8000) {
  const [saldo, setSaldo] = useState<SaldoResp | null>(null);
  const [detailed, setDetailed] = useState<DetailedResp | null>(null);

  const refresh = useCallback(async () => {
    if (!account) {
      setSaldo(null);
      setDetailed(null);
      return;
    }
    try {
      const [rs, rd] = await Promise.all([
        fetch(`/api/risk/account/saldo?rueda=CI&account=${encodeURIComponent(account)}`, { cache: "no-store" }),
        fetch(`/api/risk/account/detailed?account=${encodeURIComponent(account)}`, { cache: "no-store" }),
      ]);
      if (rs.ok) setSaldo(await rs.json());
      else setSaldo(null);
      if (rd.ok) setDetailed(await rd.json());
      else setDetailed(null);
    } catch {
      // ignore
    }
  }, [account]);

  useEffect(() => {
    void refresh();
    const id = setInterval(refresh, pollMs);
    return () => clearInterval(id);
  }, [refresh, pollMs]);

  return { saldo, detailed, refresh };
}

function PortfolioPanel({
  account,
  accountNombre,
  saldo,
  detailed,
  refresh,
}: {
  account: string;
  accountNombre?: string | null;
  saldo: SaldoResp | null;
  detailed: DetailedResp | null;
  refresh: () => void;
}) {
  // Shape real: detailedPosition.report.{TIPO}.{symbol}.detailedPositions[]
  // Flattenamos en tenencias filtrando las que ya están cerradas
  // (totalCurrentSize == 0 — fue intraday round-trip, no tenencia).
  const tenencias: TenenciaFlat[] = (() => {
    const report = detailed?.detailedPosition?.report;
    if (!report) return [];
    const out: TenenciaFlat[] = [];
    for (const [tipo, simbolos] of Object.entries(report)) {
      for (const bucket of Object.values(simbolos)) {
        const detalles = bucket?.detailedPositions ?? [];
        for (const d of detalles) {
          const size = d.totalCurrentSize ?? 0;
          if (size <= 0) continue;
          const tradingSym = d.tradingSymbol ?? d.symbolReference ?? "?";
          const corto =
            d.symbolReference ?? tradingSym.split(" - ")[2] ?? tradingSym;
          out.push({
            ticker:      corto,
            tipo:        tipo,
            size:        size,
            price:       d.marketPrice ?? null,
            marketValue: d.marketValue ?? null,
            currency:    d.currency ?? "ARS",
          });
        }
      }
    }
    // Ordenar por marketValue desc (las más gordas arriba).
    out.sort((a, b) => (b.marketValue ?? 0) - (a.marketValue ?? 0));
    return out;
  })();

  const totalMarketValue = detailed?.detailedPosition?.totalMarketValue ?? null;

  const ars = saldo?.monedas?.["ARS"] ?? {
    available: saldo?.saldo_ars ?? null,
    consumed: saldo?.movimiento_ars ?? null,
  };
  const usd = saldo?.monedas?.["USD D"] ?? {
    available: saldo?.saldo_usd_d ?? null,
    consumed: saldo?.movimiento_usd_d ?? null,
  };

  return (
    <div className="border border-[#1a1a1a] bg-[#080808] flex flex-col min-h-0 h-full">
      <div className="flex items-center justify-between px-2 py-1 border-b border-[#1a1a1a] shrink-0">
        <span className="text-[11px] tracking-wide text-[#d0d0d0] font-semibold truncate">
          PORTFOLIO{" "}
          {account && (
            <>
              · <span className="text-[#ff9900]">{account}</span>
              {accountNombre && (
                <span className="text-[#aaa] font-normal ml-1">
                  — {accountNombre}
                </span>
              )}
            </>
          )}
        </span>
        <button
          onClick={refresh}
          className="text-[#888] hover:text-[#ff9900] text-[12px] leading-none"
          title="Refrescar"
        >
          ↻
        </button>
      </div>

      {!account ? (
        <div className="px-2 py-3 text-[10px] text-[#555] text-center">
          Elegí una cuenta arriba.
        </div>
      ) : (
        <>
          {/* Saldos */}
          <div className="grid grid-cols-4 gap-2 px-2 py-2 border-b border-[#1a1a1a] text-[10px]">
            <SaldoCell label="ARS DISP" value={ars.available} fmt={fmtArs} />
            <SaldoCell label="ARS MOV" value={ars.consumed} fmt={fmtArs} dim />
            <SaldoCell label="USD D DISP" value={usd.available} fmt={fmtUsd} />
            <SaldoCell label="USD D MOV" value={usd.consumed} fmt={fmtUsd} dim />
          </div>

          {/* Tenencias */}
          <div className="flex-1 min-h-0 overflow-y-auto">
            {tenencias.length === 0 ? (
              <div className="px-2 py-3 text-[10px] text-[#555] text-center">
                {detailed === null ? "Cargando…" : "Sin tenencias"}
              </div>
            ) : (
              <table className="w-full text-[10px] font-mono tabular-nums">
                <thead className="text-[9px] text-[#666] tracking-wider bg-[#0a0a0a] sticky top-0">
                  <tr>
                    <th className="text-left px-2 py-1">TICKER</th>
                    <th className="text-left px-2 py-1">TIPO</th>
                    <th className="text-right px-2 py-1">CANT</th>
                    <th className="text-right px-2 py-1">PRECIO</th>
                    <th className="text-right px-2 py-1">VALOR</th>
                  </tr>
                </thead>
                <tbody>
                  {tenencias.map((t, i) => (
                    <tr
                      key={`${t.ticker}-${i}`}
                      className="border-t border-[#101010] hover:bg-[#0d0d0d]"
                    >
                      <td className="px-2 py-0.5 text-[#d0d0d0]">{t.ticker}</td>
                      <td className="px-2 py-0.5 text-[#888]">{t.tipo}</td>
                      <td className="px-2 py-0.5 text-right text-[#d0d0d0]">
                        {t.size.toLocaleString("es-AR")}
                      </td>
                      <td className="px-2 py-0.5 text-right text-[#d0d0d0]">
                        {t.price != null ? t.price.toFixed(2) : "—"}
                      </td>
                      <td className="px-2 py-0.5 text-right text-[#ff9900]">
                        {t.marketValue != null
                          ? `$${t.marketValue.toLocaleString("es-AR", { maximumFractionDigits: 0 })}`
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
                {totalMarketValue != null && (
                  <tfoot>
                    <tr className="border-t border-[#2a2a2a] bg-[#0a0a0a]">
                      <td colSpan={4} className="px-2 py-1 text-right text-[10px] text-[#888]">
                        TOTAL
                      </td>
                      <td className="px-2 py-1 text-right text-[#ff9900] font-bold">
                        ${totalMarketValue.toLocaleString("es-AR", { maximumFractionDigits: 0 })}
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function fmtArs(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  const sign = n < 0 ? "-" : "";
  return `${sign}$${Math.abs(n).toLocaleString("es-AR", { maximumFractionDigits: 0 })}`;
}

function fmtUsd(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  const sign = n < 0 ? "-" : "";
  return `${sign}US$${Math.abs(n).toLocaleString("es-AR", { maximumFractionDigits: 2 })}`;
}

function SaldoCell({
  label,
  value,
  fmt,
  dim,
}: {
  label: string;
  value: number | null | undefined;
  fmt: (n: number | null | undefined) => string;
  dim?: boolean;
}) {
  const color =
    value == null
      ? "text-[#888]"
      : value < 0
        ? "text-[#ff7f7f]"
        : dim
          ? "text-[#aaa]"
          : "text-[#7fff7f]";
  return (
    <div className="flex flex-col gap-0.5 leading-tight">
      <span className="text-[8px] tracking-wider text-[#666]">{label}</span>
      <span className={`text-[11px] font-semibold tabular-nums ${color}`}>
        {fmt(value)}
      </span>
    </div>
  );
}

// ─── Componentes ─────────────────────────────────────────────────────────────

function AccountSearch({
  value,
  cuentas,
  onPick,
}: {
  value: string;
  cuentas: CuentaDescubierta[];
  onPick: (id: string) => void;
}) {
  // Si value está y matchea una cuenta, mostramos `123 — Nombre` en el
  // input cuando NO está enfocado, así el user sabe cuál tiene activa.
  // Mientras escribe, mostramos solo lo que tipea.
  const [q, setQ] = useState(value);
  const [open, setOpen] = useState(false);
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    setQ(value);
  }, [value]);

  const display = useMemo(() => {
    if (focused) return q;
    const match = cuentas.find((c) => c.account_id === value);
    if (match && match.nombre) return `${match.account_id} — ${match.nombre}`;
    return value;
  }, [focused, q, value, cuentas]);

  const hits = useMemo(() => {
    const ql = (q || "").trim().toLowerCase();
    if (!ql) return cuentas.slice(0, 30);
    return cuentas
      .filter(
        (c) =>
          c.account_id.toLowerCase().includes(ql) ||
          (c.nombre && c.nombre.toLowerCase().includes(ql)),
      )
      .slice(0, 30);
  }, [q, cuentas]);

  return (
    <div className="relative">
      <input
        value={focused ? q : display}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => {
          setFocused(true);
          setQ("");
          setOpen(true);
        }}
        onBlur={() => {
          setFocused(false);
          setTimeout(() => setOpen(false), 200);
        }}
        placeholder="ID o nombre"
        className="bg-black border border-[#2a2a2a] px-2 py-0.5 text-[11px] w-[260px] focus:border-[#ff9900] outline-none"
      />
      {open && hits.length > 0 && (
        <div className="absolute top-full left-0 mt-0.5 bg-[#0d0d0d] border border-[#2a2a2a] z-20 max-h-[280px] overflow-y-auto w-[320px] text-[11px]">
          {hits.map((c) => (
            <div
              key={c.account_id}
              onMouseDown={() => {
                onPick(c.account_id);
                setOpen(false);
              }}
              className={`px-2 py-1 hover:bg-[#1a1a1a] cursor-pointer flex items-center gap-2 ${
                c.account_id === value ? "bg-[#1a1308]" : ""
              }`}
            >
              <span className="text-[#ff9900] font-mono tabular-nums min-w-[60px]">
                {c.account_id}
              </span>
              <span className="text-[#d0d0d0] flex-1 truncate">
                {c.nombre || "—"}
              </span>
              {!c.activa && (
                <span className="text-[8px] text-[#555] uppercase">inactiva</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

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
        <div className="absolute top-full left-0 mt-0.5 bg-[#0d0d0d] border border-[#2a2a2a] z-20 max-h-[200px] overflow-y-auto min-w-[260px] text-[10px]">
          {hits.map((h) => {
            const corto =
              h.ticker_corto ||
              h.ticker.split(" - ")[2] ||
              h.ticker;
            return (
              <div
                key={h.ticker}
                onMouseDown={() => onPick(corto, h.ticker)}
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
  onChangePlazo,
  onRemove,
  account,
  onExecuted,
}: {
  cfg: CardCfg;
  onChangeTicker: (corto: string, full?: string) => void;
  onChangePlazo: (plazo: "CI" | "24hs" | "48hs") => void;
  onRemove: () => void;
  account: string;
  onExecuted: () => void;
}) {
  const plazo = cfg.plazo ?? "24hs";
  const { book, status, error } = useOrderBook(
    cfg.tickerCorto,
    cfg.fullTicker,
    plazo,
  );
  const bids = book?.book?.bids ?? [];
  const offers = book?.book?.offers ?? [];
  const last = book?.metrics?.last_price ?? null;
  const close = book?.metrics?.closing_price ?? null;
  const fullTicker = book?.ticker ?? cfg.fullTicker ?? "";

  const [form, setForm] = useState<FormState>({
    side: "BUY",
    order_type: "LIMIT",
    price: "",
    size: "",
    tif: "DAY",
  });
  // Precio de salida opcional. Si tiene valor, EJECUTAR manda un bracket
  // (entrada LIMIT + salida automática al fill). Si está vacío, send_order normal.
  const [priceExit, setPriceExit] = useState<string>("");
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

    // Modo bracket: si hay priceExit, el flow cambia: entrada LIMIT +
    // salida automática al fill. NO soporta MARKET porque el bracket
    // necesita un price_entry concreto para persistir.
    const usaBracket = priceExit.trim() !== "";
    if (usaBracket) {
      if (form.order_type !== "LIMIT") {
        setResult({
          ok: false,
          msg: "Bracket requiere entrada LIMIT (no MARKET)",
        });
        return;
      }
      if (parseFloat(priceExit) <= 0) {
        setResult({ ok: false, msg: "Precio de salida inválido" });
        return;
      }
    }

    setSending(true);
    setResult(null);
    try {
      let r: Response;
      if (usaBracket) {
        r = await fetch("/api/operar/bracket", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ticker: fullTicker,
            side: form.side,
            size: parseInt(form.size, 10),
            price_entry: parseFloat(form.price),
            price_exit: parseFloat(priceExit),
            tif: form.tif,
            account,
          }),
        });
      } else {
        const body: Record<string, unknown> = {
          ticker: fullTicker,
          side: form.side,
          size: parseInt(form.size, 10),
          order_type: form.order_type,
          tif: form.tif,
          account,
        };
        if (form.order_type === "LIMIT") body.price = parseFloat(form.price);
        r = await fetch("/api/ordenes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      }
      const j = await r.json().catch(() => ({}));
      if (r.ok) {
        if (usaBracket) {
          setResult({
            ok: true,
            msg: `Bracket OK · entrada ${j.entry_cl_ord_id ?? ""} · salida @ ${priceExit}`,
          });
          setPriceExit("");
        } else {
          setResult({ ok: true, msg: `OK ${j.cl_ord_id ?? ""}` });
        }
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
    <div className="border border-[#1a1a1a] bg-[#080808] flex flex-col min-w-0 w-full">
      {/* Header */}
      <div className="flex items-center gap-1 px-2 py-1 border-b border-[#1a1a1a]">
        <TickerSearch value={cfg.tickerCorto} onPick={onChangeTicker} />
        <select
          value={plazo}
          onChange={(e) =>
            onChangePlazo(e.target.value as "CI" | "24hs" | "48hs")
          }
          className="bg-black border border-[#2a2a2a] px-1 py-0.5 text-[10px] focus:border-[#ff9900] outline-none"
          title="Plazo de liquidación (ignorado si elegiste el ticker full del autocomplete)"
        >
          <option value="CI">CI</option>
          <option value="24hs">24hs</option>
          <option value="48hs">48hs</option>
        </select>
        <div className="flex items-baseline gap-2 ml-1 flex-1 justify-end">
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
          className="ml-1 text-[#555] hover:text-[#f87171] text-[14px] leading-none"
          title="Cerrar panel"
        >
          ×
        </button>
      </div>
      {status === "subscribing" && (
        <div className="px-2 py-1 text-[9px] text-[#ffe066] border-b border-[#1a1a1a] bg-[#1a1608] flex items-center gap-2">
          <span className="inline-block w-2 h-2 rounded-full bg-[#ffe066] animate-pulse" />
          suscribiendo… el motor lo levanta en ~5s
        </div>
      )}
      {status === "error" && error && (
        <div className="px-2 py-1 text-[9px] text-[#f87171] border-b border-[#1a1a1a] bg-[#1a0d0d]">
          {error}
        </div>
      )}

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

        {/* Precio salida opcional → activa modo bracket */}
        <div className="mb-1 text-[10px]">
          <input
            value={priceExit}
            placeholder="precio salida (bracket — opcional)"
            disabled={form.order_type === "MARKET"}
            onChange={(e) => setPriceExit(e.target.value)}
            className={`w-full bg-black border px-1 py-0.5 tabular-nums focus:border-[#ff9900] outline-none disabled:opacity-40 ${
              priceExit.trim() !== ""
                ? "border-[#ff9900] text-[#ff9900]"
                : "border-[#2a2a2a]"
            }`}
            title="Cuando la entrada se llene, manda automáticamente la salida LIMIT a este precio (side opuesto, mismo size)"
          />
        </div>

        <button
          onClick={ejecutar}
          disabled={sending || !account || !fullTicker}
          className="w-full px-2 py-1 bg-[#ff9900] text-black font-bold text-[11px] tracking-wide border border-[#ff9900] hover:bg-[#ffaa20] disabled:opacity-30 disabled:cursor-not-allowed"
        >
          {sending
            ? "…"
            : priceExit.trim() !== ""
              ? `EJECUTAR BRACKET ${form.side}`
              : `EJECUTAR ${form.side}`}
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
  onCancel: (cl_ord_id: string, proprietary?: string) => Promise<void>;
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
    <div className="border border-[#1a1a1a] bg-[#080808] flex flex-col min-h-0 h-full">
      <div className="flex items-center justify-between px-2 py-1 border-b border-[#1a1a1a] shrink-0">
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

      <div className="flex-1 min-h-0 overflow-y-auto">
      {orders.length === 0 ? (
        <div className="px-2 py-3 text-[10px] text-[#555] text-center">
          Sin órdenes hoy
        </div>
      ) : (
        <table className="w-full text-[10px] font-mono tabular-nums">
          <thead className="text-[9px] text-[#666] tracking-wider bg-[#0a0a0a] sticky top-0">
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
                  <td className="px-2 py-0.5 text-[#d0d0d0]">
                    <span>{corto}</span>
                    {o.external && (
                      <span
                        className="ml-1.5 px-1 text-[8px] text-[#888] border border-[#2a2a2a] rounded align-middle"
                        title="Operada desde otra plataforma (web del broker, etc)"
                      >
                        EXT
                      </span>
                    )}
                  </td>
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
                        onClick={() => onCancel(o.cl_ord_id!, o.proprietary)}
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
  const { orders, refresh } = useOrdenesDia(account);
  const { saldo, detailed, refresh: refreshPortfolio } = usePortfolio(account);

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
    setCards((cs) => [...cs, { id: uid(), tickerCorto: "" }]);
  }

  function removeCard(id: string) {
    setCards((cs) => {
      // Piso de 4 slots: si estamos en el mínimo, el × limpia el ticker
      // (deja el slot vacío) en vez de eliminar el panel.
      if (cs.length <= MIN_CARDS) {
        return cs.map((c) =>
          c.id === id ? { ...c, tickerCorto: "", fullTicker: undefined } : c,
        );
      }
      return cs.filter((c) => c.id !== id);
    });
  }

  function changeTicker(id: string, corto: string, full?: string) {
    setCards((cs) =>
      cs.map((c) =>
        c.id === id ? { ...c, tickerCorto: corto, fullTicker: full } : c,
      ),
    );
  }

  function changePlazo(id: string, plazo: "CI" | "24hs" | "48hs") {
    setCards((cs) =>
      cs.map((c) => {
        if (c.id !== id) return c;
        // Si tenemos fullTicker guardado, reescribimos el último segmento.
        // Formato ROFEX: "MERV - XMEV - SHORT - PLAZO". Así no hay que volver
        // a pasar por el autocomplete cuando solo cambia el plazo.
        let newFull = c.fullTicker;
        if (newFull) {
          const parts = newFull.split(" - ");
          if (parts.length === 4) {
            parts[3] = plazo;
            newFull = parts.join(" - ");
          }
        }
        return { ...c, plazo, fullTicker: newFull };
      }),
    );
  }

  async function cancelOrder(cl_ord_id: string, proprietary?: string) {
    try {
      const qs = proprietary
        ? `?proprietary=${encodeURIComponent(proprietary)}`
        : "";
      const r = await fetch(
        `/api/ordenes/${encodeURIComponent(cl_ord_id)}${qs}`,
        { method: "DELETE" },
      );
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j.ok === false) {
        alert(`Cancelar falló: ${j.error || j.detail || `HTTP ${r.status}`}`);
      }
    } catch (e) {
      alert(`Cancelar falló: ${e instanceof Error ? e.message : "error"}`);
    } finally {
      void refresh();
    }
  }

  return (
    <div className="h-full flex flex-col gap-2 p-2 bg-black min-h-0 overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-2 py-1 border border-[#1a1a1a] bg-[#080808] shrink-0">
        <span className="text-[10px] tracking-wider text-[#888]">CUENTA</span>
        <AccountSearch
          value={account}
          cuentas={cuentas}
          onPick={(id) => setAccount(id)}
        />
        <button
          onClick={addCard}
          className="ml-auto px-2 py-0.5 text-[10px] font-semibold tracking-wide border border-[#ff9900] text-[#ff9900] hover:bg-[#ff9900] hover:text-black"
        >
          + AGREGAR PANEL
        </button>
      </div>

      {/* Split 50/50: izquierda = order books, derecha = portfolio + órdenes */}
      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-2 gap-2">
        {/* Izquierda (50%): grid 2×2 de order books, scroll si desborda */}
        <div className="min-h-0 overflow-y-auto grid grid-cols-1 xl:grid-cols-2 gap-2 auto-rows-min content-start">
          {cards.map((c) => (
            <OperarCard
              key={c.id}
              cfg={c}
              account={account}
              onChangeTicker={(corto, full) => changeTicker(c.id, corto, full)}
              onChangePlazo={(plazo) => changePlazo(c.id, plazo)}
              onRemove={() => removeCard(c.id)}
              onExecuted={refresh}
            />
          ))}
        </div>

        {/* Derecha (50%): portfolio arriba (50%) + órdenes abajo (50%) */}
        <div className="min-h-0 grid grid-rows-2 gap-2">
          <div className="min-h-0 overflow-hidden">
            <PortfolioPanel
              account={account}
              accountNombre={
                cuentas.find((c) => c.account_id === account)?.nombre ?? null
              }
              saldo={saldo}
              detailed={detailed}
              refresh={refreshPortfolio}
            />
          </div>
          <div className="min-h-0 overflow-hidden">
            <OrderManagement
              orders={orders}
              refresh={refresh}
              onCancel={cancelOrder}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
