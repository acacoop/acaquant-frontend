"use client";

import { useEffect, useState } from "react";
import { fmtMoney } from "@/lib/fmt-money";

/**
 * Tabla FCI de la vista /referidos — números, no gráfico. Muestra el dinero en
 * cartera FCI de TODAS las cuentas del referido, saldo promedio diario del rango
 * [desde, hasta], abierto por sociedad gerente (emisor). Base para la comisión
 * de la coop (el % se aplica en una etapa posterior). Componente autónomo: maneja
 * su propio rango y fetch — se monta en el panel superior-derecho de ReferidosView.
 */

type EmisorRow = { emisor: string; promedio: number };
type FciResp = {
  referido: string; moneda: string; desde: string; hasta: string;
  n_dias: number; total: number; emisores: EmisorRow[];
};

const HDR = "px-3 py-1.5 border-b border-[var(--t-border)] bg-[var(--t-accent)]/10 shrink-0 flex items-center gap-2 flex-wrap";

async function getJson<T>(url: string): Promise<T | null> {
  try { const r = await fetch(url, { cache: "no-store" }); return r.ok ? ((await r.json()) as T) : null; } catch { return null; }
}

// desde = primer día del mes en curso; hasta = hoy (ISO YYYY-MM-DD).
function defaultRange(): { desde: string; hasta: string } {
  const now = new Date();
  const hasta = now.toISOString().slice(0, 10);
  const desde = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString().slice(0, 10);
  return { desde, hasta };
}

export function ReferidoFciTable({ referido, moneda }: { referido: string; moneda: "ARS" | "USD" }) {
  const init = defaultRange();
  const [desde, setDesde] = useState(init.desde);
  const [hasta, setHasta] = useState(init.hasta);
  const [data, setData] = useState<FciResp | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!referido) { setData(null); return; }
    let alive = true; setLoading(true);
    void (async () => {
      const d = await getJson<FciResp>(
        `/api/operaciones/comercial/referido-fci?referido=${encodeURIComponent(referido)}&desde=${desde}&hasta=${hasta}&moneda=${moneda}`,
      );
      if (alive) { setData(d); setLoading(false); }
    })();
    return () => { alive = false; };
  }, [referido, desde, hasta, moneda]);

  const rows = data?.emisores ?? [];
  const total = data?.total ?? 0;
  const dateCls = "bg-[var(--t-surface)] border border-[var(--t-border-2)] text-[var(--t-text)] text-[10px] px-1.5 py-0.5 font-mono outline-none";

  return (
    <div className="flex-1 min-h-0 border border-[var(--t-border)] bg-[var(--t-panel)] flex flex-col overflow-hidden">
      <div className={HDR}>
        <span className="text-[10px] uppercase tracking-widest text-[var(--t-accent)]">FCI por gerente · {moneda}</span>
        <span className="text-[9px] text-[var(--t-text-muted)]">saldo prom. diario</span>
        <div className="ml-auto flex items-center gap-1">
          <input type="date" value={desde} max={hasta} onChange={(e) => setDesde(e.target.value)} className={dateCls} />
          <span className="text-[9px] text-[var(--t-text-muted)]">→</span>
          <input type="date" value={hasta} min={desde} onChange={(e) => setHasta(e.target.value)} className={dateCls} />
        </div>
      </div>
      <div className="flex-1 min-h-0 overflow-auto">
        {loading ? (
          <p className="p-3 text-[11px] text-[var(--t-text-dim)]">cargando…</p>
        ) : rows.length === 0 ? (
          <p className="p-3 text-[11px] text-[var(--t-text-dim)]">Sin tenencia FCI en el rango.</p>
        ) : (
          <table className="w-full text-[10px]">
            <thead className="sticky top-0 bg-[var(--t-panel)]"><tr className="text-[var(--t-text-muted)]">
              <th className="text-left !px-2">Sociedad gerente</th>
              <th className="text-right !px-2">Saldo prom. {moneda}</th>
              <th className="text-right !px-2">%</th>
            </tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.emisor} className="hover:bg-[var(--t-border)]">
                  <td className="!px-2">{r.emisor}</td>
                  <td className="!px-2 text-right tabular-nums">{fmtMoney(r.promedio)}</td>
                  <td className="!px-2 text-right tabular-nums text-[var(--t-text-dim)]">{total ? ((r.promedio / total) * 100).toFixed(1) : "0.0"}%</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="sticky bottom-0 bg-[var(--t-panel)] border-t border-[var(--t-border)]">
              <tr className="font-semibold">
                <td className="!px-2">TOTAL</td>
                <td className="!px-2 text-right tabular-nums text-[var(--t-accent)]">{fmtMoney(total)}</td>
                <td className="!px-2 text-right tabular-nums text-[var(--t-text-muted)]">{data?.n_dias ? `${data.n_dias}d` : ""}</td>
              </tr>
            </tfoot>
          </table>
        )}
      </div>
    </div>
  );
}
