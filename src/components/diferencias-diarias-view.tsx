"use client";

// OPERACIONES → DIFERENCIAS DIARIAS: liquidación mark-to-market de futuros
// (ROFEX/CME) desde operaciones.negocio_movimientos. NO hay tipo de operación
// ni instrumento nativo: la métrica es `importe` (± SIN nulos) y el instrumento
// sale del texto `informacion` (token entre corchetes). ARS y USDL NO se suman
// juntas → toggle de MONEDA (default USDL). Layout 2 columnas igual a DÓLAR
// FUTURO: IZQ = POR PRODUCTO (chico) + POR CUENTA. DER = gráfico (barras
// firmadas por día + línea de acumulado) + POR INSTRUMENTO. Cross-filter 3-way
// por click. Endpoint: /api/operaciones/ops/diferencias-diarias.

import { type ReactNode, useEffect, useMemo, useState } from "react";
import {
  Bar, CartesianGrid, Cell, ComposedChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";

type Modo = "ULTIMA" | "SEMANA" | "MES" | "RANGO";
type Moneda = "USDL" | "ARS";
type ProdRow = { producto: string; importe: number; n: number };
type CuentaRow = { cuenta: string; importe: number; n: number };
type InstrRow = { instrumento: string; importe: number; n: number };
type SerieRow = { periodo: string; importe: number; n: number };
type Resp = {
  moneda: Moneda;
  total: { importe: number; n: number; pos: number; neg: number };
  por_producto: ProdRow[];
  por_cuenta: CuentaRow[];
  por_instrumento: InstrRow[];
  serie: SerieRow[];
};

const POS = "#22c55e"; // verde: diferencia a favor
const NEG = "#ef4444"; // rojo: diferencia en contra

const MESES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
const fmtFechaCorta = (s: string) => { const [y, m, d] = s.split("-"); return `${d}/${m}/${y.slice(-2)}`; };
const fmtFechaDisplay = (s: string) => { const [y, m, d] = s.split("-").map(Number); return `${d} ${MESES[m - 1]} ${y}`; };
const fmtMesCorto = (s: string) => { const [y, m] = s.split("-").map(Number); return `${MESES[m - 1]} ${String(y).slice(-2)}`; };

function lunesDeSemana(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const dow = dt.getUTCDay();
  dt.setUTCDate(dt.getUTCDate() - (dow === 0 ? 6 : dow - 1));
  return dt.toISOString().slice(0, 10);
}
const primerDiaMes = (iso: string) => iso.slice(0, 7) + "-01";

// Compacto es-AR (B/M/k) preservando signo.
const fmtC = (n: number) => {
  const a = Math.abs(n);
  if (a >= 1e9) return (n / 1e9).toLocaleString("es-AR", { maximumFractionDigits: 2 }) + "B";
  if (a >= 1e6) return (n / 1e6).toLocaleString("es-AR", { maximumFractionDigits: 2 }) + "M";
  if (a >= 1e3) return (n / 1e3).toLocaleString("es-AR", { maximumFractionDigits: 1 }) + "k";
  return n.toLocaleString("es-AR", { maximumFractionDigits: 0 });
};
// Número completo SIN abreviar y sin decimales (para la columna NETO).
const fmtFull = (n: number) => n.toLocaleString("es-AR", { maximumFractionDigits: 0 });

// Orden de la columna NETO: "" = orden del backend (por |importe|), luego
// desc/asc por importe firmado al clickear el header.
type Ord = "" | "desc" | "asc";
const nextOrd = (o: Ord): Ord => (o === "" ? "desc" : o === "desc" ? "asc" : "");
const arrowOrd = (o: Ord) => (o === "desc" ? " ↓" : o === "asc" ? " ↑" : "");
function sortByImporte<T extends { importe: number }>(rows: T[], dir: Ord): T[] {
  if (!dir) return rows;
  const s = [...rows].sort((a, b) => a.importe - b.importe);
  return dir === "desc" ? s.reverse() : s;
}

export function DiferenciasDiariasView() {
  const [fechas, setFechas] = useState<{ fecha: string }[]>([]);
  const [modo, setModo] = useState<Modo>("RANGO");
  const [rDesde, setRDesde] = useState("");
  const [rHasta, setRHasta] = useState("");
  const [moneda, setMoneda] = useState<Moneda>("USDL");
  const [selProd, setSelProd] = useState<string | null>(null);
  const [selCuenta, setSelCuenta] = useState<string | null>(null);
  const [selInstr, setSelInstr] = useState<string | null>(null);
  const [nivel5, setNivel5] = useState("");
  const [niveles5, setNiveles5] = useState<string[]>([]);
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(false);
  const [buscarCuenta, setBuscarCuenta] = useState("");
  const [ordProd, setOrdProd] = useState<Ord>("");
  const [ordCuenta, setOrdCuenta] = useState<Ord>("");
  const [ordInstr, setOrdInstr] = useState<Ord>("");

  // Fechas con datos PROPIAS de esta vista (Diferencias Diarias por moneda) →
  // seed RANGO = YTD + anclaje de ULTIMA/SEMANA/MES sobre fechas reales. NO usar
  // /ops/fechas (ésas son de operaciones.operaciones, llegan hasta hoy aunque las
  // diferencias estén rezagadas → los botones caían en ventanas vacías).
  useEffect(() => {
    fetch(`/api/operaciones/ops/diferencias-fechas?moneda=${moneda}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const f: { fecha: string }[] = d?.fechas ?? [];
        if (!f.length) { setFechas([]); return; }
        setFechas(f);
        const max = f[0].fecha;
        const min = f[f.length - 1].fecha;
        const ytd = `${max.slice(0, 4)}-01-01`;
        setRDesde(ytd < min ? min : ytd);
        setRHasta(max);
      })
      .catch(() => {});
  }, [moneda]);

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

  const onDesde = (v: string) => {
    const h = rHasta || rango.hasta;
    setRDesde(v); setRHasta(h && h >= v ? h : v); setModo("RANGO");
  };
  const onHasta = (v: string) => {
    const d = rDesde || rango.desde;
    setRHasta(v); setRDesde(d && d <= v ? d : v); setModo("RANGO");
  };

  // Fetch: serie DIARIA (el chart agrega/acumula en cliente) + tablas.
  useEffect(() => {
    if (!rango.desde || !rango.hasta) return;
    setLoading(true);
    const qs = `desde=${rango.desde}&hasta=${rango.hasta}&moneda=${moneda}`
      + (selProd ? `&producto=${encodeURIComponent(selProd)}` : "")
      + (selCuenta ? `&cuenta=${encodeURIComponent(selCuenta)}` : "")
      + (selInstr ? `&instrumento=${encodeURIComponent(selInstr)}` : "")
      + (nivel5 ? `&nivel5=${encodeURIComponent(nivel5)}` : "");
    fetch(`/api/operaciones/ops/diferencias-diarias?${qs}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null)).then(setData)
      .catch(() => setData(null)).finally(() => setLoading(false));
  }, [rango.desde, rango.hasta, moneda, selProd, selCuenta, selInstr, nivel5]);

  // Al cambiar de moneda, limpiar cross-filters (un producto ARS no existe en USDL).
  const cambiarMoneda = (m: Moneda) => {
    if (m === moneda) return;
    setMoneda(m); setSelProd(null); setSelCuenta(null); setSelInstr(null);
  };

  const productos = useMemo(
    () => sortByImporte(data?.por_producto ?? [], ordProd),
    [data, ordProd],
  );
  const cuentas = useMemo(() => {
    const q = buscarCuenta.trim().toLowerCase();
    const base = data?.por_cuenta ?? [];
    const filtradas = q ? base.filter((c) => c.cuenta.toLowerCase().includes(q)) : base;
    return sortByImporte(filtradas, ordCuenta);
  }, [data, buscarCuenta, ordCuenta]);
  const instrumentos = useMemo(
    () => sortByImporte(data?.por_instrumento ?? [], ordInstr),
    [data, ordInstr],
  );
  const total = data?.total ?? { importe: 0, n: 0, pos: 0, neg: 0 };
  const serie = data?.serie ?? [];
  const unidad = moneda === "USDL" ? "US$" : "ARS";
  const maxFecha = fechasAsc[fechasAsc.length - 1];

  return (
    <div className="h-full flex flex-col min-h-0 overflow-hidden bg-[var(--t-panel)] text-[var(--t-text)]">
      {/* Toolbar: pills de rango + fechas + MONEDA + nivel_5 */}
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
        {/* Toggle de MONEDA — ARS y USDL no se pueden sumar juntas */}
        <div className="inline-flex border border-[var(--t-border-2)] divide-x divide-[var(--t-border-2)]">
          {(["USDL", "ARS"] as Moneda[]).map((m) => (
            <button key={m} onClick={() => cambiarMoneda(m)}
              className={"px-2 py-0.5 text-[11px] font-semibold " + (moneda === m ? "bg-[var(--t-accent)] text-[var(--t-on-accent)]" : "text-[var(--t-text-dim)] hover:text-[var(--t-accent)]")}>{m}</button>
          ))}
        </div>
        <select value={nivel5} onChange={(e) => setNivel5(e.target.value)}
          className="bg-[var(--t-panel)] border border-[var(--t-border-2)] px-2 py-0.5 text-[11px] text-[var(--t-text)] outline-none [color-scheme:dark] max-w-[200px]">
          <option value="">Todos los nivel 5</option>
          {niveles5.map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
        <div className="inline-flex items-center border border-[var(--t-border-2)]">
          <input value={buscarCuenta} onChange={(e) => setBuscarCuenta(e.target.value)}
            placeholder="Buscar cuenta…"
            className="bg-[var(--t-panel)] px-2 py-0.5 text-[11px] text-[var(--t-text)] outline-none placeholder:text-[var(--t-text-muted)] w-[150px]" />
          {buscarCuenta && (
            <button onClick={() => setBuscarCuenta("")} aria-label="Limpiar búsqueda"
              className="px-1.5 text-[var(--t-text-muted)] hover:text-[var(--t-accent)]">✕</button>
          )}
        </div>
        <span className="ml-auto text-[10px] font-mono text-[var(--t-text-dim)]">
          {total.n} diferencias · NETO: <span className={"font-semibold " + (total.importe >= 0 ? "text-[#22c55e]" : "text-[#ef4444]")}>{unidad} {fmtC(total.importe)}</span>
          {" "}· <span className="text-[#22c55e]">{total.pos}↑</span> / <span className="text-[#ef4444]">{total.neg}↓</span>
          {loading ? " · cargando…" : ""}
        </span>
      </div>

      {/* 2 columnas: IZQ tablas (producto + cuenta) · DER gráfico + instrumento */}
      <div className="flex-1 min-h-0 grid grid-cols-2 gap-3 p-3 overflow-hidden">
        {/* ── Columna izquierda ── */}
        <div className="min-h-0 flex flex-col gap-3 overflow-hidden">
          <TablePanel titulo="Por producto" extra={`${productos.length}`} fixed>
            <table className="w-full text-[11px] font-mono tabular-nums">
              <thead className="bg-[var(--t-panel)] text-[9px] uppercase tracking-widest text-[var(--t-text-muted)]">
                <tr>
                  <th className="px-3 py-1.5 text-left border-b border-[var(--t-border)]">Producto</th>
                  <th onClick={() => setOrdProd(nextOrd(ordProd))}
                    className="px-3 py-1.5 text-right border-b border-[var(--t-border)] cursor-pointer select-none hover:text-[var(--t-accent)]">Neto ({unidad}){arrowOrd(ordProd)}</th>
                  <th className="px-3 py-1.5 text-right border-b border-[var(--t-border)]">Diferencias</th>
                </tr>
              </thead>
              <tbody>
                {productos.map((r) => {
                  const act = selProd === r.producto;
                  return (
                    <tr key={r.producto} onClick={() => setSelProd(act ? null : r.producto)}
                      className={"border-t border-[var(--t-border)] cursor-pointer " + (act ? "bg-[var(--t-accent)]/15" : "hover:bg-[var(--t-surface-2)]")}>
                      <td className="px-3 py-1">{r.producto}</td>
                      <td className={"px-3 py-1 text-right font-semibold " + (r.importe >= 0 ? "text-[#22c55e]" : "text-[#ef4444]")}>{fmtFull(r.importe)}</td>
                      <td className="px-3 py-1 text-right text-[var(--t-text-dim)]">{r.n}</td>
                    </tr>
                  );
                })}
                {!productos.length && <tr><td className="px-3 py-3 text-[var(--t-text-muted)]">sin datos</td></tr>}
              </tbody>
            </table>
          </TablePanel>

          <TablePanel titulo="Por cuenta" extra={`${cuentas.length}`}>
            <table className="w-full text-[11px] font-mono tabular-nums">
              <thead className="sticky top-0 bg-[var(--t-panel)] text-[9px] uppercase tracking-widest text-[var(--t-text-muted)]">
                <tr>
                  <th className="px-3 py-1.5 text-left border-b border-[var(--t-border)]">Cuenta</th>
                  <th onClick={() => setOrdCuenta(nextOrd(ordCuenta))}
                    className="px-3 py-1.5 text-right border-b border-[var(--t-border)] cursor-pointer select-none hover:text-[var(--t-accent)]">Neto ({unidad}){arrowOrd(ordCuenta)}</th>
                  <th className="px-3 py-1.5 text-right border-b border-[var(--t-border)]">N</th>
                </tr>
              </thead>
              <tbody>
                {cuentas.map((r) => {
                  const act = selCuenta === r.cuenta;
                  return (
                    <tr key={r.cuenta} onClick={() => setSelCuenta(act ? null : r.cuenta)}
                      className={"border-t border-[var(--t-border)] cursor-pointer " + (act ? "bg-[var(--t-accent)]/15" : "hover:bg-[var(--t-surface-2)]")}>
                      <td className="px-3 py-1 truncate max-w-[220px]" title={r.cuenta}>{r.cuenta}</td>
                      <td className={"px-3 py-1 text-right font-semibold " + (r.importe >= 0 ? "text-[#22c55e]" : "text-[#ef4444]")}>{fmtFull(r.importe)}</td>
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
            <DifChart serie={serie} unidad={unidad} />
          </div>

          <TablePanel titulo="Por instrumento" extra={`${instrumentos.length}`}>
            <table className="w-full text-[11px] font-mono tabular-nums">
              <thead className="sticky top-0 bg-[var(--t-panel)] text-[9px] uppercase tracking-widest text-[var(--t-text-muted)]">
                <tr>
                  <th className="px-3 py-1.5 text-left border-b border-[var(--t-border)]">Instrumento</th>
                  <th onClick={() => setOrdInstr(nextOrd(ordInstr))}
                    className="px-3 py-1.5 text-right border-b border-[var(--t-border)] cursor-pointer select-none hover:text-[var(--t-accent)]">Neto ({unidad}){arrowOrd(ordInstr)}</th>
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
                      <td className={"px-3 py-1 text-right font-semibold " + (r.importe >= 0 ? "text-[#22c55e]" : "text-[#ef4444]")}>{fmtFull(r.importe)}</td>
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

  // ── Chart local: barras firmadas por período (verde/rojo) + línea acumulada.
  // Recharts nativo maneja el dominio negativo; la línea de acumulado va en un
  // eje derecho propio. Agrega en cliente (DIA/SEM/MES) sobre la serie diaria.
  function DifChart({ serie, unidad }: { serie: SerieRow[]; unidad: string }) {
    const [agg, setAgg] = useState<"DIA" | "SEM" | "MES">("DIA");
    const data = useMemo(() => {
      const bucket = (p: string) => (agg === "MES" ? p.slice(0, 7) : agg === "SEM" ? lunesDeSemana(p) : p);
      const m = new Map<string, number>();
      for (const p of serie) m.set(bucket(p.periodo), (m.get(bucket(p.periodo)) ?? 0) + p.importe);
      const rows = [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
      let acc = 0;
      return rows.map(([k, v]) => {
        acc += v;
        const x = agg === "MES" ? fmtMesCorto(k) : fmtFechaCorta(k);
        return { x, importe: Math.round(v * 100) / 100, acum: Math.round(acc * 100) / 100 };
      });
    }, [serie, agg]);

    return (
      <div className="min-h-0 border border-[var(--t-border)] flex flex-col overflow-hidden h-full">
        <div className="flex items-center flex-wrap gap-2 px-3 py-1.5 border-b border-[var(--t-border)] shrink-0">
          <span className="text-[10px] uppercase tracking-widest text-[var(--t-accent)]">Diferencias por período · {unidad}</span>
          {data.length > 0 && (
            <span className="text-[9px] font-mono text-[var(--t-text-muted)]">{data[0].x} → {data[data.length - 1].x}</span>
          )}
          <span className="text-[10px] font-mono">
            <span className="text-[var(--t-text-muted)] uppercase tracking-wider">Acumulado: </span>
            <span className={"font-semibold " + ((data.at(-1)?.acum ?? 0) >= 0 ? "text-[#22c55e]" : "text-[#ef4444]")}>{fmtC(data.at(-1)?.acum ?? 0)} {unidad}</span>
          </span>
          <div className="ml-auto inline-flex border border-[var(--t-border-2)] divide-x divide-[var(--t-border-2)]">
            {(["DIA", "SEM", "MES"] as const).map((k) => (
              <button key={k} onClick={() => setAgg(k)}
                className={"px-2 py-0.5 text-[9px] uppercase tracking-wider " + (agg === k ? "bg-[var(--t-accent)] text-[var(--t-on-accent)]" : "text-[var(--t-text-dim)] hover:text-[var(--t-accent)]")}>{k}</button>
            ))}
          </div>
        </div>
        <div className="flex-1 min-h-0 p-2 wm-corner wm-soft">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ top: 6, right: 10, left: 6, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--t-border)" />
              <XAxis dataKey="x" tick={{ fontSize: 9, fill: "var(--t-text-muted)" }} />
              <YAxis yAxisId="dif" tickFormatter={fmtC} width={52}
                tick={{ fontSize: 9, fill: "var(--t-text-muted)" }} />
              <Tooltip
                formatter={(v) => [`${fmtC(Number(v))} ${unidad}`, "Diferencia"]}
                contentStyle={{ fontSize: 11, background: "var(--t-panel)", border: "1px solid var(--t-border)" }}
                labelStyle={{ color: "var(--t-text)" }}
                cursor={{ fill: "var(--t-border)", opacity: 0.3 }} />
              <Bar yAxisId="dif" dataKey="importe" isAnimationActive={false} maxBarSize={64}>
                {data.map((d, i) => <Cell key={i} fill={d.importe >= 0 ? POS : NEG} />)}
              </Bar>
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>
    );
  }
}

function Pill({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button onClick={onClick}
      className={"px-2 py-0.5 border text-[11px] font-semibold " + (active ? "bg-[var(--t-accent)] text-[var(--t-on-accent)] border-[var(--t-accent)]" : "bg-transparent text-[var(--t-text-dim)] border-[var(--t-border-2)] hover:text-[var(--t-accent)] hover:border-[var(--t-accent)]")}>
      {children}
    </button>
  );
}

function TablePanel({ titulo, extra, children, fixed = false }: { titulo: string; extra?: string; children: ReactNode; fixed?: boolean }) {
  return (
    <div className={"border border-[var(--t-border)] flex flex-col overflow-hidden " + (fixed ? "shrink-0 max-h-[38%]" : "flex-1 min-h-0")}>
      <div className="flex items-center px-3 py-1.5 border-b border-[var(--t-border)] bg-[var(--t-accent)]/10 shrink-0">
        <span className="text-[10px] uppercase tracking-widest text-[var(--t-accent)]">{titulo}</span>
        {extra && <span className="ml-auto text-[10px] font-mono text-[var(--t-text-dim)]">{extra}</span>}
      </div>
      <div className={fixed ? "overflow-auto" : "flex-1 min-h-0 overflow-auto"}>{children}</div>
    </div>
  );
}
