"use client";

import { useEffect, useState } from "react";
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
// Consume /api/operaciones/comercial/*. Ver docs/TABLERO_COMERCIAL.md [5].

type Operador = { operador_email: string; operador_nombre: string | null; n_cuentas: number };
type Resumen = {
  aum_gestionado: number;
  n_clientes: number;
  volumen_mtd: number;
  volumen_ytd: number;
};
type Cliente = { id_cuenta: string; denominacion: string; aum: number; volumen_ytd: number };
type SeriePoint = { fecha: string; valor: number };

const fmtN = (n: number) => Math.round(n).toLocaleString("es-AR");
const fmtAum = (n: number) =>
  "$" + (Math.abs(n) >= 1e6 ? (n / 1e6).toLocaleString("es-AR", { maximumFractionDigits: 1 }) + "M" : fmtN(n));

async function getJson<T>(url: string, fallback: T): Promise<T> {
  try {
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) return fallback;
    return (await r.json()) as T;
  } catch {
    return fallback;
  }
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-[#1a1a1a] bg-[#080808] px-3 py-2 flex flex-col">
      <span className="text-[9px] text-[#666] tracking-widest">{label}</span>
      <span className="text-[16px] font-semibold tabular-nums text-[#d0d0d0]">{value}</span>
    </div>
  );
}

export function ComercialOperacionesView() {
  const [operadores, setOperadores] = useState<Operador[]>([]);
  const [sel, setSel] = useState<string>("");
  const [resumen, setResumen] = useState<Resumen | null>(null);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [metric, setMetric] = useState<"volumen" | "aum">("volumen");
  const [serie, setSerie] = useState<SeriePoint[]>([]);

  useEffect(() => {
    void getJson<Operador[]>("/api/operaciones/comercial/operadores", []).then((d) => {
      setOperadores(d);
      setSel((s) => s || (d[0]?.operador_email ?? ""));
    });
  }, []);

  useEffect(() => {
    if (!sel) return;
    const q = `operador=${encodeURIComponent(sel)}`;
    void getJson<Resumen | null>(`/api/operaciones/comercial/resumen?${q}`, null).then(setResumen);
    void getJson<Cliente[]>(`/api/operaciones/comercial/clientes?${q}`, []).then(setClientes);
  }, [sel]);

  useEffect(() => {
    if (!sel) return;
    const q = `operador=${encodeURIComponent(sel)}&metric=${metric}`;
    void getJson<{ serie: SeriePoint[] }>(`/api/operaciones/comercial/serie?${q}`, { serie: [] }).then(
      (d) => setSerie(d.serie ?? []),
    );
  }, [sel, metric]);

  return (
    <div className="h-full flex flex-col min-h-0 p-3 gap-3">
      {/* Selector de operador */}
      <div className="flex items-center gap-3 shrink-0">
        <span className="text-[10px] text-[#666] tracking-widest">OPERADOR</span>
        <select
          value={sel}
          onChange={(e) => setSel(e.target.value)}
          className="bg-[#0e0e0e] border border-[#2a2a2a] text-[#d0d0d0] text-xs px-2 py-1 font-mono focus:border-[#ff9900] outline-none min-w-[260px]"
        >
          {operadores.map((o) => (
            <option key={o.operador_email} value={o.operador_email}>
              {(o.operador_nombre || o.operador_email)} ({o.n_cuentas})
            </option>
          ))}
        </select>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 shrink-0">
        <Kpi label="AUM GESTIONADO" value={resumen ? fmtAum(resumen.aum_gestionado) : "—"} />
        <Kpi label="CLIENTES" value={resumen ? fmtN(resumen.n_clientes) : "—"} />
        <Kpi label="VOLUMEN MTD" value={resumen ? fmtAum(resumen.volumen_mtd) : "—"} />
        <Kpi label="VOLUMEN YTD" value={resumen ? fmtAum(resumen.volumen_ytd) : "—"} />
      </div>

      <div className="flex-1 min-h-0 flex gap-3">
        {/* Gráfico de líneas con toggle */}
        <div className="w-1/2 min-h-0 border border-[#1a1a1a] bg-[#080808] flex flex-col overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-1.5 border-b border-[#1a1a1a] shrink-0">
            <span className="text-[9px] text-[#666] tracking-widest mr-auto">EVOLUCIÓN</span>
            <button
              onClick={() => setMetric("volumen")}
              className={`px-2 py-0.5 text-[10px] border ${metric === "volumen" ? "bg-[#ff9900] text-black border-[#ff9900]" : "text-[#888] border-[#2a2a2a] hover:text-[#ff9900]"}`}
            >VOLUMEN</button>
            <button
              onClick={() => setMetric("aum")}
              className={`px-2 py-0.5 text-[10px] border ${metric === "aum" ? "bg-[#ff9900] text-black border-[#ff9900]" : "text-[#888] border-[#2a2a2a] hover:text-[#ff9900]"}`}
            >AUM</button>
          </div>
          <div className="flex-1 min-h-0 p-2">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={serie} margin={{ top: 8, right: 16, bottom: 24, left: 8 }}>
                <CartesianGrid stroke="#161616" />
                <XAxis dataKey="fecha" tick={{ fill: "#808080", fontSize: 10 }} axisLine={{ stroke: "#2a2a2a" }} tickLine={false} angle={-35} textAnchor="end" height={36} />
                <YAxis tick={{ fill: "#808080", fontSize: 10 }} axisLine={{ stroke: "#2a2a2a" }} tickLine={false} tickFormatter={(v) => fmtAum(Number(v))} width={60} />
                <Tooltip
                  contentStyle={{ background: "#0e0e0e", border: "1px solid #2a2a2a", fontSize: 11, fontFamily: "JetBrains Mono, monospace" }}
                  formatter={(v) => [fmtAum(Number(v)), metric === "aum" ? "AuM" : "Volumen"]}
                  labelFormatter={(l) => `${l}`}
                />
                <Line type="monotone" dataKey="valor" stroke="#ff9900" strokeWidth={1.5} dot={false} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Tabla de clientes */}
        <div className="w-1/2 min-h-0 border border-[#1a1a1a] bg-[#080808] flex flex-col overflow-hidden">
          <div className="px-3 py-1.5 border-b border-[#1a1a1a] shrink-0 text-[9px] text-[#666] tracking-widest">
            CLIENTES ({clientes.length})
          </div>
          <div className="flex-1 min-h-0 overflow-auto">
            <table className="w-full text-[11px]">
              <thead className="sticky top-0 bg-[#0a0a0a]">
                <tr className="text-[9px] text-[#666] tracking-wide">
                  <th className="text-left px-3 py-2">CUENTA</th>
                  <th className="text-right px-2">AUM</th>
                  <th className="text-right px-3">VOL. YTD</th>
                </tr>
              </thead>
              <tbody>
                {clientes.length === 0 && (
                  <tr><td colSpan={3} className="text-center text-[#555] py-4">Sin clientes.</td></tr>
                )}
                {clientes.map((c) => (
                  <tr key={c.id_cuenta} className="border-t border-[#141414] hover:bg-[#0e0e0e]">
                    <td className="px-3 py-1.5 text-[#d0d0d0] truncate">
                      <span className="text-[#666]">[{c.id_cuenta}]</span> {c.denominacion}
                    </td>
                    <td className="text-right px-2 tabular-nums font-semibold text-[#ff9900]">{fmtAum(c.aum)}</td>
                    <td className="text-right px-3 tabular-nums">{fmtAum(c.volumen_ytd)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
