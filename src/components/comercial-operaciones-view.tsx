"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

// Vista COMERCIAL (en OPERACIONES) — lente por operador.
// Layout:
//   · Header slim: selector de operador + KPIs (métricas generales, no interactivas).
//   · Izq: gráfico de evolución (chico) + ficha del cliente con tabs (tab "Datos").
//   · Der: tabla de clientes (60%) + portafolio/tenencia del cliente (40%).
// Seleccionar un cliente re-scopea el gráfico, llena la ficha (embebida, sin
// fetch) y carga su tenencia. Consume /api/operaciones/comercial/*.
// Ver docs/TABLERO_COMERCIAL.md [5].

type Operador = { operador_email: string; operador_nombre: string | null; n_cuentas: number };
type Resumen = {
  aum_gestionado: number;
  n_clientes: number;
  volumen_mtd: number;
  volumen_ytd: number;
};
type Ficha = {
  denominacion: string | null;
  nivel_1: string | null;
  nivel_2: string | null;
  nivel_3: string | null;
  nivel_4: string | null;
  nivel_5: string | null;
  primer_contacto_comercial: string | null;
  riesgo_la_ft: string | null;
  division: string | null;
  adc: string | null;
  dma: string | null;
};
type Cliente = {
  id_cuenta: string;
  denominacion: string;
  aum: number;
  volumen_ytd: number;
  ficha: Ficha;
};
type OperadorResp = { operador: string; moneda: string; resumen: Resumen; clientes: Cliente[] };
type SeriePoint = { fecha: string; valor: number };
type Posicion = { unidad: string; valuacion: number; pct: number };
type Portafolio = { id_cuenta: string; fecha_snapshot: string | null; total: number; posiciones: Posicion[] };

// ── Helpers ──────────────────────────────────────────────────────────────
const fmtN = (n: number) => Math.round(n).toLocaleString("es-AR");
const fmtAum = (n: number | null | undefined): string => {
  if (n == null || Number.isNaN(n)) return "—";
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 1e9) return sign + "$" + (abs / 1e9).toLocaleString("es-AR", { maximumFractionDigits: 2 }) + "B";
  if (abs >= 1e6) return sign + "$" + (abs / 1e6).toLocaleString("es-AR", { maximumFractionDigits: 1 }) + "M";
  if (abs >= 1e3) return sign + "$" + (abs / 1e3).toLocaleString("es-AR", { maximumFractionDigits: 0 }) + "k";
  return sign + "$" + fmtN(abs);
};

async function getJson<T>(url: string): Promise<T> {
  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return (await r.json()) as T;
}

// Campos de la ficha (tab "Datos") — se muestran SIEMPRE, incluso null.
const FICHA_DATOS: [keyof Ficha, string][] = [
  ["nivel_1", "Nivel 1"], ["nivel_2", "Nivel 2"], ["nivel_3", "Nivel 3"],
  ["nivel_4", "Nivel 4"], ["nivel_5", "Nivel 5"],
  ["primer_contacto_comercial", "1er contacto"], ["riesgo_la_ft", "Riesgo LA/FT"],
  ["division", "División"], ["adc", "ADC"], ["dma", "DMA"],
];

