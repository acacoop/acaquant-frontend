"use client";

import { useEffect, useState } from "react";
import {
  Cotizacion,
  CuentaDescubierta,
  Field,
  inputCls,
  PRICE_FACTOR_BONOS,
  Rueda,
  SaldoBox,
  SaldoCuenta,
  Td,
  Th,
  TriggerMep,
  estadoColor,
  fmtArs,
  fmtTime,
} from "./dolar-mep-shared";
import { DolarMepBoard } from "./dolar-mep-board";

// Vista TRADING: trigger condicional. El user define un MEP objetivo y
// el scanner del backend dispara la operativa cuando MEP <= objetivo.
// Cancelación automática a las 19:50 UTC (16:50 ART).
interface Props {
  rueda: Rueda;
  setRueda: (r: Rueda) => void;
  monto: string;
  setMonto: (v: string) => void;
  comision: string;
  setComision: (v: string) => void;
  account: string;
  setAccount: (v: string) => void;
  cuentas: CuentaDescubierta[];
  cot: Cotizacion | null;
  saldo: SaldoCuenta | null;
  onRefreshSaldo?: () => void;
}

export function DolarMepTradingView({
  rueda, setRueda,
  monto, setMonto,
  comision, setComision,
  account, setAccount,
  cuentas,
  cot, saldo,
  onRefreshSaldo,
}: Props) {
  const [tcObjetivo, setTcObjetivo] = useState("");
  const [tpObjetivo, setTpObjetivo] = useState("");
  const [slObjetivo, setSlObjetivo] = useState("");
  const [triggers, setTriggers] = useState<TriggerMep[]>([]);
  const [feedback, setFeedback] = useState<{ kind: "ok" | "err"; msg: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function fetchTriggers() {
    try {
      const r = await fetch("/api/operativa/mep/triggers/dia", { cache: "no-store" });
      if (r.ok) {
        const data = await r.json();
        setTriggers(Array.isArray(data) ? data : []);
      }
    } catch {
      // ignore
    }
  }

  useEffect(() => {
    fetchTriggers();
    // 10s — el scanner del backend evalúa cada 1s, así que 10s en
    // pantalla es retraso máximo de 10s para ver el cambio de estado
    // de un trigger (ACTIVE → EXECUTED, etc.). Suficiente.
    const id = setInterval(fetchTriggers, 10000);
    return () => clearInterval(id);
  }, []);

  const montoNum = parseInt(monto, 10) || 0;
  const montoDisplay = montoNum ? montoNum.toLocaleString("es-AR") : "";
  const comNum = parseFloat(comision) || 0;
  const tcNum = parseFloat(tcObjetivo) || 0;
  const tpNum = parseFloat(tpObjetivo) || 0;
  const slNum = parseFloat(slObjetivo) || 0;
  const mep = cot?.mep_implicito ?? null;
  const arsNeto = montoNum * (1 - comNum / 100);
  const precioAl30 = cot?.al30?.price ?? null;
  const nominalesEstim =
    precioAl30 && precioAl30 > 0 ? Math.floor(arsNeto / (precioAl30 * PRICE_FACTOR_BONOS)) : null;

  // Distancia entre MEP actual y el objetivo. Negativa si el objetivo está
  // por encima del MEP actual (el trigger se dispararía YA).
  const dist = mep !== null && tcNum > 0 ? mep - tcNum : null;
  const tieneBracket = tpNum > 0 || slNum > 0;

  async function handleArmar() {
    if (!montoNum || montoNum <= 0) {
      setFeedback({ kind: "err", msg: "Monto debe ser > 0" });
      return;
    }
    if (!tcNum || tcNum <= 0) {
      setFeedback({ kind: "err", msg: "TC objetivo debe ser > 0" });
      return;
    }

    const aviso =
      dist !== null && dist <= 0
        ? `\n\n⚠ El MEP actual ($${mep?.toFixed(2)}) ya está ≤ que tu objetivo ($${tcNum.toFixed(2)}). El trigger va a disparar al instante.`
        : "";

    const bracketLines = tieneBracket
      ? [
          tpNum > 0 ? `• Take Profit: vender cuando MEP ≥ $${tpNum.toFixed(2)}` : null,
          slNum > 0 ? `• Stop Loss: vender cuando MEP ≤ $${slNum.toFixed(2)}` : null,
          `• ⚠ Si entrás pero no dispara TP/SL antes de las 16:50 ART, te quedás con USD overnight.`,
        ].filter(Boolean).join("\n")
      : "";

    if (!confirm(
      `Armar trigger MEP ${rueda}:\n\n` +
      `• Monto: $${montoNum.toLocaleString("es-AR")} ARS\n` +
      `• Comisión: ${comNum}%\n` +
      `• Entry: comprar cuando MEP ≤ $${tcNum.toFixed(2)}\n` +
      (bracketLines ? bracketLines + "\n" : "") +
      `• MEP actual: $${mep?.toFixed(2) ?? "?"}\n` +
      `• Auto-cancela el trigger a las 16:50 ART.${aviso}\n\n` +
      `¿Confirmar?`,
    )) return;

    setSubmitting(true);
    setFeedback(null);
    try {
      const r = await fetch("/api/operativa/mep/trigger", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          monto_ars: montoNum,
          comision_pct: comNum,
          rueda,
          tc_objetivo: tcNum,
          tp_objetivo: tpNum > 0 ? tpNum : null,
          sl_objetivo: slNum > 0 ? slNum : null,
          account: account || null,
        }),
      });
      const data = await r.json();
      if (r.ok && data.ok) {
        setFeedback({ kind: "ok", msg: `Trigger armado · ${data.trigger_id.substring(0, 8)}` });
        setTcObjetivo("");
        setTpObjetivo("");
        setSlObjetivo("");
        await fetchTriggers();
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

  async function handleCancelar(triggerId: string) {
    if (!confirm(`Cancelar trigger ${triggerId.substring(0, 8)}?`)) return;
    try {
      const r = await fetch(`/api/operativa/mep/trigger/${encodeURIComponent(triggerId)}`, {
        method: "DELETE",
      });
      const data = await r.json();
      if (r.ok && data.ok) {
        setFeedback({ kind: "ok", msg: `Trigger ${triggerId.substring(0, 8)} cancelado` });
        await fetchTriggers();
      } else {
        const msg = data.error || data.detail || `error ${r.status}`;
        setFeedback({ kind: "err", msg: typeof msg === "string" ? msg : JSON.stringify(msg) });
      }
    } catch (e) {
      setFeedback({ kind: "err", msg: String(e) });
    }
  }

  return (
    <div className="h-full flex flex-col gap-3 p-3 bg-black text-white text-[12px] overflow-auto">
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
        <Field label="CUENTA" className="w-[140px]">
          <select value={account} onChange={(e) => setAccount(e.target.value)} className={inputCls}>
            {cuentas.length === 0 ? (
              <option value="">— sin cuentas —</option>
            ) : (
              cuentas.map((c) => (
                <option key={c.account_id} value={c.account_id}>
                  {c.account_id}
                  {c.activa ? "" : " (vacía)"}
                </option>
              ))
            )}
          </select>
        </Field>
        <Field label="MEP ENTRY ≤" className="w-[120px]">
          <input
            type="number"
            value={tcObjetivo}
            onChange={(e) => setTcObjetivo(e.target.value)}
            className={inputCls}
            step="0.01"
            min={0}
            placeholder="ej. 1420"
          />
        </Field>
        <Field label="MEP TP ≥ (opc)" className="w-[120px]">
          <input
            type="number"
            value={tpObjetivo}
            onChange={(e) => setTpObjetivo(e.target.value)}
            className={inputCls}
            step="0.01"
            min={0}
            placeholder="ej. 1480"
          />
        </Field>
        <Field label="MEP SL ≤ (opc)" className="w-[120px]">
          <input
            type="number"
            value={slObjetivo}
            onChange={(e) => setSlObjetivo(e.target.value)}
            className={inputCls}
            step="0.01"
            min={0}
            placeholder="ej. 1390"
          />
        </Field>
        <button
          onClick={handleArmar}
          disabled={submitting}
          className="bg-[#ff9900] text-black font-bold tracking-wide px-5 py-1 text-[11px] hover:bg-[#ffaa22] disabled:opacity-40"
        >
          {submitting ? "ARMANDO…" : tieneBracket ? "ARMAR BRACKET" : "ARMAR TRIGGER"}
        </button>

        <div className="flex items-center gap-4 text-[10px] text-[#888]">
          <span>Nominales estim.: {nominalesEstim ?? "—"}</span>
          <span>MEP actual: {mep !== null ? `$${mep.toFixed(2)}` : "—"}</span>
          <span className={dist !== null && dist <= 0 ? "text-[#ff9900]" : ""}>
            Distancia: {dist !== null ? `${dist > 0 ? "+" : ""}$${dist.toFixed(2)}` : "—"}
          </span>
        </div>
      </div>

      {/* Saldo — debajo del form (la lógica es: primero elegís cuenta, después ves saldo) */}
      <SaldoBox saldo={saldo} montoRequerido={montoNum} onRefresh={onRefreshSaldo} />

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

      {/* Chart + tabla triggers — split compartido con COMPRA (sólo cambia la tabla) */}
      <DolarMepBoard rueda={rueda}>
        <table className="w-full text-[11px]">
          <thead className="bg-[#1a1a1a] sticky top-0">
            <tr>
              <Th>HORA</Th>
              <Th>RUEDA</Th>
              <Th right>MONTO ARS</Th>
              <Th right>ENTRY ≤</Th>
              <Th right>TP ≥</Th>
              <Th right>SL ≤</Th>
              <Th right>MEP ÚLT</Th>
              <Th>ESTADO</Th>
              <Th>OP. ENTRY</Th>
              <Th>OP. EXIT</Th>
              <Th>USER</Th>
              <Th></Th>
            </tr>
          </thead>
          <tbody>
            {triggers.length === 0 && (
              <tr>
                <td colSpan={12} className="px-3 py-4 text-center text-[#666]">
                  Sin triggers hoy
                </td>
              </tr>
            )}
            {triggers.map((t) => {
              const cancelable = t.estado === "ACTIVE" || t.estado === "WAITING_EXIT";
              const errMsg = t.exit_error || t.error;
              return (
                <tr key={t.trigger_id} className="border-b border-[#1a1a1a]">
                  <Td>{fmtTime(t.created_at)}</Td>
                  <Td>{t.rueda}</Td>
                  <Td right>{fmtArs(t.monto_ars)}</Td>
                  <Td right className="text-[#ff9900]">${t.tc_objetivo.toFixed(2)}</Td>
                  <Td right className="text-[#7fff7f]">
                    {t.tp_objetivo ? `$${t.tp_objetivo.toFixed(2)}` : "—"}
                  </Td>
                  <Td right className="text-[#ff7f7f]">
                    {t.sl_objetivo ? `$${t.sl_objetivo.toFixed(2)}` : "—"}
                  </Td>
                  <Td right>{t.last_seen_mep !== null && t.last_seen_mep !== undefined
                    ? `$${t.last_seen_mep.toFixed(2)}`
                    : "—"}</Td>
                  <Td className={estadoColor(t.estado)}>
                    <div className="flex flex-col">
                      <span>{t.estado}</span>
                      {t.exit_motivo && t.estado === "EXITED" && (
                        <span className="text-[9px] text-[#888] mt-0.5">
                          via {t.exit_motivo}
                        </span>
                      )}
                      {errMsg && (
                        <span
                          className="text-[9px] text-[#888] mt-0.5 max-w-[200px] truncate"
                          title={errMsg}
                        >
                          {errMsg}
                        </span>
                      )}
                    </div>
                  </Td>
                  <Td className="font-mono text-[10px]">
                    {t.operativa_id ? t.operativa_id.substring(0, 8) : ""}
                  </Td>
                  <Td className="font-mono text-[10px]">
                    {t.operativa_exit_id ? t.operativa_exit_id.substring(0, 8) : ""}
                  </Td>
                  <Td className="text-[#888]">{t.actor_email ?? ""}</Td>
                  <Td>
                    {cancelable && (
                      <button
                        onClick={() => handleCancelar(t.trigger_id)}
                        className="text-[#ff7f7f] hover:bg-[#2a0a0a] px-2 py-0.5 border border-[#4a1a1a] text-[10px]"
                      >
                        CANCELAR
                      </button>
                    )}
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </DolarMepBoard>
    </div>
  );
}
