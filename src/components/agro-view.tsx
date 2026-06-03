"use client";

// OPERACIONES → AGRO: TONELADAS de Futuros Agropecuarios.
// Toolbar: rango desde→hasta (calendario inline). Fila superior = 3 tablas
// (commodity | cuenta | instrumento); fila inferior = 2 charts (VOLUMEN global |
// CUENTA elegida). Cross-filter por click (re-click sobre la fila = limpiar, sin
// chip arriba). Las tablas se acotan a [desde,hasta]; los charts traen la serie
// DIARIA histórica y agregan/filtran en cliente. Endpoint: /api/operaciones/ops/agro.

import { type ReactNode, useEffect, useMemo, useState } from "react";
import { DatePickerCompact } from "./date-picker";
import { OpsBarChart, type SerieDef, type SerieRow } from "./ops-bar-chart";

type AgroSerieRow = { periodo: string; SOJA: number; TRIGO: number; MAIZ: number };
type ShareRow = { periodo: string; SOJA: number | null; TRIGO: number | null; MAIZ: number | null };
type CuentaRow = { denominacion: string; toneladas: number; n: number };
type InstrRow = { instrumento: string; toneladas: number; n: number };
type ChartTab = "volumen" | "share";
type Resp = {
  serie: AgroSerieRow[];
  serie_cuenta: AgroSerieRow[];
  serie_share: ShareRow[];
  totales: { SOJA: number; TRIGO: number; MAIZ: number };
  por_cuenta: CuentaRow[];
  por_instrumento: InstrRow[];
};

const COMMS: SerieDef[] = [
  { key: "SOJA", label: "Soja", color: "#22c55e" },
  { key: "TRIGO", label: "Trigo", color: "#eab308" },
  { key: "MAIZ", label: "Maíz", color: "#3b82f6" },
];

const fmtTon = (n: number) => n.toLocaleString("es-AR", { maximumFractionDigits: 0 });
const fmtPct = (n: number) => n.toLocaleString("es-AR", { maximumFractionDigits: 1 });
const toSerieRows = (s: AgroSerieRow[]): SerieRow[] =>
  s.map((p) => ({ fecha: p.periodo, SOJA: p.SOJA, TRIGO: p.TRIGO, MAIZ: p.MAIZ }));
const toShareRows = (s: ShareRow[]): SerieRow[] =>
  s.map((p) => ({ fecha: p.periodo, SOJA: p.SOJA ?? 0, TRIGO: p.TRIGO ?? 0, MAIZ: p.MAIZ ?? 0 }));

