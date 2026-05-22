"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ACCOUNT_DEFAULT_FALLBACK,
  CuentaDescubierta,
  fmtTime,
} from "./dolar-mep-shared";
import { AccountSearch } from "./operar-dashboard-view";

// ─── Tipos ───────────────────────────────────────────────────────────────────

interface FciHit {
  ticker: string;
  underlying?: string | null;
  currency?: string | null;
  settl_type?: number | string | null;
  plazo?: string | null;
}

interface FciQuote {
  ticker: string;
  underlying?: string | null;
  currency?: string | null;
  cuota: number | null;
  size_precision?: number | null;
  min_trade_vol?: number | null;
  settl_type?: number | string | null;
  plazo?: string | null;
}

interface OrderDia {
  cl_ord_id?: string;
  ticker?: string;
  side?: "BUY" | "SELL";
  size?: number;
  price?: number;
  status?: string;
  cum_qty?: number;
  account?: string;
  created_at?: string;
  reject_reason?: string | null;
  kind?: string;
  op?: string;
}

type Side = "BUY" | "SELL";
type AmountMode = "importe" | "cuotapartes";

const ACCOUNT_LS_KEY = "trd-fx-operar-account";

// ─── Buscador de FCI ───────────────────────────────────────────────────────

function FciSearch({ onPick }: { onPick: (hit: FciHit) => void }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [hits, setHits] = useState<FciHit[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || q.trim().length < 2) {
      setHits([]);
      return;
    }
    let alive = true;
    setLoading(true);
    const id = setTimeout(async () => {
      try {
        const r = await fetch(
          `/api/ordenes/fci/search?q=${encodeURIComponent(q.trim())}&limit=40`,
          { cache: "no-store" },
        );
        if (alive && r.ok) setHits(await r.json());
      } catch {
        // ignore
      } finally {
        if (alive) setLoading(false);
      }
    }, 250);
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
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 200)}
        placeholder="buscar FCI por nombre…"
        className="bg-black border border-[#2a2a2a] px-2 py-1 text-[12px] w-full focus:border-[#ff9900] outline-none"
      />
      {open && (q.trim().length >= 2) && (
        <div className="absolute top-full left-0 right-0 mt-0.5 bg-[#0d0d0d] border border-[#2a2a2a] z-20 max-h-[320px] overflow-y-auto text-[11px]">
          {loading && hits.length === 0 ? (
            <div className="px-2 py-2 text-[#666]">buscando…</div>
          ) : hits.length === 0 ? (
            <div className="px-2 py-2 text-[#666]">sin resultados</div>
          ) : (
            hits.map((h) => (
              <div
                key={h.ticker}
                onMouseDown={() => {
                  onPick(h);
                  setQ("");
                  setOpen(false);
                }}
                className="px-2 py-1 hover:bg-[#1a1a1a] cursor-pointer flex items-center gap-2"
              >
                <span className="text-[#d0d0d0] flex-1 truncate" title={h.ticker}>
                  {h.ticker}
                </span>
                {h.underlying && (
                  <span className="text-[8px] text-[#666] uppercase">{h.underlying}</span>
                )}
                <span className="text-[9px] text-[#ff9900] w-9 text-right">
                  {h.currency ?? ""}
                </span>
                <span className="text-[9px] text-[#888] w-10 text-right">
                  {h.plazo ?? ""}
                </span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ─── Órdenes FCI del día ─────────────────────────────────────────────────────

function useFciOrders(account: string, pollMs = 5000) {
  const [orders, setOrders] = useState<OrderDia[]>([]);
  const fetchNow = useCallback(async () => {
    if (!account) {
      setOrders([]);
      return;
    }
    try {
      const r = await fetch(`/api/ordenes/dia?account=${encodeURIComponent(account)}`, {
        cache: "no-store",
      });
      if (r.ok) {
        const all = (await r.json()) as OrderDia[];
        setOrders(all.filter((o) => o.kind === "FCI"));
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

  return { orders, refresh: fetchNow };
}

function statusColor(s?: string): string {
  if (!s) return "text-[#888]";
  if (s === "FILLED") return "text-[#7fff7f]";
  if (s === "REJECTED" || s === "CANCELLED" || s === "EXPIRED") return "text-[#ff7f7f]";
  if (s === "NEW" || s === "PARTIALLY_FILLED" || s === "PENDING_NEW") return "text-[#ffe066]";
  return "text-white";
}

function fmtNum(n: number | null | undefined, dec = 4): string {
  if (n === null || n === undefined) return "—";
  return n.toLocaleString("es-AR", { maximumFractionDigits: dec });
}

// ─── Vista principal ─────────────────────────────────────────────────────────

export function OperarFciView() {
  const [cuentas, setCuentas] = useState<CuentaDescubierta[]>([]);
  const [account, setAccount] = useState<string>(ACCOUNT_DEFAULT_FALLBACK);

  const [fci, setFci] = useState<FciQuote | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [side, setSide] = useState<Side>("BUY");
  const [amountMode, setAmountMode] = useState<AmountMode>("importe");
  const [amount, setAmount] = useState<string>("");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);

  const { orders, refresh: refreshOrders } = useFciOrders(account);

  // Cuentas + restore del LS (compartido con el dashboard de Trading).
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await fetch("/api/risk/account/listado", { cache: "no-store" });
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
    })();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (account && typeof window !== "undefined") {
      window.localStorage.setItem(ACCOUNT_LS_KEY, account);
    }
  }, [account]);

  // Refrescar la cuota del fondo seleccionado (cambia ~diario, refresco suave).
  const fetchQuote = useCallback(async (ticker: string) => {
    setQuoteLoading(true);
    try {
      const r = await fetch(`/api/ordenes/fci/quote?ticker=${encodeURIComponent(ticker)}`, {
        cache: "no-store",
      });
      if (r.ok) setFci(await r.json());
    } catch {
      // ignore
    } finally {
      setQuoteLoading(false);
    }
  }, []);

  const selectedTicker = fci?.ticker;
  useEffect(() => {
    if (!selectedTicker) return;
    const id = setInterval(() => void fetchQuote(selectedTicker), 20000);
    return () => clearInterval(id);
  }, [selectedTicker, fetchQuote]);

  const cuota = fci?.cuota ?? null;
  const sizePrecision = fci?.size_precision ?? 4;
  const ccy = fci?.currency ?? "";

  // Conversión live importe ↔ cuotapartes.
  const amountNum = parseFloat(amount.replace(",", "."));
  const conversion = useMemo(() => {
    if (!cuota || !isFinite(amountNum) || amountNum <= 0) return null;
    if (amountMode === "importe") {
      const cuotapartes = +(amountNum / cuota).toFixed(sizePrecision ?? 4);
      return { cuotapartes, importe: amountNum };
    }
    const importe = +(amountNum * cuota).toFixed(2);
    return { cuotapartes: amountNum, importe };
  }, [amountMode, amountNum, cuota, sizePrecision]);

  async function ejecutar() {
    if (!fci) {
      setResult({ ok: false, msg: "Elegí un FCI" });
      return;
    }
    if (!account) {
      setResult({ ok: false, msg: "Elegí una cuenta arriba" });
      return;
    }
    if (!isFinite(amountNum) || amountNum <= 0) {
      setResult({ ok: false, msg: "Monto inválido" });
      return;
    }
    if (!cuota || cuota <= 0) {
      setResult({ ok: false, msg: "Sin cuota operable (¿mercado cerrado?)" });
      return;
    }
    setSending(true);
    setResult(null);
    try {
      const r = await fetch("/api/ordenes/fci", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ticker: fci.ticker,
          side,
          amount: amountNum,
          amount_mode: amountMode,
          account,
        }),
      });
      const j = await r.json().catch(() => ({}));
      if (r.ok && j.ok) {
        setResult({
          ok: true,
          msg: `${j.op ?? (side === "BUY" ? "SUSCRIPCIÓN" : "RESCATE")} OK · ${fmtNum(
            j.cuotapartes,
            sizePrecision ?? 4,
          )} cuotapartes @ ${fmtNum(j.cuota, 6)} · ${j.cl_ord_id ?? ""}`,
        });
        setAmount("");
        refreshOrders();
      } else {
        setResult({ ok: false, msg: j.error ?? j.detail ?? `HTTP ${r.status}` });
      }
    } catch (e) {
      setResult({ ok: false, msg: e instanceof Error ? e.message : "error" });
    } finally {
      setSending(false);
      setTimeout(() => setResult(null), 10000);
    }
  }

  const isBuy = side === "BUY";

  return (
    <div className="h-full flex flex-col gap-2 p-2 bg-black min-h-0 overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-2 py-1 border border-[#1a1a1a] bg-[#080808] shrink-0">
        <span className="text-[10px] tracking-wider text-[#888]">CUENTA</span>
        <AccountSearch value={account} cuentas={cuentas} onPick={(id) => setAccount(id)} />
        <span className="ml-auto text-[9px] text-[#555] tracking-wide">
          FCI · suscripción / rescate · orden = cuotapartes @ cuota del día
        </span>
      </div>

      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-2 gap-2">
        {/* Panel de operación */}
        <div className="border border-[#1a1a1a] bg-[#080808] flex flex-col min-h-0 overflow-y-auto">
          <div className="px-2 py-1 border-b border-[#1a1a1a] text-[11px] tracking-wide text-[#d0d0d0] font-semibold">
            OPERAR FCI
          </div>
          <div className="p-3 flex flex-col gap-3">
            {/* Buscador */}
            <div>
              <span className="text-[9px] tracking-wider text-[#888]">FONDO</span>
              <div className="mt-1">
                <FciSearch
                  onPick={(h) => {
                    setFci({
                      ticker: h.ticker,
                      underlying: h.underlying,
                      currency: h.currency,
                      cuota: null,
                      settl_type: h.settl_type,
                      plazo: h.plazo,
                    });
                    setResult(null);
                    void fetchQuote(h.ticker);
                  }}
                />
              </div>
            </div>

            {/* Fondo seleccionado */}
            {fci && (
              <div className="border border-[#1a1a1a] bg-[#0a0a0a] p-2 flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <span className="text-[#ff9900] font-semibold text-[12px] flex-1 truncate" title={fci.ticker}>
                    {fci.ticker}
                  </span>
                  <button
                    onClick={() => fci && fetchQuote(fci.ticker)}
                    className="text-[#888] hover:text-[#ff9900] text-[12px] leading-none"
                    title="Refrescar cuota"
                  >
                    ↻
                  </button>
                </div>
                <div className="grid grid-cols-4 gap-2 text-[10px]">
                  <Meta label="TIPO" value={fci.underlying ?? "—"} />
                  <Meta label="MONEDA" value={ccy || "—"} />
                  <Meta label="PLAZO" value={fci.plazo ?? "—"} />
                  <Meta
                    label="CUOTA"
                    value={quoteLoading && cuota === null ? "…" : fmtNum(cuota, 6)}
                    accent
                  />
                </div>
              </div>
            )}

            {/* SUSCRIBIR / RESCATAR */}
            <div className="flex gap-0.5">
              {(["BUY", "SELL"] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setSide(s)}
                  className={`flex-1 px-2 py-1 text-[11px] font-bold border ${
                    s === side
                      ? s === "BUY"
                        ? "bg-[#4ade80] text-black border-[#4ade80]"
                        : "bg-[#f87171] text-black border-[#f87171]"
                      : "bg-transparent text-[#888] border-[#2a2a2a]"
                  }`}
                >
                  {s === "BUY" ? "SUSCRIBIR" : "RESCATAR"}
                </button>
              ))}
            </div>

            {/* Monto: importe $ / cuotapartes */}
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[9px] tracking-wider text-[#888]">MONTO</span>
                <div className="flex gap-0.5 ml-auto">
                  {(["importe", "cuotapartes"] as const).map((m) => (
                    <button
                      key={m}
                      onClick={() => setAmountMode(m)}
                      className={`px-2 py-0.5 text-[9px] font-semibold border ${
                        m === amountMode
                          ? "bg-[#ff9900] text-black border-[#ff9900]"
                          : "bg-transparent text-[#888] border-[#2a2a2a]"
                      }`}
                    >
                      {m === "importe" ? `$ ${ccy || "IMPORTE"}` : "CUOTAPARTES"}
                    </button>
                  ))}
                </div>
              </div>
              <input
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder={amountMode === "importe" ? `importe en ${ccy || "$"}` : "cuotapartes"}
                inputMode="decimal"
                className="bg-black border border-[#2a2a2a] px-2 py-1 text-[12px] w-full tabular-nums focus:border-[#ff9900] outline-none"
              />
              {/* Conversión live */}
              <div className="mt-1 text-[10px] text-[#888] min-h-[14px]">
                {conversion ? (
                  amountMode === "importe" ? (
                    <>
                      ≈ <span className="text-[#d0d0d0] tabular-nums">{fmtNum(conversion.cuotapartes, sizePrecision ?? 4)}</span> cuotapartes
                    </>
                  ) : (
                    <>
                      ≈ <span className="text-[#d0d0d0] tabular-nums">{ccy} {fmtNum(conversion.importe, 2)}</span> importe
                    </>
                  )
                ) : cuota === null && fci ? (
                  "sin cuota — no se puede convertir"
                ) : (
                  ""
                )}
              </div>
            </div>

            {/* Ejecutar */}
            <button
              onClick={ejecutar}
              disabled={sending || !fci || !account || !cuota}
              className={`w-full px-2 py-1.5 font-bold text-[12px] tracking-wide border disabled:opacity-30 disabled:cursor-not-allowed ${
                isBuy
                  ? "bg-[#4ade80] text-black border-[#4ade80] hover:bg-[#5eea90]"
                  : "bg-[#f87171] text-black border-[#f87171] hover:bg-[#ff8585]"
              }`}
            >
              {sending ? "…" : isBuy ? "SUSCRIBIR" : "RESCATAR"}
            </button>

            {result && (
              <div className={`text-[10px] ${result.ok ? "text-[#4ade80]" : "text-[#f87171]"}`}>
                {result.msg}
              </div>
            )}
          </div>
        </div>

        {/* Órdenes FCI del día */}
        <div className="border border-[#1a1a1a] bg-[#080808] flex flex-col min-h-0">
          <div className="flex items-center justify-between px-2 py-1 border-b border-[#1a1a1a] shrink-0">
            <span className="text-[11px] tracking-wide text-[#d0d0d0] font-semibold">
              ÓRDENES FCI DEL DÍA
            </span>
            <button
              onClick={refreshOrders}
              className="text-[#888] hover:text-[#ff9900] text-[12px] leading-none"
              title="Refrescar"
            >
              ↻
            </button>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto">
            {orders.length === 0 ? (
              <div className="px-2 py-3 text-[10px] text-[#555] text-center">Sin órdenes FCI hoy</div>
            ) : (
              <table className="w-full text-[10px] font-mono tabular-nums">
                <thead className="text-[9px] text-[#666] tracking-wider bg-[#0a0a0a] sticky top-0">
                  <tr>
                    <th className="text-left px-2 py-1">HORA</th>
                    <th className="text-left px-2 py-1">FONDO</th>
                    <th className="text-left px-2 py-1">OP</th>
                    <th className="text-right px-2 py-1">CUOTAP.</th>
                    <th className="text-right px-2 py-1">CUOTA</th>
                    <th className="text-left px-2 py-1">STATUS</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((o) => (
                    <tr key={o.cl_ord_id ?? Math.random()} className="border-t border-[#101010] hover:bg-[#0d0d0d]">
                      <td className="px-2 py-0.5 text-[#888]">
                        {o.created_at ? fmtTime(o.created_at) : "—"}
                      </td>
                      <td className="px-2 py-0.5 text-[#d0d0d0] max-w-[160px] truncate" title={o.ticker}>
                        {o.ticker ?? "—"}
                      </td>
                      <td
                        className={`px-2 py-0.5 font-semibold ${
                          o.op === "SUSCRIPCION" || o.side === "BUY" ? "text-[#7fff7f]" : "text-[#ff7f7f]"
                        }`}
                      >
                        {o.op === "SUSCRIPCION" ? "SUSC" : o.op === "RESCATE" ? "RESC" : o.side ?? "—"}
                      </td>
                      <td className="px-2 py-0.5 text-right text-[#d0d0d0]">{fmtNum(o.size, 4)}</td>
                      <td className="px-2 py-0.5 text-right text-[#d0d0d0]">{fmtNum(o.price, 6)}</td>
                      <td className={`px-2 py-0.5 ${statusColor(o.status)}`}>
                        {o.status ?? "—"}
                        {o.reject_reason && (
                          <span className="text-[#888] ml-1 truncate inline-block max-w-[120px]" title={o.reject_reason}>
                            ({o.reject_reason})
                          </span>
                        )}
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

function Meta({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex flex-col gap-0.5 leading-tight">
      <span className="text-[8px] tracking-wider text-[#666]">{label}</span>
      <span className={`text-[11px] font-semibold tabular-nums ${accent ? "text-[#ff9900]" : "text-[#d0d0d0]"}`}>
        {value}
      </span>
    </div>
  );
}
