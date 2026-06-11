"use client";

import { useEffect, useMemo, useState } from "react";
import { usePersistedState } from "@/lib/use-persisted-state";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { fmtMoney } from "@/lib/fmt-money";
import { exportToXlsx, timestampSuffix, type ColumnDef } from "@/lib/xlsx-export";
import { ReferidoFciTable } from "@/components/referido-fci-table";

/**
 * /referidos — vista para la EMPRESA referidora. Solo sus cuentas: cuánto operan,
 * AuM, rendimientos/valuación (estilo CARTERAS), volumen y aranceles. Reusa los
 * endpoints /comercial/* + /valuaciones/{id}/mensual + /aum-pnl. Switch ARS/USD.
 */

type ClienteRow = {
  id_cuenta: string; denominacion: string; aum: number;
  vol_mes: number; vol_ano: number; arancel_mes: number; arancel_total: number;
};
type Posicion = { unidad: string; valuacion: number; pct: number };
type Resumen = { n_clientes: number; aum_total: number; vol_mes: number; vol_ano: number; arancel_mes: number; arancel_total: number };
type RefResp = { referido: string; moneda: string; clientes: ClienteRow[]; posiciones: Posicion[]; resumen: Resumen };
type SeriePt = { fecha: string; valor: number };
type MensualRow = {
  mes: string;
  valuacion_cierre: number; valuacion_cierre_usd: number;
  flujo_neto: number; flujo_neto_usd: number;
  tea_mensual: number | null; tea_mensual_usd: number | null;
  twr_base100: number; twr_base100_usd: number;
};
type MensualResp = { meses: MensualRow[] };
type PnLRow = {
  ticker: string; display_name?: string;
  valor_actual_aum: number; valor_actual_usd?: number | null;
  pnl_no_realizado: number | null; pnl_no_realizado_usd?: number | null;
  pnl_total: number; pnl_total_usd?: number | null;
};
type PnLResp = { rows: PnLRow[]; totales: Record<string, number> };
type Operacion = {
  fecha: string; comprobante: string; categoria: string; op: string | null;
  ticker: string | null; importe: number | null; moneda: string | null; arancel: number | null;
};
type Metric = "valuacion" | "rend" | "volumen";

const OP_LABEL: Record<string, string> = {
  compra: "Compra", venta: "Venta", suscripcion_fci: "Susc FCI", rescate_fci: "Resc FCI",
  solicitud_suscripcion_fci: "Sol. susc", solicitud_rescate_fci: "Sol. resc",
  caucion_colocadora: "Cauc. col", caucion_tomadora: "Cauc. tom",
};
const RANGOS = ["MTD", "1M", "3M", "YTD", "1A", "ALL"] as const;

const TODOS = "__todos__";
const fmtFecha = (s: string) => { const [y, m, d] = s.split("-"); return d ? `${d}/${m}/${y.slice(2)}` : `${m}/${y.slice(2)}`; };
const pnlColor = (v: number | null | undefined) => (v == null ? "var(--t-text-muted)" : v >= 0 ? "var(--t-pos)" : "var(--t-neg)");
const HDR = "px-3 py-1.5 border-b border-[var(--t-border)] bg-[var(--t-accent)]/10 shrink-0 flex items-center gap-2";

async function getJson<T>(url: string): Promise<T | null> {
  try { const r = await fetch(url, { cache: "no-store" }); return r.ok ? ((await r.json()) as T) : null; } catch { return null; }
}

// Filtra una serie (asc) por rango, contando desde su última fecha.
function filtrarRango(data: SeriePt[], rango: string): SeriePt[] {
  if (!data.length || rango === "ALL") return data;
  const last = data[data.length - 1].fecha;
  const lastD = new Date((last.length === 7 ? `${last}-01` : last) + "T00:00:00Z");
  let cutoff: Date;
  if (rango === "MTD") cutoff = new Date(Date.UTC(lastD.getUTCFullYear(), lastD.getUTCMonth(), 1));
  else if (rango === "YTD") cutoff = new Date(Date.UTC(lastD.getUTCFullYear(), 0, 1));
  else {
    const days = rango === "1M" ? 30 : rango === "3M" ? 90 : 365;
    cutoff = new Date(lastD.getTime() - days * 86400000);
  }
  const cstr = cutoff.toISOString().slice(0, last.length);
  return data.filter((d) => d.fecha >= cstr);
}

