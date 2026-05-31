"use client";

import { Fragment, useState } from "react";

// ─── Types — shape devuelto por GET /api/manager/valuaciones/debug ─────

interface FlujoIndividual {
  fecha: string;                          // YYYY-MM-DD
  categoria: string | null;
  op: string | null;
  ticker: string | null;
  comprobante: string | null;
  moneda: string;
  importe_original: number;
  mep_aplicado: number | null;            // null si moneda=ARS
  importe_ars: number;
  informacion: string | null;
}

interface CashflowEntry {
  fecha: string;
  monto: number;
  tipo: "valor_inicio" | "flujo" | "valor_cierre";
}

interface MesDebug {
  mes: string;                            // YYYY-MM
  fecha_inicio: string | null;
  fecha_cierre: string | null;
  dias_periodo: number | null;
  valor_inicio: number | null;
  valor_cierre: number;
  depositos: number;
  extracciones: number;
  flujo_neto: number;
  delta_bruto: number | null;
  delta_real: number | null;
  flujos_individuales: FlujoIndividual[];
  cashflow_xirr: CashflowEntry[];
  tea_mensual: number | null;
  tem_periodo: number | null;
  twr_base100_acum: number;
  // USD parallels
  mep_cierre: number | null;
  valor_inicio_usd: number | null;
  valor_cierre_usd: number;
  depositos_usd: number;
  extracciones_usd: number;
  flujo_neto_usd: number;
  delta_bruto_usd: number | null;
  delta_real_usd: number | null;
  cashflow_xirr_usd: CashflowEntry[];
  tea_mensual_usd: number | null;
  tem_periodo_usd: number | null;
  twr_base100_acum_usd: number;
  n_posiciones: number;
}

interface DebugResponse {
  id_cuenta: string;
  meses: MesDebug[];
  n_meses: number;
  resumen: {
    primer_mes: string | null;
    ultimo_mes: string | null;
    n_meses: number;
    twr_final: number | null;
    twr_final_usd: number | null;
    ganancia_pct: number | null;
    ganancia_pct_usd: number | null;
  };
}

// ─── Formatters ─────────────────────────────────────────────────────────

const fmtAR = new Intl.NumberFormat("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function fmtMoney(v: number | null | undefined): string {
  if (v === null || v === undefined) return "—";
  return fmtAR.format(v);
}
function fmtPct(v: number | null | undefined, decimals = 2): string {
  if (v === null || v === undefined) return "—";
  return (v * 100).toFixed(decimals) + "%";
}
function fmtNum(v: number | null | undefined, decimals = 4): string {
  if (v === null || v === undefined) return "—";
  return v.toFixed(decimals);
}

function pctColor(v: number | null): string {
  if (v === null) return "text-[#888]";
  if (v > 0) return "text-[#4ade80]";    // verde
  if (v < 0) return "text-[#f87171]";    // rojo
  return "text-[#d0d0d0]";
}

// ─── Componente ────────────────────────────────────────────────────────