export function ComercialOperacionesView() {
  const [operadores, setOperadores] = useState<Operador[]>([]);
  const [sel, setSel] = useState<string>("");
  const [resumen, setResumen] = useState<Resumen | null>(null);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [selCuenta, setSelCuenta] = useState<string | null>(null);
  const [metric, setMetric] = useState<"volumen" | "aum">("volumen");
  const [serie, setSerie] = useState<SeriePoint[]>([]);
  const [portafolio, setPortafolio] = useState<Portafolio | null>(null);
  const [fichaTab, setFichaTab] = useState<"datos">("datos");
  const [loading, setLoading] = useState(false);
  const [loadingSerie, setLoadingSerie] = useState(false);
  const [loadingPort, setLoadingPort] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Operadores (una vez).
  useEffect(() => {
    void (async () => {
      try {
        const d = await getJson<Operador[]>("/api/operaciones/comercial/operadores");
        setOperadores(d);
        setSel((s) => s || (d[0]?.operador_email ?? ""));
      } catch (e) {
        setErr(e instanceof Error ? e.message : String(e));
      }
    })();
  }, []);

  // Resumen + clientes del operador (una pasada). Limpia el cliente elegido.
  useEffect(() => {
    if (!sel) return;
    let cancelled = false;
    setLoading(true);
    setErr(null);
    setSelCuenta(null);
    void (async () => {
      try {
        const d = await getJson<OperadorResp>(
          `/api/operaciones/comercial/operador?operador=${encodeURIComponent(sel)}`,
        );
        if (cancelled) return;
        setResumen(d.resumen);
        setClientes(Array.isArray(d.clientes) ? d.clientes : []);
      } catch (e) {
        if (cancelled) return;
        setResumen(null);
        setClientes([]);
        setErr(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [sel]);

  // Serie del gráfico: operador completo o, si hay cliente, esa cuenta.
  useEffect(() => {
    if (!sel) return;
    let cancelled = false;
    setLoadingSerie(true);
    void (async () => {
      try {
        let q = `operador=${encodeURIComponent(sel)}&metric=${metric}`;
        if (selCuenta) q += `&id_cuenta=${encodeURIComponent(selCuenta)}`;
        const d = await getJson<{ serie: SeriePoint[] }>(`/api/operaciones/comercial/serie?${q}`);
        if (!cancelled) setSerie(Array.isArray(d.serie) ? d.serie : []);
      } catch {
        if (!cancelled) setSerie([]);
      } finally {
        if (!cancelled) setLoadingSerie(false);
      }
    })();
    return () => { cancelled = true; };
  }, [sel, metric, selCuenta]);

  // Tenencia del cliente seleccionado.
  useEffect(() => {
    if (!selCuenta) { setPortafolio(null); return; }
    let cancelled = false;
    setLoadingPort(true);
    void (async () => {
      try {
        const d = await getJson<Portafolio>(
          `/api/operaciones/comercial/portafolio?id_cuenta=${encodeURIComponent(selCuenta)}`,
        );
        if (!cancelled) setPortafolio(d);
      } catch {
        if (!cancelled) setPortafolio(null);
      } finally {
        if (!cancelled) setLoadingPort(false);
      }
    })();
    return () => { cancelled = true; };
  }, [selCuenta]);

  const cliente = useMemo(
    () => clientes.find((c) => c.id_cuenta === selCuenta) ?? null,
    [clientes, selCuenta],
  );
  const tickInterval = Math.max(0, Math.floor(serie.length / 12));

  return (
    <div className="h-full flex flex-col min-h-0 bg-[#0a0a0a] text-[#d0d0d0] overflow-hidden">

      {/* ── HEADER SLIM: selector + KPIs (métricas generales) ──────────────── */}
      <div className="flex items-center gap-3 px-3 py-1.5 border-b border-[#1a1a1a] bg-[#080808] shrink-0 flex-wrap">
        <span className="text-[9px] text-[#666] tracking-widest">OPERADOR</span>
        <select
          value={sel}
          onChange={(e) => setSel(e.target.value)}
          className="bg-[#0e0e0e] border border-[#2a2a2a] text-[#d0d0d0] text-[11px] px-2 py-1 font-mono focus:border-[#ff9900] outline-none max-w-[280px]"
        >
          {operadores.map((o) => (
            <option key={o.operador_email} value={o.operador_email}>
              {(o.operador_nombre || o.operador_email)} ({o.n_cuentas})
            </option>
          ))}
        </select>
        <span className="text-[#222]">│</span>
        <KpiChip label="AUM" value={resumen ? fmtAum(resumen.aum_gestionado) : "—"} />
        <KpiChip label="CLIENTES" value={resumen ? fmtN(resumen.n_clientes) : "—"} />
        <KpiChip label="VOL. MTD" value={resumen ? fmtAum(resumen.volumen_mtd) : "—"} />
        <KpiChip label="VOL. YTD" value={resumen ? fmtAum(resumen.volumen_ytd) : "—"} />
        {loading && <span className="text-[9px] text-[#888]">cargando…</span>}
        {err && <span className="text-[9px] text-[#ff7777]">{err}</span>}
      </div>

      {/* ── BODY: 2 columnas ───────────────────────────────────────────────── */}
      <div className="flex-1 min-h-0 grid grid-cols-2 gap-3 p-3 overflow-hidden">

        {/* IZQUIERDA: gráfico (chico) + ficha con tabs */}
        <div className="min-h-0 flex flex-col gap-3 overflow-hidden">

          {/* GRÁFICO DE EVOLUCIÓN */}
          <div className="flex-[2_1_0%] min-h-0 border border-[#1a1a1a] bg-[#080808] flex flex-col overflow-hidden">
            <div className="flex items-center gap-2 px-3 py-1.5 border-b border-[#1a1a1a] shrink-0 flex-wrap">
              <span className="text-[10px] uppercase tracking-widest text-[#ff9900]">Evolución</span>
              <span className="text-[10px] text-[#888] font-mono truncate max-w-[50%]">
                {cliente ? `· ${cliente.denominacion}` : "· Cartera del operador"}
              </span>
              {cliente && (
                <button
                  onClick={() => setSelCuenta(null)}
                  className="text-[#888] hover:text-[#ff9900] text-[13px] leading-none"
                  title="Volver a la cartera del operador"
                >×</button>
              )}
              {loadingSerie && <span className="text-[9px] text-[#888]">cargando…</span>}
              <div className="ml-auto inline-flex items-stretch border border-[#2a2a2a] divide-x divide-[#2a2a2a]">
                {(["volumen", "aum"] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => setMetric(m)}
                    className={
                      "px-2 py-0.5 text-[10px] uppercase tracking-wider " +
                      (metric === m ? "bg-[#ff9900] text-black" : "bg-[#0a0a0a] text-[#888] hover:text-[#ff9900]")
                    }
                  >
                    {m === "volumen" ? "Volumen" : "AuM"}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex-1 min-h-0 p-2">
              {serie.length === 0 ? (
                <div className="h-full flex items-center justify-center text-[11px] text-[#555]">
                  Sin datos de {metric === "aum" ? "AuM" : "volumen"}.
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={serie} margin={{ top: 8, right: 16, bottom: 20, left: 8 }}>
                    <CartesianGrid stroke="#161616" vertical={false} />
                    <XAxis
                      dataKey="fecha"
                      tick={{ fill: "#808080", fontSize: 10 }}
                      axisLine={{ stroke: "#2a2a2a" }}
                      tickLine={false}
                      interval={tickInterval}
                      angle={-35}
                      textAnchor="end"
                      height={32}
                      minTickGap={4}
                    />
                    <YAxis
                      tick={{ fill: "#808080", fontSize: 10 }}
                      axisLine={{ stroke: "#2a2a2a" }}
                      tickLine={false}
                      tickFormatter={(v) => fmtAum(Number(v))}
                      width={56}
                    />
                    <Tooltip
                      contentStyle={{ background: "#0e0e0e", border: "1px solid #2a2a2a", fontSize: 11, fontFamily: "JetBrains Mono, monospace" }}
                      labelStyle={{ color: "#808080" }}
                      itemStyle={{ color: "#d0d0d0" }}
                      formatter={(v) => [fmtAum(Number(v)), metric === "aum" ? "AuM" : "Volumen"]}
                    />
                    <Line type="monotone" dataKey="valor" stroke="#ff9900" strokeWidth={1.5} dot={false} isAnimationActive={false} />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          {/* FICHA DEL CLIENTE (con tabs) */}
          <div className="flex-[3_1_0%] min-h-0 border border-[#1a1a1a] bg-[#080808] flex flex-col overflow-hidden">
            <div className="flex items-center gap-2 px-3 py-1.5 border-b border-[#1a1a1a] bg-[#ff9900]/10 shrink-0">
              <span className="text-[11px] font-semibold text-[#ff9900] tracking-wide uppercase">Ficha</span>
              {cliente && (
                <span className="text-[10px] text-[#888] font-mono truncate">
                  [{cliente.id_cuenta}] {cliente.ficha.denominacion || cliente.denominacion}
                </span>
              )}
              <div className="ml-auto inline-flex items-stretch border border-[#2a2a2a] divide-x divide-[#2a2a2a]">
                {(["datos"] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => setFichaTab(t)}
                    className={
                      "px-2 py-0.5 text-[10px] uppercase tracking-wider " +
                      (fichaTab === t ? "bg-[#ff9900] text-black" : "bg-[#0a0a0a] text-[#888] hover:text-[#ff9900]")
                    }
                  >
                    {t === "datos" ? "Datos" : t}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex-1 min-h-0 overflow-auto p-3">
              {!cliente ? (
                <div className="h-full flex items-center justify-center text-[11px] text-[#555] text-center">
                  Seleccioná un cliente para ver su ficha.
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-x-4 gap-y-2">
                  {FICHA_DATOS.map(([k, label]) => (
                    <Field key={k} label={label} value={cliente.ficha[k]} />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* DERECHA: clientes (60%) + portafolio (40%) */}
        <div className="min-h-0 flex flex-col gap-3 overflow-hidden">

          {/* TABLA DE CLIENTES */}
          <div className="flex-[3_1_0%] min-h-0 border border-[#1a1a1a] bg-[#080808] flex flex-col overflow-hidden">
            <div className="flex items-center px-3 py-1.5 border-b border-[#1a1a1a] bg-[#ff9900]/10 shrink-0">
              <span className="text-[11px] font-semibold text-[#ff9900] tracking-wide uppercase">Clientes</span>
              <span className="ml-auto text-[10px] text-[#888] font-mono">{clientes.length}</span>
            </div>
            <div className="flex-1 min-h-0 overflow-auto">
              <table className="w-full text-[11px] font-mono tabular-nums">
                <thead className="sticky top-0 bg-[#080808] z-10 text-[9px] uppercase tracking-widest text-[#666]">
                  <tr>
                    <th className="px-3 py-1.5 text-left border-b border-[#1a1a1a]">Cuenta</th>
                    <th className="px-2 py-1.5 text-right border-b border-[#1a1a1a]">AuM</th>
                    <th className="px-3 py-1.5 text-right border-b border-[#1a1a1a]">Vol. YTD</th>
                  </tr>
                </thead>
                <tbody>
                  {clientes.length === 0 && !loading && (
                    <tr><td colSpan={3} className="text-center text-[#555] py-6">Sin clientes.</td></tr>
                  )}
                  {clientes.map((c) => {
                    const active = c.id_cuenta === selCuenta;
                    return (
                      <tr
                        key={c.id_cuenta}
                        onClick={() => setSelCuenta(active ? null : c.id_cuenta)}
                        className={
                          "border-t border-[#111] cursor-pointer transition-colors " +
                          (active ? "bg-[#ff9900]/10" : "hover:bg-[#0e0e0e]")
                        }
                        title="Click: ficha + tenencia + gráfico de este cliente"
                      >
                        <td className="px-3 py-1.5 text-[#d0d0d0] truncate max-w-[260px]" title={c.denominacion}>
                          <span className="text-[#666]">[{c.id_cuenta}]</span> {c.denominacion}
                        </td>
                        <td className="px-2 py-1.5 text-right font-semibold text-[#ff9900]">{fmtAum(c.aum)}</td>
                        <td className="px-3 py-1.5 text-right text-[#d0d0d0]">{fmtAum(c.volumen_ytd)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* PORTAFOLIO / TENENCIA */}
          <div className="flex-[2_1_0%] min-h-0 border border-[#1a1a1a] bg-[#080808] flex flex-col overflow-hidden">
            <div className="flex items-center gap-2 px-3 py-1.5 border-b border-[#1a1a1a] bg-[#ff9900]/10 shrink-0">
              <span className="text-[11px] font-semibold text-[#ff9900] tracking-wide uppercase">Portafolio</span>
              {portafolio?.fecha_snapshot && (
                <span className="text-[9px] text-[#555] font-mono">{portafolio.fecha_snapshot}</span>
              )}
              {loadingPort && <span className="text-[9px] text-[#888]">cargando…</span>}
              {portafolio && portafolio.posiciones.length > 0 && (
                <span className="ml-auto text-[10px] text-[#888] font-mono">
                  Total {fmtAum(portafolio.total)}
                </span>
              )}
            </div>
            <div className="flex-1 min-h-0 overflow-auto">
              {!cliente ? (
                <div className="h-full flex items-center justify-center text-[11px] text-[#555] text-center">
                  Seleccioná un cliente para ver su tenencia.
                </div>
              ) : !portafolio || portafolio.posiciones.length === 0 ? (
                <div className="h-full flex items-center justify-center text-[11px] text-[#555]">
                  {loadingPort ? "cargando…" : "Sin posiciones."}
                </div>
              ) : (
                <table className="w-full text-[11px] font-mono tabular-nums">
                  <thead className="sticky top-0 bg-[#080808] z-10 text-[9px] uppercase tracking-widest text-[#666]">
                    <tr>
                      <th className="px-3 py-1.5 text-left border-b border-[#1a1a1a]">Unidad</th>
                      <th className="px-2 py-1.5 text-right border-b border-[#1a1a1a]">Valuación</th>
                      <th className="px-3 py-1.5 text-right border-b border-[#1a1a1a]">%</th>
                    </tr>
                  </thead>
                  <tbody>
                    {portafolio.posiciones.map((p) => (
                      <tr key={p.unidad} className="border-t border-[#111] hover:bg-[#0e0e0e]">
                        <td className="px-3 py-1.5 text-[#d0d0d0] truncate max-w-[280px]" title={p.unidad}>{p.unidad}</td>
                        <td className="px-2 py-1.5 text-right font-semibold text-[#ff9900]">{fmtAum(p.valuacion)}</td>
                        <td className="px-3 py-1.5 text-right text-[#888]">{p.pct.toFixed(1)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function KpiChip({ label, value }: { label: string; value: string }) {
  return (
    <span className="text-[11px] font-mono">
      <span className="text-[#666] tracking-wider">{label} </span>
      <span className="text-[#d0d0d0] font-semibold">{value}</span>
    </span>
  );
}

function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex flex-col">
      <span className="text-[9px] text-[#666] tracking-wide">{label}</span>
      <span className="text-[11px] font-mono text-[#d0d0d0] truncate" title={value ?? "—"}>
        {value ?? "—"}
      </span>
    </div>
  );
}
