"use client";

/**
 * operar-shared — piezas COMUNES a las dos formas de operar (títulos y FCI):
 * el buscador de cuenta, el portfolio (saldos + tenencias), la grilla de
 * órdenes del día, y los hooks que los alimentan.
 *
 * Antes vivían dentro de `operar-dashboard-view` y la vista FCI los importaba
 * de ahí — así que tocar el dashboard rompía FCI. Al consolidar OPERAR en una
 * sola vista (títulos + FCI en el mismo lugar, columna derecha compartida)
 * este módulo pasa a ser el dueño único; nadie duplica más el toolbar de
 * cuenta ni el `cancelOrder`.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { CuentaDescubierta, fmtTime } from "./dolar-mep-shared";

// ─── Tipos ───────────────────────────────────────────────────────────────────

export interface OrderDia {
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
  external?: boolean;   // vino solo del broker (otra plataforma)
  proprietary?: string; // requerido para cancelar — lo da el backend
}

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

interface PyRofexPositionEntry {
  symbolReference?: string;
  tradingSymbol?: string;
  contractType?: string;
  marketPrice?: number;
  marketValue?: number;
  totalCurrentSize?: number;
  currency?: string;
}

interface PyRofexInstrumentBucket {
  detailedPositions?: PyRofexPositionEntry[];
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

// ─── Formato ─────────────────────────────────────────────────────────────────

export function fmtArs(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  const sign = n < 0 ? "-" : "";
  return `${sign}$${Math.abs(n).toLocaleString("es-AR", { maximumFractionDigits: 0 })}`;
}

export function fmtUsd(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  const sign = n < 0 ? "-" : "";
  return `${sign}US$${Math.abs(n).toLocaleString("es-AR", { maximumFractionDigits: 2 })}`;
}

function statusColor(s?: string): string {
  if (!s) return "text-[var(--t-text-dim)]";
  if (s === "FILLED") return "text-[var(--t-pos)]";
  if (s === "REJECTED" || s === "CANCELLED" || s === "EXPIRED") return "text-[var(--t-neg)]";
  if (s === "NEW" || s === "PARTIALLY_FILLED" || s === "PENDING_NEW") return "text-[#ffe066]";
  return "text-[var(--t-text)]";
}

// ─── Hooks de datos ──────────────────────────────────────────────────────────

/** Lista de cuentas operables + la cuenta activa. NO persiste la cuenta entre
 *  sesiones a propósito: un navegador compartido en la mesa heredaría la del
 *  usuario anterior. Solo el deep-link `?account=` la precarga. */
export function useCuentasOperar() {
  const [cuentas, setCuentas] = useState<CuentaDescubierta[]>([]);
  const [account, setAccount] = useState<string>("");
  const [derivedAccount, setDerivedAccount] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await fetch("/api/risk/account/listado", { cache: "no-store" });
        if (!alive || !r.ok) return;
        const list = (await r.json()) as CuentaDescubierta[];
        setCuentas(list);
        const urlAcc =
          typeof window !== "undefined"
            ? new URLSearchParams(window.location.search).get("account")
            : null;
        if (urlAcc && list.some((c) => c.account_id === urlAcc)) {
          setAccount(urlAcc);
          setDerivedAccount(urlAcc);
        }
      } catch {
        /* la vista muestra 'sin cuentas' */
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const accountNombre = useMemo(
    () => cuentas.find((c) => c.account_id === account)?.nombre ?? null,
    [cuentas, account],
  );

  return { cuentas, account, setAccount, accountNombre, derivedAccount, setDerivedAccount };
}

export function useOrdenesDia(account: string, pollMs = 4000) {
  const [orders, setOrders] = useState<OrderDia[]>([]);

  const refresh = useCallback(async () => {
    if (!account) {
      setOrders([]);
      return;
    }
    try {
      const r = await fetch(`/api/ordenes/dia?account=${encodeURIComponent(account)}`, {
        cache: "no-store",
      });
      if (r.ok) setOrders(await r.json());
    } catch {
      /* reintenta al próximo tick */
    }
  }, [account]);

  useEffect(() => {
    void refresh();
    const id = setInterval(refresh, pollMs);
    return () => clearInterval(id);
  }, [refresh, pollMs]);

  return { orders, refresh };
}

