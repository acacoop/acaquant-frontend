"use client";

// ACA — RESUMEN EJECUTIVO DE INVERSIONES (/aca).
//
// La cartera propia de ACA contada para los gerentes. NO es una vista live: es
// una FOTO MENSUAL. El selector de la barra elige el período y todo lo de abajo
// habla de ESE mes; no hay refresco automático porque no hay nada que se mueva
// solo — un poll sería trabajo de base sin ninguna novedad que traer.
//
// Cinco tabs, que son los cinco bloques de la planilla que reemplaza:
//   RESUMEN   → valuaciones + torta de carteras + los dos cuadros comparativos
//   CARTERAS  → rendimiento acumulado vs benchmarks (3 gráficos)
//   ACTIVOS   → detalle por cartera; ACÁ se cargan VN y PRECIO (lo manual)
//   MÉTRICAS  → apertura por clase de activo y por emisor
//   HISTÓRICO → la planilla mensual, SOLO LECTURA (se carga en Manager → ACA)
//
// El front NO calcula NADA: montos, ponderaciones, share, totales dolarizado/
// pesos, métricas y acumulados vienen resueltos del backend (api/services/aca.py).
// Es a propósito — con la fórmula duplicada acá, la pantalla podía contradecir
// al informe y ninguna de las dos versiones sería la verdad.
//
// Backend: /api/aca/* (lectura módulo `aca` ∪ escritores de la mesa; escritura
// allowlist de Mesa de Dinero + admin). Doc: docs/ACA.md.

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { fetchJson } from "@/lib/fetch-json";
import { readSheetRows } from "@/lib/xlsx-read";
import { exportToXlsx } from "@/lib/xlsx-export";
import { NumeroInput } from "./numero-input";

// ── Contrato /api/aca/vista ────────────────────────────────────────────────
type PeriodoMeta = {
  periodo: string; fecha_informe: string | null;
  mep: number | null; a3500: number | null; nota: string; n_activos: number;
};
type CarteraMonto = { cartera: string; label: string; monto: number; ponderacion: number | null };
type Total = { monto: number; ponderacion: number | null };
type SinClasificar = Total & { clases: string[] };
type Bloque = {
  periodo: string; fecha_informe: string | null;
  mep: number | null; a3500: number | null;
  valuacion_ars: number; valuacion_a3500: number | null; valuacion_usd_mep: number | null;
  carteras: CarteraMonto[]; otras_carteras: Total | null;
  total_dolarizado: Total; total_pesos: Total; sin_clasificar: SinClasificar;
  n_activos: number;
};
type Activo = {
  unidad: string; ticker: string; emisor: string; calificacion: string;
  clase_activo: string; instrumento: string; vencimiento: string; cartera: string;
  sin_ficha: boolean; vn: number | null; px: number | null;
  monto: number | null; monto_manual: number | null;
  tasa: string; obs: string; orden: number; share?: number | null;
};
type BloqueActivos = { cartera: string; label: string; total: number; filas: Activo[] };
type MetricaFila = { clave: string; monto: number; share: number | null; fuera_catalogo: boolean };
type Vista = {
  periodo: string | null;
  periodos: PeriodoMeta[];
  puede_escribir: boolean;
  carteras: { cartera: string; label: string }[];
  resumen: { actual: Bloque; anterior: Bloque | null } | null;
  detalle: { periodo: string; bloques: BloqueActivos[]; huerfanos: Activo[]; total: number } | null;
  metricas: {
    periodo: string; total: number;
    por_clase: { cartera: string; label: string; total: number; filas: MetricaFila[] }[];
    por_emisor: { bloque: string; label: string; total: number; filas: MetricaFila[] }[];
  } | null;
  periodos_grafico?: string[];
  graficos: { grafico: string; series: {
    codigo: string; nombre: string; grupo: string; color: string;
    puntos: { periodo: string; acumulado: number | null }[];
  }[] }[];
};
type Titulo = {
  unidad: string; cartera: string; clase_activo: string; emisor: string;
  ticker: string; instrumento: string; calificacion: string; vencimiento: string;
};
type CeldaHist = {
  periodo: string; mensual: number | null; acumulado: number | null;
  origen: string | null; monto: number | null; ingreso_retiro: number | null;
};
type FilaImport = {
  fila: number; titulo: string; unidad: string; ticker: string; cartera: string;
  emisor: string; match: string; ambiguo: boolean;
  vn: number | null; px: number | null;
  tasa: string | null; obs: string | null; pisa: boolean; duplicado_de_fila?: number;
};
type Ignorada = { fila: number; titulo: string; motivo: string };
type Informe = {
  periodo: string; dry_run: boolean;
  reconocidas: FilaImport[]; ignoradas: Ignorada[];
  total_archivo: number; n_reconocidas: number; n_ignoradas: number; n_pisa: number;
  n_ambiguas: number;
};
type Historico = {
  periodos: string[];
  series: { codigo: string; nombre: string; grupo: string; fuente: string; graficos: string[] }[];
  valores: Record<string, Record<string, CeldaHist>>;
};

// ── Formato ────────────────────────────────────────────────────────────────
const INPUT =
  "bg-[var(--t-surface)] border border-[var(--t-border-2)] text-[11px] px-2 py-1 " +
  "text-[var(--t-text)] focus:border-[var(--t-accent)] focus:outline-none";

const fmt0 = (n: number | null | undefined) =>
  n == null ? "—" : Math.round(n).toLocaleString("es-AR");
const fmt2 = (n: number | null | undefined, dec = 2) =>
  n == null ? "—" : n.toLocaleString("es-AR", { minimumFractionDigits: dec, maximumFractionDigits: dec });
const fmtPct = (n: number | null | undefined, dec = 1) =>
  n == null ? "—" : (n * 100).toLocaleString("es-AR", { minimumFractionDigits: dec, maximumFractionDigits: dec }) + "%";
const signo = (n: number | null | undefined) =>
  n == null ? "" : n < 0 ? "text-[var(--t-neg)]" : n > 0 ? "text-[var(--t-pos)]" : "";

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const MESES_LARGOS = ["ENERO", "FEBRERO", "MARZO", "ABRIL", "MAYO", "JUNIO", "JULIO",
  "AGOSTO", "SEPTIEMBRE", "OCTUBRE", "NOVIEMBRE", "DICIEMBRE"];

// Los tres formateadores toleran null/undefined/basura y devuelven "—".
// No es paranoia decorativa: el 2026-08-13 el backend mandó strings donde el
// front esperaba objetos, `p.periodo` quedó undefined y el `.split()` tumbó la
// VISTA ENTERA con "Cannot read properties of undefined". Un dato raro tiene que
// ensuciar UNA celda, nunca voltear la pantalla — el bug real se arregla en el
// backend, pero el blindaje evita que la próxima sorpresa sea una pantalla negra.
const _partes = (p: string | null | undefined): [string, string] | null => {
  if (typeof p !== "string") return null;
  const [y, m] = p.split("-");
  return y && m ? [y, m] : null;
};
/** '2026-07' → 'jul-26' (el eje de los gráficos de la planilla). */
const fmtPeriodoCorto = (p: string | null | undefined) => {
  const t = _partes(p);
  return t ? `${MESES[Number(t[1]) - 1] ?? t[1]}-${t[0].slice(2)}` : "—";
};
/** '2026-07' → 'JULIO 2026' (título de la torta). */
const fmtPeriodoLargo = (p: string | null | undefined) => {
  const t = _partes(p);
  return t ? `${MESES_LARGOS[Number(t[1]) - 1] ?? t[1]} ${t[0]}` : "—";
};
const fmtFecha = (iso: string | null | undefined) => {
  if (typeof iso !== "string") return "—";
  const [y, m, d] = iso.split("-");
  return y && m && d ? `${d}/${m}/${y}` : "—";
};
/** "1.234,56" (crudo del NumeroInput) → number | null. */
const num = (s: string): number | null => {
  const t = (s ?? "").trim().replace(/\./g, "").replace(",", ".");
  if (!t) return null;
  const v = Number(t);
  return Number.isFinite(v) ? v : null;
};
/** number → crudo del NumeroInput ("1234,56"). */
const crudo = (n: number | null | undefined) =>
  n == null ? "" : String(n).replace(".", ",");

