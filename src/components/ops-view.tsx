"use client";

// OPERACIONES (nueva) → sub-tab MOVIMIENTOS, sobre CashFlow.Operaciones (fuente:
// API informes). Replica la lógica de NEGOCIO pero con datos limpios + filtro de
// MERCADO. Endpoints: /api/operaciones/ops/{fechas,meta,mercados,serie,cuentas-matrix}.

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";

type Moneda = "ARS" | "USD";
type Modo = "ULTIMA" | "DIA" | "TODOS";

// Categorías (operacion) — mismas claves que el backend (_OPS_CATS).
const CATS = [
  { key: "compra",             label: "Compra",      color: "#22c55e" },
  { key: "venta",              label: "Venta",       color: "#ef4444" },
  { key: "caucion_tomadora",   label: "Cauc. Tom.",  color: "#3b82f6" },
  { key: "caucion_colocadora", label: "Cauc. Col.",  color: "#06b6d4" },
  { key: "suscripcion",        label: "Suscripción", color: "#a855f7" },
  { key: "rescate",            label: "Rescate",     color: "#f97316" },
  { key: "licitacion",         label: "Licitación",  color: "#eab308" },
  { key: "emision",            label: "Emisión",     color: "#14b8a6" },
  { key: "subasta",            label: "Subasta",     color: "#ec4899" },
  { key: "otro",               label: "Otro",        color: "#94a3b8" },
] as const;

type FechaRow = { fecha: string; n: number };
type SerieRow = { fecha: string } & Record<string, number>;
type CuentaRow = { cuenta: string; n: number; total: number } & Record<string, number>;
type Meta = { n_boletos: number; n_mercados: number; ultima_ingesta: string | null };

function fmtM(v: number): string {
  const a = Math.abs(v);
  if (a >= 1e9) return `${(v / 1e9).toFixed(2)}MM`;
  if (a >= 1e6) return `${(v / 1e6).toFixed(2)}M`;
  if (a >= 1e3) return `${(v / 1e3).toFixed(1)}k`;
  return v.toFixed(0);
}

async function getJSON<T>(url: string): Promise<T | null> {
  try {
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) return null;
    return (await r.json()) as T;
  } catch {
    return null;
  }
}

export function OpsView() {
  return (
    <div className="h-full flex flex-col min-h-0">
      <div className="flex items-center gap-1 px-3 py-2 border-b border-[var(--t-border)] bg-[var(--t-panel)] shrink-0">
        <span className="text-[11px] font-semibold text-[var(--t-accent)] tracking-widest mr-3">OPERACIONES</span>
        <span className="px-3 py-1 text-[11px] font-semibold tracking-wide border bg-[var(--t-accent)] text-[var(--t-on-accent)] border-[var(--t-accent)]">
          MOVIMIENTOS
        </span>
      </div>
      <div className="flex-1 min-h-0 overflow-hidden">
        <OpsMovimientos />
      </div>
    </div>
  );
}

