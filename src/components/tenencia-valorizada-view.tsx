"use client";

import { useEffect, useState } from "react";
import { fmtMoney } from "@/lib/fmt-money";

/**
 * Back Office → Tenencia Valorizada. Cartera HD de las cuentas propias 100/255/256.
 * Izquierda (50%): 1 fila por día (fecha snapshot) × AuM HD de cada cuenta + total.
 * Derecha (50%): posiciones HD por título del día seleccionado (default último).
 * Lee el rollup Valuaciones.TenenciaHD vía /api/back-office/tenencia-hd (1×/día hábil).
 */

const CUENTAS = ["100", "255", "256"] as const;
type Cuenta = (typeof CUENTAS)[number];

type DiaRow = { fecha: string; total: number } & Record<Cuenta, number>;
type PosRow = { unidad: string; total: number } & Record<Cuenta, number>;
type DiasResp = { cuentas: string[]; dias: DiaRow[]; ultima_fecha: string | null };
type PosResp = { fecha: string; total: number; posiciones: PosRow[] };

const HDR = "px-3 py-1.5 border-b border-[var(--t-border)] bg-[var(--t-accent)]/10 shrink-0 flex items-center gap-2";
const fmtFecha = (s: string) => { const [y, m, d] = s.split("-"); return d ? `${d}/${m}/${y.slice(2)}` : s; };

async function getJson<T>(url: string): Promise<T | null> {
  try { const r = await fetch(url, { cache: "no-store" }); return r.ok ? ((await r.json()) as T) : null; } catch { return null; }
}

export function TenenciaValorizadaView() {
  const [dias, setDias] = useState<DiaRow[]>([]);
  const [sel, setSel] = useState<string | null>(null);
  const [pos, setPos] = useState<PosResp | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      const d = await getJson<DiasResp>("/api/back-office/tenencia-hd");
      setDias(d?.dias ?? []);
      setSel(d?.ultima_fecha ?? null);
      setLoading(false);
    })();
  }, []);

  useEffect(() => {
    if (!sel) { setPos(null); return; }
    let alive = true;
    void (async () => {
      const d = await getJson<PosResp>(`/api/back-office/tenencia-hd/posiciones?fecha=${sel}`);
      if (alive) setPos(d);
    })();
    return () => { alive = false; };
  }, [sel]);

  return (
    <div className="h-full min-h-0 grid grid-cols-2 gap-3 p-3 overflow-hidden">
      {/* IZQUIERDA — serie diaria por cuenta */}
      <div className="min-h-0 border border-[var(--t-border)] bg-[var(--t-panel)] flex flex-col overflow-hidden">
        <div className={HDR}>
          <span className="text-[10px] uppercase tracking-widest text-[var(--t-accent)]">Tenencia HD por día · ARS</span>
          <span className="text-[9px] text-[var(--t-text-muted)]">{dias.length} días · cuentas 100 / 255 / 256</span>
        </div>
        <div className="flex-1 min-h-0 overflow-auto">
          {loading ? <p className="p-3 text-[11px] text-[var(--t-text-dim)]">cargando…</p>
            : dias.length === 0 ? <p className="p-3 text-[11px] text-[var(--t-text-dim)]">Sin datos. ¿Corrió el backfill / el job diario?</p>
            : (
              <table className="w-full text-[10px]">
                <thead className="sticky top-0 bg-[var(--t-panel)]"><tr className="text-[var(--t-text-muted)]">
                  <th className="text-left !px-2">Fecha</th>
                  {CUENTAS.map((c) => <th key={c} className="text-right !px-2">{c}</th>)}
                  <th className="text-right !px-2">Total</th>
                </tr></thead>
                <tbody>
                  {[...dias].reverse().map((r) => {
                    const on = r.fecha === sel;
                    return (
                      <tr key={r.fecha} onClick={() => setSel(r.fecha)}
                          className={`cursor-pointer ${on ? "bg-[var(--t-accent)]/15" : "hover:bg-[var(--t-border)]"}`}>
                        <td className="!px-2 tabular-nums text-[var(--t-text-dim)]">{fmtFecha(r.fecha)}</td>
                        {CUENTAS.map((c) => <td key={c} className="!px-2 text-right tabular-nums">{fmtMoney(r[c])}</td>)}
                        <td className="!px-2 text-right tabular-nums font-semibold">{fmtMoney(r.total)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
        </div>
      </div>

      {/* DERECHA — posiciones del día seleccionado */}
      <div className="min-h-0 border border-[var(--t-border)] bg-[var(--t-panel)] flex flex-col overflow-hidden">
        <div className={HDR}>
          <span className="text-[10px] uppercase tracking-widest text-[var(--t-accent)]">Posiciones HD · {sel ? fmtFecha(sel) : "—"}</span>
          {pos && <span className="ml-auto text-[9px] font-mono font-semibold text-[var(--t-accent)]">Total {fmtMoney(pos.total)}</span>}
        </div>
        <div className="flex-1 min-h-0 overflow-auto">
          {!sel ? <p className="p-3 text-[11px] text-[var(--t-text-dim)]">Elegí un día a la izquierda.</p>
            : !pos ? <p className="p-3 text-[11px] text-[var(--t-text-dim)]">cargando…</p>
            : pos.posiciones.length === 0 ? <p className="p-3 text-[11px] text-[var(--t-text-dim)]">Sin posiciones HD ese día.</p>
            : (
              <table className="w-full text-[10px]">
                <thead className="sticky top-0 bg-[var(--t-panel)]"><tr className="text-[var(--t-text-muted)]">
                  <th className="text-left !px-2">Título</th>
                  {CUENTAS.map((c) => <th key={c} className="text-right !px-2">{c}</th>)}
                  <th className="text-right !px-2">Total</th>
                </tr></thead>
                <tbody>
                  {pos.posiciones.map((p, i) => (
                    <tr key={`${p.unidad}-${i}`} className="hover:bg-[var(--t-border)]">
                      <td className="!px-2">{p.unidad}</td>
                      {CUENTAS.map((c) => <td key={c} className="!px-2 text-right tabular-nums text-[var(--t-text-dim)]">{p[c] ? fmtMoney(p[c]) : "—"}</td>)}
                      <td className="!px-2 text-right tabular-nums font-semibold">{fmtMoney(p.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
        </div>
      </div>
    </div>
  );
}
