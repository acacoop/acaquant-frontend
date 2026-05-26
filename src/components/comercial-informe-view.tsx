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
  vol_total: number; vol_mes: number; ar_total: number; ar_mes: number;
};
type ArancelSeg = { segmento: string; ar_total: number; ar_mes: number; n_cuentas: number };
type InformeResp = { mes_actual: string; comerciales: Comercial[]; aranceles_segmento: ArancelSeg[] };

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
              <th className="text-right px-2"># CTAS</th>
              <th className="text-right px-2">ARANC. TOTAL</th>
              <th className="text-right px-3">ARANC. MES</th>
            </tr>
          </thead>
          <tbody>
            {!informe && (
              <tr><td colSpan={4} className="text-center text-[#555] py-4">cargando…</td></tr>
            )}
            {informe?.aranceles_segmento.map((s) => (
              <tr key={s.segmento} className="border-t border-[#141414] hover:bg-[#0e0e0e]">
                <td className="px-3 py-1.5 text-[#d0d0d0] truncate max-w-[200px]" title={s.segmento}>{s.segmento}</td>
                <td className="text-right px-2 text-[#888]">{s.n_cuentas}</td>
                <td className="text-right px-2 font-semibold text-[#9fb8d0]">{fmtAr(s.ar_total)}</td>
                <td className="text-right px-3 text-[#9fb8d0]">{fmtAr(s.ar_mes)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>

      {/* Q4 — reservado (a definir) */}
      <Panel title="—">
        <div className="h-full flex items-center justify-center text-[11px] text-[#444]">
          Próximamente.
        </div>
      </Panel>
    </div>
  );
}