export function ReferidosView() {
  const [referidos, setReferidos] = useState<{ ref: string; n: number }[]>([]);
  const [referido, setReferido] = usePersistedState<string>("referidos.ref", "");
  const [moneda, setMoneda] = usePersistedState<"ARS" | "USD">("referidos.moneda", "ARS");
  const [metric, setMetric] = usePersistedState<Metric>("referidos.metric2", "valuacion");
  const [rango, setRango] = usePersistedState<string>("referidos.rango", "YTD");
  const [data, setData] = useState<RefResp | null>(null);
  const [serie, setSerie] = useState<SeriePt[]>([]);
  const [mensual, setMensual] = useState<MensualResp | null>(null);
  const [sel, setSel] = useState<string | null>(null);
  const [pnl, setPnl] = useState<PnLResp | null>(null);
  const [ops, setOps] = useState<Operacion[]>([]);
  const [detTab, setDetTab] = usePersistedState<"pnl" | "ops">("referidos.detTab", "pnl");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    void (async () => {
      const d = await getJson<{ combos: { referido: string | null; n_cuentas: number }[] }>("/api/operaciones/comercial/dimensiones");
      if (!d) return;
      const m = new Map<string, number>();
      for (const c of d.combos) if (c.referido) m.set(c.referido, (m.get(c.referido) ?? 0) + c.n_cuentas);
      setReferidos([...m.entries()].map(([ref, n]) => ({ ref, n })).sort((a, b) => b.n - a.n));
    })();
  }, []);

  useEffect(() => {
    if (!referido) { setData(null); setSel(null); return; }
    let alive = true; setLoading(true);
    void (async () => {
      const d = await getJson<RefResp>(`/api/operaciones/comercial/referido-clientes?referido=${encodeURIComponent(referido)}&moneda=${moneda}`);
      if (alive) { setData(d); setSel(null); setLoading(false); }
    })();
    return () => { alive = false; };
  }, [referido, moneda]);

  // Serie del chart: valuación (AUM) o volumen operado. Rendimiento usa `mensual`.
  useEffect(() => {
    if (!referido || metric === "rend") { setSerie([]); return; }
    let alive = true;
    const metricApi = metric === "volumen" ? "volumen" : "aum";
    const scope = sel ? `&id_cuenta=${encodeURIComponent(sel)}` : `&referido=${encodeURIComponent(referido)}`;
    void (async () => {
      const d = await getJson<{ serie: SeriePt[] }>(`/api/operaciones/comercial/serie?operador=${TODOS}&metric=${metricApi}&moneda=${moneda}${scope}`);
      if (alive) setSerie(d?.serie ?? []);
    })();
    return () => { alive = false; };
  }, [referido, sel, moneda, metric]);

  // Mensual del cliente (CARTERAS): chart rendimiento (TWR) + tabla mes a mes.
  useEffect(() => {
    if (!sel) { setMensual(null); return; }
    let alive = true;
    void (async () => {
      const d = await getJson<MensualResp>(`/api/valuaciones/${encodeURIComponent(sel)}/mensual`);
      if (alive) setMensual(d);
    })();
    return () => { alive = false; };
  }, [sel]);

  useEffect(() => {
    if (!sel) { setPnl(null); return; }
    let alive = true;
    void (async () => {
      const d = await getJson<PnLResp>(`/api/aum-pnl?id_cuenta=${encodeURIComponent(sel)}`);
      if (alive) setPnl(d);
    })();
    return () => { alive = false; };
  }, [sel]);

  useEffect(() => {
    if (!sel) { setOps([]); return; }
    let alive = true;
    void (async () => {
      const d = await getJson<{ operaciones: Operacion[] }>(`/api/operaciones/comercial/operaciones?id_cuenta=${encodeURIComponent(sel)}`);
      if (alive) setOps(d?.operaciones ?? []);
    })();
    return () => { alive = false; };
  }, [sel]);

  const clientes = data?.clientes ?? [];
  const res = data?.resumen;
  const usd = moneda === "USD";
  const selCli = clientes.find((c) => c.id_cuenta === sel) || null;
  const isRend = metric === "rend";
  const isBar = metric === "volumen";

  const rawChart = useMemo<SeriePt[]>(() => {
    if (isRend) {
      if (!sel || !mensual) return [];
      return [...mensual.meses].reverse().map((m) => ({ fecha: m.mes, valor: (usd ? m.twr_base100_usd : m.twr_base100) - 100 }));
    }
    return serie.map((p) => ({ fecha: p.fecha, valor: Math.max(0, p.valor) }));
  }, [isRend, sel, mensual, serie, usd]);
  const chartData = useMemo(() => filtrarRango(rawChart, rango), [rawChart, rango]);

  const yDomain = useMemo<[number | string, number | string]>(() => {
    if (isRend) return ["auto", "auto"];
    const vals = chartData.map((d) => d.valor);
    if (!vals.length) return [0, "auto"];
    const maxV = Math.max(...vals, 1);
    const minV = Math.min(...vals);
    if (isBar) return [0, maxV * 1.06];
    const floor = minV > 0 ? minV * 0.9 : -(maxV * 0.04);
    return [floor, maxV * 1.06];
  }, [isRend, isBar, chartData]);

  const pnlValor = (r: PnLRow) => (usd ? r.valor_actual_usd ?? null : r.valor_actual_aum);
  const pnlNoReal = (r: PnLRow) => (usd ? r.pnl_no_realizado_usd ?? null : r.pnl_no_realizado);
  const pnlTot = (r: PnLRow) => (usd ? r.pnl_total_usd ?? null : r.pnl_total);
  const selCls = "bg-[var(--t-surface)] border text-[var(--t-text)] text-[11px] px-2 py-1 font-mono outline-none";
  const tituloChart = isRend ? "Rendimiento (TWR)" : isBar ? "Volumen operado" : "Valuación / AUM";

  // Descarga a Excel — una hoja por tabla.
  const dl = (tabla: string, rows: readonly unknown[], columns: ColumnDef[]) =>
    void exportToXlsx({
      sheets: [{ name: tabla.slice(0, 31), title: `Referido: ${referido}${sel ? ` · Cuenta ${sel}` : ""} (${moneda})`, rows, columns }],
      filename: `referidos-${(referido || "todos").replace(/\W+/g, "_")}-${tabla}-${timestampSuffix()}.xlsx`,
    });
  const dlClientes = () => dl("Clientes", clientes, [
    { header: "Cliente", key: "denominacion", format: "text", width: 30 },
    { header: "Cuenta", key: "id_cuenta", format: "text" },
    { header: `AuM ${moneda}`, key: "aum", format: "number" },
    { header: "Vol mes", key: "vol_mes", format: "number" },
    { header: "Vol año", key: "vol_ano", format: "number" },
    { header: "Arancel mes", key: "arancel_mes", format: "number" },
    { header: "Arancel año", key: "arancel_total", format: "number" },
  ]);
  const dlOps = () => dl("Operaciones", ops.map((o) => ({
    fecha: o.fecha, boleto: o.comprobante, tipo: OP_LABEL[o.categoria] || o.categoria,
    ticker: o.ticker, importe: o.importe != null ? Math.abs(o.importe) : null, moneda: o.moneda, arancel: o.arancel,
  })), [
    { header: "Fecha", key: "fecha", format: "date" },
    { header: "Boleto", key: "boleto", format: "text" },
    { header: "Tipo", key: "tipo", format: "text" },
    { header: "Ticker", key: "ticker", format: "text" },
    { header: "Importe", key: "importe", format: "number" },
    { header: "Moneda", key: "moneda", format: "text" },
    { header: "Arancel", key: "arancel", format: "number" },
  ]);
  const dlPnl = () => dl("PnL", (pnl?.rows ?? []).map((r) => ({
    ticker: r.display_name || r.ticker, valor: pnlValor(r), pnl_no_real: pnlNoReal(r), pnl_total: pnlTot(r),
  })), [
    { header: "Ticker", key: "ticker", format: "text", width: 22 },
    { header: `Valor ${moneda}`, key: "valor", format: "number" },
    { header: "PnL no realizado", key: "pnl_no_real", format: "number" },
    { header: "PnL total", key: "pnl_total", format: "number" },
  ]);
  const dlPosicion = () => dl("Posicion", data?.posiciones ?? [], [
    { header: "Título", key: "unidad", format: "text", width: 32 },
    { header: `Valuación ${moneda}`, key: "valuacion", format: "number" },
    { header: "%", key: "pct", format: "percent" },
  ]);
  const dlMesAMes = () => dl("MesAMes", (mensual?.meses ?? []).map((m) => ({
    mes: m.mes,
    valuacion: usd ? m.valuacion_cierre_usd : m.valuacion_cierre,
    flujo: usd ? m.flujo_neto_usd : m.flujo_neto,
    tea_pct: (usd ? m.tea_mensual_usd : m.tea_mensual) != null ? (usd ? m.tea_mensual_usd! : m.tea_mensual!) * 100 : null,
    rend: (usd ? m.twr_base100_usd : m.twr_base100) - 100,
  })), [
    { header: "Mes", key: "mes", format: "text" },
    { header: `Valuación ${moneda}`, key: "valuacion", format: "number" },
    { header: "Flujo neto", key: "flujo", format: "number" },
    { header: "TEA mes %", key: "tea_pct", format: "percent" },
    { header: "Rend. acum %", key: "rend", format: "percent" },
  ]);

  return (
    <div className="h-full flex flex-col min-h-0">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-[var(--t-border)] bg-[var(--t-accent)]/10 shrink-0 flex-wrap">
        <span className="text-[11px] font-semibold text-[var(--t-accent)] tracking-wide uppercase">Referidos</span>
        <select value={referido} onChange={(e) => setReferido(e.target.value)} className={selCls + " border-[var(--t-accent)] max-w-[260px]"}>
          <option value="">— Elegí un referido —</option>
          {referidos.map((r) => <option key={r.ref} value={r.ref}>{r.ref} ({r.n})</option>)}
        </select>
        <div className="inline-flex border border-[var(--t-border-2)] divide-x divide-[var(--t-border-2)]">
          {(["ARS", "USD"] as const).map((m) => (
            <button key={m} onClick={() => setMoneda(m)} className={"px-2 py-1 text-[10px] font-semibold " + (moneda === m ? "bg-[var(--t-accent)] text-[var(--t-on-accent)]" : "bg-[var(--t-surface)] text-[var(--t-text-dim)] hover:text-[var(--t-accent)]")}>{m}</button>
          ))}
        </div>
        {res && (
          <div className="flex items-center gap-4 text-[11px] flex-wrap">
            <Stat label="Clientes" value={String(res.n_clientes)} accent />
            <Stat label="AuM" value={fmtMoney(res.aum_total)} />
            <Stat label="Volumen mes" value={fmtMoney(res.vol_mes)} />
            <Stat label="Volumen año" value={fmtMoney(res.vol_ano)} />
            <Stat label="Arancel mes" value={fmtMoney(res.arancel_mes)} />
            <Stat label="Arancel año" value={fmtMoney(res.arancel_total)} />
          </div>
        )}
      </div>

      {!referido ? (
        <div className="flex-1 flex items-center justify-center text-[12px] text-[var(--t-text-dim)]">Elegí un referido para ver sus cuentas, operatoria, rendimientos y aranceles.</div>
      ) : (
        <div className="flex-1 min-h-0 flex flex-col gap-3 p-3 overflow-hidden">
          {/* Card del cliente — franja full-width arriba (así izq/der quedan alineadas). */}
          {sel && selCli && (
            <div className="shrink-0 border border-[var(--t-border)] bg-[var(--t-accent)]/10 px-3 py-2 flex items-center gap-4 flex-wrap">
              <span className="text-[12px] font-bold">{selCli.denominacion}</span>
              <span className="text-[9px] text-[var(--t-text-muted)] tabular-nums">#{selCli.id_cuenta}</span>
              <div className="ml-auto flex items-center gap-4 text-[11px]">
                <Stat label={`AuM ${moneda}`} value={fmtMoney(selCli.aum)} />
                <Stat label="Volumen mes" value={fmtMoney(selCli.vol_mes)} />
                <Stat label="Volumen año" value={fmtMoney(selCli.vol_ano)} />
                <Stat label="Arancel mes" value={fmtMoney(selCli.arancel_mes)} />
                <Stat label="Arancel año" value={fmtMoney(selCli.arancel_total)} />
              </div>
            </div>
          )}

          <div className="flex-1 min-h-0 grid grid-cols-2 gap-3 overflow-hidden">
            {/* IZQUIERDA */}
            <div className="min-h-0 flex flex-col gap-3 overflow-hidden">
              <div className="flex-1 min-h-0 border border-[var(--t-border)] bg-[var(--t-panel)] flex flex-col overflow-hidden">
                <div className={HDR + " flex-wrap"}>
                  <span className="text-[10px] uppercase tracking-widest text-[var(--t-accent)]">{tituloChart} · {moneda}</span>
                  <span className="text-[9px] text-[var(--t-text-muted)] truncate">{sel ? (selCli?.denominacion || sel) : "Todo el referido"}</span>
                  <div className="inline-flex border border-[var(--t-border-2)] divide-x divide-[var(--t-border-2)]">
                    {([["valuacion", "Valuación"], ["rend", "Rendim."], ["volumen", "Volumen"]] as [Metric, string][]).map(([k, l]) => (
                      <button key={k} onClick={() => setMetric(k)} className={"px-1.5 py-0.5 text-[9px] font-semibold " + (metric === k ? "bg-[var(--t-accent)] text-[var(--t-on-accent)]" : "text-[var(--t-text-dim)] hover:text-[var(--t-accent)]")}>{l}</button>
                    ))}
                  </div>
                  <div className="ml-auto inline-flex border border-[var(--t-border-2)] divide-x divide-[var(--t-border-2)]">
                    {RANGOS.map((r) => (
                      <button key={r} onClick={() => setRango(r)} className={"px-1.5 py-0.5 text-[9px] font-semibold " + (rango === r ? "bg-[var(--t-accent)] text-[var(--t-on-accent)]" : "text-[var(--t-text-dim)] hover:text-[var(--t-accent)]")}>{r}</button>
                    ))}
                  </div>
                </div>
                <div className="flex-1 min-h-0 p-1">
                  {isRend && !sel ? (
                    <p className="p-3 text-[11px] text-[var(--t-text-dim)]">Elegí un cliente para ver el rendimiento (TWR), como en Carteras.</p>
                  ) : chartData.length === 0 ? (
                    <p className="p-3 text-[11px] text-[var(--t-text-dim)]">Sin datos en el rango.</p>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      {isBar ? (
                        <BarChart data={chartData} margin={{ top: 8, right: 12, bottom: 4, left: 4 }}>
                          <CartesianGrid strokeDasharray="2 2" stroke="var(--t-border)" vertical={false} />
                          <XAxis dataKey="fecha" tickFormatter={fmtFecha} tick={{ fontSize: 9, fill: "var(--t-text-muted)" }} minTickGap={16} />
                          <YAxis domain={yDomain} tickFormatter={(v) => fmtMoney(v as number)} tick={{ fontSize: 9, fill: "var(--t-text-muted)" }} width={54} />
                          <Tooltip cursor={{ fill: "var(--t-border)", opacity: 0.3 }} contentStyle={{ background: "var(--t-panel)", border: "1px solid var(--t-border)", fontSize: 10 }} labelFormatter={(l) => fmtFecha(String(l))} formatter={(v) => [`${moneda} ${fmtMoney(Number(v))}`, "Volumen"]} />
                          <Bar dataKey="valor" fill="var(--t-accent)" fillOpacity={0.9} />
                        </BarChart>
                      ) : (
                        <AreaChart data={chartData} margin={{ top: 8, right: 12, bottom: 4, left: 4 }}>
                          <defs><linearGradient id="ref-area" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--t-accent)" stopOpacity={0.4} /><stop offset="100%" stopColor="var(--t-accent)" stopOpacity={0.03} /></linearGradient></defs>
                          <CartesianGrid strokeDasharray="2 2" stroke="var(--t-border)" />
                          <XAxis dataKey="fecha" tickFormatter={fmtFecha} tick={{ fontSize: 9, fill: "var(--t-text-muted)" }} minTickGap={28} />
                          <YAxis domain={yDomain} tickFormatter={(v) => (isRend ? `${(v as number).toFixed(0)}%` : fmtMoney(v as number))} tick={{ fontSize: 9, fill: "var(--t-text-muted)" }} width={isRend ? 40 : 54} />
                          <Tooltip contentStyle={{ background: "var(--t-panel)", border: "1px solid var(--t-border)", fontSize: 10 }} labelFormatter={(l) => fmtFecha(String(l))} formatter={(v) => [isRend ? `${Number(v) >= 0 ? "+" : ""}${Number(v).toFixed(2)}%` : `${moneda} ${fmtMoney(Number(v))}`, isRend ? "Rendimiento" : "Valuación"]} />
                          <Area type="monotone" dataKey="valor" stroke="var(--t-accent)" strokeWidth={2} fill="url(#ref-area)" isAnimationActive={false} dot={false} />
                        </AreaChart>
                      )}
                    </ResponsiveContainer>
                  )}
                </div>
              </div>

              <div className="flex-1 min-h-0 border border-[var(--t-border)] bg-[var(--t-panel)] flex flex-col overflow-hidden">
                <div className={HDR}>
                  <span className="text-[10px] uppercase tracking-widest text-[var(--t-accent)]">Clientes referidos</span>
                  <span className="text-[9px] text-[var(--t-text-muted)]">{clientes.length}</span>
                </div>
                <div className="flex-1 min-h-0 overflow-auto">
                  {loading ? <p className="p-3 text-[11px] text-[var(--t-text-dim)]">cargando…</p> : clientes.length === 0 ? <p className="p-3 text-[11px] text-[var(--t-text-dim)]">Sin clientes para este referido.</p> : (
                    <table className="w-full text-[10px]">
                      <thead className="sticky top-0 bg-[var(--t-panel)]"><tr className="text-[var(--t-text-muted)]">
                        <th className="text-left !px-2">Cliente</th><th className="text-left !px-2">Cuenta</th>
                        <th className="text-right !px-2">AuM</th><th className="text-right !px-2">Vol mes</th><th className="text-right !px-2">Vol año</th>
                        <th className="text-right !px-2">Aran. mes</th><th className="text-right !px-2">Aran. año</th>
                      </tr></thead>
                      <tbody>
                        {clientes.map((c) => {
                          const on = c.id_cuenta === sel;
                          return (
                            <tr key={c.id_cuenta} onClick={() => setSel(on ? null : c.id_cuenta)} className={`cursor-pointer ${on ? "bg-[var(--t-accent)]/15" : "hover:bg-[var(--t-border)]"}`}>
                              <td className="!px-2">{c.denominacion}</td>
                              <td className="!px-2 tabular-nums text-[var(--t-text-dim)]">{c.id_cuenta}</td>
                              <td className="!px-2 text-right tabular-nums">{fmtMoney(c.aum)}</td>
                              <td className="!px-2 text-right tabular-nums">{fmtMoney(c.vol_mes)}</td>
                              <td className="!px-2 text-right tabular-nums">{fmtMoney(c.vol_ano)}</td>
                              <td className="!px-2 text-right tabular-nums text-[var(--t-accent)]">{fmtMoney(c.arancel_mes)}</td>
                              <td className="!px-2 text-right tabular-nums text-[var(--t-accent)]">{fmtMoney(c.arancel_total)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            </div>

            {/* DERECHA */}
            <div className="min-h-0 flex flex-col gap-3 overflow-hidden">
              {!sel ? (
                <>
                <ReferidoFciTable referido={referido} moneda={moneda} />
                <div className="flex-1 min-h-0 border border-[var(--t-border)] bg-[var(--t-panel)] flex flex-col overflow-hidden">
                  <div className={HDR}>
                    <span className="text-[10px] uppercase tracking-widest text-[var(--t-accent)]">Posición del referido · {moneda}</span>
                    <span className="text-[9px] text-[var(--t-text-muted)]">{data?.posiciones?.length ?? 0} títulos</span>
                  </div>
                  <div className="flex-1 min-h-0 overflow-auto">
                    {(data?.posiciones?.length ?? 0) === 0 ? <p className="p-3 text-[11px] text-[var(--t-text-dim)]">Sin posición.</p> : (
                      <table className="w-full text-[10px]">
                        <thead className="sticky top-0 bg-[var(--t-panel)]"><tr className="text-[var(--t-text-muted)]">
                          <th className="text-left !px-2">Título</th><th className="text-right !px-2">Valuación</th><th className="text-right !px-2">%</th>
                        </tr></thead>
                        <tbody>
                          {(data?.posiciones ?? []).map((p, i) => (
                            <tr key={`${p.unidad}-${i}`} className="hover:bg-[var(--t-border)]">
                              <td className="!px-2">{p.unidad}</td>
                              <td className="!px-2 text-right tabular-nums">{fmtMoney(p.valuacion)}</td>
                              <td className="!px-2 text-right tabular-nums text-[var(--t-text-dim)]">{p.pct.toFixed(1)}%</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                </div>
                </>
              ) : (
                <>
                  <div className="flex-1 min-h-0 border border-[var(--t-border)] bg-[var(--t-panel)] flex flex-col overflow-hidden">
                    <div className={HDR}>
                      <span className="text-[10px] uppercase tracking-widest text-[var(--t-accent)]">Mes a mes · {moneda}</span>
                      {mensual && mensual.meses.length > 0 && (() => {
                        const rt = (usd ? mensual.meses[0].twr_base100_usd : mensual.meses[0].twr_base100) - 100;
                        return <span className="ml-auto text-[9px] font-mono font-semibold" style={{ color: pnlColor(rt) }}>Rend. acum {rt >= 0 ? "+" : ""}{rt.toFixed(1)}%</span>;
                      })()}
                    </div>
                    <div className="flex-1 min-h-0 overflow-auto">
                      {!mensual ? <p className="p-3 text-[11px] text-[var(--t-text-dim)]">cargando…</p> : mensual.meses.length === 0 ? <p className="p-3 text-[11px] text-[var(--t-text-dim)]">Sin histórico mensual.</p> : (
                        <table className="w-full text-[10px]">
                          <thead className="sticky top-0 bg-[var(--t-panel)]"><tr className="text-[var(--t-text-muted)]">
                            <th className="text-left !px-2">Mes</th><th className="text-right !px-2">Valuación</th><th className="text-right !px-2">Flujo</th><th className="text-right !px-2">TEA mes</th><th className="text-right !px-2">Rend. acum</th>
                          </tr></thead>
                          <tbody>
                            {mensual.meses.map((m) => {
                              const val = usd ? m.valuacion_cierre_usd : m.valuacion_cierre;
                              const flj = usd ? m.flujo_neto_usd : m.flujo_neto;
                              const tea = usd ? m.tea_mensual_usd : m.tea_mensual;
                              const rend = (usd ? m.twr_base100_usd : m.twr_base100) - 100;
                              return (
                                <tr key={m.mes} className="hover:bg-[var(--t-border)]">
                                  <td className="!px-2 tabular-nums text-[var(--t-text-dim)]">{m.mes}</td>
                                  <td className="!px-2 text-right tabular-nums">{fmtMoney(val)}</td>
                                  <td className="!px-2 text-right tabular-nums" style={{ color: flj ? pnlColor(flj) : undefined }}>{flj ? fmtMoney(flj) : "—"}</td>
                                  <td className="!px-2 text-right tabular-nums" style={{ color: pnlColor(tea) }}>{tea != null ? `${(tea * 100).toFixed(1)}%` : "—"}</td>
                                  <td className="!px-2 text-right tabular-nums font-semibold" style={{ color: pnlColor(rend) }}>{rend >= 0 ? "+" : ""}{rend.toFixed(1)}%</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      )}
                    </div>
                  </div>

                  <div className="flex-1 min-h-0 border border-[var(--t-border)] bg-[var(--t-panel)] flex flex-col overflow-hidden">
                    <div className={HDR}>
                      <div className="inline-flex border border-[var(--t-border-2)] divide-x divide-[var(--t-border-2)]">
                        {([["pnl", "Posición & PnL"], ["ops", "Operaciones"]] as [("pnl" | "ops"), string][]).map(([k, l]) => (
                          <button key={k} onClick={() => setDetTab(k)} className={"px-2 py-0.5 text-[9px] font-semibold " + (detTab === k ? "bg-[var(--t-accent)] text-[var(--t-on-accent)]" : "text-[var(--t-text-dim)] hover:text-[var(--t-accent)]")}>{l}</button>
                        ))}
                      </div>
                      <span className="ml-auto text-[9px] text-[var(--t-text-muted)]">{moneda}</span>
                    </div>
                    <div className="flex-1 min-h-0 overflow-auto">
                      {detTab === "pnl" ? (
                        !pnl ? <p className="p-3 text-[11px] text-[var(--t-text-dim)]">cargando…</p> : (pnl.rows?.length ?? 0) === 0 ? <p className="p-3 text-[11px] text-[var(--t-text-dim)]">Sin posición.</p> : (
                          <table className="w-full text-[10px]">
                            <thead className="sticky top-0 bg-[var(--t-panel)]"><tr className="text-[var(--t-text-muted)]">
                              <th className="text-left !px-2">Ticker</th><th className="text-right !px-2">Valor</th><th className="text-right !px-2">PnL no real.</th><th className="text-right !px-2">PnL total</th>
                            </tr></thead>
                            <tbody>
                              {pnl.rows.map((r, i) => (
                                <tr key={`${r.ticker}-${i}`} className="hover:bg-[var(--t-border)]">
                                  <td className="!px-2 font-semibold">{r.display_name || r.ticker}</td>
                                  <td className="!px-2 text-right tabular-nums">{fmtMoney(pnlValor(r) ?? undefined)}</td>
                                  <td className="!px-2 text-right tabular-nums" style={{ color: pnlColor(pnlNoReal(r)) }}>{fmtMoney(pnlNoReal(r) ?? undefined)}</td>
                                  <td className="!px-2 text-right tabular-nums font-semibold" style={{ color: pnlColor(pnlTot(r)) }}>{fmtMoney(pnlTot(r) ?? undefined)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )
                      ) : (
                        ops.length === 0 ? <p className="p-3 text-[11px] text-[var(--t-text-dim)]">Sin operaciones.</p> : (
                          <table className="w-full text-[10px]">
                            <thead className="sticky top-0 bg-[var(--t-panel)]"><tr className="text-[var(--t-text-muted)]">
                              <th className="text-left !px-2">Fecha</th><th className="text-left !px-2">Boleto</th><th className="text-left !px-2">Tipo</th><th className="text-left !px-2">Ticker</th><th className="text-right !px-2">Importe</th><th className="text-center !px-2">Mon</th>
                            </tr></thead>
                            <tbody>
                              {ops.map((o, i) => (
                                <tr key={`${o.comprobante}-${i}`} className="hover:bg-[var(--t-border)]">
                                  <td className="!px-2 tabular-nums text-[var(--t-text-dim)]">{o.fecha}</td>
                                  <td className="!px-2 tabular-nums text-[var(--t-text-dim)]">{o.comprobante}</td>
                                  <td className="!px-2">{OP_LABEL[o.categoria] || o.categoria}</td>
                                  <td className="!px-2 font-semibold">{o.ticker || "—"}</td>
                                  <td className="!px-2 text-right tabular-nums">{o.importe != null ? fmtMoney(Math.abs(o.importe)) : "—"}</td>
                                  <td className="!px-2 text-center text-[var(--t-text-dim)]">{o.moneda || "—"}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <span className="inline-flex items-baseline gap-1">
      <span className="text-[9px] uppercase tracking-wide text-[var(--t-text-muted)]">{label}</span>
      <span className={"font-bold tabular-nums " + (accent ? "text-[var(--t-accent)]" : "text-[var(--t-text)]")}>{value}</span>
    </span>
  );
}
