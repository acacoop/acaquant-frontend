"use client";

import { useEffect, useState } from "react";
import { usePersistedState } from "@/lib/use-persisted-state";

/**
 * Back Office → Tenencia Valorizada. Cartera HD de las cuentas propias 100/255/256.
 * Izquierda (50%): 1 fila por día (fecha snapshot) × AuM HD de cada cuenta + total,
 * con el TC (MEP) usado ese día. Derecha (50%): posiciones HD por título del día
 * seleccionado. Switch ARS/USD (USD = ARS ÷ TC congelado del día). Números completos
 * (sin abreviar). Lee Valuaciones.TenenciaHD vía /api/back-office/tenencia-hd.
 */

const CUENTAS = ["100", "255", "256"] as const;
type Cuenta = (typeof CUENTAS)[number];

type DiaRow = { fecha: string; tc: number | null; total: number } & Record<Cuenta, number>;
type PosRow = { unidad: string; total: number } & Record<Cuenta, number>;
type DiasResp = { cuentas: string[]; dias: DiaRow[]; ultima_fecha: string | null };
type PosResp = { fecha: string; tc: number | null; total: number; posiciones: PosRow[] };

const HDR = "px-3 py-1.5 border-b border-[var(--t-border)] bg-[var(--t-accent)]/10 shrink-0 flex items-center gap-2 flex-wrap";
const fmtFecha = (s: string) => { const [y, m, d] = s.split("-"); return d ? `${d}/${m}/${y.slice(2)}` : s; };
// Número completo, sin abreviar (separador de miles es-AR), 0 decimales.
const fmtFull = (v: number | null | undefined) => (v == null ? "—" : Math.round(v).toLocaleString("es-AR"));
const fmtTC = (v: number | null | undefined) => (v == null ? "—" : v.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));

async function getJson<T>(url: string): Promise<T | null> {
  try { const r = await fetch(url, { cache: "no-store" }); return r.ok ? ((await r.json()) as T) : null; } catch { return null; }
}

export function TenenciaValorizadaView() {
  const [dias, setDias] = useState<DiaRow[]>([]);
  const [sel, setSel] = useState<string | null>(null);
  const [pos, setPos] = useState<PosResp | null>(null);
  const [loading, setLoading] = useState(true);
  const [moneda, setMoneda] = usePersistedState<"ARS" | "USD">("tenencia.moneda", "USD");
  const usd = moneda === "USD";

  // Convierte un valor ARS a la moneda elegida usando el TC (MEP) de ESE día.
  const cv = (ars: number | null | undefined, tc: number | null): number | null => {
    if (ars == null) return null;
    if (!usd) return ars;
    return tc ? ars / tc : null;
  };

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
          <span className="text-[10px] uppercase tracking-widest text-[var(--t-accent)]">Tenencia HD por día · {moneda}</span>
          <span className="text-[9px] text-[var(--t-text-muted)]">{dias.length} días · 100 / 255 / 256</span>
          <div className="ml-auto inline-flex border border-[var(--t-border-2)] divide-x divide-[var(--t-border-2)]">
            {(["ARS", "USD"] as const).map((m) => (
              <button key={m} onClick={() => setMoneda(m)}
                className={"px-2 py-0.5 text-[10px] font-semibold " + (moneda === m ? "bg-[var(--t-accent)] text-[var(--t-on-accent)]" : "bg-[var(--t-surface)] text-[var(--t-text-dim)] hover:text-[var(--t-accent)]")}>{m}</button>
            ))}
          </div>
        </div>
        <div className="flex-1 min-h-0 overflow-auto">
          {loading ? <p className="p-3 text-[11px] text-[var(--t-text-dim)]">cargando…</p>
            : dias.length === 0 ? <p className="p-3 text-[11px] text-[var(--t-text-dim)]">Sin datos. ¿Corrió el backfill / el job diario?</p>
            : (
              <table className="w-full text-[10px]">
                <thead className="sticky top-0 bg-[var(--t-panel)]"><tr className="text-[var(--t-text-muted)]">
                  <th className="text-left !px-2">Fecha</th>
                  <th className="text-right !px-2">TC</th>
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
                        <td className="!px-2 text-right tabular-nums text-[var(--t-text-muted)]">{fmtTC(r.tc)}</td>
                        {CUENTAS.map((c) => <td key={c} className="!px-2 text-right tabular-nums">{fmtFull(cv(r[c], r.tc))}</td>)}
                        <td className="!px-2 text-right tabular-nums font-semibold">{fmtFull(cv(r.total, r.tc))}</td>
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
          <span className="text-[10px] uppercase tracking-widest text-[var(--t-accent)]">Posiciones HD · {sel ? fmtFecha(sel) : "—"} · {moneda}</span>
          {pos && <span className="ml-auto text-[9px] font-mono text-[var(--t-text-muted)]">TC {fmtTC(pos.tc)} · Total <span className="font-semibold text-[var(--t-accent)]">{fmtFull(cv(pos.total, pos.tc))}</span></span>}
        </div>
        <div className="flex-1 min-h-0 overflow-auto">
          {!sel ? <p className="p-3 text-[11px] text-[var(--t-text-dim)]">Elegí un día a la izquierda.</p>
            : !pos ? <p className="p-3 text-[11px] text-[var(--t-text-dim)]">cargando…</p>
            : usd && !pos.tc ? <p className="p-3 text-[11px] text-[var(--t-text-dim)]">Sin TC para ese día — no se puede dolarizar.</p>
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
                      {CUENTAS.map((c) => <td key={c} className="!px-2 text-right tabular-nums text-[var(--t-text-dim)]">{p[c] ? fmtFull(cv(p[c], pos.tc)) : "—"}</td>)}
                      <td className="!px-2 text-right tabular-nums font-semibold">{fmtFull(cv(p.total, pos.tc))}</td>
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
