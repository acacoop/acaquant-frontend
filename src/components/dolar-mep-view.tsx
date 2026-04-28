"use client";

import { useEffect, useState } from "react";

type Rueda = "CI" | "24hs";

interface Cotizacion {
  rueda: Rueda;
  al30: { price: number; ts: string } | null;
  al30d: { price: number; ts: string } | null;
  mep_implicito: number | null;
}

interface PataOrden {
  cl_ord_id?: string;
  ticker?: string;
  status?: string;
  cum_qty?: number;
  leaves_qty?: number;
  avg_px?: number;
  reject_reason?: string | null;
}

interface OperativaMep {
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

interface SaldoCuenta {
  account: string;
  rueda: Rueda;
  saldo_ars: number | null;
  saldo_usd_d: number | null;
  settlement_date?: string | null;
  last_calc?: string | null;
}

const ACCOUNT_DEFAULT = "805"; // hoy hay solo 1 cuenta — del .env del server

export function DolarMepView() {
  const [monto, setMonto] = useState("100000");
  const [comision, setComision] = useState("0.62");
  const [rueda, setRueda] = useState<Rueda>("CI");
  const [account, setAccount] = useState(ACCOUNT_DEFAULT);

  const [cot, setCot] = useState<Cotizacion | null>(null);
  const [operativas, setOperativas] = useState<OperativaMep[]>([]);
  const [saldo, setSaldo] = useState<SaldoCuenta | null>(null);
  const [feedback, setFeedback] = useState<{ kind: "ok" | "err"; msg: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function fetchCot() {
    try {
      const r = await fetch(`/api/operativa/mep/cotizacion?rueda=${rueda}`, { cache: "no-store" });
      if (r.ok) setCot(await r.json());
    } catch {
      // silencio — el polling reintenta solo
    }
  }

  async function fetchOperativas() {
    try {
      const r = await fetch("/api/operativa/mep/dia", { cache: "no-store" });
      if (r.ok) {
        const data = await r.json();
        setOperativas(Array.isArray(data) ? data : []);
      }
    } catch {
      // ignore
    }
  }

  async function fetchSaldo() {
    try {
      const r = await fetch(`/api/risk/account/saldo?rueda=${rueda}&account=${account}`, {
        cache: "no-store",
      });
      if (r.ok) {
        setSaldo(await r.json());
      } else {
        setSaldo(null);
      }
    } catch {
      // ignore — backend cachea 3s, no es crítico si una request falla
    }
  }

  useEffect(() => {
    fetchCot();
    fetchOperativas();
    fetchSaldo();
    const idCot = setInterval(fetchCot, 2000);
    const idOps = setInterval(fetchOperativas, 3000);
    const idSal = setInterval(fetchSaldo, 3000);
    return () => {
      clearInterval(idCot);
      clearInterval(idOps);
      clearInterval(idSal);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rueda, account]);

  // Cálculo informativo en vivo (lo final lo calcula el backend con el último precio
  // al momento de mandar — esto solo es preview).
  // Convención BYMA: los bonos cotizan precio por 100 VN, así que dividimos por
  // (precio × 0.01) para pasar a precio por 1 VN (la unidad real del `size`).
  const PRICE_FACTOR = 0.01;
  const montoNum = parseInt(monto, 10) || 0;
  const montoDisplay = montoNum ? montoNum.toLocaleString("es-AR") : "";
  const comNum = parseFloat(comision) || 0;
  const arsNeto = montoNum * (1 - comNum / 100);
  const precioAl30 = cot?.al30?.price ?? null;
  const precioAl30d = cot?.al30d?.price ?? null;
  const mep = cot?.mep_implicito ?? null;
  const nominalesEstim =
    precioAl30 && precioAl30 > 0 ? Math.floor(arsNeto / (precioAl30 * PRICE_FACTOR)) : null;
  const usdEstim =
    nominalesEstim && precioAl30d ? nominalesEstim * (precioAl30d * PRICE_FACTOR) : null;

  async function handleEjecutar() {
    if (!montoNum || montoNum <= 0) {
      setFeedback({ kind: "err", msg: "Monto debe ser > 0" });
      return;
    }
    if (!confirm(
      `Ejecutar operativa MEP ${rueda}:\n\n` +
      `• Monto: $${montoNum.toLocaleString("es-AR")} ARS\n` +
      `• Comisión: ${comNum}%\n` +
      `• Nominales estimados: ${nominalesEstim ?? "?"}\n` +
      `• MEP implícito: ${mep ?? "?"}\n\n` +
      `¿Confirmar?`,
    )) return;

    setSubmitting(true);
    setFeedback(null);
    try {
      const r = await fetch("/api/operativa/mep", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          monto_ars: montoNum,
          comision_pct: comNum,
          rueda,
          account: account || null,
        }),
      });
      const data = await r.json();
      if (r.ok && data.ok) {
        setFeedback({
          kind: "ok",
          msg: `Operativa ${data.operativa_id.substring(0, 8)} · ${data.status} · BUY=${data.buy?.cl_ord_id} SELL=${data.sell?.cl_ord_id ?? "—"}`,
        });
        await fetchOperativas();
      } else {
        const msg = data.error || data.detail || `error ${r.status}`;
        setFeedback({ kind: "err", msg: typeof msg === "string" ? msg : JSON.stringify(msg) });
      }
    } catch (e) {
      setFeedback({ kind: "err", msg: String(e) });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="h-full flex flex-col gap-3 p-3 bg-black text-white text-[12px] overflow-auto">
      {/* MEP en vivo */}
      <div className="flex gap-4 items-end p-3 bg-[#080808] border border-[#1a1a1a]">
        <div className="flex flex-col">
          <span className="text-[9px] tracking-wider text-[#888]">MEP {rueda}</span>
          <span className="text-[28px] font-bold tracking-wide text-[#ff9900] tabular-nums">
            {mep !== null ? `$${mep.toFixed(2)}` : "—"}
          </span>
        </div>
        <div className="flex flex-col text-[10px] text-[#888] gap-0.5">
          <span>AL30: {precioAl30 !== null ? `$${precioAl30.toFixed(2)}` : "—"}</span>
          <span>AL30D: {precioAl30d !== null ? `US$${precioAl30d.toFixed(2)}` : "—"}</span>
          <span>{cot?.al30?.ts ? `last ${fmtTime(cot.al30.ts)}` : ""}</span>
        </div>
        <div className="ml-auto text-[10px] text-[#666]">refresca cada 2s</div>
      </div>

      {/* Form */}
      <div className="flex gap-2 items-end p-3 bg-[#080808] border border-[#1a1a1a] flex-wrap">
        <Field label="MONTO ARS" className="w-[160px]">
          <input
            type="text"
            inputMode="numeric"
            value={montoDisplay}
            onChange={(e) => {
              // Quita cualquier cosa que no sea dígito (puntos, comas, letras).
              // El state guarda solo dígitos crudos; el display se reformatea.
              setMonto(e.target.value.replace(/\D/g, ""));
            }}
            className={inputCls}
            placeholder="0"
          />
        </Field>
        <Field label="COMISIÓN %" className="w-[110px]">
          <input
            type="number"
            value={comision}
            onChange={(e) => setComision(e.target.value)}
            className={inputCls}
            step="0.01"
            min={0}
          />
        </Field>
        <Field label="RUEDA" className="w-[100px]">
          <select value={rueda} onChange={(e) => setRueda(e.target.value as Rueda)} className={inputCls}>
            <option value="CI">MEP CI</option>
            <option value="24hs">MEP 24</option>
          </select>
        </Field>
        <Field label="CUENTA" className="w-[120px]">
          <select value={account} onChange={(e) => setAccount(e.target.value)} className={inputCls}>
            <option value={ACCOUNT_DEFAULT}>{ACCOUNT_DEFAULT}</option>
          </select>
        </Field>
        <SaldoBox saldo={saldo} montoRequerido={montoNum} />
        <button
          onClick={handleEjecutar}
          disabled={submitting}
          className="bg-[#ff9900] text-black font-bold tracking-wide px-5 py-1 text-[11px] hover:bg-[#ffaa22] disabled:opacity-40"
        >
          {submitting ? "EJECUTANDO…" : "EJECUTAR"}
        </button>

        {/* Preview */}
        <div className="ml-auto flex flex-col gap-0.5 text-[10px] text-[#888]">
          <span>ARS neto: ${arsNeto.toLocaleString("es-AR", { maximumFractionDigits: 2 })}</span>
          <span>Nominales estim.: {nominalesEstim ?? "—"}</span>
          <span>USD estim.: {usdEstim ? `US$${usdEstim.toFixed(2)}` : "—"}</span>
        </div>
      </div>

      {feedback && (
        <div
          className={`px-3 py-2 text-[11px] border ${
            feedback.kind === "ok"
              ? "bg-[#0a2a0a] border-[#1a4a1a] text-[#7fff7f]"
              : "bg-[#2a0a0a] border-[#4a1a1a] text-[#ff7f7f]"
          }`}
        >
          {feedback.msg}
        </div>
      )}

      {/* Tabla operativas */}
      <div className="flex-1 min-h-0 overflow-auto bg-[#080808] border border-[#1a1a1a]">
        <table className="w-full text-[11px]">
          <thead className="bg-[#1a1a1a] sticky top-0">
            <tr>
              <Th>HORA</Th>
              <Th>RUEDA</Th>
              <Th right>MONTO ARS</Th>
              <Th right>NOMINALES</Th>
              <Th right>MEP INI</Th>
              <Th>BUY</Th>
              <Th>SELL</Th>
              <Th right>USD EFECT</Th>
              <Th right>MEP EFECT</Th>
              <Th>ESTADO</Th>
              <Th>USER</Th>
            </tr>
          </thead>
          <tbody>
            {operativas.length === 0 && (
              <tr>
                <td colSpan={11} className="px-3 py-4 text-center text-[#666]">
                  Sin operativas hoy
                </td>
              </tr>
            )}
            {operativas.map((op) => (
              <tr key={op.operativa_id} className="border-b border-[#1a1a1a]">
                <Td>{fmtTime(op.created_at)}</Td>
                <Td>{op.rueda}</Td>
                <Td right>{fmtArs(op.monto_ars)}</Td>
                <Td right>{op.nominales ?? "—"}</Td>
                <Td right>{op.mep_inicial ?? "—"}</Td>
                <PataCell pata={op.buy} />
                <PataCell pata={op.sell} />
                <Td right>{op.usd_efectivo ? `US$${op.usd_efectivo.toFixed(2)}` : "—"}</Td>
                <Td right className="text-[#ff9900]">{op.mep_efectivo ?? "—"}</Td>
                <Td className={estadoColor(op.estado)}>{op.estado ?? ""}</Td>
                <Td className="text-[#888]">{op.actor_email ?? ""}</Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const inputCls =
  "bg-black border border-[#2a2a2a] px-2 py-1 text-[11px] w-full focus:border-[#ff9900] outline-none";

function SaldoBox({
  saldo,
  montoRequerido,
}: {
  saldo: SaldoCuenta | null;
  montoRequerido: number;
}) {
  const ars = saldo?.saldo_ars ?? null;
  const usd = saldo?.saldo_usd_d ?? null;

  // Coloreo del ARS contra el monto requerido para la operativa.
  // <0 → rojo (cuenta sobregirada), <monto → naranja (no alcanza),
  // >=monto → verde.
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

function fmtSignedAr(n: number): string {
  const sign = n < 0 ? "-" : "";
  return `${sign}$${Math.abs(n).toLocaleString("es-AR", { maximumFractionDigits: 0 })}`;
}

function fmtSignedUsd(n: number): string {
  const sign = n < 0 ? "-" : "";
  return `${sign}US$${Math.abs(n).toLocaleString("es-AR", { maximumFractionDigits: 2 })}`;
}

function Field({
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

function Th({ children, right }: { children?: React.ReactNode; right?: boolean }) {
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

function Td({
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

function PataCell({ pata }: { pata: PataOrden | null | undefined }) {
  // Celda compuesta: status arriba, motivo de rechazo abajo en gris chico.
  // El motivo completo queda en el title (tooltip) por si está truncado.
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

function fmtTime(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toISOString().substring(11, 19);
}

function fmtArs(n?: number): string {
  if (n === undefined || n === null) return "—";
  return `$${n.toLocaleString("es-AR", { maximumFractionDigits: 0 })}`;
}

function statusColor(s?: string): string {
  if (!s) return "";
  if (s === "FILLED") return "text-[#7fff7f]";
  if (s === "REJECTED" || s === "CANCELLED" || s === "EXPIRED") return "text-[#ff7f7f]";
  if (s === "NEW" || s === "PARTIALLY_FILLED" || s === "PENDING_NEW") return "text-[#ffe066]";
  return "text-white";
}

function estadoColor(s?: string): string {
  if (!s) return "";
  if (s === "FILLED" || s === "OK") return "text-[#7fff7f]";
  if (s === "FAIL") return "text-[#ff7f7f]";
  if (s === "OK_PARCIAL" || s === "PENDING") return "text-[#ffe066]";
  return "text-white";
}