// Paleta de la torta/carteras: azules de la planilla original, en el orden
// ARS / DL / HD / FCI. Definidos acá y no en CSS porque recharts los necesita
// como string y son identidad de dato, no de tema.
const COLOR_CARTERA: Record<string, string> = {
  ARS: "#7ec8f0", DL: "#4a93d9", HD: "#a8cdf0", FCI: "#1f4e96",
};
const PALETA_SERIE = ["#094293", "#ff9900", "#00cc66", "#d95fbb", "#7ec8f0", "#f0c419"];

const TITULO_GRAFICO: Record<string, string> = {
  total_ars: "Cartera Total ACA en ARS vs Benchmarks",
  total_usd: "Cartera Total ACA en USD",
  pesos: "Cartera Pesos ACA vs Benchmarks",
};

type Tab = "resumen" | "carteras" | "activos" | "metricas" | "historico";

// ── Piezas chicas ──────────────────────────────────────────────────────────
function Pill({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1 text-[11px] tracking-wide border ${
        active
          ? "border-[var(--t-accent)] text-[var(--t-accent)]"
          : "border-[var(--t-border)] text-[var(--t-text-dim)] hover:text-[var(--t-text)]"
      }`}
    >
      {label}
    </button>
  );
}

function Panel({ titulo, extra, children }: {
  titulo: string; extra?: React.ReactNode; children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col min-h-0 border border-[var(--t-border)] bg-[var(--t-panel)] overflow-hidden">
      <div className="shrink-0 flex items-center justify-between gap-2 px-3 py-1.5 border-b border-[var(--t-border)] bg-[var(--t-brand)]">
        <span className="text-[11px] font-semibold text-white tracking-wide">{titulo}</span>
        {extra}
      </div>
      <div className="flex-1 min-h-0 overflow-auto">{children}</div>
    </div>
  );
}

function Dato({ label, valor, sub }: { label: string; valor: string; sub?: string }) {
  return (
    <div className="px-3 py-2 border border-[var(--t-border)] bg-[var(--t-panel)]">
      <div className="text-[9px] uppercase tracking-wide text-[var(--t-text-muted)]">{label}</div>
      <div className="text-[15px] font-semibold text-[var(--t-text)] tabular-nums">{valor}</div>
      {sub && <div className="text-[9px] text-[var(--t-text-muted)]">{sub}</div>}
    </div>
  );
}

// ── Vista ──────────────────────────────────────────────────────────────────
export function AcaView() {
  const [tab, setTab] = useState<Tab>("resumen");
  const [periodo, setPeriodo] = useState<string | null>(null);
  const [data, setData] = useState<Vista | null>(null);
  const [hist, setHist] = useState<Historico | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);

  const cargar = useCallback(async (p?: string | null) => {
    setCargando(true);
    try {
      const qs = p ? `?periodo=${encodeURIComponent(p)}` : "";
      const d = await fetchJson<Vista>(`/api/aca/vista${qs}`);
      setData(d);
      setPeriodo(d.periodo);
      setError(null);
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    } finally {
      setCargando(false);
    }
  }, []);

  // Carga inicial. El fetch va inline (y no `cargar()`) porque `cargar` prende
  // el spinner de forma SÍNCRONA, y hacer eso adentro de un efecto encadena un
  // render de más; acá el estado ya nace en `cargando: true` y los setState
  // caen en el .then, que es asíncrono.
  useEffect(() => {
    let vivo = true;
    fetchJson<Vista>("/api/aca/vista")
      .then((d) => {
        if (!vivo) return;
        setData(d); setPeriodo(d.periodo); setError(null);
      })
      .catch((e) => { if (vivo) setError(String(e instanceof Error ? e.message : e)); })
      .finally(() => { if (vivo) setCargando(false); });
    return () => { vivo = false; };
  }, []);

  // El histórico se pide UNA vez y aparte: es una serie de años que no cambia
  // al mover el selector de mes, así que re-pedirla en cada cambio de período
  // sería puro peaje de red.
  useEffect(() => {
    if (tab !== "historico" || hist) return;
    fetchJson<Historico>("/api/aca/historico").then(setHist).catch(() => setHist(null));
  }, [tab, hist]);

  const puedeEscribir = !!data?.puede_escribir;

  if (error) {
    return (
      <div className="p-6 text-[12px] text-[var(--t-neg)]">
        No se pudo cargar la vista ACA: {error}
      </div>
    );
  }
  if (!data) {
    return <div className="p-6 text-[12px] text-[var(--t-text-muted)]">Cargando…</div>;
  }

  return (
    <div className="h-full flex flex-col min-h-0">
      {/* ── Barra ── */}
      <div className="shrink-0 flex flex-wrap items-center gap-2 px-3 py-2 border-b border-[var(--t-border)] bg-[var(--t-panel)]">
        <span className="text-[12px] font-semibold text-[var(--t-text)] tracking-wide">ACA</span>
        <span className="text-[10px] text-[var(--t-text-muted)]">Resumen ejecutivo de inversiones</span>

        <select
          className={INPUT + " ml-2"}
          value={periodo ?? ""}
          onChange={(e) => { void cargar(e.target.value); }}
        >
          {data.periodos.length === 0 && <option value="">sin informes</option>}
          {data.periodos.map((p) => (
            <option key={p.periodo} value={p.periodo}>
              {fmtPeriodoLargo(p.periodo)} — al {fmtFecha(p.fecha_informe)}
            </option>
          ))}
        </select>

        <div className="flex gap-1 ml-2">
          <Pill label="RESUMEN"   active={tab === "resumen"}   onClick={() => setTab("resumen")} />
          <Pill label="CARTERAS"  active={tab === "carteras"}  onClick={() => setTab("carteras")} />
          <Pill label="ACTIVOS"   active={tab === "activos"}   onClick={() => setTab("activos")} />
          <Pill label="MÉTRICAS"  active={tab === "metricas"}  onClick={() => setTab("metricas")} />
          <Pill label="HISTÓRICO" active={tab === "historico"} onClick={() => setTab("historico")} />
        </div>

        <div className="ml-auto flex items-center gap-2">
          {cargando && <span className="text-[10px] text-[var(--t-text-muted)]">actualizando…</span>}
          {!puedeEscribir && (
            <span className="text-[9px] text-[var(--t-text-muted)] border border-[var(--t-border)] px-2 py-0.5">
              SOLO LECTURA
            </span>
          )}
          {puedeEscribir && (
            <PeriodoForm periodos={data.periodos} periodo={periodo}
                         onHecho={(p) => { void cargar(p); }} />
          )}
        </div>
      </div>

      {/* ── Cuerpo ── */}
      <div className="flex-1 min-h-0 overflow-auto p-3">
        {!data.periodo ? (
          <div className="text-[12px] text-[var(--t-text-muted)] max-w-2xl leading-relaxed">
            Todavía no hay ningún informe cargado.
            {puedeEscribir
              ? " Creá el primer período con “+ PERÍODO” arriba a la derecha: elegí el mes y la fecha de corte, y después cargá los activos en la tab ACTIVOS."
              : " Alguien de la mesa tiene que cargar el primero."}
          </div>
        ) : tab === "resumen" ? (
          <TabResumen data={data} />
        ) : tab === "carteras" ? (
          <TabCarteras data={data} />
        ) : tab === "activos" ? (
          <TabActivos data={data} periodo={data.periodo} puedeEscribir={puedeEscribir}
                      onCambio={() => { void cargar(periodo); }} />
        ) : tab === "metricas" ? (
          <TabMetricas data={data} />
        ) : (
          <TabHistorico hist={hist} />
        )}
      </div>
    </div>
  );
}

// ── RESUMEN ────────────────────────────────────────────────────────────────
function TabResumen({ data }: { data: Vista }) {
  const r = data.resumen;
  if (!r) return null;
  const a = r.actual;

  const torta = a.carteras
    .filter((c) => c.monto > 0)
    .map((c) => ({ name: c.label, value: c.monto, cartera: c.cartera }));

  return (
    <div className="flex flex-col gap-3">
      {/* Cabecera: TC + valuaciones */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-2">
        <Dato label="Informe al" valor={fmtFecha(a.fecha_informe)} sub={`${a.n_activos} activos`} />
        <Dato label="Valor MEP" valor={fmt2(a.mep)} />
        <Dato label="Valor A3500" valor={fmt2(a.a3500)} />
        <Dato label="Valuación ARS" valor={fmt0(a.valuacion_ars)} />
        <Dato label="Valuación A3500" valor={fmt0(a.valuacion_a3500)}
              sub={a.a3500 ? "valuación ÷ A3500" : "falta cargar el A3500"} />
        <Dato label="Valuación USD MEP" valor={fmt0(a.valuacion_usd_mep)}
              sub={a.mep ? "valuación ÷ MEP" : "falta cargar el MEP"} />
      </div>

      {a.sin_clasificar.monto > 0 && (
        <div className="px-3 py-2 border border-[var(--t-accent)] bg-[var(--t-tint-amber)] text-[10px] text-[var(--t-text)]">
          <b>{fmt0(a.sin_clasificar.monto)}</b> ({fmtPct(a.sin_clasificar.ponderacion)}) no entra ni a
          Total Dolarizado ni a Total Pesos: no hay regla de moneda para{" "}
          <b>{a.sin_clasificar.clases.join(", ")}</b>. Se resuelve en Manager → ACA → REGLA DE MONEDA.
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
        {/* Torta */}
        <Panel titulo={fmtPeriodoLargo(a.periodo)}>
          <div className="h-[300px] p-2">
            {torta.length === 0 ? (
              <div className="h-full grid place-items-center text-[11px] text-[var(--t-text-muted)]">
                Sin activos con monto — cargá VN y precio en la tab ACTIVOS.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={torta} dataKey="value" nameKey="name" innerRadius="52%" outerRadius="80%"
                       paddingAngle={1} stroke="var(--t-panel)">
                    {torta.map((t) => (
                      <Cell key={t.cartera} fill={COLOR_CARTERA[t.cartera] ?? "#888"} />
                    ))}
                  </Pie>
                  <Legend verticalAlign="middle" align="right" layout="vertical"
                          wrapperStyle={{ fontSize: 11 }} />
                  <Tooltip
                    contentStyle={{ background: "var(--t-panel)", border: "1px solid var(--t-border-2)", fontSize: 11 }}
                    formatter={(v, n) => {
                      const m = Number(v);
                      return [`${fmt0(m)} (${fmtPct(a.valuacion_ars ? m / a.valuacion_ars : null)})`, String(n)];
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </Panel>

        {/* Los dos cuadros: mes actual y mes anterior */}
        <div className="flex flex-col gap-3">
          <CuadroPeriodo bloque={a} />
          {r.anterior
            ? <CuadroPeriodo bloque={r.anterior} />
            : <div className="px-3 py-2 border border-[var(--t-border)] bg-[var(--t-panel)] text-[10px] text-[var(--t-text-muted)]">
                No hay un período anterior cargado para comparar.
              </div>}
        </div>
      </div>
    </div>
  );
}

function CuadroPeriodo({ bloque }: { bloque: Bloque }) {
  return (
    <Panel titulo={fmtPeriodoLargo(bloque.periodo)}>
      <table className="w-full text-[11px]">
        <thead>
          <tr className="text-[9px] uppercase text-[var(--t-text-muted)] bg-[var(--t-surface)]">
            <th className="text-left px-3 py-1 font-medium">Concepto</th>
            <th className="text-right px-3 py-1 font-medium">Monto ARS</th>
            <th className="text-right px-3 py-1 font-medium">Ponderación</th>
          </tr>
        </thead>
        <tbody className="tabular-nums">
          {bloque.carteras.map((c) => (
            <tr key={c.cartera} className="border-t border-[var(--t-border)]">
              <td className="px-3 py-1 text-[var(--t-text)]">{c.label}</td>
              <td className="px-3 py-1 text-right">{fmt0(c.monto)}</td>
              <td className="px-3 py-1 text-right text-[var(--t-text-dim)]">{fmtPct(c.ponderacion)}</td>
            </tr>
          ))}
          {bloque.otras_carteras && (
            <tr className="border-t border-[var(--t-border)] bg-[var(--t-tint-amber)]">
              <td className="px-3 py-1" title="Activos cuya cartera en Manager → Títulos no es ARS/DL/HD/FCI">
                Otras carteras
              </td>
              <td className="px-3 py-1 text-right">{fmt0(bloque.otras_carteras.monto)}</td>
              <td className="px-3 py-1 text-right text-[var(--t-text-dim)]">
                {fmtPct(bloque.otras_carteras.ponderacion)}
              </td>
            </tr>
          )}
          <tr className="border-t-2 border-[var(--t-border-2)] font-semibold">
            <td className="px-3 py-1">Total Dolarizado</td>
            <td className="px-3 py-1 text-right">{fmt0(bloque.total_dolarizado.monto)}</td>
            <td className="px-3 py-1 text-right">{fmtPct(bloque.total_dolarizado.ponderacion)}</td>
          </tr>
          <tr className="border-t border-[var(--t-border)] font-semibold">
            <td className="px-3 py-1">Total Pesos</td>
            <td className="px-3 py-1 text-right">{fmt0(bloque.total_pesos.monto)}</td>
            <td className="px-3 py-1 text-right">{fmtPct(bloque.total_pesos.ponderacion)}</td>
          </tr>
          {bloque.sin_clasificar.monto > 0 && (
            <tr className="border-t border-[var(--t-border)] text-[var(--t-accent)]">
              <td className="px-3 py-1">Sin clasificar</td>
              <td className="px-3 py-1 text-right">{fmt0(bloque.sin_clasificar.monto)}</td>
              <td className="px-3 py-1 text-right">{fmtPct(bloque.sin_clasificar.ponderacion)}</td>
            </tr>
          )}
        </tbody>
      </table>
    </Panel>
  );
}

// ── CARTERAS (gráficos vs benchmarks) ──────────────────────────────────────
function TabCarteras({ data }: { data: Vista }) {
  const graficos = data.graficos ?? [];
  const conDatos = graficos.filter((g) => g.series.length > 0);
  if (conDatos.length === 0) {
    return (
      <div className="text-[11px] text-[var(--t-text-muted)] max-w-2xl leading-relaxed">
        Todavía no hay series cargadas para graficar. Los rendimientos mensuales se
        cargan en Manager → ACA → HISTÓRICO, y ahí mismo se elige en qué gráfico
        entra cada serie.
      </div>
    );
  }
  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
      {conDatos.map((g) => (
        <Panel key={g.grafico} titulo={TITULO_GRAFICO[g.grafico] ?? g.grafico}>
          <div className="h-[320px] p-2">
            <GraficoAcumulado series={g.series} />
          </div>
        </Panel>
      ))}
    </div>
  );
}

function GraficoAcumulado({ series }: { series: Vista["graficos"][number]["series"] }) {
  // Recharts quiere UNA fila por período con una columna por serie.
  const filas = useMemo(() => {
    const porPeriodo = new Map<string, Record<string, number | null | string>>();
    for (const s of series) {
      for (const p of s.puntos) {
        const fila = porPeriodo.get(p.periodo) ?? { periodo: fmtPeriodoCorto(p.periodo) };
        fila[s.codigo] = p.acumulado;
        porPeriodo.set(p.periodo, fila);
      }
    }
    return [...porPeriodo.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([, v]) => v);
  }, [series]);

  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={filas} margin={{ top: 8, right: 12, bottom: 4, left: 4 }}>
        <CartesianGrid stroke="var(--t-border)" strokeDasharray="2 4" />
        <XAxis dataKey="periodo" tick={{ fontSize: 10, fill: "var(--t-text-muted)" }}
               stroke="var(--t-border-2)" />
        <YAxis tick={{ fontSize: 10, fill: "var(--t-text-muted)" }} stroke="var(--t-border-2)"
               tickFormatter={(v: number) => fmtPct(v, 0)} width={48} />
        <Tooltip
          contentStyle={{ background: "var(--t-panel)", border: "1px solid var(--t-border-2)", fontSize: 11 }}
          formatter={(v, n) => [fmtPct(v == null ? null : Number(v), 2), String(n)]}
        />
        <Legend wrapperStyle={{ fontSize: 10 }} />
        {series.map((s, i) => (
          <Line
            key={s.codigo}
            type="monotone"
            dataKey={s.codigo}
            name={s.nombre}
            // Las series de la CARTERA van sólidas y los benchmarks punteados:
            // es la lectura de la planilla (lo nuestro vs contra qué se mide).
            strokeDasharray={s.grupo === "benchmark" ? "4 3" : undefined}
            stroke={s.color || PALETA_SERIE[i % PALETA_SERIE.length]}
            strokeWidth={s.grupo === "cartera" ? 2 : 1.4}
            dot={{ r: 2 }}
            // Un mes sin dato NO corta la línea: el acumulado arrastra.
            connectNulls
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

// ── ACTIVOS (detalle por cartera — acá se carga lo manual) ─────────────────

// Anchos FIJOS compartidos por las 4 tablas de cartera.
//
// Sin esto cada tabla es `auto` y se dimensiona con SU propio contenido: la de
// Cartera Pesos (2 filas, emisores cortos) queda con columnas angostas y la de
// Cartera DL (emisores largos como 'AEROPUERTOS 2000') con columnas anchas, así
// que las mismas columnas arrancan en lugares distintos y el informe se lee como
// cuatro tablas sueltas en vez de una. Con `table-fixed` + este colgroup, VN, Px
// y Monto caen SIEMPRE en la misma posición y las cifras quedan alineadas de
// arriba a abajo, que es lo que hace comparable un informe.
//
// Porcentajes (no px) para que siga siendo responsive. La última columna solo
// existe para quien escribe, así que hay dos repartos que suman 100 cada uno.
function ColsActivos({ puedeEscribir }: { puedeEscribir: boolean }) {
  const w = puedeEscribir
    ? ["15%", "12%", "6%", "7%", "7%", "10%", "9%", "10%", "5%", "5%", "6%", "8%"]
    : ["16%", "13%", "7%", "8%", "8%", "11%", "8%", "11%", "6%", "5%", "7%"];
  return <colgroup>{w.map((x, i) => <col key={i} style={{ width: x }} />)}</colgroup>;
}
function TabActivos({ data, periodo, puedeEscribir, onCambio }: {
  data: Vista; periodo: string; puedeEscribir: boolean; onCambio: () => void;
}) {
  const det = data.detalle;
  const [agregando, setAgregando] = useState(false);
  const [importando, setImportando] = useState(false);
  const [busy, setBusy] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [sugeridos, setSugeridos] = useState<Record<string, { precio: number; fecha: string | null }>>({});

  const clonar = async () => {
    if (!confirm("Copia los títulos y los VN del período anterior. NO copia los precios " +
                 "(el precio es el corte de ESTE mes). No pisa lo ya cargado. ¿Seguir?")) return;
    setBusy(true);
    try {
      const r = await fetchJson<{ filas: number; origen: string }>("/api/aca/clonar", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ periodo }),
      });
      setAviso(`Se copiaron ${r.filas} títulos desde ${r.origen}.`);
      onCambio();
    } catch (e) {
      setAviso(String(e instanceof Error ? e.message : e));
    } finally { setBusy(false); }
  };

  const verSugeridos = async () => {
    try {
      const r = await fetchJson<{ precios: { unidad: string; precio: number; fecha: string | null }[] }>(
        `/api/aca/precios-sugeridos?periodo=${encodeURIComponent(periodo)}`);
      const m: Record<string, { precio: number; fecha: string | null }> = {};
      for (const p of r.precios) m[p.unidad] = { precio: p.precio, fecha: p.fecha };
      setSugeridos(m);
      setAviso("Referencia cargada: el último precio conocido de cada título aparece debajo " +
               "del campo PX. Es orientativo — el precio del informe se escribe a mano.");
    } catch (e) {
      setAviso(String(e instanceof Error ? e.message : e));
    }
  };

  if (!det) return null;

  return (
    <div className="flex flex-col gap-3">
      {puedeEscribir && (
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={() => setAgregando(true)} disabled={busy}
                  className="px-3 py-1 text-[11px] border border-[var(--t-accent)] text-[var(--t-accent)] hover:bg-[var(--t-tint-amber)]">
            + AGREGAR TÍTULO
          </button>
          <button onClick={clonar} disabled={busy}
                  className="px-3 py-1 text-[11px] border border-[var(--t-border-2)] text-[var(--t-text-dim)] hover:text-[var(--t-text)]">
            COPIAR DEL MES ANTERIOR
          </button>
          <button onClick={() => setImportando(true)} disabled={busy}
                  className="px-3 py-1 text-[11px] border border-[var(--t-accent)] text-[var(--t-accent)] hover:bg-[var(--t-tint-amber)]">
            ⬆ IMPORTAR EXCEL
          </button>
          <button onClick={verSugeridos} disabled={busy}
                  className="px-3 py-1 text-[11px] border border-[var(--t-border-2)] text-[var(--t-text-dim)] hover:text-[var(--t-text)]">
            VER PRECIOS DE REFERENCIA
          </button>
          {aviso && <span className="text-[10px] text-[var(--t-text-dim)]">{aviso}</span>}
        </div>
      )}

      {agregando && (
        <AgregarTitulo periodo={periodo} onCerrar={() => setAgregando(false)}
                       onHecho={() => { setAgregando(false); onCambio(); }} />
      )}

      {importando && (
        <ImportarExcel periodo={periodo}
                       activos={det.bloques.flatMap((b) => b.filas)}
                       onCerrar={() => setImportando(false)}
                       onHecho={() => { setImportando(false); onCambio(); }} />
      )}

      {det.huerfanos.length > 0 && (
        <div className="px-3 py-2 border border-[var(--t-accent)] bg-[var(--t-tint-amber)] text-[10px] text-[var(--t-text)]">
          {det.huerfanos.length} título(s) cargados cuya CARTERA en Manager → Títulos no es
          ARS/DL/HD/FCI (o que no tienen ficha): {det.huerfanos.map((h) => h.ticker || h.unidad).join(", ")}.
          Suman al total pero no entran a ningún cuadro por cartera — corregí su ficha en Manager → Títulos.
        </div>
      )}

      {det.bloques.map((b) => (
        <Panel key={b.cartera}
               titulo={`Detalle de Activos - ${b.label}`}
               extra={<span className="text-[11px] text-white tabular-nums">{fmt0(b.total)}</span>}>
          <table className="w-full text-[11px] table-fixed">
            <ColsActivos puedeEscribir={puedeEscribir} />
            <thead>
              <tr className="text-[9px] uppercase text-[var(--t-text-muted)] bg-[var(--t-surface)]">
                <th className="text-left px-2 py-1 font-medium">Ticker</th>
                <th className="text-center px-2 py-1 font-medium">Emisor</th>
                <th className="text-center px-2 py-1 font-medium">Calif.</th>
                <th className="text-center px-2 py-1 font-medium">Clase Act.</th>
                <th className="text-center px-2 py-1 font-medium">Venc.</th>
                <th className="text-center px-2 py-1 font-medium">VN</th>
                <th className="text-center px-2 py-1 font-medium">Px</th>
                <th className="text-center px-2 py-1 font-medium">Monto</th>
                <th className="text-center px-2 py-1 font-medium">Tasa</th>
                <th className="text-center px-2 py-1 font-medium">% Share</th>
                <th className="text-center px-2 py-1 font-medium">Obs.</th>
                {puedeEscribir && <th className="px-2 py-1" />}
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {b.filas.length === 0 && (
                <tr><td colSpan={12} className="px-2 py-3 text-center text-[var(--t-text-muted)]">
                  Sin títulos cargados en esta cartera.
                </td></tr>
              )}
              {b.filas.map((f) => (
                <FilaActivo key={f.unidad} fila={f} periodo={periodo}
                            puedeEscribir={puedeEscribir} onCambio={onCambio}
                            sugerido={sugeridos[f.unidad]} />
              ))}
            </tbody>
          </table>
        </Panel>
      ))}
    </div>
  );
}

function FilaActivo({ fila, periodo, puedeEscribir, onCambio, sugerido }: {
  fila: Activo; periodo: string; puedeEscribir: boolean; onCambio: () => void;
  sugerido?: { precio: number; fecha: string | null };
}) {
  const [vn, setVn] = useState(crudo(fila.vn));
  const [px, setPx] = useState(crudo(fila.px));
  const [tasa, setTasa] = useState(fila.tasa);
  const [obs, setObs] = useState(fila.obs);
  const [busy, setBusy] = useState(false);
  const [sucio, setSucio] = useState(false);

  // Re-sincronizar con el servidor tras cada guardado/recarga, SIN pisar lo que
  // el usuario esté tipeando (`sucio`). Va durante el render y no en un efecto:
  // es el patrón oficial de React para ajustar estado cuando cambian las props
  // (un useEffect acá dispara un render en cascada por cada fila de la tabla).
  // `fila` es un objeto nuevo en cada fetch, así que la comparación por
  // identidad alcanza para detectar "llegó data del servidor".
  const [ultimaDelServidor, setUltimaDelServidor] = useState(fila);
  if (ultimaDelServidor !== fila && !sucio) {
    setUltimaDelServidor(fila);
    setVn(crudo(fila.vn)); setPx(crudo(fila.px));
    setTasa(fila.tasa); setObs(fila.obs);
  }

  const guardar = async () => {
    setBusy(true);
    try {
      await fetchJson("/api/aca/activos", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          periodo, unidad: fila.unidad, vn: num(vn), px: num(px),
          monto: fila.monto_manual, tasa, obs, orden: fila.orden,
        }),
      });
      setSucio(false);
      onCambio();
    } catch (e) {
      alert(String(e instanceof Error ? e.message : e));
    } finally { setBusy(false); }
  };

  const borrar = async () => {
    if (!confirm(`Sacar ${fila.ticker || fila.unidad} del informe de ${periodo}?`)) return;
    setBusy(true);
    try {
      await fetchJson(
        `/api/aca/activos?periodo=${encodeURIComponent(periodo)}&unidad=${encodeURIComponent(fila.unidad)}`,
        { method: "DELETE" });
      onCambio();
    } catch (e) {
      alert(String(e instanceof Error ? e.message : e));
    } finally { setBusy(false); }
  };

  const cel = "px-2 py-1";
  // Con `table-fixed` el contenido ya NO ensancha la columna: un emisor largo
  // desbordaría sobre la de al lado. `truncate` lo corta con puntos suspensivos
  // y el `title` deja el texto completo a un hover de distancia.
  const celTxt = cel + " truncate";
  const marcar = <T,>(set: (v: T) => void) => (v: T) => { set(v); setSucio(true); };

  return (
    <tr className={`border-t border-[var(--t-border)] hover:bg-[var(--t-surface-2)] ${
      fila.monto == null ? "bg-[var(--t-tint-amber)]" : ""}`}>
      <td className={celTxt + " text-[var(--t-text)]"} title={fila.unidad}>
        {fila.ticker || fila.instrumento || fila.unidad}
        {fila.sin_ficha && <span className="ml-1 text-[var(--t-accent)]" title="Sin ficha en Manager → Títulos">⚠</span>}
      </td>
      <td className={celTxt + " text-center text-[var(--t-text-dim)]"} title={fila.emisor}>{fila.emisor || "—"}</td>
      <td className={celTxt + " text-center text-[var(--t-text-dim)]"} title={fila.calificacion}>{fila.calificacion || "—"}</td>
      <td className={celTxt + " text-center text-[var(--t-text-dim)]"} title={fila.clase_activo}>{fila.clase_activo || "—"}</td>
      <td className={celTxt + " text-center text-[var(--t-text-dim)]"} title={fila.vencimiento}>{fila.vencimiento || "—"}</td>
      <td className={cel + " text-center"}>
        {puedeEscribir
          ? <NumeroInput value={vn} onChange={marcar(setVn)} className={INPUT + " w-full text-center"} />
          : fmt0(fila.vn)}
      </td>
      <td className={cel + " text-center"}>
        {puedeEscribir ? (
          <>
            <NumeroInput value={px} onChange={marcar(setPx)} className={INPUT + " w-full text-center"} />
            {sugerido && (
              <div className="text-[8px] text-[var(--t-text-muted)] truncate" title="Último precio conocido en tenencia — orientativo">
                ref {fmt2(sugerido.precio)} · {sugerido.fecha ?? "—"}
              </div>
            )}
          </>
        ) : fmt2(fila.px)}
      </td>
      <td className={cel + " text-center text-[var(--t-text)]"}
          title={fila.monto_manual != null ? "Monto forzado a mano (no derivado de VN × Px)" : "VN × Px"}>
        {fmt0(fila.monto)}{fila.monto_manual != null && " *"}
      </td>
      <td className={celTxt + " text-center"} title={fila.tasa}>
        {puedeEscribir
          ? <input value={tasa} onChange={(e) => { setTasa(e.target.value); setSucio(true); }}
                   className={INPUT + " w-full text-center"} />
          : (fila.tasa || "—")}
      </td>
      <td className={cel + " text-center text-[var(--t-text-dim)]"}>{fmtPct(fila.share, 0)}</td>
      <td className={celTxt + " text-center"} title={fila.obs}>
        {puedeEscribir
          ? <input value={obs} onChange={(e) => { setObs(e.target.value); setSucio(true); }}
                   className={INPUT + " w-full text-center"} />
          : (fila.obs || "—")}
      </td>
      {puedeEscribir && (
        <td className={cel}>
          <div className="flex items-center gap-1">
            <button onClick={guardar} disabled={busy || !sucio}
                    title={sucio ? "Guardar los cambios de esta fila" : "Sin cambios"}
                    className={`flex-1 px-1 py-0.5 text-[10px] border ${
                      sucio ? "border-[var(--t-accent)] text-[var(--t-accent)]"
                            : "border-[var(--t-border)] text-[var(--t-text-muted)]"}`}>
              {busy ? "…" : "✓"}
            </button>
            <button onClick={borrar} disabled={busy} title="Sacar del informe"
                    className="px-1 py-0.5 text-[10px] border border-[var(--t-border)] text-[var(--t-text-muted)] hover:text-[var(--t-neg)]">
              ✕
            </button>
          </div>
        </td>
      )}
    </tr>
  );
}

function AgregarTitulo({ periodo, onCerrar, onHecho }: {
  periodo: string; onCerrar: () => void; onHecho: () => void;
}) {
  const [q, setQ] = useState("");
  const [titulos, setTitulos] = useState<Titulo[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => {
      fetchJson<{ titulos: Titulo[] }>(`/api/aca/titulos?q=${encodeURIComponent(q)}`)
        .then((d) => setTitulos(d.titulos)).catch(() => setTitulos([]));
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  const agregar = async (t: Titulo) => {
    setBusy(true);
    try {
      await fetchJson("/api/aca/activos", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ periodo, unidad: t.unidad }),
      });
      onHecho();
    } catch (e) {
      alert(String(e instanceof Error ? e.message : e));
    } finally { setBusy(false); }
  };

  return (
    <Panel titulo="AGREGAR TÍTULO AL INFORME"
           extra={<button onClick={onCerrar} className="text-[11px] text-white">✕</button>}>
      <div className="p-2 flex flex-col gap-2">
        <div className="text-[10px] text-[var(--t-text-muted)]">
          Los títulos salen del catálogo de Manager → Títulos: la ficha (emisor, calificación,
          clase de activo, vencimiento, cartera) se hereda de ahí y no se tipea acá. Si un
          título no aparece, hay que darlo de alta en ese maestro primero.
        </div>
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)}
               placeholder="Buscar por ticker, emisor o unidad…" className={INPUT + " w-full"} />
        <div className="max-h-[320px] overflow-auto">
          <table className="w-full text-[11px]">
            <thead>
              <tr className="text-[9px] uppercase text-[var(--t-text-muted)] bg-[var(--t-surface)]">
                <th className="text-left px-2 py-1 font-medium">Ticker</th>
                <th className="text-left px-2 py-1 font-medium">Cartera</th>
                <th className="text-left px-2 py-1 font-medium">Clase</th>
                <th className="text-left px-2 py-1 font-medium">Emisor</th>
                <th className="text-left px-2 py-1 font-medium">Unidad</th>
                <th className="px-2 py-1" />
              </tr>
            </thead>
            <tbody>
              {titulos.map((t) => (
                <tr key={t.unidad} className="border-t border-[var(--t-border)] hover:bg-[var(--t-surface-2)]">
                  <td className="px-2 py-1 text-[var(--t-text)]">{t.ticker || "—"}</td>
                  <td className="px-2 py-1 text-[var(--t-text-dim)]">{t.cartera || "—"}</td>
                  <td className="px-2 py-1 text-[var(--t-text-dim)]">{t.clase_activo || "—"}</td>
                  <td className="px-2 py-1 text-[var(--t-text-dim)]">{t.emisor || "—"}</td>
                  <td className="px-2 py-1 text-[9px] text-[var(--t-text-muted)]">{t.unidad}</td>
                  <td className="px-2 py-1">
                    <button onClick={() => agregar(t)} disabled={busy}
                            className="px-2 py-0.5 text-[10px] border border-[var(--t-accent)] text-[var(--t-accent)]">
                      AGREGAR
                    </button>
                  </td>
                </tr>
              ))}
              {titulos.length === 0 && (
                <tr><td colSpan={6} className="px-2 py-3 text-center text-[var(--t-text-muted)]">
                  Sin resultados.
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </Panel>
  );
}

// ── MÉTRICAS GENERALES ─────────────────────────────────────────────────────
function TabMetricas({ data }: { data: Vista }) {
  const m = data.metricas;
  if (!m) return null;
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
      {m.por_clase.map((b) => (
        <Panel key={b.cartera} titulo={b.label}
               extra={<span className="text-[11px] text-white tabular-nums">{fmt0(b.total)}</span>}>
          <TablaMetrica filas={b.filas} />
        </Panel>
      ))}
      {m.por_emisor.map((b) => (
        <Panel key={b.bloque} titulo={b.label}
               extra={<span className="text-[11px] text-white tabular-nums">{fmt0(b.total)}</span>}>
          <TablaMetrica filas={b.filas} dec={b.bloque === "privados" ? 2 : 0} />
        </Panel>
      ))}
    </div>
  );
}

function TablaMetrica({ filas, dec = 0 }: { filas: MetricaFila[]; dec?: number }) {
  if (filas.length === 0) {
    return <div className="px-3 py-3 text-[11px] text-[var(--t-text-muted)]">
      Sin filas — se configuran en Manager → ACA.
    </div>;
  }
  return (
    <table className="w-full text-[11px]">
      <tbody className="tabular-nums">
        {filas.map((f) => (
          <tr key={f.clave} className="border-t border-[var(--t-border)]">
            <td className="px-3 py-1 text-[var(--t-text)]">
              {f.clave}
              {f.fuera_catalogo && (
                <span className="ml-1 text-[var(--t-accent)]" title="Aparece en el período pero no está en el catálogo de Manager → ACA">•</span>
              )}
            </td>
            <td className={`px-3 py-1 text-right ${f.monto ? "" : "text-[var(--t-text-muted)]"}`}>
              {f.monto ? fmt0(f.monto) : "-"}
            </td>
            <td className="px-3 py-1 text-right text-[var(--t-text-dim)] w-20">
              {fmtPct(f.share, dec)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ── HISTÓRICO (solo lectura — se carga en Manager → ACA) ───────────────────
function TabHistorico({ hist }: { hist: Historico | null }) {
  if (!hist) return <div className="text-[11px] text-[var(--t-text-muted)]">Cargando histórico…</div>;
  if (hist.periodos.length === 0) {
    return <div className="text-[11px] text-[var(--t-text-muted)]">
      Todavía no hay datos históricos. Se cargan en Manager → ACA → HISTÓRICO.
    </div>;
  }
  return (
    <Panel titulo="HISTÓRICO — rendimiento mensual y acumulado"
           extra={<span className="text-[10px] text-white/70">se carga en Manager → ACA</span>}>
      <div className="overflow-auto">
        <table className="text-[11px] min-w-max">
          <thead className="sticky top-0 bg-[var(--t-surface)] z-10">
            <tr className="text-[9px] uppercase text-[var(--t-text-muted)]">
              <th className="text-left px-2 py-1 font-medium sticky left-0 bg-[var(--t-surface)]">Período</th>
              {hist.series.map((s) => (
                <th key={s.codigo} colSpan={2}
                    className="text-center px-2 py-1 font-medium border-l border-[var(--t-border)]">
                  {s.nombre}
                </th>
              ))}
            </tr>
            <tr className="text-[9px] uppercase text-[var(--t-text-muted)]">
              <th className="sticky left-0 bg-[var(--t-surface)]" />
              {hist.series.map((s) => (
                <>
                  <th key={s.codigo + "-m"} className="text-right px-2 py-0.5 font-normal border-l border-[var(--t-border)]">Mensual</th>
                  <th key={s.codigo + "-a"} className="text-right px-2 py-0.5 font-normal">Acumulado</th>
                </>
              ))}
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {hist.periodos.map((p) => (
              <tr key={p} className="border-t border-[var(--t-border)] hover:bg-[var(--t-surface-2)]">
                <td className="px-2 py-1 text-[var(--t-text-dim)] sticky left-0 bg-[var(--t-panel)]">
                  {fmtPeriodoCorto(p)}
                </td>
                {hist.series.map((s) => {
                  const c = hist.valores[s.codigo]?.[p];
                  return (
                    <>
                      <td key={s.codigo + p + "m"}
                          className={`px-2 py-1 text-right border-l border-[var(--t-border)] ${signo(c?.mensual)}`}
                          title={c?.origen === "auto" ? "Calculado automáticamente desde una serie macro" : undefined}>
                        {fmtPct(c?.mensual ?? null, 2)}
                        {c?.origen === "auto" && <span className="text-[var(--t-text-muted)]"> ·a</span>}
                      </td>
                      <td key={s.codigo + p + "a"} className="px-2 py-1 text-right text-[var(--t-text)]">
                        {fmtPct(c?.acumulado ?? null, 2)}
                      </td>
                    </>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

// ── Alta / edición del período (cabecera del informe) ──────────────────────
function PeriodoForm({ periodos, periodo, onHecho }: {
  periodos: PeriodoMeta[]; periodo: string | null; onHecho: (p: string) => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const actual = periodos.find((p) => p.periodo === periodo);
  const [mes, setMes] = useState(periodo ?? "");
  const [fecha, setFecha] = useState(actual?.fecha_informe ?? "");
  const [mep, setMep] = useState(crudo(actual?.mep ?? null));
  const [a3500, setA3500] = useState(crudo(actual?.a3500 ?? null));
  const [busy, setBusy] = useState(false);

  const abrir = (nuevo: boolean) => {
    if (nuevo) { setMes(""); setFecha(""); setMep(""); setA3500(""); }
    else {
      setMes(periodo ?? "");
      setFecha(actual?.fecha_informe ?? "");
      setMep(crudo(actual?.mep ?? null));
      setA3500(crudo(actual?.a3500 ?? null));
    }
    setAbierto(true);
  };

  const guardar = async () => {
    setBusy(true);
    try {
      await fetchJson("/api/aca/periodos", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          periodo: mes, fecha_informe: fecha, mep: num(mep), a3500: num(a3500),
        }),
      });
      setAbierto(false);
      onHecho(mes);
    } catch (e) {
      alert(String(e instanceof Error ? e.message : e));
    } finally { setBusy(false); }
  };

  if (!abierto) {
    return (
      <div className="flex gap-1">
        <button onClick={() => abrir(true)}
                className="px-2 py-1 text-[10px] border border-[var(--t-accent)] text-[var(--t-accent)]">
          + PERÍODO
        </button>
        {periodo && (
          <button onClick={() => abrir(false)}
                  className="px-2 py-1 text-[10px] border border-[var(--t-border-2)] text-[var(--t-text-dim)]">
            EDITAR MEP/A3500
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-1">
      <input type="month" value={mes} onChange={(e) => {
        setMes(e.target.value);
        // La fecha del informe casi siempre es el último día del mes elegido:
        // se propone sola y se puede pisar.
        if (e.target.value) {
          const [y, m] = e.target.value.split("-").map(Number);
          setFecha(new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10));
        }
      }} className={INPUT} title="Mes del informe" />
      <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)}
             className={INPUT} title="Informe al…" />
      <NumeroInput value={mep} onChange={setMep} className={INPUT + " w-24 text-right"}
                   placeholder="MEP" />
      <NumeroInput value={a3500} onChange={setA3500} className={INPUT + " w-24 text-right"}
                   placeholder="A3500" />
      <button onClick={guardar} disabled={busy || !mes || !fecha}
              className="px-2 py-1 text-[10px] border border-[var(--t-accent)] text-[var(--t-accent)]">
        {busy ? "…" : "GUARDAR"}
      </button>
      <button onClick={() => setAbierto(false)}
              className="px-2 py-1 text-[10px] border border-[var(--t-border)] text-[var(--t-text-muted)]">
        ✕
      </button>
    </div>
  );
}

// ── Importar Excel al detalle de activos ───────────────────────────────────
// Flujo en dos pasos, a propósito: se PARSEA y se muestra qué reconoció el
// backend ANTES de escribir nada. Recién con CONFIRMAR se persiste. Un import a
// ciegas sobre un informe de gerencia es la clase de cosa que se descubre tarde.
//
// El archivo puede tener las MISMAS columnas que la tabla ACTIVOS; solo se leen
// las que son INPUT (ticker, VN, Px, tasa, obs). Emisor, calificación, clase y
// vencimiento se ignoran aunque vengan: esos salen del maestro de Manager →
// Títulos, que es la única ficha (si el Excel dice otra cosa, gana el maestro).
// El MONTO tampoco se importa: se deriva de VN × Px, que es el punto de la vista.

/** Encabezado del Excel → campo interno. Normaliza (minúsculas, sin acentos,
 *  sin puntuación) y acepta los sinónimos que aparecen en la planilla real. */
const _COLUMNAS: Record<string, string[]> = {
  titulo: ["ticker", "especie", "activo", "titulo", "instrumento", "unidad", "papel"],
  vn:     ["vn", "valornominal", "nominal", "nominales", "cantidad", "vnominal"],
  px:     ["px", "precio", "preciocorte", "pxcorte", "cotizacion", "valor"],
  tasa:   ["tasa"],
  obs:    ["obs", "observacion", "observaciones", "nota", "notas", "comentario"],
};
const _norm = (s: string) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]/g, "");

function mapearColumnas(fila: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fila)) {
    const n = _norm(k);
    for (const [campo, alias] of Object.entries(_COLUMNAS)) {
      if (out[campo] === undefined && alias.includes(n)) out[campo] = v;
    }
  }
  return out;
}

function ImportarExcel({ periodo, activos, onCerrar, onHecho }: {
  periodo: string; activos: Activo[]; onCerrar: () => void; onHecho: () => void;
}) {
  const [informe, setInforme] = useState<Informe | null>(null);
  const [crudas, setCrudas] = useState<Record<string, unknown>[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const analizar = async (file: File) => {
    setBusy(true); setError(null); setInforme(null);
    try {
      const rows = await readSheetRows(file);
      const filas = rows
        .map(mapearColumnas)
        .filter((f) => String(f.titulo ?? "").trim() !== "");
      if (!filas.length) {
        setError("No encontré ninguna fila con columna de ticker. El archivo tiene que " +
                 "tener un encabezado con TICKER (o especie/activo/instrumento) y, " +
                 "opcionalmente, VN, PX, TASA y OBS.");
        return;
      }
      setCrudas(filas);
      // dry_run: el backend resuelve contra el maestro y devuelve el informe SIN escribir.
      setInforme(await fetchJson<Informe>("/api/aca/activos/importar", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ periodo, filas, dry_run: true }),
      }));
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    } finally { setBusy(false); }
  };

  const confirmar = async () => {
    setBusy(true); setError(null);
    try {
      const r = await fetchJson<Informe>("/api/aca/activos/importar", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ periodo, filas: crudas, dry_run: false }),
      });
      alert(`Listo: ${r.n_reconocidas} títulos importados` +
            (r.n_ignoradas ? `, ${r.n_ignoradas} ignorados.` : "."));
      onHecho();
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    } finally { setBusy(false); }
  };

  return (
    <Panel titulo={`IMPORTAR EXCEL — ${fmtPeriodoLargo(periodo)}`}
           extra={<button onClick={onCerrar} className="text-[11px] text-white">✕</button>}>
      <div className="p-3 flex flex-col gap-3">
        <div className="text-[10px] text-[var(--t-text-muted)] leading-relaxed max-w-4xl">
          Subí el .xlsx (o .csv) con las mismas columnas que la tabla. Se leen{" "}
          <b>TICKER</b>, <b>VN</b>, <b>PX</b>, <b>TASA</b> y <b>OBS</b>; el resto se
          ignora aunque venga: emisor, calificación, clase de activo y vencimiento salen
          del maestro de Manager → Títulos, y el <b>monto se calcula</b> (VN × Px).
          Los títulos que no estén en ese maestro <b>no se importan</b> y se listan abajo
          con el motivo. Nada se guarda hasta que toques CONFIRMAR.
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button onClick={() => void descargarModelo(periodo, activos)}
                  className="px-3 py-1 text-[11px] border border-[var(--t-border-2)] text-[var(--t-text-dim)] hover:text-[var(--t-text)]">
            ⬇ DESCARGAR MODELO
          </button>
          <input type="file" accept=".xlsx,.xlsm,.xls,.csv" disabled={busy}
                 onChange={(e) => { const f = e.target.files?.[0]; if (f) void analizar(f); }}
                 className="text-[11px] text-[var(--t-text)]" />
        </div>
        <div className="text-[9px] text-[var(--t-text-muted)]">
          El modelo baja con los encabezados exactos{activos.length
            ? ` y los ${activos.length} títulos que ya tiene este período (con su VN y Px)` : ""}
          , más una hoja INSTRUCCIONES. Completá y volvé a subirlo.
        </div>

        {busy && <div className="text-[11px] text-[var(--t-text-muted)]">Procesando…</div>}
        {error && <div className="text-[11px] text-[var(--t-neg)] max-w-4xl">{error}</div>}

        {informe && (
          <>
            <div className="flex flex-wrap items-center gap-3 text-[11px]">
              <span className="text-[var(--t-text-dim)]">
                {informe.total_archivo} filas en el archivo
              </span>
              <span className="text-[var(--t-pos)]">✓ {informe.n_reconocidas} se importan</span>
              {informe.n_ignoradas > 0 && (
                <span className="text-[var(--t-neg)]">✕ {informe.n_ignoradas} se ignoran</span>
              )}
              {informe.n_pisa > 0 && (
                <span className="text-[var(--t-accent)]">
                  ⚠ {informe.n_pisa} ya estaban cargados y se van a PISAR
                </span>
              )}
              {informe.n_ambiguas > 0 && (
                <span className="text-[var(--t-accent)]"
                      title="El ticker apunta a más de un título del maestro. Se importa el que dice la columna 'Se importa como' — revisalo y corregilo si no es ese.">
                  ⚠ {informe.n_ambiguas} con ticker repetido en el maestro
                </span>
              )}
              <button onClick={confirmar} disabled={busy || !informe.n_reconocidas}
                      className="ml-auto px-3 py-1 text-[11px] font-semibold bg-[var(--t-accent)] text-[var(--t-on-accent)] disabled:opacity-40">
                CONFIRMAR E IMPORTAR {informe.n_reconocidas}
              </button>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
              <div className="border border-[var(--t-border)] max-h-[340px] overflow-auto">
                <table className="w-full text-[11px]">
                  <thead className="sticky top-0 bg-[var(--t-surface)]">
                    <tr className="text-[9px] uppercase text-[var(--t-text-muted)]">
                      <th className="text-left px-2 py-1 font-medium">#</th>
                      <th className="text-left px-2 py-1 font-medium">Del archivo</th>
                      <th className="text-left px-2 py-1 font-medium">Se importa como</th>
                      <th className="text-left px-2 py-1 font-medium">Cart.</th>
                      <th className="text-right px-2 py-1 font-medium">VN</th>
                      <th className="text-right px-2 py-1 font-medium">Px</th>
                    </tr>
                  </thead>
                  <tbody className="tabular-nums">
                    {informe.reconocidas.map((f) => (
                      <tr key={f.unidad}
                          className={`border-t border-[var(--t-border)] ${
                            f.ambiguo || f.pisa ? "bg-[var(--t-tint-amber)]" : ""}`}>
                        <td className="px-2 py-1 text-[var(--t-text-muted)]">{f.fila}</td>
                        <td className="px-2 py-1 text-[var(--t-text-dim)]">{f.titulo}</td>
                        <td className="px-2 py-1 text-[var(--t-text)]" title={`${f.unidad} (${f.match})`}>
                          {f.ticker || f.unidad}
                          {f.ambiguo && (
                            <span className="ml-1 text-[var(--t-accent)]" title={f.match}>⚠</span>
                          )}
                          {f.duplicado_de_fila && (
                            <span className="ml-1 text-[var(--t-accent)]"
                                  title={`Repetido en el archivo (también en la fila ${f.duplicado_de_fila}); vale este`}>⚠</span>
                          )}
                        </td>
                        <td className="px-2 py-1 text-[var(--t-text-dim)]">{f.cartera || "—"}</td>
                        <td className="px-2 py-1 text-right">{fmt0(f.vn)}</td>
                        <td className="px-2 py-1 text-right">{fmt2(f.px)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="border border-[var(--t-border)] max-h-[340px] overflow-auto">
                {informe.ignoradas.length === 0 ? (
                  <div className="p-3 text-[11px] text-[var(--t-pos)]">
                    Se reconocieron todos los títulos del archivo.
                  </div>
                ) : (
                  <table className="w-full text-[11px]">
                    <thead className="sticky top-0 bg-[var(--t-surface)]">
                      <tr className="text-[9px] uppercase text-[var(--t-text-muted)]">
                        <th className="text-left px-2 py-1 font-medium">#</th>
                        <th className="text-left px-2 py-1 font-medium">No se importa</th>
                        <th className="text-left px-2 py-1 font-medium">Por qué</th>
                      </tr>
                    </thead>
                    <tbody>
                      {informe.ignoradas.map((f, i) => (
                        <tr key={i} className="border-t border-[var(--t-border)]">
                          <td className="px-2 py-1 text-[var(--t-text-muted)]">{f.fila}</td>
                          <td className="px-2 py-1 text-[var(--t-text)]">{f.titulo || "(vacío)"}</td>
                          <td className="px-2 py-1 text-[var(--t-text-dim)]">{f.motivo}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </Panel>
  );
}

/** Modelo .xlsx para llenar y volver a subir.
 *
 * Hoja 1 = los datos, con los encabezados EXACTOS que espera el importador y
 * en la FILA 1 (por eso no se usa el `title` de exportToXlsx: mete una línea
 * arriba y correría los headers a la fila 3, que el lector no mira).
 *
 * Si el período ya tiene títulos cargados, el modelo baja CON ellos y su VN/Px:
 * así sirve para las dos cosas — arrancar de cero, o bajar lo cargado, corregirlo
 * en Excel y volver a subirlo (el import pisa por título).
 *
 * Hoja 2 = INSTRUCCIONES. Es inerte a propósito: el importador lee solo la
 * PRIMERA hoja, así que el instructivo no puede colarse como datos.
 */
async function descargarModelo(periodo: string, activos: Activo[]) {
  const filas = activos.map((a) => ({
    ticker: a.ticker || a.unidad,
    vn: a.vn, px: a.px, tasa: a.tasa || "", obs: a.obs || "",
  }));

  const instrucciones = [
    ["CÓMO COMPLETAR ESTE ARCHIVO"],
    [""],
    ["1. Llená la hoja ACTIVOS: una fila por título. No cambies los encabezados."],
    ["2. Los encabezados van en la FILA 1. No agregues títulos ni logos arriba."],
    ["3. Subilo desde la vista ACA → tab ACTIVOS → IMPORTAR EXCEL."],
    [""],
    ["QUÉ SIGNIFICA CADA COLUMNA"],
    ["Ticker", "Obligatorio. El ticker del título tal como figura en Manager → Títulos."],
    ["", "También sirve pegado al nombre: 'RMJ28 - BONO MUN. ROSARIO 26/06/28 $'."],
    ["VN", "Valor nominal al cierre del mes."],
    ["Px", "PRECIO DE CORTE DEL MES. Es el dato que no sale de ningún lado: se carga a mano."],
    ["Tasa", "Texto libre (opcional). Lo que va en la columna Tasa del informe."],
    ["Obs", "Texto libre (opcional). Ej: 'Amortizo'."],
    [""],
    ["LO QUE NO HACE FALTA PONER"],
    ["", "Emisor, calificación, clase de activo, vencimiento y cartera salen del"],
    ["", "maestro de Manager → Títulos. Si los ponés acá, se ignoran."],
    ["", "El MONTO se calcula solo (VN × Px). No hace falta cargarlo."],
    [""],
    ["QUÉ PASA SI UN TÍTULO NO SE RECONOCE"],
    ["", "No se importa, y la pantalla te lo lista con el motivo y el número de fila."],
    ["", "El resto SÍ se importa. Nada se guarda hasta que tocás CONFIRMAR."],
    [""],
    ["FORMATOS"],
    ["", "Los números pueden ir como número o como texto (458.915.200 / 80,04)."],
    ["", "Las filas sin Ticker se saltean (vacías, subtotales, etc.)."],
    ["", "Solo se lee la PRIMERA hoja. Máximo 2000 filas."],
  ].map(([a, b]) => ({ a: a ?? "", b: b ?? "" }));

  await exportToXlsx({
    filename: `ACA-activos-${periodo}.xlsx`,
    sheets: [
      {
        name: "ACTIVOS",
        rows: filas,
        columns: [
          { header: "Ticker", key: "ticker", format: "text",    width: 42 },
          { header: "VN",     key: "vn",     format: "integer", width: 18 },
          { header: "Px",     key: "px",     format: "number",  width: 12 },
          { header: "Tasa",   key: "tasa",   format: "text",    width: 14 },
          { header: "Obs",    key: "obs",    format: "text",    width: 18 },
        ],
      },
      {
        name: "INSTRUCCIONES",
        rows: instrucciones,
        columns: [
          { header: "ACA — Importar activos", key: "a", format: "text", width: 30 },
          { header: "", key: "b", format: "text", width: 95 },
        ],
      },
    ],
  });
}