function OpsMovimientos() {
  const [moneda, setMoneda] = useState<Moneda>("ARS");
  const [mercado, setMercado] = useState<string>("");
  const [mercados, setMercados] = useState<string[]>([]);
  const [modo, setModo] = useState<Modo>("ULTIMA");
  const [fechas, setFechas] = useState<FechaRow[]>([]);
  const [idx, setIdx] = useState(0); // índice en `fechas` (0 = más reciente)
  const [meta, setMeta] = useState<Meta | null>(null);
  const [serie, setSerie] = useState<SerieRow[]>([]);
  const [cuentas, setCuentas] = useState<CuentaRow[]>([]);
  const [totalGral, setTotalGral] = useState(0);
  const [loading, setLoading] = useState(false);

  const fecha = fechas[idx]?.fecha ?? "";
  const rango = useMemo(() => {
    if (!fechas.length) return { desde: "", hasta: "" };
    if (modo === "TODOS") return { desde: fechas[fechas.length - 1].fecha, hasta: fechas[0].fecha };
    return { desde: fecha, hasta: fecha };
  }, [modo, fecha, fechas]);

  const mercadoQS = mercado ? `&mercado=${encodeURIComponent(mercado)}` : "";

  // Mount: fechas + mercados.
  const cargarBase = useCallback(async () => {
    const [f, m] = await Promise.all([
      getJSON<{ fechas: FechaRow[] }>("/api/operaciones/ops/fechas"),
      getJSON<{ mercados: string[] }>("/api/operaciones/ops/mercados"),
    ]);
    setFechas(f?.fechas ?? []);
    setMercados(m?.mercados ?? []);
    setIdx(0);
  }, []);
  useEffect(() => { cargarBase(); }, [cargarBase]);

  // ULTIMA fuerza el más reciente.
  useEffect(() => { if (modo === "ULTIMA") setIdx(0); }, [modo]);

  // Serie (gráfico) — depende de moneda + mercado.
  useEffect(() => {
    (async () => {
      const d = await getJSON<{ serie: SerieRow[] }>(
        `/api/operaciones/ops/serie?moneda=${moneda}${mercadoQS}`,
      );
      setSerie(d?.serie ?? []);
    })();
  }, [moneda, mercadoQS]);

  // Meta + matrix de cuentas — depende de modo + fecha + moneda + mercado.
  useEffect(() => {
    if (!fechas.length) return;
    setLoading(true);
    (async () => {
      const [mt, mx] = await Promise.all([
        modo === "TODOS"
          ? Promise.resolve(null)
          : getJSON<Meta>(`/api/operaciones/ops/meta?fecha=${fecha}`),
        getJSON<{ cuentas: CuentaRow[]; total: number }>(
          `/api/operaciones/ops/cuentas-matrix?moneda=${moneda}${mercadoQS}` +
          `&desde=${rango.desde}&hasta=${rango.hasta}`,
        ),
      ]);
      setMeta(mt);
      setCuentas(mx?.cuentas ?? []);
      setTotalGral(mx?.total ?? 0);
      setLoading(false);
    })();
  }, [modo, fecha, moneda, mercadoQS, rango.desde, rango.hasta, fechas.length]);

  // Datos del gráfico: en DÍA/ÚLTIMA, barras por categoría del día; en TODOS, serie por fecha.
  const chartData = useMemo<Array<Record<string, string | number>>>(() => {
    if (modo === "TODOS") {
      return serie.map((r) => ({ ...r, x: r.fecha }));
    }
    const row = serie.find((r) => r.fecha === fecha);
    return CATS.map((c) => ({ x: c.label, valor: row ? Number(row[c.key] ?? 0) : 0 }));
  }, [modo, serie, fecha]);

  // Qué categorías tienen algún valor (para columnas de la tabla).
  const catsActivas = useMemo(
    () => CATS.filter((c) => cuentas.some((r) => Number(r[c.key] ?? 0) !== 0)),
    [cuentas],
  );

  const refresh = () => { cargarBase(); };

  return (
    <div className="h-full flex flex-col min-h-0 overflow-hidden">
      {/* Barra de filtros */}
      <div className="flex items-center flex-wrap gap-2 px-3 py-2 border-b border-[var(--t-border)] bg-[var(--t-panel)] shrink-0 text-[11px]">
        <button onClick={() => setIdx((i) => Math.min(i + 1, fechas.length - 1))}
          disabled={modo !== "DIA" || idx >= fechas.length - 1}
          className="px-2 py-0.5 border border-[var(--t-border-2)] text-[var(--t-text)] disabled:opacity-30">‹</button>
        <button onClick={() => setIdx((i) => Math.max(i - 1, 0))}
          disabled={modo !== "DIA" || idx <= 0}
          className="px-2 py-0.5 border border-[var(--t-border-2)] text-[var(--t-text)] disabled:opacity-30">›</button>
        {(["ULTIMA", "DIA", "TODOS"] as Modo[]).map((m) => (
          <Pill key={m} active={modo === m} onClick={() => setModo(m)}>{m}</Pill>
        ))}
        <span className="text-[var(--t-text)] font-semibold mx-1">
          {modo === "TODOS" ? `${rango.desde} → ${rango.hasta}` : fecha || "—"}
        </span>
        <span className="text-[var(--t-text-muted)]">│</span>
        {(["ARS", "USD"] as Moneda[]).map((m) => (
          <Pill key={m} active={moneda === m} onClick={() => setMoneda(m)}>{m}</Pill>
        ))}
        <span className="text-[var(--t-text-muted)]">│</span>
        <select value={mercado} onChange={(e) => setMercado(e.target.value)}
          className="bg-[var(--t-panel)] border border-[var(--t-border-2)] text-[var(--t-text)] px-2 py-0.5">
          <option value="">Todos los mercados</option>
          {mercados.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
        <button onClick={refresh} className="px-2 py-0.5 border border-[var(--t-border-2)] text-[var(--t-accent)] hover:bg-[var(--t-accent)] hover:text-[var(--t-on-accent)]">↻ REFRESH</button>
        {meta && modo !== "TODOS" && (
          <span className="ml-auto text-[var(--t-text-muted)]">
            BOLETOS: <span className="text-[var(--t-text)]">{meta.n_boletos.toLocaleString("es-AR")}</span>
            {meta.ultima_ingesta && <> · ÚLTIMA INGESTA: <span className="text-[var(--t-text)]">{new Date(meta.ultima_ingesta).toLocaleTimeString("es-AR")}</span></>}
          </span>
        )}
      </div>

      {/* Tabla de cuentas */}
      <div className="flex-1 min-h-0 overflow-auto p-3">
        <div className="text-[10px] text-[var(--t-text-muted)] mb-2">
          {loading ? "cargando…" : `${cuentas.length} cuentas operaron · total ${fmtM(totalGral)} ${moneda}`}
        </div>
        <table className="w-full text-[11px] border-collapse">
          <thead>
            <tr className="text-[var(--t-text-muted)] border-b border-[var(--t-border)]">
              <th className="text-left py-1 px-2">CUENTA</th>
              {catsActivas.map((c) => <th key={c.key} className="text-right py-1 px-2">{c.label}</th>)}
              <th className="text-right py-1 px-2">TOTAL</th>
              <th className="text-right py-1 px-2">#</th>
            </tr>
          </thead>
          <tbody>
            {cuentas.slice(0, 200).map((r) => (
              <tr key={r.cuenta} className="border-b border-[var(--t-border)]/40 hover:bg-[var(--t-panel)]">
                <td className="py-1 px-2 text-[var(--t-text)]">{r.cuenta}</td>
                {catsActivas.map((c) => (
                  <td key={c.key} className="text-right py-1 px-2 text-[var(--t-text-muted)]">
                    {Number(r[c.key] ?? 0) ? fmtM(Number(r[c.key])) : "—"}
                  </td>
                ))}
                <td className="text-right py-1 px-2 text-[var(--t-text)] font-semibold">{fmtM(r.total)}</td>
                <td className="text-right py-1 px-2 text-[var(--t-text-muted)]">{r.n}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {cuentas.length > 200 && (
          <div className="text-[10px] text-[var(--t-text-muted)] mt-2">… {cuentas.length - 200} cuentas más (top 200 por total)</div>
        )}
      </div>

      {/* Gráfico de importes */}
      <div className="h-[220px] shrink-0 border-t border-[var(--t-border)] bg-[var(--t-panel)] px-3 py-2">
        <div className="text-[10px] text-[var(--t-text-muted)] mb-1">
          Importe operado · {moneda}{mercado ? ` · ${mercado}` : ""}{modo === "TODOS" ? " · por día" : " · por categoría"}
        </div>
        <ResponsiveContainer width="100%" height="88%">
          <BarChart data={chartData} margin={{ top: 4, right: 8, left: 8, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--t-border)" />
            <XAxis dataKey="x" tick={{ fontSize: 9, fill: "var(--t-text-muted)" }} />
            <YAxis tickFormatter={fmtM} tick={{ fontSize: 9, fill: "var(--t-text-muted)" }} width={44} />
            <Tooltip formatter={(value) => `${fmtM(Number(value))} ${moneda}`} contentStyle={{ fontSize: 11, background: "var(--t-panel)", border: "1px solid var(--t-border)" }} />
            {modo === "TODOS" ? (
              <>
                <Legend wrapperStyle={{ fontSize: 9 }} />
                {CATS.map((c) => <Bar key={c.key} dataKey={c.key} name={c.label} stackId="a" fill={c.color} />)}
              </>
            ) : (
              <Bar dataKey="valor" name="Importe" fill="var(--t-accent)" />
            )}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function Pill({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick}
      className={`px-2 py-0.5 border text-[11px] font-semibold ${active
        ? "bg-[var(--t-accent)] text-[var(--t-on-accent)] border-[var(--t-accent)]"
        : "bg-transparent text-[var(--t-text-dim)] border-[var(--t-border-2)] hover:text-[var(--t-accent)] hover:border-[var(--t-accent)]"}`}>
      {children}
    </button>
  );
}
