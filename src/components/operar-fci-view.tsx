"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ACCOUNT_DEFAULT_FALLBACK, CuentaDescubierta } from "./dolar-mep-shared";
import {
  AccountSearch,
  OrderManagement,
  PortfolioPanel,
  usePortfolio,
  useOrdenesDia,
} from "./operar-dashboard-view";

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
      {open && q.trim().length >= 2 && (
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
                <span className="text-[9px] text-[#888] w-10 text-right">{h.plazo ?? ""}</span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function fmtNum(n: number | null | undefined, dec = 4): string {
  if (n === null || n === undefined) return "—";
  return n.toLocaleString("es-AR", { maximumFractionDigits: dec });
}

// ─── Panel de operación FCI (lado izquierdo) ─────────────────────────────────

function FciOperatePanel({
  account,
  onExecuted,
}: {
  account: string;
  onExecuted: () => void;
}) {
  const [fci, setFci] = useState<FciQuote | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [side, setSide] = useState<Side>("BUY");
  const [amountMode, setAmountMode] = useState<AmountMode>("importe");
  const [amount, setAmount] = useState<string>("");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);

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

  // Refresco suave de la cuota del fondo elegido (cambia ~diario).
  const selectedTicker = fci?.ticker;
  useEffect(() => {
    if (!selectedTicker) return;
    const id = setInterval(() => void fetchQuote(selectedTicker), 20000);
    return () => clearInterval(id);
  }, [selectedTicker, fetchQuote]);

  const cuota = fci?.cuota ?? null;
  const sizePrecision = fci?.size_precision ?? 4;
  const ccy = fci?.currency ?? "";

  const amountNum = parseFloat(amount.replace(",", "."));
  const conversion = useMemo(() => {
    if (!cuota || !isFinite(amountNum) || amountNum <= 0) return null;
    if (amountMode === "importe") {
      return { cuotapartes: +(amountNum / cuota).toFixed(sizePrecision ?? 4), importe: amountNum };
    }
    return { cuotapartes: amountNum, importe: +(amountNum * cuota).toFixed(2) };
  }, [amountMode, amountNum, cuota, sizePrecision]);

  async function ejecutar() {
    if (!fci) return setResult({ ok: false, msg: "Elegí un FCI" });
    if (!account) return setResult({ ok: false, msg: "Elegí una cuenta arriba" });
    if (!isFinite(amountNum) || amountNum <= 0) return setResult({ ok: false, msg: "Monto inválido" });
    if (!cuota || cuota <= 0) return setResult({ ok: false, msg: "Sin cuota operable (¿mercado cerrado?)" });

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
        onExecuted();
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
    <div className="border border-[#1a1a1a] bg-[#080808] flex flex-col min-h-0 overflow-y-auto">
      <div className="px-2 py-1 border-b border-[#1a1a1a] text-[11px] tracking-wide text-[#d0d0d0] font-semibold shrink-0">
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
              <span
                className="text-[#ff9900] font-semibold text-[12px] flex-1 truncate"
                title={fci.ticker}
              >
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

        {/* Monto */}
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
          <div className="mt-1 text-[10px] text-[#888] min-h-[14px]">
            {conversion ? (
              amountMode === "importe" ? (
                <>
                  ≈{" "}
                  <span className="text-[#d0d0d0] tabular-nums">
                    {fmtNum(conversion.cuotapartes, sizePrecision ?? 4)}
                  </span>{" "}
                  cuotapartes
                </>
              ) : (
                <>
                  ≈{" "}
                  <span className="text-[#d0d0d0] tabular-nums">
                    {ccy} {fmtNum(conversion.importe, 2)}
                  </span>{" "}
                  importe
                </>
              )
            ) : cuota === null && fci ? (
              "sin cuota — no se puede convertir"
            ) : (
              ""
            )}
          </div>
        </div>

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
  );
}

function Meta({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex flex-col gap-0.5 leading-tight">
      <span className="text-[8px] tracking-wider text-[#666]">{label}</span>
      <span
        className={`text-[11px] font-semibold tabular-nums ${
          accent ? "text-[#ff9900]" : "text-[#d0d0d0]"
        }`}
      >
        {value}
      </span>
    </div>
  );
}

// ─── Vista principal — espejo del DASHBOARD ──────────────────────────────────
// Izquierda: panel FCI. Derecha: portfolio (arriba) + órdenes del día (abajo),
// reusando los MISMOS componentes que el dashboard de assets.

export function OperarFciView() {
  const [cuentas, setCuentas] = useState<CuentaDescubierta[]>([]);
  const [account, setAccount] = useState<string>(ACCOUNT_DEFAULT_FALLBACK);

  const { orders, refresh } = useOrdenesDia(account);
  const { saldo, detailed, refresh: refreshPortfolio } = usePortfolio(account);

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
          typeof window !== "undefined" ? window.localStorage.getItem(ACCOUNT_LS_KEY) : null;
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

  async function cancelOrder(cl_ord_id: string, proprietary?: string) {
    try {
      const qs = proprietary ? `?proprietary=${encodeURIComponent(proprietary)}` : "";
      const r = await fetch(`/api/ordenes/${encodeURIComponent(cl_ord_id)}${qs}`, {
        method: "DELETE",
      });
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
      {/* Toolbar — mismo que el dashboard */}
      <div className="flex items-center gap-2 px-2 py-1 border border-[#1a1a1a] bg-[#080808] shrink-0">
        <span className="text-[10px] tracking-wider text-[#888]">CUENTA</span>
        <AccountSearch value={account} cuentas={cuentas} onPick={(id) => setAccount(id)} />
        <span className="ml-auto text-[9px] text-[#555] tracking-wide">
          FCI · suscripción / rescate · orden = cuotapartes @ cuota del día
        </span>
      </div>

      {/* Split 50/50 — espejo del dashboard */}
      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-2 gap-2">
        {/* Izquierda: panel FCI (en lugar de los order books) */}
        <FciOperatePanel
          account={account}
          onExecuted={() => {
            void refresh();
            void refreshPortfolio();
          }}
        />

        {/* Derecha: portfolio arriba + órdenes del día abajo (idéntico al dashboard) */}
        <div className="min-h-0 grid grid-rows-2 gap-2">
          <div className="min-h-0 overflow-hidden">
            <PortfolioPanel
              account={account}
              accountNombre={cuentas.find((c) => c.account_id === account)?.nombre ?? null}
              saldo={saldo}
              detailed={detailed}
              refresh={refreshPortfolio}
            />
          </div>
          <div className="min-h-0 overflow-hidden">
            <OrderManagement orders={orders} refresh={refresh} onCancel={cancelOrder} />
          </div>
        </div>
      </div>
    </div>
  );
}
