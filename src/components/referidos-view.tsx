"use client";

import { useEffect, useState } from "react";
import { usePersistedState } from "@/lib/use-persisted-state";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { fmtMoney } from "@/lib/fmt-money";

/**
 * /referidos — vista para la EMPRESA referidora. Solo le importan SUS cuentas:
 * cuánto operan, su AuM, los rendimientos/valuación (estilo CARTERAS) y los
 * aranceles que generaron. SIN operador/segmento/ficha.
 *
 * Layout 50/50:
 *   · Izq: chart valuación/AUM (scope o cliente) + tabla de clientes referidos.
 *   · Der: cliente elegido → detalle vol/arancel (mes/año) + posición & PnL títulos.
 * Reusa /comercial/serie (chart), /comercial/referido-clientes (tabla, nuevo),
 * /aum-pnl (posición+PnL). Switch ARS/USD.
 */

type ClienteRow = {
  id_cuenta: string; denominacion: string; aum: number;
  vol_mes: number; vol_ano: number; arancel_mes: number; arancel_total: number;
};
type Resumen = { n_clientes: number; aum_total: number; vol_mes: number; vol_ano: number; arancel_mes: number; arancel_total: number };
type RefResp = { referido: string; moneda: string; clientes: ClienteRow[]; resumen: Resumen };
type SeriePt = { fecha: string; valor: number };
type PnLRow = {
  ticker: string; display_name?: string;
  valor_actual_aum: number; valor_actual_usd?: number | null;
  pnl_no_realizado: number | null; pnl_no_realizado_usd?: number | null;
  pnl_total: number; pnl_total_usd?: number | null;
};
type PnLResp = { rows: PnLRow[]; totales: Record<string, number> };

const TODOS = "__todos__";
const fmtFecha = (s: string) => { const [y, m, d] = s.split("-"); return d ? `${d}/${m}/${y.slice(2)}` : s; };
const pnlColor = (v: number | null | undefined) => (v == null ? "var(--t-text-muted)" : v >= 0 ? "var(--t-pos)" : "var(--t-neg)");

async function getJson<T>(url: string): Promise<T | null> {
  try { const r = await fetch(url, { cache: "no-store" }); return r.ok ? ((await r.json()) as T) : null; } catch { return null; }
}