export function AgroView() {
  const [bounds, setBounds] = useState<{ min: string; max: string } | null>(null);
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [selComm, setSelComm] = useState<string | null>(null);
  const [selCuenta, setSelCuenta] = useState<string | null>(null);
  const [chartTab, setChartTab] = useState<ChartTab>("volumen");
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(false);

  // Bounds del calendario + defaults (YTD del último año con datos).
  useEffect(() => {
    (async () => {
      const r = await fetch("/api/operaciones/ops/fechas", { cache: "no-store" })
        .then((x) => (x.ok ? x.json() : null)).catch(() => null);
      const fechas: { fecha: string }[] = r?.fechas ?? [];
      if (!fechas.length) return;
      const max = fechas[0].fecha;
      const min = fechas[fechas.length - 1].fecha;
      const ytd = `${max.slice(0, 4)}-01-01`;
      setBounds({ min, max });
      setDesde(ytd < min ? min : ytd);
      setHasta(max);
    })();
  }, []);

  // Tablas = rango [desde,hasta]; series = históricas DIARIAS (el chart agrega en
  // cliente, su toolbar no refetchea). serie_cuenta sólo viene si hay cuenta.
  useEffect(() => {
    if (!desde || !hasta) return;
    setLoading(true);
    const qs = `desde=${desde}&hasta=${hasta}&agg=DIARIO`
      + (selComm ? `&commodity=${selComm}` : "")
      + (selCuenta ? `&cuenta=${encodeURIComponent(selCuenta)}` : "");
    fetch(`/api/operaciones/ops/agro?${qs}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null)).then(setData)
      .catch(() => setData(null)).finally(() => setLoading(false));
  }, [desde, hasta, selComm, selCuenta]);

  const series = useMemo(() => COMMS.filter((c) => !selComm || selComm === c.key), [selComm]);
  const serieGlobal = useMemo(() => toSerieRows(data?.serie ?? []), [data]);
  const serieCuenta = useMemo(() => toSerieRows(data?.serie_cuenta ?? []), [data]);
  const serieShare = useMemo(() => toShareRows(data?.serie_share ?? []), [data]);
  const tot = data?.totales ?? { SOJA: 0, TRIGO: 0, MAIZ: 0 };
  const totGral = tot.SOJA + tot.TRIGO + tot.MAIZ;
  const cuentas = data?.por_cuenta ?? [];
  const instrumentos = data?.por_instrumento ?? [];
  const nBoletos = cuentas.reduce((a, r) => a + r.n, 0);

  return (
    <div className="h-full flex flex-col min-h-0 overflow-hidden bg-[var(--t-panel)] text-[var(--t-text)]">
      {/* Toolbar: rango desde → hasta */}
      <div className="flex items-center flex-wrap gap-2 px-4 py-2 border-b border-[var(--t-border)] shrink-0 text-[11px]">
        <span className="text-[10px] uppercase tracking-wider text-[var(--t-text-muted)]">Desde</span>
        {bounds && desde && (
          <DatePickerCompact value={desde} onChange={setDesde} min={bounds.min} max={hasta || bounds.max} />
        )}
        <span className="text-[10px] uppercase tracking-wider text-[var(--t-text-muted)]">Hasta</span>
        {bounds && hasta && (
          <DatePickerCompact value={hasta} onChange={setHasta} min={desde || bounds.min} max={bounds.max} />
        )}
        <span className="ml-auto text-[10px] font-mono text-[var(--t-text-dim)]">
          {nBoletos} boletos · TOTAL: <span className="text-[var(--t-text)] font-semibold">{fmtTon(totGral)} t</span>
          {loading ? " · cargando…" : ""}
        </span>
      </div>

      {/* Fila tablas (3) + fila charts (2) */}
      <div className="flex-1 min-h-0 grid grid-rows-2 gap-3 p-3 overflow-hidden">
        {/* SUPERIOR: 3 tablas */}
        <div className="min-h-0 grid grid-cols-3 gap-3 overflow-hidden">
          {/* Por commodity */}
          <TablePanel titulo="Por commodity" extra={`Σ ${fmtTon(totGral)} t`}>
            <table className="w-full text-[11px] font-mono tabular-nums">
              <tbody>
                {COMMS.filter((c) => tot[c.key as "SOJA" | "TRIGO" | "MAIZ"] !== 0).map((c) => {
                  const ck = c.key as "SOJA" | "TRIGO" | "MAIZ";
                  const act = selComm === c.key;
                  return (
                    <tr key={c.key} onClick={() => setSelComm(act ? null : c.key)}
                      className={"border-t border-[var(--t-border)] cursor-pointer " + (act ? "bg-[var(--t-accent)]/15" : "hover:bg-[var(--t-surface-2)]")}>
                      <td className="px-3 py-1">
                        <span className="inline-block w-2 h-2 mr-2" style={{ background: c.color }} />{c.label}
                      </td>
                      <td className="px-3 py-1 text-right font-semibold">{fmtTon(tot[ck])} t</td>
                      <td className="px-3 py-1 text-right text-[var(--t-text-dim)] w-12">{totGral ? ((tot[ck] / totGral) * 100).toFixed(0) : "0"}%</td>
                    </tr>
                  );
                })}
                {!totGral && <tr><td className="px-3 py-3 text-[var(--t-text-muted)]">sin datos</td></tr>}
              </tbody>
            </table>
          </TablePanel>

          {/* Por cuenta (selección → chart de la derecha) */}
          <TablePanel titulo="Por cuenta" extra={`${cuentas.length} · Σ ${fmtTon(totGral)} t`}>
            <table className="w-full text-[11px] font-mono tabular-nums">
              <thead className="sticky top-0 bg-[var(--t-panel)] text-[9px] uppercase tracking-widest text-[var(--t-text-muted)]">
                <tr>
                  <th className="px-3 py-1.5 text-left border-b border-[var(--t-border)]">Cuenta</th>
                  <th className="px-3 py-1.5 text-right border-b border-[var(--t-border)]">Ton</th>
                  <th className="px-3 py-1.5 text-right border-b border-[var(--t-border)]">N</th>
                </tr>
              </thead>
              <tbody>
                {cuentas.map((r) => {
                  const act = selCuenta === r.denominacion;
                  return (
                    <tr key={r.denominacion} onClick={() => setSelCuenta(act ? null : r.denominacion)}
                      className={"border-t border-[var(--t-border)] cursor-pointer " + (act ? "bg-[var(--t-accent)]/15" : "hover:bg-[var(--t-surface-2)]")}>
                      <td className="px-3 py-1 truncate max-w-[200px]" title={r.denominacion}>{r.denominacion}</td>
                      <td className="px-3 py-1 text-right font-semibold">{fmtTon(r.toneladas)}</td>
                      <td className="px-3 py-1 text-right text-[var(--t-text-dim)]">{r.n}</td>
                    </tr>
                  );
                })}
                {!cuentas.length && <tr><td className="px-3 py-3 text-[var(--t-text-muted)]">sin datos</td></tr>}
              </tbody>
            </table>
          </TablePanel>

          {/* Por instrumento (qué se opera; respeta commodity + cuenta) */}
          <TablePanel titulo="Por instrumento" extra={`${instrumentos.length}`}>
            <table className="w-full text-[11px] font-mono tabular-nums">
              <thead className="sticky top-0 bg-[var(--t-panel)] text-[9px] uppercase tracking-widest text-[var(--t-text-muted)]">
                <tr>
                  <th className="px-3 py-1.5 text-left border-b border-[var(--t-border)]">Instrumento</th>
                  <th className="px-3 py-1.5 text-right border-b border-[var(--t-border)]">Ton</th>
                  <th className="px-3 py-1.5 text-right border-b border-[var(--t-border)]">N</th>
                </tr>
              </thead>
              <tbody>
                {instrumentos.map((r) => (
                  <tr key={r.instrumento} className="border-t border-[var(--t-border)]">
                    <td className="px-3 py-1 truncate max-w-[200px]" title={r.instrumento}>{r.instrumento}</td>
                    <td className="px-3 py-1 text-right font-semibold">{fmtTon(r.toneladas)}</td>
                    <td className="px-3 py-1 text-right text-[var(--t-text-dim)]">{r.n}</td>
                  </tr>
                ))}
                {!instrumentos.length && <tr><td className="px-3 py-3 text-[var(--t-text-muted)]">sin datos</td></tr>}
              </tbody>
            </table>
          </TablePanel>
        </div>

        {/* INFERIOR: 2 charts. Izq con tab Volumen ↔ Share de mercado. */}
        <div className="min-h-0 grid grid-cols-2 gap-3 overflow-hidden">
          {/* Izquierda: tab + chart */}
          <div className="min-h-0 flex flex-col gap-1.5 overflow-hidden">
            <div className="inline-flex border border-[var(--t-border-2)] divide-x divide-[var(--t-border-2)] shrink-0 w-fit">
              {(["volumen", "share"] as ChartTab[]).map((t) => (
                <button key={t} onClick={() => setChartTab(t)}
                  className={"px-3 py-0.5 text-[10px] uppercase tracking-wider font-semibold " + (chartTab === t ? "bg-[var(--t-accent)] text-[var(--t-on-accent)]" : "text-[var(--t-text-dim)] hover:text-[var(--t-accent)]")}>
                  {t === "volumen" ? "Volumen" : "Share de mercado"}
                </button>
              ))}
            </div>
            <div className="flex-1 min-h-0">
              {chartTab === "volumen" ? (
                <OpsBarChart serie={serieGlobal} series={series} fmt={fmtTon} unidad="toneladas"
                  defaultAgg="MENSUAL" titulo="Volumen global" />
              ) : serieShare.length ? (
                <OpsBarChart serie={serieShare} series={series} fmt={fmtPct} unidad="%"
                  soloMensual titulo="Share de mercado (nuestro / mercado)" />
              ) : (
                <div className="min-h-0 border border-[var(--t-border)] flex items-center justify-center text-center px-4 text-[11px] text-[var(--t-text-muted)] h-full">
                  Sin volumen de mercado cargado (CashFlow.VolumenMercadoAgro)
                </div>
              )}
            </div>
          </div>

          {/* Derecha: chart de la cuenta elegida */}
          {selCuenta ? (
            <OpsBarChart serie={serieCuenta} series={series} fmt={fmtTon} unidad="toneladas"
              defaultAgg="MENSUAL" titulo={`Cuenta: ${selCuenta}`} />
          ) : (
            <div className="min-h-0 border border-[var(--t-border)] flex items-center justify-center text-center px-4 text-[11px] text-[var(--t-text-muted)] h-full">
              Elegí una cuenta en la tabla para ver su volumen
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function TablePanel({ titulo, extra, children }: { titulo: string; extra?: string; children: ReactNode }) {
  return (
    <div className="min-h-0 border border-[var(--t-border)] flex flex-col overflow-hidden">
      <div className="flex items-center px-3 py-1.5 border-b border-[var(--t-border)] bg-[var(--t-accent)]/10 shrink-0">
        <span className="text-[10px] uppercase tracking-widest text-[var(--t-accent)]">{titulo}</span>
        {extra && <span className="ml-auto text-[10px] font-mono text-[var(--t-text-dim)]">{extra}</span>}
      </div>
      <div className="flex-1 min-h-0 overflow-auto">{children}</div>
    </div>
  );
}
