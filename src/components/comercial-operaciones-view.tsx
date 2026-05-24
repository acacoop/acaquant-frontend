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

// Vista COMERCIAL (en OPERACIONES) — lente por operador, estilo NEGOCIO.
// Layout: izq = resumen del operador (selector + KPIs) + gráfico de evolución;
// der = tabla de clientes (60%) + ficha del cliente seleccionado (40%).
// Seleccionar un cliente re-scopea el gráfico a esa cuenta y llena la ficha
// (que viaja embebida en /comercial/operador → sin fetch extra).
// Consume /api/operaciones/comercial/*. Ver docs/TABLERO_COMERCIAL.md [5].

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
  provincia: string | null;
  ciudad: string | null;
  sucursal: string | null;
  referido: string | null;
  tipo_cliente: string | null;
  tipo_titular: string | null;
  perfil_inversion: string | null;
  horizonte_inversion: string | null;
  clase: string | null;
  estado: string | null;
  fecha_alta_legajo: string | null;
  primer_contacto_comercial: string | null;
  riesgo_la_ft: string | null;
  division: string | null;
  adc: string | null;
  dma: string | null;
  observaciones: string | null;
  email: string | null;
  telefono: string | null;
  operador_nombre: string | null;
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

// Grupos de campos de la ficha (panel derecho). Solo se muestran los que
// tienen valor; el grupo entero se omite si está vacío.
const FICHA_GROUPS: { title: string; fields: [keyof Ficha, string][] }[] = [
  {
    title: "Segmentación",
    fields: [
      ["nivel_1", "Nivel 1"], ["nivel_2", "Nivel 2"], ["nivel_3", "Nivel 3"],
      ["nivel_4", "Nivel 4"], ["nivel_5", "Nivel 5"],
    ],
  },
  {
    title: "Perfil",
    fields: [
      ["tipo_cliente", "Tipo cliente"], ["tipo_titular", "Tipo titular"],
      ["perfil_inversion", "Perfil inv."], ["horizonte_inversion", "Horizonte"],
      ["clase", "Clase"],
    ],
  },
  {
    title: "Ubicación / Origen",
    fields: [
      ["provincia", "Provincia"], ["ciudad", "Ciudad"],
      ["sucursal", "Sucursal"], ["referido", "Referido"],
    ],
  },
  {
    title: "Comercial / Riesgo",
    fields: [
      ["primer_contacto_comercial", "1er contacto"], ["riesgo_la_ft", "Riesgo LA/FT"],
      ["division", "División"], ["adc", "ADC"], ["dma", "DMA"],
    ],
  },
  {
    title: "Contacto",
    fields: [["email", "Email"], ["telefono", "Teléfono"]],
  },
];