export function ReferidosView() {
  const [referidos, setReferidos] = useState<{ ref: string; n: number }[]>([]);
  const [referido, setReferido] = usePersistedState<string>("referidos.ref", "");
  const [moneda, setMoneda] = usePersistedState<"ARS" | "USD">("referidos.moneda", "ARS");
  const [data, setData] = useState<RefResp | null>(null);
  const [serie, setSerie] = useState<SeriePt[]>([]);
  const [sel, setSel] = useState<string | null>(null);
  const [pnl, setPnl] = useState<PnLResp | null>(null);
  const [loading, setLoading] = useState(false);

  // Lista de referidos (distinct de /comercial/dimensiones).
  useEffect(() => {
    void (async () => {
      const d = await getJson<{ combos: { referido: string | null; n_cuentas: number }[] }>("/api/operaciones/comercial/dimensiones");
      if (!d) return;
      const m = new Map<string, number>();
      for (const c of d.combos) if (c.referido) m.set(c.referido, (m.get(c.referido) ?? 0) + c.n_cuentas);
      setReferidos([...m.entries()].map(([ref, n]) => ({ ref, n })).sort((a, b) => b.n - a.n));
    })();
  }, []);

  // Clientes + resumen del referido.
  useEffect(() => {
    if (!referido) { setData(null); setSel(null); return; }
    let alive = true;
    setLoading(true);
    void (async () => {
      const d = await getJson<RefResp>(`/api/operaciones/comercial/referido-clientes?referido=${encodeURIComponent(referido)}&moneda=${moneda}`);
      if (alive) { setData(d); setSel(null); setLoading(false); }
    })();
    return () => { alive = false; };
  }, [referido, moneda]);

  // Serie valuación/AUM: scope (referido) o cliente seleccionado.
  useEffect(() => {
    if (!referido) { setSerie([]); return; }
    let alive = true;
    const q = sel
      ? `operador=${TODOS}&metric=aum&moneda=${moneda}&id_cuenta=${encodeURIComponent(sel)}`
      : `operador=${TODOS}&metric=aum&moneda=${moneda}&referido=${encodeURIComponent(referido)}`;
    void (async () => {
      const d = await getJson<{ serie: SeriePt[] }>(`/api/operaciones/comercial/serie?${q}`);
      if (alive) setSerie(d?.serie ?? []);
    })();
    return () => { alive = false; };
  }, [referido, sel, moneda]);

  // PnL + posición del cliente seleccionado.
  useEffect(() => {
    if (!sel) { setPnl(null); return; }
    let alive = true;
    void (async () => {
      const d = await getJson<PnLResp>(`/api/aum-pnl?id_cuenta=${encodeURIComponent(sel)}`);
      if (alive) setPnl(d);
    })();
    return () => { alive = false; };
  }, [sel]);

  const clientes = data?.clientes ?? [];
  const res = data?.resumen;
  const usd = moneda === "USD";
  const selCli = clientes.find((c) => c.id_cuenta === sel) || null;
  const pnlValor = (r: PnLRow) => (usd ? r.valor_actual_usd ?? null : r.valor_actual_aum);
  const pnlNoReal = (r: PnLRow) => (usd ? r.pnl_no_realizado_usd ?? null : r.pnl_no_realizado);
  const pnlTot = (r: PnLRow) => (usd ? r.pnl_total_usd ?? null : r.pnl_total);

  const selCls = "bg-[var(--t-surface)] border text-[var(--t-text)] text-[11px] px-2 py-1 font-mono outline-none";

  return (
    <div className="h-full flex flex-col min-h-0">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-[var(--t-border)] bg-[var(--t-panel)] shrink-0 flex-wrap">
        <span className="text-[11px] font-semibold text-[var(--t-accent)] tracking-wide uppercase">Referidos</span>
        <select value={referido} onChange={(e) => setReferido(e.target.value)} className={selCls + " border-[var(--t-accent)] max-w-[260px]"}>
          <option value="">— Elegí un referido —</option>
          {referidos.map((r) => <option key={r.ref} value={r.ref}>{r.ref} ({r.n})</option>)}
        </select>
        <div className="inline-flex border border-[var(--t-border-2)] divide-x divide-[var(--t-border-2)]">
          {(["ARS", "USD"] as const).map((m) => (
            <button key={m} onClick={() => setMoneda(m)} className={"px-2 py-1 text-[10px] font-semibold " + (moneda === m ? "bg-[var(--t-accent)] text-[var(--t-on-accent)]" : "bg-[var(--t-surface)] text-[var(--t-text-dim)] hover:text-[var(--t-accent)]")}>{m}</button>
          ))}
        </div>
        {res && (
          <div className="ml-auto flex items-center gap-3 text-[10px] font-mono">
            <Kpi label="Clientes" value={String(res.n_clientes)} />
            <Kpi label={`AuM ${moneda}`} value={fmtMoney(res.aum_total)} />
            <Kpi label="Vol mes" value={fmtMoney(res.vol_mes)} />
            <Kpi label="Vol año" value={fmtMoney(res.vol_ano)} />
            <Kpi label="Aran. mes" value={fmtMoney(res.arancel_mes)} accent />
            <Kpi label="Aran. año" value={fmtMoney(res.arancel_total)} accent />
          </div>
        )}
      </div>

      {!referido ? (
        <div className="flex-1 flex items-center justify-center text-[12px] text-[var(--t-text-dim)]">Elegí un referido para ver sus cuentas, operatoria, rendimientos y aranceles.</div>
      ) : (
        <div className="flex-1 min-h-0 grid grid-cols-2 gap-3 p-3 overflow-hidden">
          {/* IZQUIERDA */}
          <div className="min-h-0 flex flex-col gap-3 overflow-hidden">
            <div className="flex-1 min-h-0 border border-[var(--t-border)] flex flex-col overflow-hidden">
              <div className="px-3 py-1.5 border-b border-[var(--t-border)] shrink-0 flex items-center gap-2">
                <span className="text-[10px] uppercase tracking-widest text-[var(--t-accent)]">Valuación / AUM · {moneda}</span>
                <span className="text-[9px] text-[var(--t-text-muted)] truncate">{sel ? (selCli?.denominacion || sel) : "Todo el referido"}</span>
              </div>
              <div className="flex-1 min-h-0 p-1">
                {serie.length === 0 ? <p className="p-3 text-[11px] text-[var(--t-text-dim)]">Sin serie.</p> : (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={serie} margin={{ top: 8, right: 12, bottom: 4, left: 4 }}>
                      <defs><linearGradient id="ref-aum" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--t-accent)" stopOpacity={0.4} /><stop offset="100%" stopColor="var(--t-accent)" stopOpacity={0.03} /></linearGradient></defs>
                      <CartesianGrid strokeDasharray="2 2" stroke="var(--t-border)" />
                      <XAxis dataKey="fecha" tickFormatter={fmtFecha} tick={{ fontSize: 9, fill: "var(--t-text-muted)" }} minTickGap={28} />
                      <YAxis tickFormatter={(v) => fmtMoney(v as number)} tick={{ fontSize: 9, fill: "var(--t-text-muted)" }} width={54} />
                      <Tooltip contentStyle={{ background: "var(--t-panel)", border: "1px solid var(--t-border)", fontSize: 10 }} labelFormatter={(l) => fmtFecha(String(l))} formatter={(v) => [`${moneda} ${fmtMoney(Number(v))}`, "Valuación"]} />
                      <Area type="monotone" dataKey="valor" stroke="var(--t-accent)" strokeWidth={2} fill="url(#ref-aum)" isAnimationActive={false} dot={false} />
                    </AreaChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>

            <div className="flex-1 min-h-0 border border-[var(--t-border)] flex flex-col overflow-hidden">
              <div className="px-3 py-1.5 border-b border-[var(--t-border)] shrink-0 flex items-center gap-2">
                <span className="text-[10px] uppercase tracking-widest text-[var(--t-accent)]">Clientes referidos</span>
                <span className="text-[9px] text-[var(--t-text-muted)]">{clientes.length}</span>
              </div>
              <div className="flex-1 min-h-0 overflow-auto">
                {loading ? <p className="p-3 text-[11px] text-[var(--t-text-dim)]">cargando…</p> : clientes.length === 0 ? <p className="p-3 text-[11px] text-[var(--t-text-dim)]">Sin clientes para este referido.</p> : (
                  <table className="w-full text-[10px]">
                    <thead className="sticky top-0 bg-[var(--t-panel)]"><tr className="text-[var(--t-text-muted)]">
                      <th className="text-left !px-2">Cliente</th><th className="text-left !px-2">Cuenta</th>
                      <th className="text-right !px-2">AuM</th><th className="text-right !px-2">Vol mes</th><th className="text-right !px-2">Vol año</th>
                      <th className="text-right !px-2">Aran. mes</th><th className="text-right !px-2">Aran. año</th>
                    </tr></thead>
                    <tbody>
                      {clientes.map((c) => {
                        const on = c.id_cuenta === sel;
                        return (
                          <tr key={c.id_cuenta} onClick={() => setSel(on ? null : c.id_cuenta)} className={`cursor-pointer ${on ? "bg-[var(--t-accent)]/15" : "hover:bg-[var(--t-border)]"}`}>
                            <td className="!px-2 truncate max-w-[150px]" title={c.denominacion}>{c.denominacion}</td>
                            <td className="!px-2 tabular-nums text-[var(--t-text-dim)]">{c.id_cuenta}</td>
                            <td className="!px-2 text-right tabular-nums">{fmtMoney(c.aum)}</td>
                            <td className="!px-2 text-right tabular-nums">{fmtMoney(c.vol_mes)}</td>
                            <td className="!px-2 text-right tabular-nums">{fmtMoney(c.vol_ano)}</td>
                            <td className="!px-2 text-right tabular-nums text-[var(--t-accent)]">{fmtMoney(c.arancel_mes)}</td>
                            <td className="!px-2 text-right tabular-nums text-[var(--t-accent)]">{fmtMoney(c.arancel_total)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </div>

          {/* DERECHA */}
          <div className="min-h-0 flex flex-col gap-3 overflow-hidden">
            {!sel || !selCli ? (
              <div className="flex-1 flex items-center justify-center border border-[var(--t-border)] p-3 text-center text-[11px] text-[var(--t-text-dim)]">Elegí un cliente para ver su detalle, posición y PnL de títulos.</div>
            ) : (
              <>
                <div className="shrink-0 border border-[var(--t-border)] p-3">
                  <div className="text-[12px] font-semibold truncate" title={selCli.denominacion}>{selCli.denominacion}</div>
                  <div className="text-[9px] text-[var(--t-text-muted)] tabular-nums mb-2">Cuenta {selCli.id_cuenta} · AuM {moneda} {fmtMoney(selCli.aum)}</div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[10px] font-mono">
                    <Det label={`Vol mes ${moneda}`} value={fmtMoney(selCli.vol_mes)} />
                    <Det label={`Vol año ${moneda}`} value={fmtMoney(selCli.vol_ano)} />
                    <Det label={`Arancel mes ${moneda}`} value={fmtMoney(selCli.arancel_mes)} accent />
                    <Det label={`Arancel año ${moneda}`} value={fmtMoney(selCli.arancel_total)} accent />
                  </div>
                </div>

                <div className="flex-1 min-h-0 border border-[var(--t-border)] flex flex-col overflow-hidden">
                  <div className="px-3 py-1.5 border-b border-[var(--t-border)] shrink-0">
                    <span className="text-[10px] uppercase tracking-widest text-[var(--t-accent)]">Posición & PnL títulos · {moneda}</span>
                  </div>
                  <div className="flex-1 min-h-0 overflow-auto">
                    {!pnl ? <p className="p-3 text-[11px] text-[var(--t-text-dim)]">cargando…</p> : (pnl.rows?.length ?? 0) === 0 ? <p className="p-3 text-[11px] text-[var(--t-text-dim)]">Sin posición.</p> : (
                      <table className="w-full text-[10px]">
                        <thead className="sticky top-0 bg-[var(--t-panel)]"><tr className="text-[var(--t-text-muted)]">
                          <th className="text-left !px-2">Ticker</th><th className="text-right !px-2">Valor</th><th className="text-right !px-2">PnL no real.</th><th className="text-right !px-2">PnL total</th>
                        </tr></thead>
                        <tbody>
                          {pnl.rows.map((r, i) => (
                            <tr key={`${r.ticker}-${i}`} className="hover:bg-[var(--t-border)]">
                              <td className="!px-2 font-semibold">{r.display_name || r.ticker}</td>
                              <td className="!px-2 text-right tabular-nums">{fmtMoney(pnlValor(r) ?? undefined)}</td>
                              <td className="!px-2 text-right tabular-nums" style={{ color: pnlColor(pnlNoReal(r)) }}>{fmtMoney(pnlNoReal(r) ?? undefined)}</td>
                              <td className="!px-2 text-right tabular-nums font-semibold" style={{ color: pnlColor(pnlTot(r)) }}>{fmtMoney(pnlTot(r) ?? undefined)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Kpi({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex flex-col items-end">
      <span className="text-[8px] uppercase tracking-wide text-[var(--t-text-muted)]">{label}</span>
      <span className={"font-semibold " + (accent ? "text-[var(--t-accent)]" : "text-[var(--t-text)]")}>{value}</span>
    </div>
  );
}

function Det({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-[var(--t-text-muted)]">{label}</span>
      <span className={"tabular-nums font-semibold " + (accent ? "text-[var(--t-accent)]" : "")}>{value}</span>
    </div>
  );
}
