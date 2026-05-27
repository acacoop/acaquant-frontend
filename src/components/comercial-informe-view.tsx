"use client";

import { useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

// Vista INFORME (sub-vista de COMERCIAL) — reporte GLOBAL de la mesa (no por
// operador). 4 cuadrantes. Consume /api/operaciones/comercial/informe[-segmento].
// Ver docs/TABLERO_COMERCIAL.md [5].

type SegCount = { segmento: string; n: number };
type SegmentoResp = {
  mes: string; mes_min: string; mes_actual: string; total: number; segmentos: SegCount[];
};
type Comercial = {
  rank: number; operador_email: string | null; operador_nombre: string;
  vol_total: number; vol_mes: number; ar_total: number; ar_mes: number; ticket_promedio: number;
};
type ArancelSeg = {
  segmento: string; ar_total: number; ar_mes: number; n_cuentas: number; ticket_promedio: number;
};
type InformeResp = { mes_actual: string; comerciales: Comercial[]; aranceles_segmento: ArancelSeg[] };
type ClienteArancel = { id_cuenta: string; denominacion: string; arancel_total: number; arancel_mes: number };
type OperacionArancel = {
  fecha: string; id_cuenta: string; denominacion: string; comprobante: string;
  ticker: string | null; categoria: string; op: string | null;
  importe: number; moneda: string; arancel: number;
};
type SegDetalle = {
  segmento: string; n_clientes: number; clientes: ClienteArancel[]; operaciones: OperacionArancel[];
};

const fmtN = (n: number) => Math.round(n).toLocaleString("es-AR");
const fmtAum = (n: number) =>
  "$" + (Math.abs(n) >= 1e6 ? (n / 1e6).toLocaleString("es-AR", { maximumFractionDigits: 1 }) + "M" : fmtN(n));
const fmtAr = (n: number) => (n ? "$" + Math.round(n).toLocaleString("es-AR") : "—");

const MESES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
const ymLabel = (ym: string) => {
  const [y, m] = ym.split("-").map(Number);
  return `${MESES[m - 1]} ${y}`;
};
const ymAdd = (ym: string, delta: number) => {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

async function getJson<T>(url: string, fallback: T): Promise<T> {
  try {
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) return fallback;
    return (await r.json()) as T;
  } catch {
    return fallback;
  }
}

function Panel({ title, extra, children }: { title: string; extra?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="min-h-0 border border-[#1a1a1a] bg-[#080808] flex flex-col overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-[#1a1a1a] shrink-0">
        <span className="text-[9px] text-[#888] tracking-widest uppercase mr-auto">{title}</span>
        {extra}
      </div>
      <div className="flex-1 min-h-0 overflow-auto">{children}</div>
    </div>
  );
}

export function ComercialInforme() {
  const [informe, setInforme] = useState<InformeResp | null>(null);
  const [seg, setSeg] = useState<SegmentoResp | null>(null);
  const [mes, setMes] = useState<string | null>(null);
  const [selSeg, setSelSeg] = useState<string | null>(null);
  const [detalle, setDetalle] = useState<SegDetalle | null>(null);
  const [q4tab, setQ4tab] = useState<"clientes" | "operaciones">("clientes");

  useEffect(() => {
    void getJson<InformeResp | null>("/api/operaciones/comercial/informe", null).then(setInforme);
  }, []);

  useEffect(() => {
    const q = mes ? `?hasta=${mes}` : "";
    void getJson<SegmentoResp | null>(`/api/operaciones/comercial/informe-segmento${q}`, null).then((d) => {
      setSeg(d);
      if (d && !mes) setMes(d.mes); // primer load → fija el mes actual
    });
  }, [mes]);

  // Detalle del segmento seleccionado (Q4 dinámica).
  useEffect(() => {
    if (!selSeg) { setDetalle(null); return; }
    setDetalle(null);
    void getJson<SegDetalle | null>(
      `/api/operaciones/comercial/informe-segmento-detalle?segmento=${encodeURIComponent(selSeg)}`,
      null,
    ).then(setDetalle);
  }, [selSeg]);

  const canPrev = !!(seg && mes && mes > seg.mes_min);
  const canNext = !!(seg && mes && mes < seg.mes_actual);

  return (
    <div className="flex-1 min-h-0 grid grid-cols-2 grid-rows-2 gap-3 p-3 overflow-hidden">
      {/* Q1 — Cuentas por segmento (barras) + selector temporal estilo cashflow */}
      <Panel
        title={`Cuentas por segmento${seg ? ` · ${seg.total}` : ""}`}
        extra={
          <div className="flex items-center gap-1">
            <button
              disabled={!canPrev}
              onClick={() => mes && setMes(ymAdd(mes, -1))}
              className="px-1.5 text-[#888] hover:text-[#ff9900] disabled:opacity-30 disabled:hover:text-[#888]"
            >◀</button>
            <span className="text-[10px] text-[#d0d0d0] font-mono min-w-[64px] text-center">
              {mes ? ymLabel(mes) : "…"}
            </span>
            <button
              disabled={!canNext}
              onClick={() => mes && setMes(ymAdd(mes, 1))}
              className="px-1.5 text-[#888] hover:text-[#ff9900] disabled:opacity-30 disabled:hover:text-[#888]"
            >▶</button>
          </div>
        }
      >
        <div className="h-full w-full p-2">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={seg?.segmentos ?? []} margin={{ top: 8, right: 12, bottom: 40, left: 0 }}>
              <CartesianGrid stroke="#161616" vertical={false} />
              <XAxis
                dataKey="segmento" tick={{ fill: "#808080", fontSize: 9 }}
                axisLine={{ stroke: "#2a2a2a" }} tickLine={false}
                angle={-35} textAnchor="end" height={48} interval={0}
              />
              <YAxis
                tick={{ fill: "#808080", fontSize: 10 }} axisLine={{ stroke: "#2a2a2a" }}
                tickLine={false} allowDecimals={false} width={36}
              />
              <Tooltip
                contentStyle={{ background: "#0e0e0e", border: "1px solid #2a2a2a", fontSize: 11, fontFamily: "JetBrains Mono, monospace" }}
                formatter={(v) => [fmtN(Number(v)), "Cuentas"]}
                cursor={{ fill: "#ffffff10" }}
              />
              <Bar dataKey="n" fill="#ff9900" isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Panel>

      {/* Q2 — Volumen + aranceles por comercial (ranking) */}
      <Panel title="Volumen por comercial · ranking">
        <table className="w-full text-[11px] tabular-nums">
          <thead className="sticky top-0 bg-[#0a0a0a]">
            <tr className="text-[9px] text-[#666] tracking-wide">
              <th className="text-left px-2 py-2">#</th>
              <th className="text-left px-1">COMERCIAL</th>
              <th className="text-right px-2">VOL. TOTAL</th>
              <th className="text-right px-2">VOL. MES</th>
              <th className="text-right px-2">TICKET PROM.</th>
              <th className="text-right px-2">ARANC. TOTAL</th>
              <th className="text-right px-3">ARANC. MES</th>
            </tr>
          </thead>
          <tbody>
            {!informe && (
              <tr><td colSpan={6} className="text-center text-[#555] py-4">cargando…</td></tr>
            )}
            {informe?.comerciales.map((c) => (
              <tr key={c.operador_email ?? c.operador_nombre} className="border-t border-[#141414] hover:bg-[#0e0e0e]">
                <td className="px-2 py-1.5 text-[#666]">{c.rank}</td>
                <td className="px-1 py-1.5 text-[#d0d0d0] truncate max-w-[160px]" title={c.operador_nombre}>
                  {c.operador_nombre}
                </td>
                <td className="text-right px-2 font-semibold text-[#ff9900]">{fmtAum(c.vol_total)}</td>
                <td className="text-right px-2 text-[#aaa]">{fmtAum(c.vol_mes)}</td>
                <td className="text-right px-2 text-[#d0d0d0]">{fmtAum(c.ticket_promedio)}</td>
                <td className="text-right px-2 text-[#9fb8d0]">{fmtAr(c.ar_total)}</td>
                <td className="text-right px-3 text-[#9fb8d0]">{fmtAr(c.ar_mes)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>

      {/* Q3 — Aranceles por segmento (nivel_1) */}
      <Panel title="Aranceles por segmento">
        <table className="w-full text-[11px] tabular-nums">
          <thead className="sticky top-0 bg-[#0a0a0a]">
            <tr className="text-[9px] text-[#666] tracking-wide">
              <th className="text-left px-3 py-2">SEGMENTO</th>
              <th className="text-right px-2">ARANC. TOTAL</th>
              <th className="text-right px-2">ARANC. MES</th>
              <th className="text-right px-3">TICKET PROM.</th>
            </tr>
          </thead>
          <tbody>
            {!informe && (
              <tr><td colSpan={4} className="text-center text-[#555] py-4">cargando…</td></tr>
            )}
            {informe?.aranceles_segmento.map((s) => (
              <tr
                key={s.segmento}
                onClick={() => setSelSeg(s.segmento)}
                title="Ver clientes y operaciones de este segmento"
                className={
                  "border-t border-[#141414] cursor-pointer " +
                  (selSeg === s.segmento ? "bg-[#ff9900]/10" : "hover:bg-[#0e0e0e]")
                }
              >
                <td className="px-3 py-1.5 text-[#d0d0d0] truncate max-w-[200px]" title={s.segmento}>{s.segmento}</td>
                <td className="text-right px-2 font-semibold text-[#9fb8d0]">{fmtAr(s.ar_total)}</td>
                <td className="text-right px-2 text-[#9fb8d0]">{fmtAr(s.ar_mes)}</td>
                <td className="text-right px-3 text-[#d0d0d0]">{fmtAum(s.ticket_promedio)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>

      {/* Q4 — detalle dinámico del segmento elegido en Q3 (2 tabs) */}
      <Panel
        title={selSeg ? `Detalle · ${selSeg}` : "Detalle de segmento"}
        extra={
          selSeg ? (
            <div className="inline-flex items-stretch border border-[#2a2a2a] divide-x divide-[#2a2a2a]">
              {(["clientes", "operaciones"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setQ4tab(t)}
                  className={
                    "px-2 py-0.5 text-[10px] uppercase tracking-wider " +
                    (q4tab === t ? "bg-[#ff9900] text-black" : "bg-[#0a0a0a] text-[#888] hover:text-[#ff9900]")
                  }
                >
                  {t === "clientes" ? "Clientes" : "Operaciones"}
                </button>
              ))}
            </div>
          ) : null
        }
      >
        {!selSeg ? (
          <div className="h-full flex items-center justify-center text-[11px] text-[#555] text-center px-4">
            Tocá un segmento en “Aranceles por segmento” para ver sus clientes y operaciones.
          </div>
        ) : !detalle ? (
          <div className="h-full flex items-center justify-center text-[11px] text-[#555]">cargando…</div>
        ) : q4tab === "clientes" ? (
          <table className="w-full text-[11px] tabular-nums">
            <thead className="sticky top-0 bg-[#0a0a0a]">
              <tr className="text-[9px] text-[#666] tracking-wide">
                <th className="text-left px-3 py-2">CLIENTE</th>
                <th className="text-right px-2">ARANC. TOTAL</th>
                <th className="text-right px-3">ARANC. MES</th>
              </tr>
            </thead>
            <tbody>
              {detalle.clientes.length === 0 && (
                <tr><td colSpan={3} className="text-center text-[#555] py-4">Sin aranceles.</td></tr>
              )}
              {detalle.clientes.map((c) => (
                <tr key={c.id_cuenta} className="border-t border-[#141414] hover:bg-[#0e0e0e]">
                  <td className="px-3 py-1.5 text-[#d0d0d0] truncate max-w-[200px]" title={c.denominacion}>
                    <span className="text-[#666]">[{c.id_cuenta}]</span> {c.denominacion}
                  </td>
                  <td className="text-right px-2 font-semibold text-[#9fb8d0]">{fmtAr(c.arancel_total)}</td>
                  <td className="text-right px-3 text-[#9fb8d0]">{fmtAr(c.arancel_mes)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <table className="w-full text-[11px] tabular-nums">
            <thead className="sticky top-0 bg-[#0a0a0a]">
              <tr className="text-[9px] text-[#666] tracking-wide">
                <th className="text-left px-3 py-2">FECHA</th>
                <th className="text-left px-1">CLIENTE</th>
                <th className="text-left px-1">TICKER</th>
                <th className="text-right px-2">IMPORTE</th>
                <th className="text-right px-3">ARANCEL</th>
              </tr>
            </thead>
            <tbody>
              {detalle.operaciones.length === 0 && (
                <tr><td colSpan={5} className="text-center text-[#555] py-4">Sin operaciones.</td></tr>
              )}
              {detalle.operaciones.map((o, i) => (
                <tr key={o.comprobante + i} className="border-t border-[#141414] hover:bg-[#0e0e0e]">
                  <td className="px-3 py-1.5 text-[#888] whitespace-nowrap">{o.fecha}</td>
                  <td className="px-1 py-1.5 text-[#d0d0d0] truncate max-w-[120px]" title={o.denominacion}>{o.denominacion}</td>
                  <td className="px-1 py-1.5 text-[#aaa]">{o.ticker ?? o.categoria}</td>
                  <td className="text-right px-2 text-[#aaa]">{fmtAum(o.importe)}</td>
                  <td className="text-right px-3 font-semibold text-[#9fb8d0]">{fmtAr(o.arancel)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>
    </div>
  );
}
