"use client";

import { useEffect, useState } from "react";
import {
  Cotizacion,
  CuentaDescubierta,
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
import { AccountPicker } from "./account-picker";
import { DolarMepBoard } from "./dolar-mep-board";
import { DolarMepDetalleDrawer } from "./dolar-mep-detalle-drawer";

// Espejo de DolarMepCompraView pero al revés:
//   - Input: monto_usd a vender.
//   - Operativa: BUY AL30D (cancela short) + SELL AL30 (cierra long) → ARS.
//   - POST a /api/operativa/mep/venta.
// La tabla del día muestra TODAS las operativas (compra + venta) — el campo
// `tipo` distingue.

interface Props {
  rueda: Rueda;
  setRueda: (r: Rueda) => void;
  montoUsd: string;
  setMontoUsd: (v: string) => void;
  comision: string;
  setComision: (v: string) => void;
  account: string;
  setAccount: (v: string) => void;
  cuentas: CuentaDescubierta[];
  cot: Cotizacion | null;
  saldo: SaldoCuenta | null;
  onRefreshSaldo?: () => void;
}

export function DolarMepVentaView({
  rueda, setRueda,
  montoUsd, setMontoUsd,
  comision, setComision,
  account, setAccount,
  cuentas,
  cot, saldo,
  onRefreshSaldo,
}: Props) {
  const [operativas, setOperativas] = useState<OperativaMep[]>([]);
  const [feedback, setFeedback] = useState<{ kind: "ok" | "err"; msg: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [detalleId, setDetalleId] = useState<string | null>(null);

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

  const montoNum = parseFloat(montoUsd) || 0;
  const comNum = parseFloat(comision) || 0;
  const usdNeto = montoNum * (1 - comNum / 100);
  const precioAl30 = cot?.al30?.price ?? null;
  const precioAl30d = cot?.al30d?.price ?? null;
  const mep = cot?.mep_implicito ?? null;
  // Nominales: cuántos AL30D voy a comprar para cancelar el short equivalente.
  const nominalesEstim =
    precioAl30d && precioAl30d > 0
      ? Math.floor(usdNeto / (precioAl30d * PRICE_FACTOR_BONOS))
      : null;
  // ARS estimado a recibir tras vender esos nominales al precio AL30.
  const arsEstim =
    nominalesEstim && precioAl30
      ? nominalesEstim * (precioAl30 * PRICE_FACTOR_BONOS)
      : null;

  async function handleEjecutar() {
    if (!montoNum || montoNum <= 0) {
      setFeedback({ kind: "err", msg: "Monto USD debe ser > 0" });
      return;
    }
    if (
      !confirm(
        `Ejecutar VENTA MEP ${rueda}:\n\n` +
          `• Monto: US$${montoNum.toLocaleString("es-AR", { maximumFractionDigits: 2 })}\n` +
          `• Comisión: ${comNum}%\n` +
          `• Nominales estimados: ${nominalesEstim ?? "?"}\n` +
          `• ARS estimado: ${
            arsEstim ? `$${arsEstim.toLocaleString("es-AR", { maximumFractionDigits: 0 })}` : "?"
          }\n` +
          `• MEP implícito: ${mep ?? "?"}\n\n` +
          `¿Confirmar?`,
      )
    ) {
      return;
    }

    setSubmitting(true);
    setFeedback(null);
    try {
      const r = await fetch("/api/operativa/mep/venta", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          monto_usd: montoNum,
          comision_pct: comNum,
          rueda,
          account: account || null,
          client_order_id: crypto.randomUUID(),  // idempotencia: anti doble operativa
        }),
      });
      const data = await r.json();
      if (r.ok && data.ok) {
        setFeedback({
          kind: "ok",
          msg: `Venta ${data.operativa_id?.substring(0, 8) ?? ""} · ${data.status} · BUY AL30D=${data.buy?.cl_ord_id} SELL AL30=${data.sell?.cl_ord_id ?? "—"}`,
        });
        await fetchOperativas();
      } else {
        const msg = data.error || data.detail || `error ${r.status}`;
        setFeedback({
          kind: "err",
          msg: typeof msg === "string" ? msg : JSON.stringify(msg),
        });
      }
    } catch (e) {
      setFeedback({ kind: "err", msg: String(e) });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="h-full flex flex-col gap-3 p-3 bg-black text-white text-[12px] overflow-auto">
      <div className="flex gap-2 items-end p-3 bg-[var(--t-panel)] border border-[#1a1a1a] flex-wrap">
        <Field label="MONTO USD" className="w-[160px]">
          <input
            type="text"
            inputMode="decimal"
            value={montoUsd}
            onChange={(e) =>
              setMontoUsd(e.target.value.replace(/[^0-9.,]/g, "").replace(",", "."))
            }
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
          <select
            value={rueda}
            onChange={(e) => setRueda(e.target.value as Rueda)}
            className={inputCls}
          >
            <option value="CI">MEP CI</option>
            <option value="24hs">MEP 24</option>
          </select>
        </Field>
        <Field label="CUENTA" className="w-[140px]">
          <AccountPicker value={account} onChange={setAccount} cuentas={cuentas} />
        </Field>
        <button
          onClick={handleEjecutar}
          disabled={submitting}
          className="bg-[#f87171] text-black font-bold tracking-wide px-5 py-1 text-[11px] hover:bg-[#ff8888] disabled:opacity-40"
        >
          {submitting ? "EJECUTANDO…" : "EJECUTAR VENTA"}
        </button>

        <div className="flex items-center gap-4 text-[10px] text-[#888]">
          <span>USD neto: US${usdNeto.toLocaleString("es-AR", { maximumFractionDigits: 2 })}</span>
          <span>Nominales estim.: {nominalesEstim ?? "—"}</span>
          <span>
            ARS estim.:{" "}
            {arsEstim
              ? `$${arsEstim.toLocaleString("es-AR", { maximumFractionDigits: 0 })}`
              : "—"}
          </span>
        </div>
      </div>

      <SaldoBox saldo={saldo} montoRequerido={0} onRefresh={onRefreshSaldo} />

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

      <DolarMepBoard rueda={rueda}>
        <table className="w-full text-[11px]">
          <thead className="bg-[#1a1a1a] sticky top-0">
            <tr>
              <Th>HORA</Th>
              <Th>TIPO</Th>
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
                <td colSpan={10} className="px-3 py-4 text-center text-[#666]">
                  Sin operativas hoy
                </td>
              </tr>
            )}
            {operativas.map((op) => {
              // El backend persiste `tipo` ("compra" | "venta") en
              // OperativasMep. No está en el type compartido porque la vista
              // compra no lo mostraba — lo leemos defensivo desde el dict.
              const tipo = ((op as unknown as Record<string, unknown>).tipo ?? "compra") as string;
              return (
                <tr
                  key={op.operativa_id}
                  className="border-b border-[#1a1a1a] hover:bg-[var(--t-surface)] cursor-pointer"
                  onClick={() => setDetalleId(op.operativa_id)}
                  title="Click para ver detalle"
                >
                  <Td>{fmtTime(op.created_at)}</Td>
                  <Td
                    className={
                      tipo === "venta" ? "text-[#f87171]" : "text-[#7fff7f]"
                    }
                  >
                    {tipo.toUpperCase()}
                  </Td>
                  <Td right>{op.nominales ?? "—"}</Td>
                  <Td right>{op.mep_inicial ?? "—"}</Td>
                  <PataCell pata={op.buy} />
                  <PataCell pata={op.sell} />
                  <Td right>{op.usd_efectivo ? `US$${op.usd_efectivo.toFixed(2)}` : "—"}</Td>
                  <Td right className="text-[#ff9900]">
                    {op.mep_efectivo ?? "—"}
                  </Td>
                  <Td className={estadoColor(op.estado)}>{op.estado ?? ""}</Td>
                  <Td className="text-[#888]">{op.actor_email ?? ""}</Td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </DolarMepBoard>

      <DolarMepDetalleDrawer
        operativaId={detalleId}
        onClose={() => setDetalleId(null)}
      />
    </div>
  );
}