export function usePortfolio(account: string, pollMs = 8000) {
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
      setSaldo(rs.ok ? await rs.json() : null);
      setDetailed(rd.ok ? await rd.json() : null);
    } catch {
      /* reintenta al próximo tick */
    }
  }, [account]);

  useEffect(() => {
    void refresh();
    const id = setInterval(refresh, pollMs);
    return () => clearInterval(id);
  }, [refresh, pollMs]);

  return { saldo, detailed, refresh };
}

/** Cancela una orden y refresca. El alert es intencional: cancelar es una
 *  acción con plata, un fallo silencioso sería peligroso. */
export async function cancelarOrden(
  cl_ord_id: string,
  proprietary: string | undefined,
  refresh: () => void,
) {
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

// ─── Buscador de cuenta ──────────────────────────────────────────────────────

export function AccountSearch({
  value,
  cuentas,
  onPick,
}: {
  value: string;
  cuentas: CuentaDescubierta[];
  onPick: (id: string) => void;
}) {
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
        placeholder="cuenta: ID o nombre"
        className="bg-[var(--t-surface)] border border-[var(--t-border-2)] rounded px-2.5 py-1 text-[11px] w-[260px] focus:border-[var(--t-accent)] outline-none"
      />
      {open && hits.length > 0 && (
        <div className="absolute top-full left-0 mt-1 bg-[var(--t-surface)] border border-[var(--t-border-2)] rounded shadow-lg z-30 max-h-[280px] overflow-y-auto w-[320px] text-[11px]">
          {hits.map((c) => (
            <div
              key={c.account_id}
              onMouseDown={() => {
                onPick(c.account_id);
                setOpen(false);
              }}
              className={`px-2.5 py-1.5 hover:bg-[var(--t-border)] cursor-pointer flex items-center gap-2 ${
                c.account_id === value ? "bg-[var(--t-tint-amber)]" : ""
              }`}
            >
              <span className="text-[var(--t-accent)] font-mono tabular-nums min-w-[60px]">
                {c.account_id}
              </span>
              <span className="text-[var(--t-text)] flex-1 truncate">{c.nombre || "—"}</span>
              {!c.activa && (
                <span className="text-[8px] text-[var(--t-text-muted)] uppercase">inactiva</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Banner de deep-link desde Valuaciones ───────────────────────────────────

export function DerivedAccountBanner({
  derivedAccount,
  cuentas,
  onClose,
}: {
  derivedAccount: string;
  cuentas: CuentaDescubierta[];
  onClose: () => void;
}) {
  const nombre = cuentas.find((c) => c.account_id === derivedAccount)?.nombre;
  const noOperable = cuentas.length > 0 && !cuentas.some((c) => c.account_id === derivedAccount);
  return (
    <div
      className={`shrink-0 flex items-center gap-2 px-3 py-1.5 text-[10px] border rounded ${
        noOperable
          ? "border-[#f87171]/50 bg-[var(--t-tint-red)] text-[var(--t-neg)]"
          : "border-[var(--t-accent)]/40 bg-[var(--t-tint-amber)] text-[#ffcf66]"
      }`}
    >
      <span>
        ↪ Derivado de Valuaciones · operando cuenta{" "}
        <b className="text-[var(--t-text)]">{derivedAccount}</b>
        {nombre ? ` — ${nombre}` : ""}
        {noOperable && " · ⚠ esta cuenta no figura como operable por API"}
      </span>
      <button
        onClick={onClose}
        className="ml-auto text-[var(--t-text-dim)] hover:text-[var(--t-text)] leading-none"
        title="Ocultar"
      >
        ✕
      </button>
    </div>
  );
}

// ─── Portfolio: saldos + tenencias ───────────────────────────────────────────

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
      ? "text-[var(--t-text-dim)]"
      : value < 0
        ? "text-[var(--t-neg)]"
        : dim
          ? "text-[var(--t-text-dim)]"
          : "text-[var(--t-pos)]";
  return (
    <div className="flex flex-col gap-0.5 leading-tight">
      <span className="text-[8px] tracking-wider text-[var(--t-text-muted)]">{label}</span>
      <span className={`text-[12px] font-semibold tabular-nums ${color}`}>{fmt(value)}</span>
    </div>
  );
}

export function PortfolioPanel({
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
  const tenencias: TenenciaFlat[] = useMemo(() => {
    const report = detailed?.detailedPosition?.report;
    if (!report) return [];
    const out: TenenciaFlat[] = [];
    for (const [tipo, simbolos] of Object.entries(report)) {
      for (const bucket of Object.values(simbolos)) {
        for (const d of bucket?.detailedPositions ?? []) {
          const size = d.totalCurrentSize ?? 0;
          if (size <= 0) continue; // round-trip intradía, no tenencia
          const tradingSym = d.tradingSymbol ?? d.symbolReference ?? "?";
          out.push({
            ticker: d.symbolReference ?? tradingSym.split(" - ")[2] ?? tradingSym,
            tipo,
            size,
            price: d.marketPrice ?? null,
            marketValue: d.marketValue ?? null,
            currency: d.currency ?? "ARS",
          });
        }
      }
    }
    out.sort((a, b) => (b.marketValue ?? 0) - (a.marketValue ?? 0));
    return out;
  }, [detailed]);

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
    <div className="border border-[var(--t-border)] rounded bg-[var(--t-panel)] flex flex-col min-h-0 h-full overflow-hidden">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-[var(--t-border)] shrink-0">
        <span className="text-[11px] tracking-wide text-[var(--t-text)] font-semibold truncate">
          Posición
          {account && (
            <span className="text-[var(--t-accent)] ml-1">
              {account}
              {accountNombre && (
                <span className="text-[var(--t-text-dim)] font-normal ml-1">— {accountNombre}</span>
              )}
            </span>
          )}
        </span>
        <button
          onClick={refresh}
          className="text-[var(--t-text-dim)] hover:text-[var(--t-accent)] text-[13px] leading-none"
          title="Refrescar"
        >
          ↻
        </button>
      </div>

      {!account ? (
        <div className="px-3 py-4 text-[10px] text-[var(--t-text-muted)] text-center">
          Elegí una cuenta arriba.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-4 gap-2 px-3 py-2.5 border-b border-[var(--t-border)]">
            <SaldoCell label="ARS DISP" value={ars.available} fmt={fmtArs} />
            <SaldoCell label="ARS MOV" value={ars.consumed} fmt={fmtArs} dim />
            <SaldoCell label="USD D DISP" value={usd.available} fmt={fmtUsd} />
            <SaldoCell label="USD D MOV" value={usd.consumed} fmt={fmtUsd} dim />
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto">
            {tenencias.length === 0 ? (
              <div className="px-3 py-4 text-[10px] text-[var(--t-text-muted)] text-center">
                {detailed === null ? "Cargando…" : "Sin tenencias"}
              </div>
            ) : (
              <table className="w-full text-[10px] font-mono tabular-nums">
                <thead className="text-[9px] text-[var(--t-text-muted)] tracking-wider bg-[var(--t-panel)] sticky top-0">
                  <tr>
                    <th className="text-left px-3 py-1">TICKER</th>
                    <th className="text-left px-2 py-1">TIPO</th>
                    <th className="text-right px-2 py-1">CANT</th>
                    <th className="text-right px-2 py-1">PRECIO</th>
                    <th className="text-right px-3 py-1">VALOR</th>
                  </tr>
                </thead>
                <tbody>
                  {tenencias.map((t, i) => (
                    <tr
                      key={`${t.ticker}-${i}`}
                      className="border-t border-[var(--t-border)] hover:bg-[var(--t-surface)]"
                    >
                      <td className="px-3 py-0.5 text-[var(--t-text)]">{t.ticker}</td>
                      <td className="px-2 py-0.5 text-[var(--t-text-dim)]">{t.tipo}</td>
                      <td className="px-2 py-0.5 text-right text-[var(--t-text)]">
                        {t.size.toLocaleString("es-AR")}
                      </td>
                      <td className="px-2 py-0.5 text-right text-[var(--t-text)]">
                        {t.price != null ? t.price.toFixed(2) : "—"}
                      </td>
                      <td className="px-3 py-0.5 text-right text-[var(--t-accent)]">
                        {t.marketValue != null
                          ? `$${t.marketValue.toLocaleString("es-AR", { maximumFractionDigits: 0 })}`
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
                {totalMarketValue != null && (
                  <tfoot>
                    <tr className="border-t border-[var(--t-border-2)] bg-[var(--t-panel)]">
                      <td colSpan={4} className="px-2 py-1 text-right text-[10px] text-[var(--t-text-dim)]">
                        TOTAL
                      </td>
                      <td className="px-3 py-1 text-right text-[var(--t-accent)] font-bold">
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

// ─── Órdenes del día ─────────────────────────────────────────────────────────

export function OrderManagement({
  orders,
  refresh,
  onCancel,
}: {
  orders: OrderDia[];
  refresh: () => void;
  onCancel: (cl_ord_id: string, proprietary?: string) => void;
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
  const restantes = useMemo(() => orders.filter((o) => !activas.includes(o)), [orders, activas]);

  return (
    <div className="border border-[var(--t-border)] rounded bg-[var(--t-panel)] flex flex-col min-h-0 h-full overflow-hidden">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-[var(--t-border)] shrink-0">
        <span className="text-[11px] tracking-wide text-[var(--t-text)] font-semibold">
          Órdenes del día
        </span>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-[var(--t-text-dim)]">
            {activas.length} activas · {restantes.length} cerradas
          </span>
          <button
            onClick={refresh}
            className="text-[var(--t-text-dim)] hover:text-[var(--t-accent)] text-[13px] leading-none"
            title="Refrescar"
          >
            ↻
          </button>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto">
        {orders.length === 0 ? (
          <div className="px-3 py-4 text-[10px] text-[var(--t-text-muted)] text-center">
            Sin órdenes hoy
          </div>
        ) : (
          <table className="w-full text-[10px] font-mono tabular-nums">
            <thead className="text-[9px] text-[var(--t-text-muted)] tracking-wider bg-[var(--t-panel)] sticky top-0">
              <tr>
                <th className="text-left px-3 py-1">HORA</th>
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
              {[...activas, ...restantes].map((o, i) => {
                const corto = o.ticker?.split(" - ")[2] ?? o.ticker ?? "?";
                const isActive = activas.includes(o);
                return (
                  <tr
                    key={o.cl_ord_id ?? `ord-${i}`}
                    className="border-t border-[var(--t-border)] hover:bg-[var(--t-surface)]"
                  >
                    <td className="px-3 py-0.5 text-[var(--t-text-dim)]">
                      {o.created_at ? fmtTime(o.created_at) : "—"}
                    </td>
                    <td className="px-2 py-0.5 text-[var(--t-text)]">
                      <span>{corto}</span>
                      {o.external && (
                        <span
                          className="ml-1.5 px-1 text-[8px] text-[var(--t-text-dim)] border border-[var(--t-border-2)] rounded align-middle"
                          title="Operada desde otra plataforma"
                        >
                          EXT
                        </span>
                      )}
                    </td>
                    <td
                      className={`px-2 py-0.5 font-semibold ${
                        o.side === "BUY" ? "text-[var(--t-pos)]" : "text-[var(--t-neg)]"
                      }`}
                    >
                      {o.side ?? "—"}
                    </td>
                    <td className="px-2 py-0.5 text-[var(--t-text-dim)]">{o.order_type ?? "—"}</td>
                    <td className="px-2 py-0.5 text-right text-[var(--t-text)]">
                      {o.price != null ? o.price.toFixed(2) : "—"}
                    </td>
                    <td className="px-2 py-0.5 text-right text-[var(--t-text)]">
                      {o.size?.toLocaleString("es-AR") ?? "—"}
                    </td>
                    <td className="px-2 py-0.5 text-right text-[var(--t-text-dim)]">
                      {o.cum_qty?.toLocaleString("es-AR") ?? "—"}
                    </td>
                    <td className={`px-2 py-0.5 ${statusColor(o.status)}`}>
                      {o.status ?? "—"}
                      {o.reject_reason && (
                        <span
                          className="text-[var(--t-text-dim)] ml-1 truncate inline-block max-w-[140px]"
                          title={o.reject_reason}
                        >
                          ({o.reject_reason})
                        </span>
                      )}
                    </td>
                    <td className="px-2 py-0.5 text-[var(--t-text-dim)]">{o.account ?? "—"}</td>
                    <td className="px-2 py-0.5">
                      {isActive && o.cl_ord_id && (
                        <button
                          onClick={() => onCancel(o.cl_ord_id!, o.proprietary)}
                          className="text-[9px] text-[var(--t-neg)] hover:underline"
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
