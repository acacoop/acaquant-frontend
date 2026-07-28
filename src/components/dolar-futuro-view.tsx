"use client";

// OPERACIONES → DÓLAR FUTURO: NOCIONAL (USD) de los futuros DLR (mercado A3).
// 1 contrato = USD 1000 → nocional = |cantidad| × 1000 (lo calcula el backend).
// Layout 2×2 (4 paneles al 50%): POR TIPO (Compra/Venta) · POR CUENTA ·
// POR INSTRUMENTO (vencimientos) · gráfico de barras (nocional por periodo).
// Toolbar: rango desde→hasta + filtro nivel_5. Cross-filter por click (re-click =
// limpiar). Endpoint: /api/operaciones/ops/dolar-futuro.

import { type ReactNode, useEffect, useMemo, useState } from "react";
import { DatePickerCompact } from "./date-picker";
import { OpsBarChart, type SerieDef, type SerieRow } from "./ops-bar-chart";

type Tipo = "Compra" | "Venta";
type TipoRow = { tipo: Tipo; nocional: number; arancel: number; n: number };
type CuentaRow = { denominacion: string; nocional: number; arancel: number; n: number };
type InstrRow = { instrumento: string; nocional: number; arancel: number; n: number };
type SerieResp = { periodo: string; Compra: number; Venta: number };
type Resp = {
  total: { nocional: number; arancel: number; n: number };
  por_tipo: TipoRow[];
  por_cuenta: CuentaRow[];
  por_instrumento: InstrRow[];
  serie: SerieResp[];
};

const SERIES: SerieDef[] = [
  { key: "Compra", label: "Compra", color: "#22c55e" }, // verde
  { key: "Venta", label: "Venta", color: "#ef4444" },   // rojo
];

// Compacto es-AR (B/M/k) para nocional (US$) y arancel (ARS).
const fmtC = (n: number) => {
  const a = Math.abs(n);
  if (a >= 1e9) return (n / 1e9).toLocaleString("es-AR", { maximumFractionDigits: 2 }) + "B";
  if (a >= 1e6) return (n / 1e6).toLocaleString("es-AR", { maximumFractionDigits: 2 }) + "M";
  if (a >= 1e3) return (n / 1e3).toLocaleString("es-AR", { maximumFractionDigits: 1 }) + "k";
  return n.toLocaleString("es-AR", { maximumFractionDigits: 0 });
};
const toSerieRows = (s: SerieResp[]): SerieRow[] =>
  s.map((p) => ({ fecha: p.periodo, Compra: p.Compra, Venta: p.Venta }));

