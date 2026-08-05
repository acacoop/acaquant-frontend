"use client";

// OPERACIONES → DÓLAR FUTURO: NOCIONAL (USD) de los futuros DLR (mercado A3).
// 1 contrato = USD 1000 → nocional = |cantidad| × 1000 (lo calcula el backend).
// Layout 2 columnas: IZQ = POR TIPO (chico, 2 filas) + POR CUENTA (llena el resto).
// DER = gráfico de barras (arriba) + POR INSTRUMENTO (abajo).
// Toolbar estilo OPERACIONES: pills ULTIMA/SEMANA/MES/RANGO + inputs de fecha
// nativos (calendario visible en dark) + filtro nivel_5. Cross-filter por click
// (re-click = limpiar). Endpoint: /api/operaciones/ops/dolar-futuro.

import { type ReactNode, useEffect, useMemo, useState } from "react";
import { OpsBarChart, type SerieDef, type SerieRow } from "./ops-bar-chart";
import { fmtFechaCorta, MESES_CORTOS as MESES } from "@/lib/fmt";

type Modo = "ULTIMA" | "SEMANA" | "MES" | "RANGO";
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

const fmtFechaDisplay = (s: string) => { const [y, m, d] = s.split("-").map(Number); return `${d} ${MESES[m - 1]} ${y}`; };

