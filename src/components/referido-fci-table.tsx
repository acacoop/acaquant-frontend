"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { fmtMoney } from "@/lib/fmt-money";
import { getJSON as getJson } from "@/lib/fetch-json";

/**
 * Tabla FCI de /referidos — la COMISIÓN a la coop, por fondo, agrupada por gerente.
 * Por cada fondo: saldo promedio diario del rango × fee anual × (días/365) = comisión.
 * El fee (Assets.FEE_ADMIN) es ANUAL y varía por fondo → se muestra por fila.
 * Lee /api/operaciones/comercial/referido-fci?referido&desde&hasta&moneda.
 */

type FondoRow = { unidad: string; emisor: string; saldo: number; fee: number | null; comision: number | null };
type FciResp = {
  referido: string; moneda: string; desde: string; hasta: string;
  n_dias: number; dias_periodo: number; total_saldo: number; total_comision: number;
  fondos: FondoRow[];
};

const HDR = "px-3 py-1.5 border-b border-[var(--t-border)] bg-[var(--t-accent)]/10 shrink-0 flex items-center gap-2 flex-wrap";

function defaultRange(): { desde: string; hasta: string } {
  const now = new Date();
  const hasta = now.toISOString().slice(0, 10);
  const desde = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString().slice(0, 10);
  return { desde, hasta };
}

// "[1004] CAFCI632-1004 - Balanz Retorno Total - Clase A" → "Balanz Retorno Total - Clase A"
function cleanFondo(u: string): string {
  const noBracket = u.replace(/^\s*\[\d+\]\s*/, "");
  const i = noBracket.indexOf(" - ");
  return i >= 0 ? noBracket.slice(i + 3) : noBracket;
}
const pctFee = (f: number | null) => (f == null ? "—" : `${(f * 100).toFixed(2)}%`);

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

  // Agrupar fondos por gerente, con subtotal por grupo.
  const grupos = useMemo(() => {
    const m = new Map<string, FondoRow[]>();
    for (const f of data?.fondos ?? []) {
      const arr = m.get(f.emisor) ?? [];
      arr.push(f); m.set(f.emisor, arr);
    }
    return [...m.entries()].map(([emisor, fondos]) => ({
      emisor, fondos,
      saldo: fondos.reduce((a, f) => a + f.saldo, 0),
      comision: fondos.reduce((a, f) => a + (f.comision ?? 0), 0),
    }));
  }, [data]);

  const dateCls = "bg-[var(--t-surface)] border border-[var(--t-border-2)] text-[var(--t-text)] text-[10px] px-1.5 py-0.5 font-mono outline-none";

  return (
    <div className="flex-1 min-h-0 border border-[var(--t-border)] bg-[var(--t-panel)] flex flex-col overflow-hidden">
      <div className={HDR}>
        <span className="text-[10px] uppercase tracking-widest text-[var(--t-accent)]">FCI · comisión · {moneda}</span>
        {data && <span className="text-[9px] text-[var(--t-text-muted)]">{data.dias_periodo}d · fee anual ÷365×días</span>}
        <div className="ml-auto flex items-center gap-1">
          <input type="date" value={desde} max={hasta} onChange={(e) => setDesde(e.target.value)} className={dateCls} />
          <span className="text-[9px] text-[var(--t-text-muted)]">→</span>
          <input type="date" value={hasta} min={desde} onChange={(e) => setHasta(e.target.value)} className={dateCls} />
        </div>
      </div>
      <div className="flex-1 min-h-0 overflow-auto">
        {loading ? <p className="p-3 text-[11px] text-[var(--t-text-dim)]">cargando…</p>
          : !data || data.fondos.length === 0 ? <p className="p-3 text-[11px] text-[var(--t-text-dim)]">Sin tenencia FCI en el rango.</p>
          : (
            <table className="w-full text-[10px]">
              <thead className="sticky top-0 bg-[var(--t-panel)]"><tr className="text-[var(--t-text-muted)]">
                <th className="text-left !px-2">Fondo</th>
                <th className="text-right !px-2">Saldo prom.</th>
                <th className="text-right !px-2">Fee a.</th>
                <th className="text-right !px-2">Comisión</th>
              </tr></thead>
              <tbody>
                {grupos.map((g) => (
                  <Fragment key={g.emisor}>
                    <tr className="bg-[var(--t-accent)]/5 text-[var(--t-accent)]">
                      <td className="!px-2 font-semibold uppercase tracking-wide text-[9px]" colSpan={3}>{g.emisor}</td>
                      <td className="!px-2 text-right tabular-nums font-semibold">{fmtMoney(g.comision)}</td>
                    </tr>
                    {g.fondos.map((f) => (
                      <tr key={f.unidad} className="hover:bg-[var(--t-border)]">
                        <td className="!px-2 pl-4 text-[var(--t-text-dim)]">{cleanFondo(f.unidad)}</td>
                        <td className="!px-2 text-right tabular-nums">{fmtMoney(f.saldo)}</td>
                        <td className="!px-2 text-right tabular-nums" style={{ color: f.fee == null ? "var(--t-neg)" : undefined }}>{pctFee(f.fee)}</td>
                        <td className="!px-2 text-right tabular-nums font-semibold text-[var(--t-accent)]">{f.comision == null ? "—" : fmtMoney(f.comision)}</td>
                      </tr>
                    ))}
                  </Fragment>
                ))}
              </tbody>
              <tfoot className="sticky bottom-0 bg-[var(--t-panel)] border-t border-[var(--t-border)]">
                <tr className="font-semibold">
                  <td className="!px-2">TOTAL</td>
                  <td className="!px-2 text-right tabular-nums">{fmtMoney(data.total_saldo)}</td>
                  <td className="!px-2"></td>
                  <td className="!px-2 text-right tabular-nums text-[var(--t-accent)]">{fmtMoney(data.total_comision)}</td>
                </tr>
              </tfoot>
            </table>
          )}
      </div>
    </div>
  );
}
