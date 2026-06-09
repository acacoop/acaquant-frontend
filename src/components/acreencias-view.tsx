"use client";

import { useEffect, useMemo, useState } from "react";

interface DiaAgg { fecha: string; por_moneda: Record<string, number>; n_clientes: number; n_pagos: number }
interface Pago {
  fecha_pago: string; id_cuenta: string; cliente: string | null;
  ticker: string; emisor: string | null; moneda: string; cantidad: number; monto: number;
}

const HORIZONTES = [
  { d: 30, l: "30 días" }, { d: 90, l: "90 días" },
  { d: 180, l: "6 meses" }, { d: 365, l: "1 año" },
];

function fmt(n?: number): string {
  return n == null ? "--" : new Intl.NumberFormat("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}
function isoToday(): string { return new Date().toISOString().slice(0, 10); }
function isoPlus(days: number): string { const d = new Date(); d.setDate(d.getDate() + days); return d.toISOString().slice(0, 10); }
function fmtFecha(iso: string): string { const [y, m, d] = iso.split("-"); return `${d}/${m}/${y.slice(2)}`; }

export function AcreenciasView() {
  const [horizonte, setHorizonte] = useState(90);
  const [dias, setDias] = useState<DiaAgg[]>([]);
  const [sel, setSel] = useState<string | null>(null);
  const [detalle, setDetalle] = useState<Pago[]>([]);
  const [vacio, setVacio] = useState(false);

  useEffect(() => {
    let alive = true;
    const desde = isoToday(), hasta = isoPlus(horizonte);
    fetch(`/api/back-office/acreencias/por-dia?desde=${desde}&hasta=${hasta}`)
      .then((r) => r.json())
      .then((d) => { if (alive) { const arr = Array.isArray(d) ? d : []; setDias(arr); setVacio(arr.length === 0); } })
      .catch(() => { if (alive) setDias([]); });
    return () => { alive = false; };
  }, [horizonte]);

  useEffect(() => {
    if (!sel) return;
    let alive = true;
    fetch(`/api/back-office/acreencias/dia?fecha=${encodeURIComponent(sel)}`)
      .then((r) => r.json())
      .then((d) => { if (alive) setDetalle(Array.isArray(d) ? d : []); })
      .catch(() => {});
    return () => { alive = false; };
  }, [sel]);

  // Totales del horizonte por moneda.
  const totales = useMemo(() => {
    const t: Record<string, number> = {};
    for (const d of dias) for (const [m, v] of Object.entries(d.por_moneda)) t[m] = (t[m] || 0) + v;
    return t;
  }, [dias]);

  return (
    <div className="h-full min-h-0 flex flex-col p-3 gap-2">
      <div className="flex items-center gap-3 flex-wrap shrink-0">
        <span className="text-[11px] text-[var(--t-text-dim)]">Horizonte:</span>
        {HORIZONTES.map((h) => (
          <button key={h.d} type="button" onClick={() => { setHorizonte(h.d); setSel(null); }}
            className={"px-2 py-0.5 text-[10px] font-semibold border " +
              (horizonte === h.d ? "text-[var(--t-accent)] border-[var(--t-accent)]" : "text-[var(--t-text-dim)] border-[var(--t-border)] hover:text-[var(--t-text)]")}>
            {h.l}
          </button>
        ))}
        <span className="ml-auto text-[11px] text-[var(--t-text)]">
          {Object.entries(totales).map(([m, v]) => `${m} ${fmt(v)}`).join("  ·  ") || "—"}
          <span className="text-[var(--t-text-dim)]"> a cobrar en el período</span>
        </span>
      </div>

      {vacio && (
        <p className="text-[12px] text-amber-500">
          No hay acreencias precomputadas. Corré <code>python -m jobs.acreencias --commit</code> en el Droplet.
        </p>
      )}

      <div className="flex gap-3 flex-1 min-h-0">
        {/* Días */}
        <div className="w-[44%] min-h-0 overflow-auto border border-[var(--t-border)]">
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

        {/* Detalle del día */}
        <div className="flex-1 min-h-0 overflow-auto border border-[var(--t-border)]">
          {!sel ? (
            <p className="text-[12px] text-[var(--t-text-dim)] p-3">Elegí un día para ver quién cobra y cuánto.</p>
          ) : (
            <>
              <div className="px-3 py-1.5 text-[11px] font-semibold border-b border-[var(--t-border)] sticky top-0 bg-[var(--t-panel)]">
                Cobros del {fmtFecha(sel)} · {detalle.length} pago{detalle.length !== 1 ? "s" : ""}
              </div>
              <table>
                <thead>
                  <tr><th>Cliente</th><th>Ticker</th><th>Emisor</th><th>Mon</th><th className="text-right">VN</th><th className="text-right">Monto</th></tr>
                </thead>
                <tbody>
                  {detalle.map((p, i) => (
                    <tr key={`${p.id_cuenta}-${p.ticker}-${i}`}>
                      <td>{p.cliente || p.id_cuenta}</td>
                      <td className="font-semibold">{p.ticker}</td>
                      <td className="text-[var(--t-text-dim)]">{p.emisor || "--"}</td>
                      <td>{p.moneda}</td>
                      <td className="text-right tabular-nums text-[var(--t-text-dim)]">{fmt(p.cantidad)}</td>
                      <td className="text-right tabular-nums font-semibold">{fmt(p.monto)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