export function DolarFuturoView() {
  const [bounds, setBounds] = useState<{ min: string; max: string } | null>(null);
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [selTipo, setSelTipo] = useState<Tipo | null>(null);
  const [selCuenta, setSelCuenta] = useState<string | null>(null);
  const [selInstr, setSelInstr] = useState<string | null>(null);
  const [nivel5, setNivel5] = useState("");
  const [niveles5, setNiveles5] = useState<string[]>([]);
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(false);

  // Bounds del calendario + default YTD del último año con datos.
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

  // Valores de nivel_5 (Comitentes) para el filtro.
  useEffect(() => {
    fetch("/api/operaciones/ops/niveles5", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (Array.isArray(d?.niveles5)) setNiveles5(d.niveles5); })
      .catch(() => {});
  }, []);

  // Fetch: serie DIARIA (el chart agrega en cliente) + tablas acotadas al rango.
  useEffect(() => {
    if (!desde || !hasta) return;
    setLoading(true);
    const qs = `desde=${desde}&hasta=${hasta}&agg=DIARIO`
      + (selTipo ? `&tipo=${selTipo}` : "")
      + (selCuenta ? `&cuenta=${encodeURIComponent(selCuenta)}` : "")
      + (selInstr ? `&instrumento=${encodeURIComponent(selInstr)}` : "")
      + (nivel5 ? `&nivel5=${encodeURIComponent(nivel5)}` : "");
    fetch(`/api/operaciones/ops/dolar-futuro?${qs}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null)).then(setData)
      .catch(() => setData(null)).finally(() => setLoading(false));
  }, [desde, hasta, selTipo, selCuenta, selInstr, nivel5]);

  const tipos = data?.por_tipo ?? [];
  const cuentas = data?.por_cuenta ?? [];
  const instrumentos = data?.por_instrumento ?? [];
  const total = data?.total ?? { nocional: 0, arancel: 0, n: 0 };
  const serie = useMemo(() => toSerieRows(data?.serie ?? []), [data]);
  // Si hay un tipo seleccionado, el chart muestra sólo esa serie.
  const chartSeries = useMemo(
    () => (selTipo ? SERIES.filter((s) => s.key === selTipo) : SERIES),
    [selTipo],
  );

  return (
    <div className="h-full flex flex-col min-h-0 overflow-hidden bg-[var(--t-panel)] text-[var(--t-text)]">
      {/* Toolbar: rango desde → hasta + nivel_5 + total nocional */}
      <div className="flex items-center flex-wrap gap-2 px-4 py-2 border-b border-[var(--t-border)] shrink-0 text-[11px]">
        <span className="text-[10px] uppercase tracking-wider text-[var(--t-text-muted)]">Desde</span>
        {bounds && desde && (
          <DatePickerCompact value={desde} onChange={setDesde} min={bounds.min} max={hasta || bounds.max} />
        )}
        <span className="text-[10px] uppercase tracking-wider text-[var(--t-text-muted)]">Hasta</span>
        {bounds && hasta && (
          <DatePickerCompact value={hasta} onChange={setHasta} min={desde || bounds.min} max={bounds.max} />
        )}
        <select value={nivel5} onChange={(e) => setNivel5(e.target.value)}
          className="bg-[var(--t-panel)] border border-[var(--t-border-2)] px-2 py-0.5 text-[11px] text-[var(--t-text)] outline-none [color-scheme:dark] max-w-[200px]">
          <option value="">Todos los nivel 5</option>
          {niveles5.map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
        <span className="ml-auto text-[10px] font-mono text-[var(--t-text-dim)]">
          {total.n} boletos · NOCIONAL: <span className="text-[var(--t-text)] font-semibold">US$ {fmtC(total.nocional)}</span>
          {" "}· ARANCEL: <span className="text-[var(--t-text)] font-semibold">{fmtC(total.arancel)} ARS</span>
          {loading ? " · cargando…" : ""}
        </span>
      </div>

      {/* Grid 2×2: 4 paneles al 50%. */}
      <div className="flex-1 min-h-0 grid grid-rows-2 grid-cols-2 gap-3 p-3 overflow-hidden">
        {/* Por tipo de operación (Compra/Venta) */}
        <TablePanel titulo="Por tipo de operación" extra={`US$ ${fmtC(total.nocional)}`}>
          <table className="w-full text-[11px] font-mono tabular-nums">
            <thead className="sticky top-0 bg-[var(--t-panel)] text-[9px] uppercase tracking-widest text-[var(--t-text-muted)]">
              <tr>
                <th className="px-3 py-1.5 text-left border-b border-[var(--t-border)]">Operación</th>
                <th className="px-3 py-1.5 text-right border-b border-[var(--t-border)]">Nocional (US$)</th>
                <th className="px-3 py-1.5 text-right border-b border-[var(--t-border)]">Arancel (ARS)</th>
                <th className="px-3 py-1.5 text-right border-b border-[var(--t-border)]">Boletos</th>
                <th className="px-3 py-1.5 text-right border-b border-[var(--t-border)]">%</th>
              </tr>
            </thead>
            <tbody>
              {tipos.map((r) => {
                const act = selTipo === r.tipo;
                const col = SERIES.find((s) => s.key === r.tipo)?.color;
                const pct = total.nocional ? (r.nocional / total.nocional) * 100 : 0;
                return (
                  <tr key={r.tipo} onClick={() => setSelTipo(act ? null : r.tipo)}
                    className={"border-t border-[var(--t-border)] cursor-pointer " + (act ? "bg-[var(--t-accent)]/15" : "hover:bg-[var(--t-surface-2)]")}>
                    <td className="px-3 py-1">
                      <span className="inline-block w-2 h-2 mr-2" style={{ background: col }} />{r.tipo}
                    </td>
                    <td className="px-3 py-1 text-right font-semibold">{fmtC(r.nocional)}</td>
                    <td className="px-3 py-1 text-right text-[var(--t-text-dim)]">{fmtC(r.arancel)}</td>
                    <td className="px-3 py-1 text-right text-[var(--t-text-dim)]">{r.n}</td>
                    <td className="px-3 py-1 text-right text-[var(--t-text-dim)] w-12">{pct.toFixed(0)}%</td>
                  </tr>
                );
              })}
              {!tipos.length && <tr><td className="px-3 py-3 text-[var(--t-text-muted)]">sin datos</td></tr>}
            </tbody>
          </table>
        </TablePanel>

        {/* Por cuenta */}
        <TablePanel titulo="Por cuenta" extra={`${cuentas.length}`}>
          <table className="w-full text-[11px] font-mono tabular-nums">
            <thead className="sticky top-0 bg-[var(--t-panel)] text-[9px] uppercase tracking-widest text-[var(--t-text-muted)]">
              <tr>
                <th className="px-3 py-1.5 text-left border-b border-[var(--t-border)]">Cuenta</th>
                <th className="px-3 py-1.5 text-right border-b border-[var(--t-border)]">Nocional (US$)</th>
                <th className="px-3 py-1.5 text-right border-b border-[var(--t-border)]">Arancel (ARS)</th>
                <th className="px-3 py-1.5 text-right border-b border-[var(--t-border)]">N</th>
              </tr>
            </thead>
            <tbody>
              {cuentas.map((r) => {
                const act = selCuenta === r.denominacion;
                return (
                  <tr key={r.denominacion} onClick={() => setSelCuenta(act ? null : r.denominacion)}
                    className={"border-t border-[var(--t-border)] cursor-pointer " + (act ? "bg-[var(--t-accent)]/15" : "hover:bg-[var(--t-surface-2)]")}>
                    <td className="px-3 py-1 truncate max-w-[220px]" title={r.denominacion}>{r.denominacion}</td>
                    <td className="px-3 py-1 text-right font-semibold">{fmtC(r.nocional)}</td>
                    <td className="px-3 py-1 text-right text-[var(--t-text-dim)]">{fmtC(r.arancel)}</td>
                    <td className="px-3 py-1 text-right text-[var(--t-text-dim)]">{r.n}</td>
                  </tr>
                );
              })}
              {!cuentas.length && <tr><td className="px-3 py-3 text-[var(--t-text-muted)]">sin datos</td></tr>}
            </tbody>
          </table>
        </TablePanel>

        {/* Por instrumento (vencimientos DLR) */}
        <TablePanel titulo="Por instrumento (vencimiento)" extra={`${instrumentos.length}`}>
          <table className="w-full text-[11px] font-mono tabular-nums">
            <thead className="sticky top-0 bg-[var(--t-panel)] text-[9px] uppercase tracking-widest text-[var(--t-text-muted)]">
              <tr>
                <th className="px-3 py-1.5 text-left border-b border-[var(--t-border)]">Vencimiento</th>
                <th className="px-3 py-1.5 text-right border-b border-[var(--t-border)]">Nocional (US$)</th>
                <th className="px-3 py-1.5 text-right border-b border-[var(--t-border)]">Arancel (ARS)</th>
                <th className="px-3 py-1.5 text-right border-b border-[var(--t-border)]">N</th>
              </tr>
            </thead>
            <tbody>
              {instrumentos.map((r) => {
                const act = selInstr === r.instrumento;
                return (
                  <tr key={r.instrumento} onClick={() => setSelInstr(act ? null : r.instrumento)}
                    className={"border-t border-[var(--t-border)] cursor-pointer " + (act ? "bg-[var(--t-accent)]/15" : "hover:bg-[var(--t-surface-2)]")}>
                    <td className="px-3 py-1 truncate max-w-[220px]" title={r.instrumento}>{r.instrumento}</td>
                    <td className="px-3 py-1 text-right font-semibold">{fmtC(r.nocional)}</td>
                    <td className="px-3 py-1 text-right text-[var(--t-text-dim)]">{fmtC(r.arancel)}</td>
                    <td className="px-3 py-1 text-right text-[var(--t-text-dim)]">{r.n}</td>
                  </tr>
                );
              })}
              {!instrumentos.length && <tr><td className="px-3 py-3 text-[var(--t-text-muted)]">sin datos</td></tr>}
            </tbody>
          </table>
        </TablePanel>

        {/* Gráfico de barras: nocional por periodo (Compra/Venta) */}
        <div className="min-h-0 overflow-hidden">
          <OpsBarChart serie={serie} series={chartSeries} fmt={fmtC} unidad="US$ nocional"
            defaultAgg="MENSUAL" defaultRango="ALL" titulo="Volumen nocional (US$)" etiquetas />
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
