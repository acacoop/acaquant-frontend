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

export interface SaldoMoneda {
  available: number | null;
  consumed: number | null;
}

export interface SaldoCuenta {
  account: string;
  rueda: Rueda;
  saldo_ars: number | null;
  saldo_usd_d: number | null;
  movimiento_ars?: number | null;
  movimiento_usd_d?: number | null;
  monedas?: Record<string, SaldoMoneda>;
  settlement_date?: string | null;
  last_calc?: string | null;
}

// Fallback solo si /api/risk/account/listado todavía no devolvió nada
// (job descubrir_cuentas no corrió, primer load del frontend, etc.).
// La cuenta operativa real viene del listado, no de acá.
export const ACCOUNT_DEFAULT_FALLBACK = "";

export interface CuentaDescubierta {
  account_id: string;
  nombre?: string | null;
  ars_disponible: number | null;
  usd_d_disponible: number | null;
  n_posiciones: number;
  activa: boolean;
  last_discovered_at?: string | null;
}

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

// Panel horizontal de saldo — replica la vista de Primary para las 2
// monedas que importan en operativa MEP (ARS y USD D = USD MEP). El
// resto de monedas (USD C, USD G, U$S, etc.) viene en el endpoint pero
// no se muestra acá; si alguna vez son relevantes, se inspeccionan vía
// /api/risk/account/report.
function _colorDisp(value: number | null, opts?: { ref?: number }): string {
  if (value === null) return "text-[#888]";
  if (value < 0) return "text-[#ff7f7f]";
  if (opts?.ref !== undefined && opts.ref > 0 && value < opts.ref) return "text-[#ff9900]";
  return "text-[#7fff7f]";
}

export function SaldoBox({
  saldo,
  montoRequerido,
  onRefresh,
}: {
  saldo: SaldoCuenta | null;
  montoRequerido: number;
  onRefresh?: () => void;
}) {
  const ars = saldo?.monedas?.["ARS"] ?? {
    available: saldo?.saldo_ars ?? null,
    consumed: saldo?.movimiento_ars ?? null,
  };
  const usd = saldo?.monedas?.["USD D"] ?? {
    available: saldo?.saldo_usd_d ?? null,
    consumed: saldo?.movimiento_usd_d ?? null,
  };

  return (
    <div className="flex items-center gap-6 px-3 py-2 bg-[#080808] border border-[#1a1a1a]">
      <div className="flex items-center gap-2 min-w-[110px]">
        <span className="text-[9px] tracking-wider text-[#888]">SALDO {saldo?.rueda ?? ""}</span>
        {onRefresh && (
          <button
            onClick={onRefresh}
            title="Refrescar saldo"
            className="text-[#888] hover:text-[#ff9900] text-[11px] leading-none"
          >
            ↻
          </button>
        )}
      </div>

      <Cell
        label="ARS DISPONIBLE"
        value={ars.available}
        fmt={fmtSignedAr}
        color={_colorDisp(ars.available, { ref: montoRequerido })}
      />
      <Cell
        label="ARS MOVIM."
        value={ars.consumed}
        // Movimientos: sin signo y en gris neutro — informativos, no
        // direccionales. El signo del broker indica dirección, pero acá
        // mostramos magnitud (lo que se operó).
        fmt={(n) => fmtSignedAr(Math.abs(n))}
        color="text-[#aaa]"
        zeroAsDash
      />
      <Cell
        label="USD D DISPONIBLE"
        value={usd.available}
        fmt={fmtSignedUsd}
        color={_colorDisp(usd.available)}
      />
      <Cell
        label="USD D MOVIM."
        value={usd.consumed}
        fmt={(n) => fmtSignedUsd(Math.abs(n))}
        color="text-[#aaa]"
        zeroAsDash
      />

      {saldo?.last_calc && (
        <span
          className="ml-auto text-[9px] text-[#666] tabular-nums"
          title={saldo.last_calc}
        >
          last {fmtTime(saldo.last_calc)}
        </span>
      )}
    </div>
  );
}

function Cell({
  label,
  value,
  fmt,
  color,
  zeroAsDash,
}: {
  label: string;
  value: number | null | undefined;
  fmt: (n: number) => string;
  color: string;
  zeroAsDash?: boolean;
}) {
  const v = value ?? null;
  const txt =
    v === null || (zeroAsDash && v === 0) ? "—" : fmt(v);
  return (
    <div className="flex flex-col gap-0.5 leading-tight">
      <span className="text-[8px] tracking-wider text-[#666]">{label}</span>
      <span className={`text-[12px] font-semibold tabular-nums ${color}`}>{txt}</span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Format helpers
// ─────────────────────────────────────────────────────────────────────────────

// Hora ART explícita (HH:MM:SS) — el backend devuelve UTC con tz, acá lo
// localizamos a Buenos Aires sin depender de la timezone del browser.
const _HORA_ART_HMS = new Intl.DateTimeFormat("es-AR", {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
  timeZone: "America/Argentina/Buenos_Aires",
});

export function fmtTime(iso?: string | null): string {
  if (!iso) return "";
  // pymongo (sin tz_aware=True) deserializa BSON datetime como naive Python →
  // FastAPI/orjson lo serializa "YYYY-MM-DDTHH:MM:SS.fff" (sin Z, sin offset).
  // `new Date(iso)` con string naive lo interpreta como hora LOCAL del browser
  // → si el browser está en ART y el dato real era UTC, queda adelantada 3hs.
  // Asumimos UTC cuando el ISO no tenga indicador: el backend escribe UTC.
  const hasTz = /[Zz]$|[+-]\d{2}:?\d{2}$/.test(iso);
  const d = new Date(hasTz ? iso : iso + "Z");
  if (isNaN(d.getTime())) return "";
  return _HORA_ART_HMS.format(d);
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
