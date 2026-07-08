"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { fmtMoney } from "@/lib/fmt-money";

interface DiaAgg { fecha: string; por_moneda: Record<string, number>; n_clientes: number; n_pagos: number }
interface Pago {
  fecha_pago: string; id_cuenta: string; cliente: string | null;
  ticker: string; emisor: string | null; moneda: string; cantidad: number; monto: number;
}
type Mon = "ARS" | "USD";

const PRESETS = [
  { d: 7, l: "7d" }, { d: 30, l: "30d" }, { d: 90, l: "90d" },
  { d: 180, l: "6m" }, { d: 365, l: "1 año" },
];
const _inp = "bg-[var(--t-surface-2)] border border-[var(--t-border)] px-1.5 py-0.5 text-[11px]";

function fmt(n?: number): string {
  return n == null ? "--" : new Intl.NumberFormat("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}
function isoToday(): string { return new Date().toISOString().slice(0, 10); }
function isoPlus(days: number): string { const d = new Date(); d.setDate(d.getDate() + days); return d.toISOString().slice(0, 10); }
function fmtFecha(iso: string): string { const [y, m, d] = iso.split("-"); return `${d}/${m}/${y.slice(2)}`; }

export function AcreenciasView() {
  const [desde, setDesde] = useState(isoToday());
  const [hasta, setHasta] = useState(isoPlus(90));
  const [dias, setDias] = useState<DiaAgg[]>([]);
  // Por defecto enfocamos HOY (si no hay cobros, el detalle muestra "hoy no hay").
  const [sel, setSel] = useState<string | null>(isoToday());
  const [detalle, setDetalle] = useState<Pago[]>([]);
  const [estado, setEstado] = useState<"loading" | "ok" | "vacio" | "error">("loading");
  // Moneda del gráfico acumulado (izquierda).
  const [chartMon, setChartMon] = useState<Mon>("ARS");
  // Filtros de la tabla de cobros (derecha).
  const [fTicker, setFTicker] = useState<string>("");
  const [fMon, setFMon] = useState<"ALL" | Mon>("ALL");

  useEffect(() => {
    let alive = true;
    fetch(`/api/back-office/acreencias/por-dia?desde=${desde}&hasta=${hasta}`)
      .then((r) => r.json())
      .then((d) => {
        if (!alive) return;
        if (Array.isArray(d)) { setDias(d); setEstado(d.length ? "ok" : "vacio"); }
        else { setDias([]); setEstado("error"); }
      })
      .catch(() => { if (alive) { setDias([]); setEstado("error"); } });
    return () => { alive = false; };
  }, [desde, hasta]);

  useEffect(() => {
    if (!sel) { setDetalle([]); return; }
    let alive = true;
    fetch(`/api/back-office/acreencias/dia?fecha=${encodeURIComponent(sel)}`)
      .then((r) => r.json())
      .then((d) => { if (alive) setDetalle(Array.isArray(d) ? d : []); })
      .catch(() => { if (alive) setDetalle([]); });
    return () => { alive = false; };
  }, [sel]);

  // Al cambiar de día, limpiar el filtro de ticker (los tickers cambian por día).
  useEffect(() => { setFTicker(""); }, [sel]);

  const totales = useMemo(() => {
    const t: Record<string, number> = {};
    for (const d of dias) for (const [m, v] of Object.entries(d.por_moneda)) t[m] = (t[m] || 0) + v;
    return t;
  }, [dias]);

  // Serie por día (X=fecha, Y=monto a cobrar ese día) en la moneda del toggle.
  const chartData = useMemo(() => {
    const ord = [...dias].sort((a, b) => a.fecha.localeCompare(b.fecha));
    return ord.map((d) => ({ fecha: d.fecha, dia: d.por_moneda[chartMon] || 0 }));
  }, [dias, chartMon]);

  const tickers = useMemo(
    () => Array.from(new Set(detalle.map((p) => p.ticker).filter(Boolean))).sort(),
    [detalle],
  );
  const detalleFiltrado = useMemo(
    () => detalle.filter((p) => (!fTicker || p.ticker === fTicker) && (fMon === "ALL" || p.moneda === fMon)),
    [detalle, fTicker, fMon],
  );

  const preset = (n: number) => { setDesde(isoToday()); setHasta(isoPlus(n)); setSel(isoToday()); };
  const esHoy = sel === isoToday();

  return (
    <div className="h-full min-h-0 flex flex-col p-3 gap-2">
      {/* Filtros: desde / hasta + atajos */}
      <div className="flex items-center gap-2 flex-wrap shrink-0">
        <label className="flex items-center gap-1 text-[11px] text-[var(--t-text-dim)]">
          Desde <input type="date" value={desde} max={hasta} onChange={(e) => { setDesde(e.target.value); }} className={_inp + " text-[var(--t-text)]"} />
        </label>
        <label className="flex items-center gap-1 text-[11px] text-[var(--t-text-dim)]">
          Hasta <input type="date" value={hasta} min={desde} onChange={(e) => { setHasta(e.target.value); }} className={_inp + " text-[var(--t-text)]"} />
        </label>
        <span className="text-[10px] text-[var(--t-text-dim)] ml-1">atajos:</span>
        {PRESETS.map((p) => (
          <button key={p.d} type="button" onClick={() => preset(p.d)}
            className={"px-1.5 py-0.5 text-[10px] font-semibold border border-[var(--t-border)] text-[var(--t-text-dim)] hover:text-[var(--t-text)]"}>
            {p.l}
          </button>
        ))}
        <span className="ml-auto text-[11px] text-[var(--t-text)]">
          {Object.entries(totales).map(([m, v]) => `${m} ${fmt(v)}`).join("  ·  ") || "—"}
          <span className="text-[var(--t-text-dim)]"> a cobrar</span>
        </span>
      </div>

      {estado === "vacio" && (
        <p className="text-[12px] text-amber-500">
          No hay acreencias en ese rango. Si nunca corriste el precompute:
          <code className="mx-1">python -m jobs.acreencias --commit</code> en el Droplet (post-AuM).
        </p>
      )}
      {estado === "error" && (
        <p className="text-[12px] text-red-500">
          No se pudo leer acreencias. ¿Reiniciaste api.service tras el deploy?
        </p>
      )}

      <div className="flex gap-3 flex-1 min-h-0">
        {/* IZQUIERDA: tabla de días (50%) + gráfico acumulado (50%) */}
        <div className="w-[44%] min-h-0 flex flex-col gap-2 overflow-hidden">
          {/* Tabla de días */}
          <div className="flex-1 min-h-0 overflow-auto border border-[var(--t-border)]">
            <table>
              <thead>
                <tr><th>Fecha</th><th className="text-right">USD</th><th className="text-right">ARS</th><th className="text-right">Clientes</th><th className="text-right">Pagos</th></tr>
              </thead>
              <tbody>
                {dias.map((d) => (
                  <tr key={d.fecha} onClick={() => setSel(d.fecha)}
                    className={"cursor-pointer " + (sel === d.fecha ? "bg-[var(--t-surface-2)]" : "")}>
                    <td className="font-semibold tabular-nums">{fmtFecha(d.fecha)}</td>
                    <td className="text-right tabular-nums">{d.por_moneda.USD ? fmt(d.por_moneda.USD) : "—"}</td>
                    <td className="text-right tabular-nums">{d.por_moneda.ARS ? fmt(d.por_moneda.ARS) : "—"}</td>
                    <td className="text-right tabular-nums">{d.n_clientes}</td>
                    <td className="text-right tabular-nums text-[var(--t-text-dim)]">{d.n_pagos}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Gráfico acumulado */}
          <div className="flex-1 min-h-0 border border-[var(--t-border)] flex flex-col overflow-hidden">
            <div className="px-3 py-1.5 border-b border-[var(--t-border)] shrink-0 flex items-center gap-2">
              <span className="text-[10px] uppercase tracking-widest text-[var(--t-accent)]">A cobrar por día · {chartMon}</span>
              <div className="ml-auto inline-flex border border-[var(--t-border-2)] divide-x divide-[var(--t-border-2)]">
                {(["ARS", "USD"] as Mon[]).map((m) => (
                  <button key={m} onClick={() => setChartMon(m)}
                    className={"px-1.5 py-0.5 text-[9px] font-semibold " + (chartMon === m ? "bg-[var(--t-accent)] text-[var(--t-on-accent)]" : "text-[var(--t-text-dim)] hover:text-[var(--t-accent)]")}>
                    {m}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex-1 min-h-0 p-1">
              {chartData.length === 0 ? (
                <p className="p-3 text-[11px] text-[var(--t-text-dim)]">Sin datos en el rango.</p>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 8, right: 12, bottom: 4, left: 4 }}>
                    <defs>
                      <linearGradient id="acr-grad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--t-accent)" stopOpacity={0.9} />
                        <stop offset="100%" stopColor="var(--t-accent)" stopOpacity={0.35} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="2 2" stroke="var(--t-border)" vertical={false} />
                    <XAxis dataKey="fecha" tickFormatter={fmtFecha} tick={{ fontSize: 9, fill: "var(--t-text-muted)" }} minTickGap={24} />
                    <YAxis tickFormatter={(v) => fmtMoney(v as number)} tick={{ fontSize: 9, fill: "var(--t-text-muted)" }} width={54} />
                    <Tooltip
                      cursor={{ fill: "var(--t-surface-2)", opacity: 0.4 }}
                      contentStyle={{ background: "var(--t-panel)", border: "1px solid var(--t-border)", fontSize: 10 }}
                      labelFormatter={(l) => fmtFecha(String(l))}
                      formatter={(v) => [`${chartMon} ${fmtMoney(Number(v))}`, "A cobrar"]}
                    />
                    <Bar dataKey="dia" fill="url(#acr-grad)" radius={[2, 2, 0, 0]} maxBarSize={28} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        </div>

        {/* DERECHA: detalle del día (default hoy) + filtros ticker / moneda */}
        <div className="flex-1 min-h-0 overflow-hidden border border-[var(--t-border)] flex flex-col">
          {!sel ? (
            <p className="text-[12px] text-[var(--t-text-dim)] p-3">Elegí un día (izquierda) para ver quién cobra y cuánto.</p>
          ) : (
            <>
              <div className="px-3 py-1.5 border-b border-[var(--t-border)] sticky top-0 bg-[var(--t-panel)] shrink-0 flex items-center gap-2 flex-wrap">
                <span className="text-[11px] font-semibold">
                  Cobros del {fmtFecha(sel)} · {detalleFiltrado.length} pago{detalleFiltrado.length !== 1 ? "s" : ""}
                </span>
                <select value={fTicker} onChange={(e) => setFTicker(e.target.value)} className={_inp + " text-[var(--t-text)] ml-auto"}>
                  <option value="">Todos los tickers</option>
                  {tickers.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
                <div className="inline-flex border border-[var(--t-border-2)] divide-x divide-[var(--t-border-2)]">
                  {(["ALL", "ARS", "USD"] as ("ALL" | Mon)[]).map((m) => (
                    <button key={m} onClick={() => setFMon(m)}
                      className={"px-1.5 py-0.5 text-[9px] font-semibold " + (fMon === m ? "bg-[var(--t-accent)] text-[var(--t-on-accent)]" : "text-[var(--t-text-dim)] hover:text-[var(--t-accent)]")}>
                      {m === "ALL" ? "Todas" : m}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex-1 min-h-0 overflow-auto">
                {detalleFiltrado.length === 0 ? (
                  <p className="text-[12px] text-[var(--t-text-dim)] p-3">
                    {esHoy && detalle.length === 0 ? "Hoy no hay cobros." : "No hay cobros para el filtro."}
                  </p>
                ) : (
                  <table>
                    <thead>
                      <tr><th>Cliente</th><th>Cuenta</th><th>Ticker</th><th>Emisor</th><th>Mon</th><th className="text-right">VN</th><th className="text-right">Monto</th></tr>
                    </thead>
                    <tbody>
                      {detalleFiltrado.map((p, i) => (
                        <tr key={`${p.id_cuenta}-${p.ticker}-${i}`}>
                          <td>{p.cliente || p.id_cuenta}</td>
                          <td className="tabular-nums text-[var(--t-text-dim)]">{p.id_cuenta}</td>
                          <td className="font-semibold">{p.ticker}</td>
                          <td className="text-[var(--t-text-dim)]">{p.emisor || "--"}</td>
                          <td>{p.moneda}</td>
                          <td className="text-right tabular-nums text-[var(--t-text-dim)]">{fmt(p.cantidad)}</td>
                          <td className="text-right tabular-nums font-semibold">{fmt(p.monto)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