export function ManagerDebugXirrPanel() {
  const [idCuenta, setIdCuenta] = useState<string>("");
  const [data, setData] = useState<DebugResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [moneda, setMoneda] = useState<"ARS" | "USD">("ARS");

  const cargar = () => {
    const cta = idCuenta.trim();
    if (!cta) {
      setError("Ingresá un id de cuenta");
      return;
    }
    setLoading(true);
    setError(null);
    setData(null);
    setExpanded(new Set());
    fetch(`/api/manager/valuaciones/debug?id_cuenta=${encodeURIComponent(cta)}`)
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}: ${await r.text()}`);
        return r.json();
      })
      .then((d: DebugResponse) => setData(d))
      .catch((e) => setError(String(e?.message ?? e)))
      .finally(() => setLoading(false));
  };

  const toggle = (mes: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(mes)) next.delete(mes); else next.add(mes);
      return next;
    });
  };

  return (
    <div className="h-full flex flex-col min-h-0">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3 px-3 py-2 border-b border-[var(--t-border)] bg-[var(--t-panel)] shrink-0">
        <span className="text-[10px] tracking-widest text-[#888]">DEBUG XIRR · CUENTA</span>
        <input
          value={idCuenta}
          onChange={(e) => setIdCuenta(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") cargar(); }}
          placeholder="ej: 805"
          className="bg-black border border-[var(--t-border-2)] text-[11px] px-2 py-1 text-[#d0d0d0] font-mono w-[120px] focus:border-[#ff9900] focus:outline-none"
        />
        <button
          onClick={cargar}
          disabled={loading}
          className="text-[10px] tracking-widest px-3 py-1 border border-[#ff9900] text-[#ff9900] hover:bg-[#ff9900]/10 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {loading ? "CARGANDO…" : "CARGAR"}
        </button>
        {/* ARS/USD toggle */}
        <div className="flex items-center gap-1 ml-3 border-l border-[#333] pl-3">
          <button
            onClick={() => setMoneda("ARS")}
            className={`text-[10px] tracking-widest px-2 py-1 border ${
              moneda === "ARS"
                ? "border-[#4ade80] text-[#4ade80] bg-[#4ade80]/10"
                : "border-[#666] text-[#888] hover:border-[#888]"
            }`}
          >
            ARS
          </button>
          <button
            onClick={() => setMoneda("USD")}
            className={`text-[10px] tracking-widest px-2 py-1 border ${
              moneda === "USD"
                ? "border-[#4ade80] text-[#4ade80] bg-[#4ade80]/10"
                : "border-[#666] text-[#888] hover:border-[#888]"
            }`}
          >
            USD
          </button>
        </div>
        {data?.resumen && (
          <div className="flex items-center gap-4 ml-auto text-[10px] font-mono">
            <span className="text-[#888]">
              {data.resumen.primer_mes} → {data.resumen.ultimo_mes}
            </span>
            <span className="text-[#888]">
              {data.resumen.n_meses} meses
            </span>
            <span>
              <span className="text-[#888]">TWR FINAL: </span>
              <span className="text-[#d0d0d0]">
                {moneda === "ARS" ? fmtNum(data.resumen.twr_final, 2) : fmtNum(data.resumen.twr_final_usd, 2)}
              </span>
            </span>
            <span>
              <span className="text-[#888]">GANANCIA: </span>
              <span className={pctColor((moneda === "ARS" ? data.resumen.ganancia_pct : data.resumen.ganancia_pct_usd) ?? 0)}>
                {moneda === "ARS"
                  ? (data.resumen.ganancia_pct !== null ? data.resumen.ganancia_pct.toFixed(2) + "%" : "—")
                  : (data.resumen.ganancia_pct_usd !== null ? data.resumen.ganancia_pct_usd.toFixed(2) + "%" : "—")}
              </span>
            </span>
          </div>
        )}
      </div>

      {/* Body */}
      <div className="flex-1 min-h-0 overflow-auto">
        {error && (
          <div className="px-3 py-2 text-[11px] text-[#f87171] font-mono">{error}</div>
        )}

        {!data && !loading && !error && (
          <div className="p-4 text-[11px] text-[#666] font-mono">
            Ingresá una cuenta y dale CARGAR. Vas a ver mes a mes el cashflow exacto
            que recibe la función XIRR + la TEA resultante, sin caching.
          </div>
        )}

        {data && data.meses.length === 0 && (
          <div className="p-4 text-[11px] text-[#666] font-mono">
            Sin datos para esta cuenta.
          </div>
        )}

        {data && data.meses.length > 0 && (
          <table className="w-full text-[10px] font-mono">
            <thead className="sticky top-0 bg-[#0a0a0a] border-b border-[var(--t-border-2)]">
              <tr className="text-[#666] tracking-widest">
                <th className="text-left px-2 py-1 w-[28px]"></th>
                <th className="text-left px-2 py-1">MES</th>
                <th className="text-left px-2 py-1">PERÍODO</th>
                <th className="text-right px-2 py-1">DÍAS</th>
                <th className="text-right px-2 py-1">V_INICIO</th>
                <th className="text-right px-2 py-1">V_CIERRE</th>
                <th className="text-right px-2 py-1">DEPÓSITOS</th>
                <th className="text-right px-2 py-1">EXTRACCIONES</th>
                <th className="text-right px-2 py-1">FLUJO NETO</th>
                <th className="text-right px-2 py-1">Δ BRUTO</th>
                <th className="text-right px-2 py-1">Δ REAL</th>
                <th className="text-right px-2 py-1">BASE 100</th>
                <th className="text-right px-2 py-1">TEM</th>
                <th className="text-right px-2 py-1">TEA</th>
                {moneda === "USD" && <th className="text-right px-2 py-1 text-[#ff9900]">MEP</th>}
              </tr>
            </thead>
            <tbody>
              {data.meses.map((m) => {
                const isOpen = expanded.has(m.mes);
                const flujos = m.flujos_individuales ?? [];
                const cf = moneda === "ARS" ? (m.cashflow_xirr ?? []) : (m.cashflow_xirr_usd ?? []);

                // Select values based on moneda toggle
                const v_inicio = moneda === "ARS" ? m.valor_inicio : m.valor_inicio_usd;
                const v_cierre = moneda === "ARS" ? m.valor_cierre : m.valor_cierre_usd;
                const depositos = moneda === "ARS" ? m.depositos : m.depositos_usd;
                const extracciones = moneda === "ARS" ? m.extracciones : m.extracciones_usd;
                const flujo_neto = moneda === "ARS" ? m.flujo_neto : m.flujo_neto_usd;
                const delta_bruto = moneda === "ARS" ? m.delta_bruto : m.delta_bruto_usd;
                const delta_real = moneda === "ARS" ? m.delta_real : m.delta_real_usd;
                const twr_base100 = moneda === "ARS" ? m.twr_base100_acum : m.twr_base100_acum_usd;
                const tem_periodo = moneda === "ARS" ? m.tem_periodo : m.tem_periodo_usd;
                const tea_mensual = moneda === "ARS" ? m.tea_mensual : m.tea_mensual_usd;

                return (
                  <Fragment key={m.mes}>
                    <tr
                      onClick={() => toggle(m.mes)}
                      className="border-b border-[var(--t-border)] hover:bg-[var(--t-surface)] cursor-pointer"
                    >
                      <td className="px-2 py-1 text-[#666]">{isOpen ? "▼" : "▶"}</td>
                      <td className="px-2 py-1 text-[#d0d0d0]">{m.mes}</td>
                      <td className="px-2 py-1 text-[#888]">
                        {m.fecha_inicio ?? "—"} → {m.fecha_cierre ?? "—"}
                      </td>
                      <td className="px-2 py-1 text-right text-[#888]">{m.dias_periodo ?? "—"}</td>
                      <td className="px-2 py-1 text-right">{fmtMoney(v_inicio)}</td>
                      <td className="px-2 py-1 text-right">{fmtMoney(v_cierre)}</td>
                      <td className="px-2 py-1 text-right text-[#4ade80]">{fmtMoney(depositos)}</td>
                      <td className="px-2 py-1 text-right text-[#f87171]">{fmtMoney(extracciones)}</td>
                      <td className={`px-2 py-1 text-right ${pctColor(flujo_neto)}`}>{fmtMoney(flujo_neto)}</td>
                      <td className={`px-2 py-1 text-right ${pctColor(delta_bruto)}`}>{fmtMoney(delta_bruto)}</td>
                      <td className={`px-2 py-1 text-right ${pctColor(delta_real)}`}>{fmtMoney(delta_real)}</td>
                      <td className="px-2 py-1 text-right text-[#d0d0d0]">{fmtNum(twr_base100, 2)}</td>
                      <td className={`px-2 py-1 text-right ${pctColor(tem_periodo)}`}>{fmtPct(tem_periodo, 4)}</td>
                      <td className={`px-2 py-1 text-right font-semibold ${pctColor(tea_mensual)}`}>{fmtPct(tea_mensual, 2)}</td>
                      {moneda === "USD" && <td className="px-2 py-1 text-right text-[#ff9900]">{fmtNum(m.mep_cierre, 2)}</td>}
                    </tr>

                    {isOpen && (
                      <tr key={`${m.mes}-detail`} className="bg-[#050505] border-b border-[var(--t-border)]">
                        <td colSpan={moneda === "USD" ? 15 : 14} className="px-4 py-3">
                          <div className="grid grid-cols-2 gap-6">
                            {/* Cashflow XIRR */}
                            <div>
                              <div className="text-[10px] tracking-widest text-[#ff9900] mb-1">
                                CASHFLOW XIRR ({cf.length} entradas) — pegar en Excel TIR.NO.PER
                              </div>
                              <table className="w-full text-[10px]">
                                <thead>
                                  <tr className="text-[#666] tracking-widest border-b border-[var(--t-border)]">
                                    <th className="text-left py-0.5">FECHA</th>
                                    <th className="text-right py-0.5">MONTO</th>
                                    <th className="text-left py-0.5 pl-3">TIPO</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {cf.length === 0 && (
                                    <tr><td colSpan={3} className="py-1 text-[#666]">
                                      Sin cashflow — TEA no se calcula (primer mes o capital cero).
                                    </td></tr>
                                  )}
                                  {cf.map((c, i) => (
                                    <tr key={i} className="border-b border-[#0a0a0a]">
                                      <td className="py-0.5 text-[#d0d0d0]">{c.fecha}</td>
                                      <td className={`py-0.5 text-right ${pctColor(c.monto)}`}>{fmtMoney(c.monto)}</td>
                                      <td className="py-0.5 pl-3 text-[#888]">{c.tipo}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>

                            {/* Flujos individuales */}
                            <div>
                              <div className="text-[10px] tracking-widest text-[#ff9900] mb-1">
                                FLUJOS INDIVIDUALES ({flujos.length})
                              </div>
                              <table className="w-full text-[10px]">
                                <thead>
                                  <tr className="text-[#666] tracking-widest border-b border-[var(--t-border)]">
                                    <th className="text-left py-0.5">FECHA</th>
                                    <th className="text-left py-0.5">CAT</th>
                                    <th className="text-right py-0.5">ORIG</th>
                                    <th className="text-left py-0.5 pl-1">MON</th>
                                    <th className="text-right py-0.5">MEP</th>
                                    <th className="text-right py-0.5">ARS</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {flujos.length === 0 && (
                                    <tr><td colSpan={6} className="py-1 text-[#666]">
                                      Sin flujos externos en el mes.
                                    </td></tr>
                                  )}
                                  {flujos.map((f, i) => (
                                    <tr key={i} className="border-b border-[#0a0a0a]" title={f.informacion ?? ""}>
                                      <td className="py-0.5 text-[#d0d0d0]">{f.fecha}</td>
                                      <td className="py-0.5 text-[#888]">{f.categoria}</td>
                                      <td className={`py-0.5 text-right ${pctColor(f.importe_original)}`}>
                                        {fmtMoney(f.importe_original)}
                                      </td>
                                      <td className="py-0.5 pl-1 text-[#888]">{f.moneda}</td>
                                      <td className="py-0.5 text-right text-[#888]">
                                        {f.mep_aplicado !== null ? fmtNum(f.mep_aplicado, 2) : "—"}
                                      </td>
                                      <td className={`py-0.5 text-right ${pctColor(f.importe_ars)}`}>
                                        {fmtMoney(f.importe_ars)}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