// Anclas de SEMANA / MES sobre la fecha más reciente con datos (no en hoy).
function lunesDeSemana(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const dow = dt.getUTCDay();
  dt.setUTCDate(dt.getUTCDate() - (dow === 0 ? 6 : dow - 1));
  return dt.toISOString().slice(0, 10);
}
const primerDiaMes = (iso: string) => iso.slice(0, 7) + "-01";

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
  const [fechas, setFechas] = useState<{ fecha: string }[]>([]);
  const [modo, setModo] = useState<Modo>("MES");
  const [rDesde, setRDesde] = useState("");
  const [rHasta, setRHasta] = useState("");
  const [selTipo, setSelTipo] = useState<Tipo | null>(null);
  const [selCuenta, setSelCuenta] = useState<string | null>(null);
  const [selInstr, setSelInstr] = useState<string | null>(null);
  const [nivel5, setNivel5] = useState("");
  const [niveles5, setNiveles5] = useState<string[]>([]);
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(false);

  // Fechas con datos → seed RANGO = YTD del último año con operaciones.
  useEffect(() => {
    fetch("/api/operaciones/ops/fechas", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const f: { fecha: string }[] = d?.fechas ?? [];
        if (!f.length) return;
        setFechas(f);
        const max = f[0].fecha;
        const min = f[f.length - 1].fecha;
        const ytd = `${max.slice(0, 4)}-01-01`;
        setRDesde(ytd < min ? min : ytd);
        setRHasta(max);
      })
      .catch(() => {});
  }, []);

  // Valores de nivel_5 (Comitentes) para el filtro.
  useEffect(() => {
    fetch("/api/operaciones/ops/niveles5", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (Array.isArray(d?.niveles5)) setNiveles5(d.niveles5); })
      .catch(() => {});
  }, []);

  const fechasAsc = useMemo(() => fechas.map((f) => f.fecha).sort(), [fechas]);
  const rango = useMemo(() => {
    if (!fechasAsc.length) return { desde: rDesde, hasta: rHasta };
    const ultima = fechasAsc[fechasAsc.length - 1];
    if (modo === "SEMANA") return { desde: lunesDeSemana(ultima), hasta: ultima };
    if (modo === "MES") return { desde: primerDiaMes(ultima), hasta: ultima };
    if (modo === "RANGO") return { desde: rDesde || ultima, hasta: rHasta || ultima };
    return { desde: ultima, hasta: ultima }; // ULTIMA
  }, [modo, fechasAsc, rDesde, rHasta]);

  // Editar cualquiera de los dos date inputs salta a modo RANGO.
  const onDesde = (v: string) => {
    const h = rHasta || rango.hasta;
    setRDesde(v); setRHasta(h && h >= v ? h : v); setModo("RANGO");
  };
  const onHasta = (v: string) => {
    const d = rDesde || rango.desde;
    setRHasta(v); setRDesde(d && d <= v ? d : v); setModo("RANGO");
  };

  // Fetch: serie DIARIA (el chart agrega en cliente) + tablas acotadas al rango.
  useEffect(() => {
    if (!rango.desde || !rango.hasta) return;
    setLoading(true);
    const qs = `desde=${rango.desde}&hasta=${rango.hasta}&agg=DIARIO`
      + (selTipo ? `&tipo=${selTipo}` : "")
      + (selCuenta ? `&cuenta=${encodeURIComponent(selCuenta)}` : "")
      + (selInstr ? `&instrumento=${encodeURIComponent(selInstr)}` : "")
      + (nivel5 ? `&nivel5=${encodeURIComponent(nivel5)}` : "");
    fetch(`/api/operaciones/ops/dolar-futuro?${qs}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null)).then(setData)
      .catch(() => setData(null)).finally(() => setLoading(false));
  }, [rango.desde, rango.hasta, selTipo, selCuenta, selInstr, nivel5]);

  const tipos = data?.por_tipo ?? [];
  const cuentas = data?.por_cuenta ?? [];
  const instrumentos = data?.por_instrumento ?? [];
  const total = data?.total ?? { nocional: 0, arancel: 0, n: 0 };
  const serie = useMemo(() => toSerieRows(data?.serie ?? []), [data]);
  const chartSeries = useMemo(
    () => (selTipo ? SERIES.filter((s) => s.key === selTipo) : SERIES),
    [selTipo],
  );
  const maxFecha = fechasAsc[fechasAsc.length - 1];

  return (
    <div className="h-full flex flex-col min-h-0 overflow-hidden bg-[var(--t-panel)] text-[var(--t-text)]">
      {/* Toolbar estilo OPERACIONES: pills de rango + date inputs nativos + nivel_5 */}
      <div className="flex items-center flex-wrap gap-2 px-4 py-2 border-b border-[var(--t-border)] shrink-0 text-[11px]">
        {(["ULTIMA", "SEMANA", "MES", "RANGO"] as Modo[]).map((m) => (
          <Pill key={m} active={modo === m} onClick={() => setModo(m)}>{m}</Pill>
        ))}
        <div className="inline-flex items-center border border-[var(--t-border-2)] divide-x divide-[var(--t-border-2)]">
          <input type="date" value={rango.desde} max={rango.hasta || maxFecha || undefined}
            disabled={!fechas.length} onChange={(e) => onDesde(e.target.value)}
            className="bg-[var(--t-panel)] px-2 py-0.5 text-[12px] font-mono text-[var(--t-text)] outline-none [color-scheme:dark]" />
          <span className="px-1 text-[var(--t-text-dim)]">→</span>
          <input type="date" value={rango.hasta} min={rango.desde || undefined} max={maxFecha || undefined}
            disabled={!fechas.length} onChange={(e) => onHasta(e.target.value)}
            className="bg-[var(--t-panel)] px-2 py-0.5 text-[12px] font-mono text-[var(--t-text)] outline-none [color-scheme:dark]" />
        </div>
        <span className="font-mono text-[12px] text-[var(--t-accent)] mx-1">
          {modo === "ULTIMA" ? (rango.hasta ? fmtFechaDisplay(rango.hasta) : "—")
            : `${fmtFechaCorta(rango.desde)} → ${fmtFechaCorta(rango.hasta)}`}
        </span>
        <span className="text-[#333]">│</span>
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

      {/* 2 columnas: IZQ tablas (tipo + cuenta) · DER gráfico + instrumento */}
      <div className="flex-1 min-h-0 grid grid-cols-2 gap-3 p-3 overflow-hidden">
        {/* ── Columna izquierda ── */}
        <div className="min-h-0 flex flex-col gap-3 overflow-hidden">
          {/* Por tipo de operación (Compra/Venta) — sólo 2 filas, altura mínima */}
          <TablePanel titulo="Por tipo de operación" extra={`US$ ${fmtC(total.nocional)}`} fixed>
            <table className="w-full text-[11px] font-mono tabular-nums">
              <thead className="bg-[var(--t-panel)] text-[9px] uppercase tracking-widest text-[var(--t-text-muted)]">
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

          {/* Por cuenta — llena el resto de la columna */}
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
        </div>

        {/* ── Columna derecha: gráfico arriba + instrumento abajo ── */}
        <div className="min-h-0 flex flex-col gap-3 overflow-hidden">
          <div className="flex-1 min-h-0">
            <OpsBarChart serie={serie} series={chartSeries} fmt={fmtC} unidad="US$"
              defaultAgg="DIARIO" defaultRango="ALL" titulo="Nocional" etiquetas wmSoft />
          </div>

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
        </div>
      </div>
    </div>
  );
}

function Pill({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button onClick={onClick}
      className={"px-2 py-0.5 border text-[11px] font-semibold " + (active ? "bg-[var(--t-accent)] text-[var(--t-on-accent)] border-[var(--t-accent)]" : "bg-transparent text-[var(--t-text-dim)] border-[var(--t-border-2)] hover:text-[var(--t-accent)] hover:border-[var(--t-accent)]")}>
      {children}
    </button>
  );
}

// fixed=true → panel de altura mínima (contenido), para tablas cortas (Por tipo).
function TablePanel({ titulo, extra, children, fixed = false }: { titulo: string; extra?: string; children: ReactNode; fixed?: boolean }) {
  return (
    <div className={"border border-[var(--t-border)] flex flex-col overflow-hidden " + (fixed ? "shrink-0" : "flex-1 min-h-0")}>
      <div className="flex items-center px-3 py-1.5 border-b border-[var(--t-border)] bg-[var(--t-accent)]/10 shrink-0">
        <span className="text-[10px] uppercase tracking-widest text-[var(--t-accent)]">{titulo}</span>
        {extra && <span className="ml-auto text-[10px] font-mono text-[var(--t-text-dim)]">{extra}</span>}
      </div>
      <div className={fixed ? "overflow-hidden" : "flex-1 min-h-0 overflow-auto"}>{children}</div>
    </div>
  );
}
