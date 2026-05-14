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
  fecha_inicio: string | null;            // último día del mes anterior
  fecha_cierre: string | null;            // último día del mes actual
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
  tea_mensual: number | null;             // 0.26 = 26%
  tem_periodo: number | null;             // TEA des-anualizada al período
  twr_base100_acum: number;
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
    ganancia_pct: number | null;
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
      <div className="flex flex-wrap items-center gap-3 px-3 py-2 border-b border-[#1a1a1a] bg-[#080808] shrink-0">
        <span className="text-[10px] tracking-widest text-[#888]">DEBUG XIRR · CUENTA</span>
        <input
          value={idCuenta}
          onChange={(e) => setIdCuenta(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") cargar(); }}
          placeholder="ej: 805"
          className="bg-black border border-[#2a2a2a] text-[11px] px-2 py-1 text-[#d0d0d0] font-mono w-[120px] focus:border-[#ff9900] focus:outline-none"
        />
        <button
          onClick={cargar}
          disabled={loading}
          className="text-[10px] tracking-widest px-3 py-1 border border-[#ff9900] text-[#ff9900] hover:bg-[#ff9900]/10 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {loading ? "CARGANDO…" : "CARGAR"}
        </button>
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
              <span className="text-[#d0d0d0]">{fmtNum(data.resumen.twr_final, 2)}</span>
            </span>
            <span>
              <span className="text-[#888]">GANANCIA: </span>
              <span className={pctColor((data.resumen.ganancia_pct ?? 0) / 100)}>
                {data.resumen.ganancia_pct !== null ? data.resumen.ganancia_pct.toFixed(2) + "%" : "—"}
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
            <thead className="sticky top-0 bg-[#0a0a0a] border-b border-[#2a2a2a]">
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
                <th className="text-right px-2 py-1">TEA</th>
                <th className="text-right px-2 py-1">TEM PER.</th>
                <th className="text-right px-2 py-1">BASE 100</th>
              </tr>
            </thead>
            <tbody>
              {data.meses.map((m) => {
                const isOpen = expanded.has(m.mes);
                const flujos = m.flujos_individuales ?? [];
                const cf = m.cashflow_xirr ?? [];
                return (
                  <Fragment key={m.mes}>
                    <tr
                      onClick={() => toggle(m.mes)}
                      className="border-b border-[#1a1a1a] hover:bg-[#0e0e0e] cursor-pointer"
                    >
                      <td className="px-2 py-1 text-[#666]">{isOpen ? "▼" : "▶"}</td>
                      <td className="px-2 py-1 text-[#d0d0d0]">{m.mes}</td>
                      <td className="px-2 py-1 text-[#888]">
                        {m.fecha_inicio ?? "—"} → {m.fecha_cierre ?? "—"}
                      </td>
                      <td className="px-2 py-1 text-right text-[#888]">{m.dias_periodo ?? "—"}</td>
                      <td className="px-2 py-1 text-right">{fmtMoney(m.valor_inicio)}</td>
                      <td className="px-2 py-1 text-right">{fmtMoney(m.valor_cierre)}</td>
                      <td className="px-2 py-1 text-right text-[#4ade80]">{fmtMoney(m.depositos)}</td>
                      <td className="px-2 py-1 text-right text-[#f87171]">{fmtMoney(m.extracciones)}</td>
                      <td className={`px-2 py-1 text-right ${pctColor(m.flujo_neto)}`}>{fmtMoney(m.flujo_neto)}</td>
                      <td className={`px-2 py-1 text-right ${pctColor(m.delta_bruto)}`}>{fmtMoney(m.delta_bruto)}</td>
                      <td className={`px-2 py-1 text-right ${pctColor(m.delta_real)}`}>{fmtMoney(m.delta_real)}</td>
                      <td className={`px-2 py-1 text-right font-semibold ${pctColor(m.tea_mensual)}`}>{fmtPct(m.tea_mensual, 2)}</td>
                      <td className={`px-2 py-1 text-right ${pctColor(m.tem_periodo)}`}>{fmtPct(m.tem_periodo, 4)}</td>
                      <td className="px-2 py-1 text-right text-[#d0d0d0]">{fmtNum(m.twr_base100_acum, 2)}</td>
                    </tr>

                    {isOpen && (
                      <tr key={`${m.mes}-detail`} className="bg-[#050505] border-b border-[#1a1a1a]">
                        <td colSpan={14} className="px-4 py-3">
                          <div className="grid grid-cols-2 gap-6">
                            {/* Cashflow XIRR */}
                            <div>
                              <div className="text-[10px] tracking-widest text-[#ff9900] mb-1">
                                CASHFLOW XIRR ({cf.length} entradas) — pegar en Excel TIR.NO.PER
                              </div>
                              <table className="w-full text-[10px]">
                                <thead>
                                  <tr className="text-[#666] tracking-widest border-b border-[#1a1a1a]">
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
                                  <tr className="text-[#666] tracking-widest border-b border-[#1a1a1a]">
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
