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
  cuentas: CuentaDescubierta[];
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
  cuentas,
  cot, saldo,
  onRefreshSaldo,
}: Props) {
  const [operativas, setOperativas] = useState<OperativaMep[]>([]);
  const [feedback, setFeedback] = useState<{ kind: "ok" | "err"; msg: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [detalleId, setDetalleId] = useState<string | null>(null);
  // Modo de input: ARS (default) o USD. El backend sólo acepta `monto_ars`,
  // así que cuando el user pone USD calculamos los ARS equivalentes y los
  // mandamos. La cotización del bono se mueve en vivo → el cálculo se
  // refresca con cada tick.
  const [inputMode, setInputMode] = useState<"ARS" | "USD">("ARS");
  const [montoUsd, setMontoUsd] = useState<string>("");

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

  const comNum = parseFloat(comision) || 0;
  const precioAl30 = cot?.al30?.price ?? null;
  const precioAl30d = cot?.al30d?.price ?? null;
  const mep = cot?.mep_implicito ?? null;
  // Conversión inversa USD → ARS: si querés N USD, necesitás
  //   arsNeto = N * (precioAl30 / precioAl30d)
  //   montoArs = arsNeto / (1 - comNum/100)
  // Cuando el modo es USD y los precios están disponibles, sincronizamos
  // `monto` (que es lo que va al backend) con el ARS calculado.
  const usdNum = parseFloat(montoUsd.replace(",", ".")) || 0;
  useEffect(() => {
    if (inputMode !== "USD") return;
    if (!precioAl30 || !precioAl30d || !usdNum) return;
    const arsNetoCalc = usdNum * (precioAl30 / precioAl30d);
    const arsCalc = Math.round(arsNetoCalc / (1 - comNum / 100));
    setMonto(String(arsCalc));
  }, [inputMode, usdNum, precioAl30, precioAl30d, comNum, setMonto]);

  const montoNum = parseInt(monto, 10) || 0;
  const montoDisplay = montoNum ? montoNum.toLocaleString("es-AR") : "";
  const arsNeto = montoNum * (1 - comNum / 100);
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
          client_order_id: crypto.randomUUID(),  // idempotencia: anti doble operativa
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
    <div className="h-full flex flex-col gap-3 p-3 bg-[var(--t-panel)] text-[var(--t-text)] text-[12px] overflow-auto">
      {/* Form: inputs + EJECUTAR + cálculos horizontales pegados al botón */}
      <div className="flex gap-2 items-end p-3 bg-[var(--t-panel)] border border-[var(--t-border)] flex-wrap">
        {/* Toggle ARS / USD: cuando el user pone monto en USD, el ARS equivalente
            se calcula con la cotización viva del par AL30/AL30D y se manda al
            backend (que sólo conoce ARS). */}
        <Field label="MODO" className="w-[110px]">
          <div className="flex gap-0.5">
            {(["ARS", "USD"] as const).map((m) => (
              <button
                key={m}
                onClick={() => {
                  setInputMode(m);
                  // Al cambiar de modo, blanqueamos el campo NO activo para
                  // evitar valores stale en pantalla.
                  if (m === "ARS") setMontoUsd("");
                  else setMonto("");
                }}
                className={`flex-1 px-2 py-0.5 text-[11px] font-bold border ${
                  inputMode === m
                    ? "bg-[var(--t-accent)] text-[var(--t-on-accent)] border-[var(--t-accent)]"
                    : "bg-transparent text-[var(--t-text-dim)] border-[var(--t-border-2)] hover:text-[var(--t-text)]"
                }`}
                title={m === "USD" ? "Ingresar cantidad de USD a comprar" : "Ingresar monto ARS a invertir"}
              >
                {m}
              </button>
            ))}
          </div>
        </Field>
        {inputMode === "ARS" ? (
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
        ) : (
          <Field label="MONTO USD" className="w-[160px]">
            <input
              type="text"
              inputMode="decimal"
              value={montoUsd}
              onChange={(e) =>
                // Acepta dígitos, coma y punto; normaliza coma→punto.
                setMontoUsd(e.target.value.replace(/[^0-9.,]/g, "").replace(",", "."))
              }
              className={inputCls}
              placeholder="0"
            />
          </Field>
        )}
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
        <Field label="CUENTA" className="w-[140px]">
          <AccountPicker value={account} onChange={setAccount} cuentas={cuentas} />
        </Field>
        <button
          onClick={handleEjecutar}
          disabled={submitting}
          className="bg-[var(--t-accent)] text-[var(--t-on-accent)] font-bold tracking-wide px-5 py-1 text-[11px] hover:bg-[#ffaa22] disabled:opacity-40"
        >
          {submitting ? "EJECUTANDO…" : "EJECUTAR"}
        </button>

        <div className="flex items-center gap-4 text-[10px] text-[var(--t-text-dim)]">
          {inputMode === "USD" && (
            <span>
              ARS necesarios:{" "}
              <span className="text-[var(--t-accent)]">
                ${montoNum.toLocaleString("es-AR")}
              </span>
            </span>
          )}
          <span>ARS neto: ${arsNeto.toLocaleString("es-AR", { maximumFractionDigits: 2 })}</span>
          <span>Nominales estim.: {nominalesEstim ?? "—"}</span>
          <span>USD estim.: {usdEstim ? `US$${usdEstim.toFixed(2)}` : "—"}</span>
        </div>
      </div>

      {/* Saldo — debajo del form (la lógica es: primero elegís cuenta, después ves saldo) */}
      <SaldoBox saldo={saldo} montoRequerido={montoNum} onRefresh={onRefreshSaldo} />

      {feedback && (
        <div
          className={`px-3 py-2 text-[11px] border ${
            feedback.kind === "ok"
              ? "bg-[var(--t-tint-green)] border-[#1a4a1a] text-[var(--t-pos)]"
              : "bg-[var(--t-tint-red)] border-[#4a1a1a] text-[var(--t-neg)]"
          }`}
        >
          {feedback.msg}
        </div>
      )}

      {/* Chart + tabla operativas — split compartido con TRADING (sólo cambia la tabla) */}
      <DolarMepBoard rueda={rueda}>
        <table className="w-full text-[11px]">
          <thead className="bg-[var(--t-border)] sticky top-0">
            <tr>
              <Th>HORA</Th>
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
                <td colSpan={10} className="px-3 py-4 text-center text-[var(--t-text-muted)]">
                  Sin operativas hoy
                </td>
              </tr>
            )}
            {operativas.map((op) => (
              <tr
                key={op.operativa_id}
                className="border-b border-[var(--t-border)] hover:bg-[var(--t-surface)] cursor-pointer"
                onClick={() => setDetalleId(op.operativa_id)}
                title="Click para ver detalle de la operativa"
              >
                <Td>{fmtTime(op.created_at)}</Td>
                <Td right>{fmtArs(op.monto_ars)}</Td>
                <Td right>{op.nominales ?? "—"}</Td>
                <Td right>{op.mep_inicial ?? "—"}</Td>
                <PataCell pata={op.buy} />
                <PataCell pata={op.sell} />
                <Td right>{op.usd_efectivo ? `US$${op.usd_efectivo.toFixed(2)}` : "—"}</Td>
                <Td right className="text-[var(--t-accent)]">{op.mep_efectivo ?? "—"}</Td>
                <Td className={estadoColor(op.estado)}>{op.estado ?? ""}</Td>
                <Td className="text-[var(--t-text-dim)]">{op.actor_email ?? ""}</Td>
              </tr>
            ))}
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
