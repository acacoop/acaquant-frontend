"use client";

import { useEffect, useState } from "react";
import {
  ACCOUNT_DEFAULT,
  Cotizacion,
  Field,
  inputCls,
  OperativaMep,
  PataCell,
  PRICE_FACTOR_BONOS,
  Rueda,
  SaldoBox,
  SaldoCuenta,
  Td,
  Th,
  estadoColor,
  fmtArs,
  fmtTime,
} from "./dolar-mep-shared";

// El shell maneja rueda/monto/comision/account/cot/saldo y los pasa por props.
// Esta vista solo se ocupa de "operativa instantánea": form EJECUTAR + tabla
// de operativas del día.
interface Props {
  rueda: Rueda;
  monto: string;
  setMonto: (v: string) => void;
  comision: string;
  setComision: (v: string) => void;
  account: string;
  setAccount: (v: string) => void;
  setRueda: (r: Rueda) => void;
  cot: Cotizacion | null;
  saldo: SaldoCuenta | null;
  onRefreshSaldo?: () => void;
}

export function DolarMepCompraView({
  rueda, setRueda,
  monto, setMonto,
  comision, setComision,
  account, setAccount,
  cot, saldo,
  onRefreshSaldo,
}: Props) {
  const [operativas, setOperativas] = useState<OperativaMep[]>([]);
  const [feedback, setFeedback] = useState<{ kind: "ok" | "err"; msg: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);

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

  useEffect(() => {
    fetchOperativas();
    const id = setInterval(fetchOperativas, 3000);
    return () => clearInterval(id);
  }, []);

  const montoNum = parseInt(monto, 10) || 0;
  const montoDisplay = montoNum ? montoNum.toLocaleString("es-AR") : "";
  const comNum = parseFloat(comision) || 0;
  const arsNeto = montoNum * (1 - comNum / 100);
  const precioAl30 = cot?.al30?.price ?? null;
  const precioAl30d = cot?.al30d?.price ?? null;
  const mep = cot?.mep_implicito ?? null;
  const nominalesEstim =
    precioAl30 && precioAl30 > 0 ? Math.floor(arsNeto / (precioAl30 * PRICE_FACTOR_BONOS)) : null;
  const usdEstim =
    nominalesEstim && precioAl30d ? nominalesEstim * (precioAl30d * PRICE_FACTOR_BONOS) : null;

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
      {/* Saldo — panel propio, replica vista de Primary */}
      <SaldoBox saldo={saldo} montoRequerido={montoNum} onRefresh={onRefreshSaldo} />

      {/* Form */}
      <div className="flex gap-2 items-end p-3 bg-[#080808] border border-[#1a1a1a] flex-wrap">
        <Field label="MONTO ARS" className="w-[160px]">
          <input
            type="text"
            inputMode="numeric"
            value={montoDisplay}
            onChange={(e) => setMonto(e.target.value.replace(/\D/g, ""))}
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
        <button
          onClick={handleEjecutar}
          disabled={submitting}
          className="bg-[#ff9900] text-black font-bold tracking-wide px-5 py-1 text-[11px] hover:bg-[#ffaa22] disabled:opacity-40"
        >
          {submitting ? "EJECUTANDO…" : "EJECUTAR"}
        </button>

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
