"use client";

import { useCallback, useEffect, useState } from "react";
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

interface MepCot {
  rueda: "CI" | "24hs";
  al30: { price: number; ts: string } | null;
  al30d: { price: number; ts: string } | null;
  mep_implicito: number | null;
}

interface FormState {
  ticker: string;        // ROFEX full (lo setea el click en el book)
  ticker_corto: string;  // lo que el user ve
  side: "BUY" | "SELL";
  order_type: "LIMIT" | "MARKET";
  price: string;
  size: string;
  tif: "DAY" | "IOC" | "FOK" | "GTC";
  account: string;
}

// ─── Hooks de polling ────────────────────────────────────────────────────────

function useOrderBook(tickerCorto: string, pollMs = 1000) {
  const [book, setBook] = useState<OrderBookResp | null>(null);
  useEffect(() => {
    let alive = true;
    async function fetchBook() {
      try {
        const r = await fetch(
          `/api/operar/order-book?ticker=${encodeURIComponent(tickerCorto)}`,
          { cache: "no-store" },
        );
        if (alive && r.ok) setBook(await r.json());
      } catch {
        // silently retry next tick
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

function useMep(rueda: "CI" | "24hs", pollMs = 5000) {
  const [cot, setCot] = useState<MepCot | null>(null);
  useEffect(() => {
    let alive = true;
    async function fetchCot() {
      try {
        const r = await fetch(`/api/operativa/mep/cotizacion?rueda=${rueda}`, {
          cache: "no-store",
        });
        if (alive && r.ok) setCot(await r.json());
      } catch {
        // ignore
      }
    }
    fetchCot();
    const id = setInterval(fetchCot, pollMs);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [rueda, pollMs]);
  return cot;
}

// ─── Componentes ─────────────────────────────────────────────────────────────

function MepPanel() {
  const [rueda, setRueda] = useState<"CI" | "24hs">("CI");
  const cot = useMep(rueda);
  const mep = cot?.mep_implicito ?? null;

  return (
    <div className="border border-[#1a1a1a] bg-[#080808] p-2 flex flex-col min-h-[180px]">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] tracking-wider text-[#888]">
          DÓLAR MEP {rueda}
        </span>
        <div className="flex gap-0.5">
          {(["CI", "24hs"] as const).map((r) => (
            <button
              key={r}
              onClick={() => setRueda(r)}
              className={`px-1.5 py-0 text-[9px] border transition-colors ${
                r === rueda
                  ? "bg-[#ff9900] text-black border-[#ff9900]"
                  : "bg-transparent text-[#666] border-[#2a2a2a] hover:text-[#ff9900]"
              }`}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      <div className="text-[28px] font-bold text-[#ff9900] tabular-nums leading-none">
        {mep !== null ? `$${mep.toFixed(2)}` : "—"}
      </div>

      <div className="mt-2 text-[10px] text-[#888] grid grid-cols-2 gap-x-2 gap-y-0.5">
        <span>AL30</span>
        <span className="tabular-nums text-right">
          {cot?.al30 ? `$${cot.al30.price.toFixed(2)}` : "—"}
        </span>
        <span>AL30D</span>
        <span className="tabular-nums text-right">
          {cot?.al30d ? `US$${cot.al30d.price.toFixed(2)}` : "—"}
        </span>
      </div>

      <div className="mt-auto text-[9px] text-[#555]">
        {cot?.al30?.ts && `last ${fmtTime(cot.al30.ts)}`}
      </div>
    </div>
  );
}

function BookPanel({
  tickerCorto,
  onPickPrice,
}: {
  tickerCorto: string;
  onPickPrice: (
    side: "BUY" | "SELL",
    price: number,
    size: number,
    fullTicker: string,
  ) => void;
}) {
  const book = useOrderBook(tickerCorto);
  const bids = book?.book?.bids ?? [];
  const offers = book?.book?.offers ?? [];
  const last = book?.metrics?.last_price ?? null;
  const close = book?.metrics?.closing_price ?? null;
  const fullTicker = book?.ticker ?? "";

  return (
    <div className="border border-[#1a1a1a] bg-[#080808] p-2 flex flex-col min-h-[180px]">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[12px] tracking-wide text-[#d0d0d0] font-semibold">
          {tickerCorto}
        </span>
        <span className="text-[10px] text-[#888]">
          last{" "}
          <span className="text-[#ff9900] tabular-nums">
            {last !== null ? last.toFixed(2) : "—"}
          </span>
          {close !== null && (
            <span className="text-[#555] ml-2">prev {close.toFixed(2)}</span>
          )}
        </span>
      </div>

      <table className="w-full text-[11px] font-mono tabular-nums">
        <thead className="text-[9px] text-[#666] tracking-wider">
          <tr>
            <th className="text-left px-1 py-0.5">BID SIZE</th>
            <th className="text-right px-1 py-0.5">BID</th>
            <th className="text-left px-1 py-0.5">ASK</th>
            <th className="text-right px-1 py-0.5">ASK SIZE</th>
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
                  onClick={() =>
                    b && fullTicker && onPickPrice("SELL", b.price, b.size, fullTicker)
                  }
                  title={b ? "Click: vender a este bid" : ""}
                >
                  {b ? b.price.toFixed(2) : "—"}
                </td>
                <td
                  className={`px-1 py-0.5 ${
                    a
                      ? "text-[#ff7f7f] cursor-pointer hover:bg-[#2d0d0d]"
                      : "text-[#555]"
                  }`}
                  onClick={() =>
                    a && fullTicker && onPickPrice("BUY", a.price, a.size, fullTicker)
                  }
                  title={a ? "Click: comprar a este ask" : ""}
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

      <div className="mt-auto pt-1 text-[9px] text-[#555]">
        {book?.updated_at ? `last ${fmtTime(book.updated_at)}` : ""}
      </div>
    </div>
  );
}

function LocalField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[8px] tracking-wider text-[#888]">{label}</span>
      {children}
    </div>
  );
}

function OrderFormPanel({
  form,
  setForm,
  cuentas,
}: {
  form: FormState;
  setForm: (f: FormState) => void;
  cuentas: CuentaDescubierta[];
}) {
  const [sending, setSending] = useState(false);
  const [lastResult, setLastResult] = useState<{
    ok: boolean;
    msg: string;
  } | null>(null);

  function patch(p: Partial<FormState>) {
    setForm({ ...form, ...p });
  }

  async function ejecutar() {
    if (!form.ticker) {
      setLastResult({
        ok: false,
        msg: "Click una row del book para fijar el ticker",
      });
      return;
    }
    if (!form.size || parseInt(form.size, 10) <= 0) {
      setLastResult({ ok: false, msg: "Nominales > 0" });
      return;
    }
    if (form.order_type === "LIMIT" && !form.price) {
      setLastResult({ ok: false, msg: "Falta precio para LIMIT" });
      return;
    }
    if (!form.account) {
      setLastResult({ ok: false, msg: "Elegí cuenta" });
      return;
    }
    setSending(true);
    setLastResult(null);
    try {
      const body: Record<string, unknown> = {
        ticker: form.ticker,
        side: form.side,
        size: parseInt(form.size, 10),
        order_type: form.order_type,
        tif: form.tif,
        account: form.account,
      };
      if (form.order_type === "LIMIT") body.price = parseFloat(form.price);
      const r = await fetch("/api/ordenes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await r.json().catch(() => ({}));
      if (r.ok) {
        setLastResult({ ok: true, msg: `OK ${j.cl_ord_id ?? ""}` });
      } else {
        setLastResult({
          ok: false,
          msg: j.detail ?? `HTTP ${r.status}`,
        });
      }
    } catch (e) {
      setLastResult({
        ok: false,
        msg: e instanceof Error ? e.message : "error",
      });
    } finally {
      setSending(false);
      setTimeout(() => setLastResult(null), 8000);
    }
  }

  const sideBg = form.side === "BUY" ? "bg-[#0d1d0d]" : "bg-[#1d0d0d]";

  return (
    <div className={`border border-[#1a1a1a] p-2 ${sideBg} shrink-0`}>
      <div className="flex items-end gap-2 flex-wrap">
        <LocalField label="TICKER">
          <input
            value={form.ticker_corto}
            onChange={(e) =>
              patch({ ticker_corto: e.target.value.toUpperCase(), ticker: "" })
            }
            placeholder="(click book)"
            className="bg-black border border-[#2a2a2a] px-2 py-1 text-[12px] w-[110px] font-mono focus:border-[#ff9900] outline-none"
          />
        </LocalField>
        <LocalField label="LADO">
          <div className="flex gap-0.5">
            {(["BUY", "SELL"] as const).map((s) => (
              <button
                key={s}
                onClick={() => patch({ side: s })}
                className={`px-2 py-1 text-[11px] font-semibold border ${
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
        </LocalField>
        <LocalField label="TIPO">
          <select
            value={form.order_type}
            onChange={(e) =>
              patch({ order_type: e.target.value as "LIMIT" | "MARKET" })
            }
            className="bg-black border border-[#2a2a2a] px-2 py-1 text-[11px] focus:border-[#ff9900] outline-none"
          >
            <option value="LIMIT">LIMIT</option>
            <option value="MARKET">MARKET</option>
          </select>
        </LocalField>
        <LocalField label="PRECIO">
          <input
            value={form.price}
            disabled={form.order_type === "MARKET"}
            onChange={(e) => patch({ price: e.target.value })}
            className="bg-black border border-[#2a2a2a] px-2 py-1 text-[11px] w-[80px] tabular-nums focus:border-[#ff9900] outline-none disabled:opacity-40"
          />
        </LocalField>
        <LocalField label="NOMINALES">
          <input
            value={form.size}
            onChange={(e) => patch({ size: e.target.value })}
            className="bg-black border border-[#2a2a2a] px-2 py-1 text-[11px] w-[90px] tabular-nums focus:border-[#ff9900] outline-none"
          />
        </LocalField>
        <LocalField label="TIF">
          <select
            value={form.tif}
            onChange={(e) =>
              patch({ tif: e.target.value as FormState["tif"] })
            }
            className="bg-black border border-[#2a2a2a] px-2 py-1 text-[11px] focus:border-[#ff9900] outline-none"
          >
            <option value="DAY">DAY</option>
            <option value="IOC">IOC</option>
            <option value="FOK">FOK</option>
            <option value="GTC">GTC</option>
          </select>
        </LocalField>
        <LocalField label="CUENTA">
          <select
            value={form.account}
            onChange={(e) => patch({ account: e.target.value })}
            className="bg-black border border-[#2a2a2a] px-2 py-1 text-[11px] w-[100px] focus:border-[#ff9900] outline-none"
          >
            <option value="">— elegir —</option>
            {cuentas.map((c) => (
              <option key={c.account_id} value={c.account_id}>
                {c.account_id}
              </option>
            ))}
          </select>
        </LocalField>
        <button
          onClick={ejecutar}
          disabled={sending || !form.account || !form.ticker}
          className="px-4 py-1 bg-[#ff9900] text-black font-bold text-[12px] tracking-wide border border-[#ff9900] hover:bg-[#ffaa20] disabled:opacity-30 disabled:cursor-not-allowed"
        >
          {sending ? "…" : "EJECUTAR"}
        </button>
        {lastResult && (
          <span
            className={`text-[10px] ${
              lastResult.ok ? "text-[#4ade80]" : "text-[#f87171]"
            }`}
          >
            {lastResult.msg}
          </span>
        )}
      </div>
      {!form.ticker && form.ticker_corto && (
        <div className="mt-1 text-[9px] text-[#888]">
          Hacé click en una row del book para fijar el ticker exacto antes de
          ejecutar.
        </div>
      )}
    </div>
  );
}

// ─── Vista principal ─────────────────────────────────────────────────────────

const ACCOUNT_LS_KEY = "trd-fx-operar-account";

export function OperarDashboardView() {
  const [cuentas, setCuentas] = useState<CuentaDescubierta[]>([]);
  const [form, setForm] = useState<FormState>({
    ticker: "",
    ticker_corto: "",
    side: "BUY",
    order_type: "LIMIT",
    price: "",
    size: "",
    tif: "DAY",
    account: ACCOUNT_DEFAULT_FALLBACK,
  });

  // Cuentas 1 vez al montar + restore de LS (igual patron que dolar-mep-shell).
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
          setForm((f) => ({ ...f, account: persisted }));
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

  // Persist account elegida.
  useEffect(() => {
    if (form.account && typeof window !== "undefined") {
      window.localStorage.setItem(ACCOUNT_LS_KEY, form.account);
    }
  }, [form.account]);

  const onPickPrice = useCallback(
    (
      side: "BUY" | "SELL",
      price: number,
      size: number,
      fullTicker: string,
    ) => {
      // Full ticker formato `MERV - XMEV - <CORTO> - <PLAZO>`.
      const corto = fullTicker.split(" - ")[2] ?? fullTicker;
      setForm((prev) => ({
        ...prev,
        ticker: fullTicker,
        ticker_corto: corto,
        side,
        order_type: "LIMIT",
        price: price.toFixed(2),
        size: String(size),
      }));
    },
    [],
  );

  return (
    <div className="h-full flex flex-col gap-2 p-2 bg-black min-h-0 overflow-auto">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
        <MepPanel />
        <BookPanel tickerCorto="AL30" onPickPrice={onPickPrice} />
        <BookPanel tickerCorto="GD30" onPickPrice={onPickPrice} />
      </div>
      <OrderFormPanel form={form} setForm={setForm} cuentas={cuentas} />
    </div>
  );
}