export function ComercialOperacionesView() {
  const [operadores, setOperadores] = useState<Operador[]>([]);
  const [sel, setSel] = useState<string>("");
  const [resumen, setResumen] = useState<Resumen | null>(null);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [selCuenta, setSelCuenta] = useState<string | null>(null);
  const [metric, setMetric] = useState<"volumen" | "aum">("volumen");
  const [serie, setSerie] = useState<SeriePoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingSerie, setLoadingSerie] = useState(false);
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

  // Serie del gráfico: operador completo o, si hay cliente elegido, esa cuenta.
  useEffect(() => {
    if (!sel) return;
    let cancelled = false;
    setLoadingSerie(true);
    void (async () => {
      try {
        let q = `operador=${encodeURIComponent(sel)}&metric=${metric}`;
        if (selCuenta) q += `&id_cuenta=${encodeURIComponent(selCuenta)}`;
        const d = await getJson<{ serie: SeriePoint[] }>(
          `/api/operaciones/comercial/serie?${q}`,
        );
        if (cancelled) return;
        setSerie(Array.isArray(d.serie) ? d.serie : []);
      } catch {
        if (!cancelled) setSerie([]);
      } finally {
        if (!cancelled) setLoadingSerie(false);
      }
    })();
    return () => { cancelled = true; };
  }, [sel, metric, selCuenta]);

  const cliente = useMemo(
    () => clientes.find((c) => c.id_cuenta === selCuenta) ?? null,
    [clientes, selCuenta],
  );

  const tickInterval = Math.max(0, Math.floor(serie.length / 12));

  return (
    <div className="h-full grid grid-cols-2 gap-3 p-3 bg-[#0a0a0a] text-[#d0d0d0] overflow-hidden">

      {/* ── COLUMNA IZQUIERDA: resumen operador + gráfico ─────────────────── */}
      <div className="min-h-0 flex flex-col gap-3 overflow-hidden">

        {/* RESUMEN OPERADOR (selector + KPIs) — bloque compacto, tipo POR CATEGORÍA */}
        <div className="border border-[#1a1a1a] bg-[#080808] flex flex-col shrink-0">
          <div className="flex items-center gap-2 px-3 py-1.5 border-b border-[#1a1a1a] bg-[#ff9900]/10">
            <span className="text-[11px] font-semibold text-[#ff9900] tracking-wide uppercase">
              Resumen operador
            </span>
            {loading && <span className="text-[9px] text-[#888]">cargando…</span>}
            <select
              value={sel}
              onChange={(e) => setSel(e.target.value)}
              className="ml-auto bg-[#0e0e0e] border border-[#2a2a2a] text-[#d0d0d0] text-[11px] px-2 py-1 font-mono focus:border-[#ff9900] outline-none max-w-[60%]"
            >
              {operadores.map((o) => (
                <option key={o.operador_email} value={o.operador_email}>
                  {(o.operador_nombre || o.operador_email)} ({o.n_cuentas})
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-[#141414]">
            <Kpi label="AUM GESTIONADO" value={resumen ? fmtAum(resumen.aum_gestionado) : "—"} />
            <Kpi label="CLIENTES" value={resumen ? fmtN(resumen.n_clientes) : "—"} />
            <Kpi label="VOLUMEN MTD" value={resumen ? fmtAum(resumen.volumen_mtd) : "—"} />
            <Kpi label="VOLUMEN YTD" value={resumen ? fmtAum(resumen.volumen_ytd) : "—"} />
          </div>
        </div>

        {/* GRÁFICO DE EVOLUCIÓN (toggle Volumen/AuM; cliente si hay selección) */}
        <div className="flex-1 min-h-0 border border-[#1a1a1a] bg-[#080808] flex flex-col overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-1.5 border-b border-[#1a1a1a] shrink-0 flex-wrap">
            <span className="text-[10px] uppercase tracking-widest text-[#ff9900]">
              Evolución
            </span>
            <span className="text-[10px] text-[#888] font-mono truncate max-w-[55%]">
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
                    (metric === m
                      ? "bg-[#ff9900] text-black"
                      : "bg-[#0a0a0a] text-[#888] hover:text-[#ff9900]")
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
                <LineChart data={serie} margin={{ top: 8, right: 16, bottom: 24, left: 8 }}>
                  <CartesianGrid stroke="#161616" vertical={false} />
                  <XAxis
                    dataKey="fecha"
                    tick={{ fill: "#808080", fontSize: 10 }}
                    axisLine={{ stroke: "#2a2a2a" }}
                    tickLine={false}
                    interval={tickInterval}
                    angle={-35}
                    textAnchor="end"
                    height={36}
                    minTickGap={4}
                  />
                  <YAxis
                    tick={{ fill: "#808080", fontSize: 10 }}
                    axisLine={{ stroke: "#2a2a2a" }}
                    tickLine={false}
                    tickFormatter={(v) => fmtAum(Number(v))}
                    width={60}
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
      </div>

      {/* ── COLUMNA DERECHA: clientes (60%) + ficha (40%) ─────────────────── */}
      <div className="min-h-0 flex flex-col gap-3 overflow-hidden">

        {/* TABLA DE CLIENTES (60%) */}
        <div className="flex-[3_1_0%] min-h-0 border border-[#1a1a1a] bg-[#080808] flex flex-col overflow-hidden">
          <div className="flex items-center px-3 py-1.5 border-b border-[#1a1a1a] bg-[#ff9900]/10 shrink-0">
            <span className="text-[11px] font-semibold text-[#ff9900] tracking-wide uppercase">
              Clientes
            </span>
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
                      title="Click: ver ficha y re-scopear el gráfico a este cliente"
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

        {/* FICHA DEL CLIENTE (40%) */}
        <div className="flex-[2_1_0%] min-h-0 border border-[#1a1a1a] bg-[#080808] flex flex-col overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-1.5 border-b border-[#1a1a1a] bg-[#ff9900]/10 shrink-0">
            <span className="text-[11px] font-semibold text-[#ff9900] tracking-wide uppercase">
              Ficha cliente
            </span>
            {cliente && (
              <span className="text-[10px] text-[#888] font-mono truncate">
                [{cliente.id_cuenta}] {cliente.ficha.denominacion || cliente.denominacion}
              </span>
            )}
          </div>
          <div className="flex-1 min-h-0 overflow-auto p-3">
            {!cliente ? (
              <div className="h-full flex items-center justify-center text-[11px] text-[#555] text-center">
                Seleccioná un cliente para ver su ficha.
              </div>
            ) : (
              <FichaPanel cliente={cliente} />
            )}
          </div>
        </div>
      </div>

      {err && (
        <div className="col-span-2 border border-[#aa3333] bg-[#1a0808] p-2 text-[11px] text-[#ff7777]">
          {err}
        </div>
      )}
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-3 py-2 flex flex-col">
      <span className="text-[9px] text-[#666] tracking-widest">{label}</span>
      <span className="text-[15px] font-semibold tabular-nums text-[#d0d0d0]">{value}</span>
    </div>
  );
}

function FichaPanel({ cliente }: { cliente: Cliente }) {
  const f = cliente.ficha;
  return (
    <div className="flex flex-col gap-3 text-[11px]">
      {/* Encabezado: AuM + Vol YTD + estado/alta */}
      <div className="grid grid-cols-2 gap-2">
        <Field label="AuM" value={fmtAum(cliente.aum)} accent />
        <Field label="Vol. YTD" value={fmtAum(cliente.volumen_ytd)} />
        <Field label="Estado" value={f.estado} />
        <Field label="Alta legajo" value={f.fecha_alta_legajo} />
      </div>

      {FICHA_GROUPS.map((g) => {
        const rows = g.fields.filter(([k]) => f[k] != null && f[k] !== "");
        if (rows.length === 0) return null;
        return (
          <div key={g.title}>
            <div className="text-[9px] uppercase tracking-widest text-[#666] mb-1">{g.title}</div>
            <div className="grid grid-cols-2 gap-x-3 gap-y-1">
              {rows.map(([k, label]) => (
                <Field key={k} label={label} value={f[k]} />
              ))}
            </div>
          </div>
        );
      })}

      {f.observaciones && (
        <div>
          <div className="text-[9px] uppercase tracking-widest text-[#666] mb-1">Observaciones</div>
          <p className="text-[#d0d0d0] whitespace-pre-wrap">{f.observaciones}</p>
        </div>
      )}
    </div>
  );
}

function Field({ label, value, accent }: { label: string; value: string | null; accent?: boolean }) {
  return (
    <div className="flex flex-col">
      <span className="text-[9px] text-[#666] tracking-wide">{label}</span>
      <span className={"font-mono truncate " + (accent ? "text-[#ff9900] font-semibold" : "text-[#d0d0d0]")} title={value ?? "—"}>
        {value ?? "—"}
      </span>
    </div>
  );
}
