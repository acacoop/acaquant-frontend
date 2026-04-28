"use client";

// Tipos + helpers comunes entre las sub-vistas de DOLAR MEP (compra, trading).
// Si esto crece más, lo movemos a src/lib/.

export type Rueda = "CI" | "24hs";

export interface Cotizacion {
  rueda: Rueda;
  al30: { price: number; ts: string } | null;
  al30d: { price: number; ts: string } | null;
  mep_implicito: number | null;
}

export interface PataOrden {
  cl_ord_id?: string;
  ticker?: string;
  status?: string;
  cum_qty?: number;
  leaves_qty?: number;
  avg_px?: number;
  reject_reason?: string | null;
}

export interface OperativaMep {
  operativa_id: string;
  created_at?: string;
  rueda?: Rueda;
  account?: string;
  actor_email?: string;
  monto_ars?: number;
  comision_pct?: number;
  nominales?: number;
  mep_inicial?: number | null;
  buy?: PataOrden | null;
  sell?: PataOrden | null;
  usd_efectivo?: number | null;
  mep_efectivo?: number | null;
  estado?: string;
  wrapper_status?: string;
}

export interface SaldoCuenta {
  account: string;
  rueda: Rueda;
  saldo_ars: number | null;
  saldo_usd_d: number | null;
  settlement_date?: string | null;
  last_calc?: string | null;
}

export interface TriggerMep {
  trigger_id: string;
  account?: string;
  actor_email?: string;
  monto_ars: number;
  comision_pct: number;
  rueda: Rueda;
  tc_objetivo: number;
  estado: string;
  operativa_id?: string | null;
  last_seen_mep?: number | null;
  created_at?: string;
  updated_at?: string;
  fired_at?: string | null;
  fired_at_mep?: number | null;
  error?: string | null;
}

export const ACCOUNT_DEFAULT = "805";

export const inputCls =
  "bg-black border border-[#2a2a2a] px-2 py-1 text-[11px] w-full focus:border-[#ff9900] outline-none";

// ─────────────────────────────────────────────────────────────────────────────
// Componentes UI compartidos
// ─────────────────────────────────────────────────────────────────────────────

export function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex flex-col gap-1 ${className ?? ""}`}>
      <span className="text-[9px] tracking-wider text-[#888]">{label}</span>
      {children}
    </div>
  );
}

export function Th({ children, right }: { children?: React.ReactNode; right?: boolean }) {
  return (
    <th
      className={`px-2 py-1 text-[10px] tracking-wider text-[#888] font-semibold ${
        right ? "text-right" : "text-left"
      }`}
    >
      {children}
    </th>
  );
}

export function Td({
  children,
  right,
  className,
}: {
  children?: React.ReactNode;
  right?: boolean;
  className?: string;
}) {
  return (
    <td className={`px-2 py-1 ${right ? "text-right tabular-nums" : ""} ${className ?? ""}`}>
      {children}
    </td>
  );
}

export function PataCell({ pata }: { pata: PataOrden | null | undefined }) {
  const status = pata?.status;
  const reason = pata?.reject_reason ?? null;
  return (
    <td className={`px-2 py-1 align-top ${statusColor(status)}`}>
      <div className="flex flex-col">
        <span>{status ?? "—"}</span>
        {reason && (
          <span
            className="text-[9px] text-[#888] mt-0.5 max-w-[200px] truncate"
            title={reason}
          >
            {reason}
          </span>
        )}
      </div>
    </td>
  );
}

export function SaldoBox({
  saldo,
  montoRequerido,
}: {
  saldo: SaldoCuenta | null;
  montoRequerido: number;
}) {
  const ars = saldo?.saldo_ars ?? null;
  const usd = saldo?.saldo_usd_d ?? null;

  const arsColor =
    ars === null
      ? "text-[#888]"
      : ars < 0
      ? "text-[#ff7f7f]"
      : montoRequerido > 0 && ars < montoRequerido
      ? "text-[#ff9900]"
      : "text-[#7fff7f]";
  const usdColor = usd === null ? "text-[#888]" : usd < 0 ? "text-[#ff7f7f]" : "text-[#7fff7f]";

  return (
    <div className="flex flex-col gap-0.5 min-w-[160px] px-2 border-l border-[#2a2a2a]">
      <span className="text-[9px] tracking-wider text-[#888]">SALDO {saldo?.rueda ?? ""}</span>
      <span className={`text-[12px] font-semibold tabular-nums ${arsColor}`}>
        ARS {ars !== null ? fmtSignedAr(ars) : "—"}
      </span>
      <span className={`text-[10px] tabular-nums ${usdColor}`}>
        USD MEP {usd !== null ? fmtSignedUsd(usd) : "—"}
      </span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Format helpers
// ─────────────────────────────────────────────────────────────────────────────

export function fmtTime(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toISOString().substring(11, 19);
}

export function fmtArs(n?: number | null): string {
  if (n === undefined || n === null) return "—";
  return `$${n.toLocaleString("es-AR", { maximumFractionDigits: 0 })}`;
}

export function fmtSignedAr(n: number): string {
  const sign = n < 0 ? "-" : "";
  return `${sign}$${Math.abs(n).toLocaleString("es-AR", { maximumFractionDigits: 0 })}`;
}

export function fmtSignedUsd(n: number): string {
  const sign = n < 0 ? "-" : "";
  return `${sign}US$${Math.abs(n).toLocaleString("es-AR", { maximumFractionDigits: 2 })}`;
}

export function statusColor(s?: string): string {
  if (!s) return "";
  if (s === "FILLED") return "text-[#7fff7f]";
  if (s === "REJECTED" || s === "CANCELLED" || s === "EXPIRED") return "text-[#ff7f7f]";
  if (s === "NEW" || s === "PARTIALLY_FILLED" || s === "PENDING_NEW") return "text-[#ffe066]";
  return "text-white";
}

export function estadoColor(s?: string): string {
  if (!s) return "";
  if (s === "FILLED" || s === "OK" || s === "EXECUTED") return "text-[#7fff7f]";
  if (s === "FAIL") return "text-[#ff7f7f]";
  if (s === "OK_PARCIAL" || s === "PENDING" || s === "FIRING" || s === "ACTIVE") return "text-[#ffe066]";
  if (s === "CANCELLED" || s === "CANCELLED_EOD" || s === "STALE_BUY") return "text-[#888]";
  return "text-white";
}

// Convención BYMA: bonos cotizan precio por 100 VN.
export const PRICE_FACTOR_BONOS = 0.01;
