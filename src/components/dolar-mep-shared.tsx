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

export interface TriggerMep {
  trigger_id: string;
  account?: string;
  actor_email?: string;
  monto_ars: number;
  comision_pct: number;
  rueda: Rueda;
  tc_objetivo: number;
  tp_objetivo?: number | null;
  sl_objetivo?: number | null;
  estado: string;
  operativa_id?: string | null;
  operativa_exit_id?: string | null;
  nominales_entry?: number | null;
  last_seen_mep?: number | null;
  created_at?: string;
  updated_at?: string;
  fired_at?: string | null;
  fired_at_mep?: number | null;
  exit_fired_at?: string | null;
  exit_fired_mep?: number | null;
  exit_motivo?: string | null;
  error?: string | null;
  exit_error?: string | null;
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

// Monedas que mostramos en el SaldoBox cuando aparecen con valor distinto
// de cero. ARS / USD D siempre se muestran (aunque sean 0) porque son las
// que la operativa MEP usa. Las otras solo si tienen movimiento o saldo.
const MONEDAS_FIJAS = ["ARS", "USD D"];
const MONEDAS_OPCIONALES = ["U$S", "USD C", "USD G", "USD R", "USD UY", "USD MtR", "USD DB"];

function _esRelevante(m: SaldoMoneda | undefined): boolean {
  if (!m) return false;
  return (m.available ?? 0) !== 0 || (m.consumed ?? 0) !== 0;
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
  const monedas = saldo?.monedas ?? {};
  // Orden: fijas primero (ARS, USD D), después las opcionales con valor.
  const codigos = [
    ...MONEDAS_FIJAS,
    ...MONEDAS_OPCIONALES.filter((c) => _esRelevante(monedas[c])),
  ];

  return (
    <div className="flex flex-col gap-0.5 min-w-[280px] px-2 border-l border-[#2a2a2a]">
      <div className="flex items-center gap-1">
        <span className="text-[9px] tracking-wider text-[#888]">SALDO {saldo?.rueda ?? ""}</span>
        {onRefresh && (
          <button
            onClick={onRefresh}
            title="Refrescar saldo"
            className="text-[#888] hover:text-[#ff9900] text-[10px] leading-none"
          >
            ↻
          </button>
        )}
      </div>
      <table className="text-[10px] tabular-nums">
        <thead>
          <tr className="text-[#666]">
            <th className="text-left font-normal pr-2">moneda</th>
            <th className="text-right font-normal pr-3">disponible</th>
            <th className="text-right font-normal">movim.</th>
          </tr>
        </thead>
        <tbody>
          {codigos.map((c) => {
            const m = monedas[c] ?? { available: null, consumed: null };
            const av = m.available;
            const cs = m.consumed;
            const isAr = c === "ARS";
            const avColor =
              av === null
                ? "text-[#888]"
                : av < 0
                ? "text-[#ff7f7f]"
                : isAr && montoRequerido > 0 && av < montoRequerido
                ? "text-[#ff9900]"
                : "text-[#7fff7f]";
            const csColor =
              cs === null || cs === 0
                ? "text-[#666]"
                : cs < 0
                ? "text-[#ff7f7f]"
                : "text-[#7fff7f]";
            const fmtMoneda = isAr ? fmtSignedAr : fmtSignedUsd;
            return (
              <tr key={c}>
                <td className="text-[#aaa] pr-2">{c}</td>
                <td className={`text-right pr-3 ${avColor}`}>
                  {av !== null ? fmtMoneda(av) : "—"}
                </td>
                <td className={`text-right ${csColor}`}>
                  {cs !== null && cs !== 0 ? fmtMoneda(cs) : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {saldo?.last_calc && (
        <span className="text-[9px] text-[#666]" title={saldo.last_calc}>
          last {fmtTime(saldo.last_calc)}
        </span>
      )}
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
  const d = new Date(iso);
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
