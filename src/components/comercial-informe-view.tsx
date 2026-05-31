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

import { fmtMoney, fmtMoneyFull } from "@/lib/fmt-money";
import { exportToXlsx, timestampSuffix } from "@/lib/xlsx-export";

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
// Montos: formato compacto compartido (M/MM/B). fmtAr conserva "—" para 0.
const fmtAum = (n: number) => fmtMoney(n);
const fmtAr = (n: number) => (n ? fmtMoney(n) : "—");

function DownloadBtn({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      title="Descargar a Excel"
      className="text-[9px] tracking-wider text-[var(--t-text-dim)] hover:text-[var(--t-accent)] border border-[var(--t-border-2)] hover:border-[var(--t-accent)] px-1.5 py-0.5 uppercase"
    >
      ⬇ xls
    </button>
  );
}

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
    <div className="min-h-0 border border-[var(--t-border)] bg-[var(--t-panel)] flex flex-col overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-[var(--t-border)] shrink-0">
        <span className="text-[9px] text-[var(--t-text-dim)] tracking-widest uppercase mr-auto">{title}</span>
        {extra}
      </div>
      <div className="flex-1 min-h-0 overflow-auto">{children}</div>
    </div>
  );
}

export function ComercialInforme({ moneda = "ARS" }: { moneda?: "ARS" | "USD" }) {
  const [informe, setInforme] = useState<InformeResp | null>(null);
  const [seg, setSeg] = useState<SegmentoResp | null>(null);
  const [mes, setMes] = useState<string | null>(null);
  const [selSeg, setSelSeg] = useState<string | null>(null);
  const [detalle, setDetalle] = useState<SegDetalle | null>(null);
  const [q4tab, setQ4tab] = useState<"clientes" | "operaciones">("clientes");
  const [selComercial, setSelComercial] = useState<string | null>(null);
  const [segScoped, setSegScoped] = useState<ArancelSeg[] | null>(null);

  useEffect(() => {
    void getJson<InformeResp | null>(`/api/operaciones/comercial/informe?moneda=${moneda}`, null).then(setInforme);
  }, [moneda]);

  // Q1 (cuentas por segmento) — se re-scopea al comercial elegido (item 7).
  useEffect(() => {
    const params = new URLSearchParams();
    if (mes) params.set("hasta", mes);
    if (selComercial) params.set("operador", selComercial);
    const q = params.toString() ? `?${params.toString()}` : "";
    void getJson<SegmentoResp | null>(`/api/operaciones/comercial/informe-segmento${q}`, null).then((d) => {
      setSeg(d);
      if (d && !mes) setMes(d.mes); // primer load → fija el mes actual
    });
  }, [mes, selComercial]);

  // Q3 re-scopeada: aranceles por segmento del comercial elegido.
  useEffect(() => {
    if (!selComercial) { setSegScoped(null); return; }
    setSegScoped(null);
    void getJson<{ aranceles_segmento: ArancelSeg[] } | null>(
      `/api/operaciones/comercial/informe-aranceles-segmento?operador=${encodeURIComponent(selComercial)}&moneda=${moneda}`,
      null,
    ).then((d) => setSegScoped(d?.aranceles_segmento ?? []));
  }, [selComercial, moneda]);

  // Detalle (Q4): por defecto TODOS los segmentos; al elegir uno en Q3, filtra.
  // Respeta el comercial elegido en Q2.
  useEffect(() => {
    setDetalle(null);
    const op = selComercial ? `&operador=${encodeURIComponent(selComercial)}` : "";
    const segParam = selSeg ?? "todos";
    void getJson<SegDetalle | null>(
      `/api/operaciones/comercial/informe-segmento-detalle?segmento=${encodeURIComponent(segParam)}${op}&moneda=${moneda}`,
      null,
    ).then(setDetalle);
  }, [selSeg, selComercial, moneda]);

  const canPrev = !!(seg && mes && mes > seg.mes_min);
  const canNext = !!(seg && mes && mes < seg.mes_actual);
  const comercialNombre = selComercial
    ? (informe?.comerciales.find((c) => c.operador_email === selComercial)?.operador_nombre ?? selComercial)
    : null;
  const q3segs = selComercial ? segScoped : (informe?.aranceles_segmento ?? null);

  // Totales del ranking (fila fija abajo). El ticket promedio no se suma.
  const totRanking = (informe?.comerciales ?? []).reduce(
    (a, c) => ({
      vol_total: a.vol_total + c.vol_total, vol_mes: a.vol_mes + c.vol_mes,
      ar_total: a.ar_total + c.ar_total, ar_mes: a.ar_mes + c.ar_mes,
    }),
    { vol_total: 0, vol_mes: 0, ar_total: 0, ar_mes: 0 },
  );

  // ── Export a Excel (item 4) ──────────────────────────────────────────────
  const dlCuentasSeg = () => void exportToXlsx({
    filename: `comercial-cuentas-segmento-${timestampSuffix()}.xlsx`,
    sheets: [{ name: "Cuentas x segmento", rows: seg?.segmentos ?? [], columns: [
      { header: "Segmento", key: "segmento", format: "text", width: 28 },
      { header: "Cuentas", key: "n", format: "integer" },
    ] }],
  });
  const dlRanking = () => void exportToXlsx({
    filename: `comercial-ranking-${timestampSuffix()}.xlsx`,
    sheets: [{ name: "Ranking comercial", rows: informe?.comerciales ?? [], columns: [
      { header: "#", key: "rank", format: "integer", width: 5 },
      { header: "Comercial", key: "operador_nombre", format: "text", width: 28 },
      { header: "Ticket prom.", key: "ticket_promedio", format: "currency" },
      { header: "Vol. total", key: "vol_total", format: "currency", width: 18 },
      { header: "Vol. mes", key: "vol_mes", format: "currency", width: 18 },
      { header: "Aranc. total", key: "ar_total", format: "currency" },
      { header: "Aranc. mes", key: "ar_mes", format: "currency" },
    ] }],
  });
  const dlAranceles = () => void exportToXlsx({
    filename: `comercial-aranceles-segmento-${timestampSuffix()}.xlsx`,
    sheets: [{ name: "Aranceles x segmento", rows: q3segs ?? [], columns: [
      { header: "Segmento", key: "segmento", format: "text", width: 28 },
      { header: "Aranc. total", key: "ar_total", format: "currency" },
      { header: "Aranc. mes", key: "ar_mes", format: "currency" },
      { header: "Ticket prom.", key: "ticket_promedio", format: "currency" },
      { header: "# cuentas", key: "n_cuentas", format: "integer" },
    ] }],
  });
  const dlDetalle = () => void exportToXlsx({
    filename: `comercial-detalle-${selSeg ?? "todos"}-${timestampSuffix()}.xlsx`,
    sheets: q4tab === "clientes"
      ? [{ name: "Clientes", rows: detalle?.clientes ?? [], columns: [
          { header: "Cuenta", key: "id_cuenta", format: "text", width: 10 },
          { header: "Cliente", key: "denominacion", format: "text", width: 32 },
          { header: "Aranc. total", key: "arancel_total", format: "currency" },
          { header: "Aranc. mes", key: "arancel_mes", format: "currency" },
        ] }]
      : [{ name: "Operaciones", rows: detalle?.operaciones ?? [], columns: [
          { header: "Fecha", key: "fecha", format: "text", width: 12 },
          { header: "Cuenta", key: "id_cuenta", format: "text", width: 10 },
          { header: "Cliente", key: "denominacion", format: "text", width: 28 },
          { header: "Ticker", key: "ticker", format: "text", width: 14 },
          { header: "Categoría", key: "categoria", format: "text", width: 14 },
          { header: "Importe", key: "importe", format: "currency", width: 16 },
          { header: "Moneda", key: "moneda", format: "text", width: 8 },
          { header: "Arancel", key: "arancel", format: "currency" },
        ] }],
  });

  return (
    <div className="flex-1 min-h-0 grid grid-cols-2 grid-rows-2 gap-3 p-3 overflow-hidden">
      {/* Q1 — Cuentas por segmento (barras) + selector temporal estilo cashflow */}
      <Panel
        title={`Cuentas por segmento${comercialNombre ? ` · ${comercialNombre}` : ""}${seg ? ` · ${seg.total}` : ""}`}
        extra={
          <div className="flex items-center gap-1">
            <button
              disabled={!canPrev}
              onClick={() => mes && setMes(ymAdd(mes, -1))}
              className="px-1.5 text-[var(--t-text-dim)] hover:text-[var(--t-accent)] disabled:opacity-30 disabled:hover:text-[var(--t-text-dim)]"
            >◀</button>
            <span className="text-[10px] text-[var(--t-text)] font-mono min-w-[64px] text-center">
              {mes ? ymLabel(mes) : "…"}
            </span>
            <button
              disabled={!canNext}
              onClick={() => mes && setMes(ymAdd(mes, 1))}
              className="px-1.5 text-[var(--t-text-dim)] hover:text-[var(--t-accent)] disabled:opacity-30 disabled:hover:text-[var(--t-text-dim)]"
            >▶</button>
            <DownloadBtn onClick={dlCuentasSeg} />
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

      {/* Q2 — Volumen + aranceles por comercial (ranking). Click = re-scopea Q1/Q3/Q4. */}
      <Panel
        title="Volumen por comercial · ranking"
        extra={
          <div className="flex items-center gap-2">
            {selComercial ? (
              <button
                onClick={() => { setSelComercial(null); setSelSeg(null); }}
                className="text-[10px] text-[var(--t-accent)] hover:text-[#ffb84d]"
              >✕ quitar filtro</button>
            ) : (
              <span className="text-[9px] text-[var(--t-text-muted)]">click = filtrar</span>
            )}
            <DownloadBtn onClick={dlRanking} />
          </div>
        }
      >
        <table className="w-full text-[11px] tabular-nums">
          <thead className="sticky top-0 bg-[#0a0a0a]">
            <tr className="text-[9px] text-[var(--t-text-muted)] tracking-wide">
              <th className="text-left px-2 py-2">#</th>
              <th className="text-left px-1">COMERCIAL</th>
              <th className="text-right px-2">TICKET PROM.</th>
              <th className="text-right px-2">VOL. TOTAL</th>
              <th className="text-right px-2">VOL. MES</th>
              <th className="text-right px-2">ARANC. TOTAL</th>
              <th className="text-right px-3">ARANC. MES</th>
            </tr>
          </thead>
          <tbody>
            {!informe && (
              <tr><td colSpan={7} className="text-center text-[var(--t-text-muted)] py-4">cargando…</td></tr>
            )}
            {informe?.comerciales.map((c) => (
              <tr
                key={c.operador_email ?? c.operador_nombre}
                onClick={() => {
                  const em = c.operador_email;
                  if (em) { setSelComercial((s) => (s === em ? null : em)); setSelSeg(null); }
                }}
                title="Filtrar gráfico y tablas por este comercial"
                className={
                  "border-t border-[var(--t-border)] cursor-pointer " +
                  (selComercial === c.operador_email ? "bg-[var(--t-accent)]/10" : "hover:bg-[var(--t-surface)]")
                }
              >
                <td className="px-2 py-1.5 text-[var(--t-text-muted)]">{c.rank}</td>
                <td className="px-1 py-1.5 text-[var(--t-text)] truncate max-w-[160px]" title={c.operador_nombre}>
                  {c.operador_nombre}
                </td>
                <td className="text-right px-2 text-[var(--t-text)]" title={fmtMoneyFull(c.ticket_promedio)}>{fmtAum(c.ticket_promedio)}</td>
                <td className="text-right px-2 font-semibold text-[var(--t-accent)]" title={fmtMoneyFull(c.vol_total)}>{fmtAum(c.vol_total)}</td>
                <td className="text-right px-2 text-[var(--t-text-dim)]" title={fmtMoneyFull(c.vol_mes)}>{fmtAum(c.vol_mes)}</td>
                <td className="text-right px-2 text-[#9fb8d0]" title={fmtMoneyFull(c.ar_total)}>{fmtAr(c.ar_total)}</td>
                <td className="text-right px-3 text-[#9fb8d0]" title={fmtMoneyFull(c.ar_mes)}>{fmtAr(c.ar_mes)}</td>
              </tr>
            ))}
          </tbody>
          {informe && informe.comerciales.length > 0 && (
            <tfoot className="sticky bottom-0 bg-[var(--t-surface)]">
              <tr className="border-t-2 border-[var(--t-border-2)] font-semibold text-[var(--t-text)]">
                <td className="px-2 py-1.5" colSpan={2}>TOTAL</td>
                <td className="text-right px-2 text-[var(--t-text-muted)]">—</td>
                <td className="text-right px-2 text-[var(--t-accent)]" title={fmtMoneyFull(totRanking.vol_total)}>{fmtMoney(totRanking.vol_total)}</td>
                <td className="text-right px-2 text-[var(--t-text-dim)]" title={fmtMoneyFull(totRanking.vol_mes)}>{fmtMoney(totRanking.vol_mes)}</td>
                <td className="text-right px-2 text-[#9fb8d0]" title={fmtMoneyFull(totRanking.ar_total)}>{fmtMoney(totRanking.ar_total)}</td>
                <td className="text-right px-3 text-[#9fb8d0]" title={fmtMoneyFull(totRanking.ar_mes)}>{fmtMoney(totRanking.ar_mes)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </Panel>

      {/* Q3 — Aranceles por segmento (nivel_1). Se re-scopea al comercial elegido. */}
      <Panel
        title={`Aranceles por segmento${comercialNombre ? ` · ${comercialNombre}` : ""}`}
        extra={<DownloadBtn onClick={dlAranceles} />}
      >
        <table className="w-full text-[11px] tabular-nums">
          <thead className="sticky top-0 bg-[#0a0a0a]">
            <tr className="text-[9px] text-[var(--t-text-muted)] tracking-wide">
              <th className="text-left px-3 py-2">SEGMENTO</th>
              <th className="text-right px-2">ARANC. TOTAL</th>
              <th className="text-right px-2">ARANC. MES</th>
              <th className="text-right px-3">TICKET PROM.</th>
            </tr>
          </thead>
          <tbody>
            {!q3segs && (
              <tr><td colSpan={4} className="text-center text-[var(--t-text-muted)] py-4">cargando…</td></tr>
            )}
            {q3segs?.map((s) => (
              <tr
                key={s.segmento}
                onClick={() => setSelSeg(s.segmento)}
                title="Ver clientes y operaciones de este segmento"
                className={
                  "border-t border-[var(--t-border)] cursor-pointer " +
                  (selSeg === s.segmento ? "bg-[var(--t-accent)]/10" : "hover:bg-[var(--t-surface)]")
                }
              >
                <td className="px-3 py-1.5 text-[var(--t-text)] truncate max-w-[200px]" title={s.segmento}>{s.segmento}</td>
                <td className="text-right px-2 font-semibold text-[#9fb8d0]">{fmtAr(s.ar_total)}</td>
                <td className="text-right px-2 text-[#9fb8d0]">{fmtAr(s.ar_mes)}</td>
                <td className="text-right px-3 text-[var(--t-text)]">{fmtAum(s.ticket_promedio)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>

      {/* Q4 — detalle dinámico del segmento elegido en Q3 (2 tabs) */}
      <Panel
        title={selSeg ? `Detalle · ${selSeg}` : "Detalle · todos"}
        extra={
          <div className="flex items-center gap-2">
            {selSeg && (
              <button
                onClick={() => setSelSeg(null)}
                title="Ver todos los segmentos"
                className="text-[10px] text-[var(--t-accent)] hover:text-[#ffb84d]"
              >✕ todos</button>
            )}
            <div className="inline-flex items-stretch border border-[var(--t-border-2)] divide-x divide-[var(--t-border-2)]">
              {(["clientes", "operaciones"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setQ4tab(t)}
                  className={
                    "px-2 py-0.5 text-[10px] uppercase tracking-wider " +
                    (q4tab === t ? "bg-[var(--t-accent)] text-black" : "bg-[#0a0a0a] text-[var(--t-text-dim)] hover:text-[var(--t-accent)]")
                  }
                >
                  {t === "clientes" ? "Clientes" : "Operaciones"}
                </button>
              ))}
            </div>
            <DownloadBtn onClick={dlDetalle} />
          </div>
        }
      >
        {!detalle ? (
          <div className="h-full flex items-center justify-center text-[11px] text-[var(--t-text-muted)]">cargando…</div>
        ) : q4tab === "clientes" ? (
          <table className="w-full text-[11px] tabular-nums">
            <thead className="sticky top-0 bg-[#0a0a0a]">
              <tr className="text-[9px] text-[var(--t-text-muted)] tracking-wide">
                <th className="text-left px-3 py-2">CLIENTE</th>
                <th className="text-right px-2">ARANC. TOTAL</th>
                <th className="text-right px-3">ARANC. MES</th>
              </tr>
            </thead>
            <tbody>
              {detalle.clientes.length === 0 && (
                <tr><td colSpan={3} className="text-center text-[var(--t-text-muted)] py-4">Sin aranceles.</td></tr>
              )}
              {detalle.clientes.map((c) => (
                <tr key={c.id_cuenta} className="border-t border-[var(--t-border)] hover:bg-[var(--t-surface)]">
                  <td className="px-3 py-1.5 text-[var(--t-text)] truncate max-w-[200px]" title={c.denominacion}>
                    <span className="text-[var(--t-text-muted)]">[{c.id_cuenta}]</span> {c.denominacion}
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
              <tr className="text-[9px] text-[var(--t-text-muted)] tracking-wide">
                <th className="text-left px-3 py-2">FECHA</th>
                <th className="text-left px-1">CLIENTE</th>
                <th className="text-left px-1">TICKER</th>
                <th className="text-right px-2">IMPORTE</th>
                <th className="text-right px-3">ARANCEL</th>
              </tr>
            </thead>
            <tbody>
              {detalle.operaciones.length === 0 && (
                <tr><td colSpan={5} className="text-center text-[var(--t-text-muted)] py-4">Sin operaciones.</td></tr>
              )}
              {detalle.operaciones.map((o, i) => (
                <tr key={o.comprobante + i} className="border-t border-[var(--t-border)] hover:bg-[var(--t-surface)]">
                  <td className="px-3 py-1.5 text-[var(--t-text-dim)] whitespace-nowrap">{o.fecha}</td>
                  <td className="px-1 py-1.5 text-[var(--t-text)] truncate max-w-[120px]" title={o.denominacion}>{o.denominacion}</td>
                  <td className="px-1 py-1.5 text-[var(--t-text-dim)]">{o.ticker ?? o.categoria}</td>
                  <td className="text-right px-2 text-[var(--t-text-dim)]">{fmtAum(o.importe)}</td>
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
