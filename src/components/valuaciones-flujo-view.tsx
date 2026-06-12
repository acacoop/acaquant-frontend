"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { CuentaCombobox, type CuentaDoc } from "@/components/aum-view";

// ── Tipos ───────────────────────────────────────────────────────────────────
type Categoria = "COMPRAS" | "VENTAS" | "RESCATES" | "SUSCRIPCIONES" | "OTROS";
const COLUMNAS: Categoria[] = ["COMPRAS", "VENTAS", "RESCATES", "SUSCRIPCIONES", "OTROS"];

interface FilaResumen {
  mes: string;
  COMPRAS: number; VENTAS: number; RESCATES: number; SUSCRIPCIONES: number; OTROS: number;
  neto: number;
}
interface ResumenResp {
  desde: string; hasta: string;
  filas: FilaResumen[]; totales: Record<Categoria, number>; neto_total: number;
}
interface Mov {
  comprobante: string; fecha: string | null; categoria: Categoria;
  op: string | null; ticker: string | null; importe: number;
  moneda: string | null; importe_ars: number; incluido: boolean;
}
interface MensualRow {
  mes: string; ultimo_dia: string | null;
  valuacion_cierre: number; flujo_neto: number;
  delta_real: number | null; tem_periodo: number | null; twr_base100: number;
  valuacion_cierre_usd: number; flujo_neto_usd: number;
  delta_real_usd: number | null; tem_periodo_usd: number | null; twr_base100_usd: number;
}
interface MensualResp { meses: MensualRow[]; }
interface Posicion { ticker: string; cantidad: number; precio: number; valuacion: number }
interface TenenciasResp { fecha: string | null; posiciones: Posicion[]; total: number; n: number }

// ── Formato ──────────────────────────────────────────────────────────────────
function fmtC(n: number): string {
  const a = Math.abs(n), s = n < 0 ? "-" : "";
  if (a >= 1e12) return `${s}$${(a / 1e12).toFixed(2)}B`;
  if (a >= 1e9) return `${s}$${(a / 1e9).toFixed(2)}MM`;
  if (a >= 1e6) return `${s}$${(a / 1e6).toFixed(2)}M`;
  if (a >= 1e3) return `${s}$${(a / 1e3).toFixed(1)}K`;
  return `${s}$${a.toFixed(0)}`;
}
const fmtN = (n: number) => n.toLocaleString("es-AR", { maximumFractionDigits: 0 });
function pct(v: number | null): string {
  if (v == null) return "—";
  return `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`;
}
const _MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
function mesLabel(mes: string): string {
  const [y, m] = mes.split("-");
  return `${_MESES[Number(m) - 1] ?? m} ${y.slice(2)}`;
}
function pnlClass(n: number | null | undefined): string {
  if (n == null) return "text-[var(--t-text-dim)]";
  return n > 0 ? "text-[var(--t-pos)]" : n < 0 ? "text-[var(--t-neg)]" : "text-[var(--t-text-dim)]";
}

function _today(): string {
  if (typeof window === "undefined") return "";
  const d = new Date(), p = (x: number) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
function _yearStart(): string {
  if (typeof window === "undefined") return "";
  return `${new Date().getFullYear()}-01-01`;
}
function _readUrlParam(name: string): string | null {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get(name);
}

// ── Shell (cuenta) ───────────────────────────────────────────────────────────
export function ValuacionesFlujoShell() {
  const [cuentas, setCuentas] = useState<CuentaDoc[]>([]);
  const [idCuenta, setIdCuenta] = useState<string>(() => _readUrlParam("cuenta") || "");

  useEffect(() => {
    fetch("/api/portfolio-cuentas", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then((d: { cuentas: CuentaDoc[] }) => {
        const list = d.cuentas || [];
        setCuentas(list);
        if (list.length && !idCuenta) setIdCuenta((list.find((c) => c.id_cuenta === "100") || list[0]).id_cuenta);
      })
      .catch(() => {});
  }, [idCuenta]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    if (idCuenta) url.searchParams.set("cuenta", idCuenta); else url.searchParams.delete("cuenta");
    window.history.replaceState(null, "", url.toString());
  }, [idCuenta]);

  const idx = cuentas.findIndex((c) => c.id_cuenta === idCuenta);
  const prev = idx > 0 ? cuentas[idx - 1].id_cuenta : null;
  const next = idx >= 0 && idx < cuentas.length - 1 ? cuentas[idx + 1].id_cuenta : null;

  return (
    <div className="h-full flex flex-col min-h-0">
      <div className="flex items-center gap-3 px-3 py-2 border-b border-[var(--t-border)] bg-[var(--t-panel)] shrink-0">
        <span className="text-[9px] tracking-widest text-[var(--t-text-muted)]">CUENTA</span>
        <button onClick={() => prev && setIdCuenta(prev)} disabled={!prev} title="Anterior"
          className="px-1 py-0.5 text-[10px] text-[var(--t-text-dim)] border border-[var(--t-border-2)] hover:text-[var(--t-accent)] disabled:text-[#333] disabled:cursor-not-allowed">◀</button>
        <CuentaCombobox cuentas={cuentas} value={idCuenta} onChange={setIdCuenta} />
        <button onClick={() => next && setIdCuenta(next)} disabled={!next} title="Siguiente"
          className="px-1 py-0.5 text-[10px] text-[var(--t-text-dim)] border border-[var(--t-border-2)] hover:text-[var(--t-accent)] disabled:text-[#333] disabled:cursor-not-allowed">▶</button>
      </div>
      <div className="flex-1 min-h-0">
        {idCuenta ? <FlujoView idCuenta={idCuenta} /> : (
          <div className="h-full flex items-center justify-center text-[var(--t-text-muted)] text-sm">Cargando cuentas…</div>
        )}
      </div>
    </div>
  );
}

// ── Vista (4 paneles) ────────────────────────────────────────────────────────
function FlujoView({ idCuenta }: { idCuenta: string }) {
  const [desde, setDesde] = useState<string>(_yearStart);
  const [hasta, setHasta] = useState<string>(_today);
  const [resumen, setResumen] = useState<ResumenResp | null>(null);
  const [err, setErr] = useState<string | null>(null);

  // detalle (panel izq-der)
  const [selCat, setSelCat] = useState<Categoria | null>(null);
  const [selMes, setSelMes] = useState<string | null>(null);
  const [detalle, setDetalle] = useState<Mov[]>([]);
  const [detLoading, setDetLoading] = useState(false);

  // mensual (panel der-arriba)
  const [mensual, setMensual] = useState<MensualRow[]>([]);
  const [esUSD, setEsUSD] = useState(false);

  // tenencias (panel der-abajo)
  const [tenFecha, setTenFecha] = useState<string | null>(null);
  const [tenencias, setTenencias] = useState<TenenciasResp | null>(null);

  const qs = useMemo(() => {
    const p = new URLSearchParams({ id_cuenta: idCuenta });
    if (desde) p.set("desde", desde);
    if (hasta) p.set("hasta", hasta);
    return p.toString();
  }, [idCuenta, desde, hasta]);

  const cargarResumen = useCallback(() => {
    setErr(null);
    fetch(`/api/valuaciones-flujo/resumen?${qs}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d: ResumenResp) => setResumen(d))
      .catch((e) => setErr(e instanceof Error ? e.message : "error"));
  }, [qs]);

  const cargarMensual = useCallback(() => {
    fetch(`/api/valuaciones-flujo/mensual?id_cuenta=${encodeURIComponent(idCuenta)}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d: MensualResp) => {
        const ms = d.meses || [];
        setMensual(ms);
        if (ms.length && !tenFecha) setTenFecha(ms[0].ultimo_dia);
      })
      .catch(() => setMensual([]));
  }, [idCuenta, tenFecha]);

  useEffect(() => { cargarResumen(); }, [cargarResumen]);
  useEffect(() => { setTenFecha(null); cargarMensual(); /* eslint-disable-next-line */ }, [idCuenta]);

  // tenencias al cambiar el mes elegido
  useEffect(() => {
    if (!tenFecha) { setTenencias(null); return; }
    fetch(`/api/valuaciones-flujo/tenencias?id_cuenta=${encodeURIComponent(idCuenta)}&fecha=${tenFecha}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error())))
      .then((d: TenenciasResp) => setTenencias(d))
      .catch(() => setTenencias(null));
  }, [idCuenta, tenFecha]);

  const cargarDetalle = useCallback((cat: Categoria, mes: string | null) => {
    setDetLoading(true);
    const p = new URLSearchParams({ id_cuenta: idCuenta, categoria: cat });
    if (desde) p.set("desde", desde);
    if (hasta) p.set("hasta", hasta);
    if (mes) p.set("mes", mes);
    fetch(`/api/valuaciones-flujo/movimientos?${p.toString()}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error())))
      .then((d: { movimientos: Mov[] }) => setDetalle(d.movimientos || []))
      .catch(() => setDetalle([]))
      .finally(() => setDetLoading(false));
  }, [idCuenta, desde, hasta]);

  const seleccionar = (cat: Categoria, mes: string | null) => { setSelCat(cat); setSelMes(mes); cargarDetalle(cat, mes); };

  async function toggle(mov: Mov) {
    const nuevo = !mov.incluido;
    setDetalle((p) => p.map((m) => (m.comprobante === mov.comprobante ? { ...m, incluido: nuevo } : m)));
    try {
      const r = await fetch("/api/valuaciones-flujo/seleccion", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id_cuenta: idCuenta, comprobante: mov.comprobante, incluido: nuevo }),
      });
      if (!r.ok) throw new Error();
      cargarResumen(); cargarMensual(); // el flujo del XIRR también cambia
    } catch {
      setDetalle((p) => p.map((m) => (m.comprobante === mov.comprobante ? { ...m, incluido: mov.incluido } : m)));
    }
  }

  // PnL acum (suma corrida de delta_real, cronológico asc → guardado por mes).
  const pnlAcum = useMemo(() => {
    const asc = [...mensual].reverse();
    const map = new Map<string, number>();
    let acc = 0;
    for (const m of asc) {
      const d = esUSD ? m.delta_real_usd : m.delta_real;
      if (d != null) acc += d;
      map.set(m.mes, acc);
    }
    return map;
  }, [mensual, esUSD]);

  const cell = (n: number) => (n ? fmtC(n) : "—");

  return (
    <div className="h-full flex flex-col gap-2 p-3 overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center gap-2 text-[10px] shrink-0">
        <span className="text-[9px] tracking-widest text-[var(--t-text-muted)]">DESDE</span>
        <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className="bg-[var(--t-surface)] border border-[var(--t-border-2)] px-1 py-0.5 text-[var(--t-text)]" />
        <span className="text-[9px] tracking-widest text-[var(--t-text-muted)]">HASTA</span>
        <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className="bg-[var(--t-surface)] border border-[var(--t-border-2)] px-1 py-0.5 text-[var(--t-text)]" />
        {resumen && <span className="ml-auto text-[9px] text-[var(--t-text-muted)] font-mono">NETO flujo: <span className="text-[var(--t-accent)] font-semibold">{fmtC(resumen.neto_total)}</span></span>}
      </div>
      {err && <div className="text-[11px] text-[var(--t-neg)] shrink-0">Error: {err}</div>}

      <div className="flex-1 min-h-0 flex gap-3">
        {/* IZQUIERDA 50%: resumen (arriba) / detalle (abajo) */}
        <div className="w-1/2 flex flex-col gap-2 min-h-0">
          {/* resumen */}
          <div className="h-1/2 border border-[var(--t-border)] bg-[var(--t-panel)] overflow-auto min-h-0">
            <table className="w-full text-[10px] font-mono">
              <thead className="sticky top-0 bg-[var(--t-surface)] border-b border-[var(--t-border)] z-10 text-[8px] tracking-widest text-[var(--t-text-dim)]">
                <tr>
                  <th className="px-2 py-1.5 text-left">MES</th>
                  {COLUMNAS.map((c) => (
                    <th key={c} onClick={() => seleccionar(c, null)} title={`Detalle ${c}`}
                      className={`px-1 py-1.5 text-right cursor-pointer hover:text-[var(--t-accent)] ${selCat === c && !selMes ? "text-[var(--t-accent)]" : ""}`}>{c}</th>
                  ))}
                  <th className="px-2 py-1.5 text-right">NETO</th>
                </tr>
              </thead>
              <tbody>
                {!resumen || resumen.filas.length === 0 ? (
                  <tr><td colSpan={COLUMNAS.length + 2} className="p-4 text-center text-[var(--t-text-muted)]">Sin movs.</td></tr>
                ) : resumen.filas.map((f) => (
                  <tr key={f.mes} className="border-b border-[var(--t-border)] hover:bg-[var(--t-accent)]/5">
                    <td className="px-2 py-1 text-[var(--t-text)]">{f.mes}</td>
                    {COLUMNAS.map((c) => (
                      <td key={c} onClick={() => f[c] && seleccionar(c, f.mes)}
                        className={`px-1 py-1 text-right ${f[c] ? "cursor-pointer hover:text-[var(--t-accent)]" : ""} ${selCat === c && selMes === f.mes ? "bg-[var(--t-accent)]/15 text-[var(--t-accent)]" : "text-[var(--t-text-dim)]"}`}>{f[c] ? fmtC(f[c]) : "—"}</td>
                    ))}
                    <td className="px-2 py-1 text-right text-[var(--t-text)] font-semibold">{fmtC(f.neto)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* detalle */}
          <div className="h-1/2 border border-[var(--t-border)] bg-[var(--t-panel)] flex flex-col min-h-0 overflow-hidden">
            {!selCat ? (
              <div className="h-full flex items-center justify-center text-center text-[var(--t-text-muted)] text-[10px] px-3">Tocá una categoría para ver/excluir sus movimientos.</div>
            ) : (
              <>
                <div className="px-2 py-1.5 border-b border-[var(--t-border)] bg-[var(--t-surface)] flex items-center gap-2 shrink-0 text-[10px]">
                  <span className="font-semibold text-[var(--t-accent)]">{selCat}</span>
                  {selMes && <span className="text-[9px] text-[var(--t-text-muted)]">· {selMes}</span>}
                  <span className="ml-auto text-[8px] text-[var(--t-text-muted)] font-mono">{detalle.filter((m) => m.incluido).length}/{detalle.length}</span>
                </div>
                <div className="flex-1 min-h-0 overflow-auto">
                  {detLoading ? <div className="p-3 text-[10px] text-[var(--t-text-muted)]">Cargando…</div> : (
                    <table className="w-full text-[10px] font-mono">
                      <tbody>
                        {detalle.map((m, i) => (
                          <tr key={`${m.comprobante}-${i}`} className={"border-b border-[var(--t-border)] " + (m.incluido ? "" : "opacity-40")}>
                            <td className="px-1 py-1 text-center">
                              <button onClick={() => toggle(m)} title={m.incluido ? "Excluir" : "Incluir"}
                                className={`px-1.5 py-0.5 text-[8px] font-bold border ${m.incluido ? "bg-[var(--t-pos)]/15 text-[var(--t-pos)] border-[var(--t-pos)]/40" : "bg-[var(--t-neg)]/10 text-[var(--t-neg)] border-[var(--t-neg)]/40"}`}>{m.incluido ? "SÍ" : "NO"}</button>
                            </td>
                            <td className="px-1 py-1 text-[var(--t-text-dim)]">{m.fecha}</td>
                            <td className="px-1 py-1 text-[var(--t-text)] truncate max-w-[120px]" title={m.op || ""}>{m.ticker || m.op || "—"}</td>
                            <td className="px-1 py-1 text-right text-[var(--t-text)]">{fmtC(m.importe_ars)}</td>
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

        {/* DERECHA 50%: mensual (arriba) | tenencias (abajo) */}
        <div className="w-1/2 flex flex-col gap-2 min-h-0">
          {/* mensual estilo Carteras */}
          <div className="h-1/2 border border-[var(--t-border)] bg-[var(--t-panel)] flex flex-col min-h-0 overflow-hidden">
            <div className="px-2 py-1.5 border-b border-[var(--t-border)] bg-[var(--t-surface)] flex items-center gap-2 shrink-0">
              <span className="text-[9px] tracking-widest text-[var(--t-text-dim)]">MENSUAL · TEA/TEM (XIRR con flujo = neto movs)</span>
              <div className="ml-auto flex gap-1">
                {(["ARS", "USD"] as const).map((m) => (
                  <button key={m} onClick={() => setEsUSD(m === "USD")}
                    className={`px-2 py-0.5 text-[9px] font-semibold border ${(esUSD ? "USD" : "ARS") === m ? "bg-[var(--t-accent)] text-[var(--t-on-accent)] border-[var(--t-accent)]" : "text-[var(--t-text-dim)] border-[var(--t-border-2)]"}`}>{m}</button>
                ))}
              </div>
            </div>
            <div className="flex-1 min-h-0 overflow-auto">
              <table className="w-full text-[10px] font-mono">
                <thead className="sticky top-0 bg-[var(--t-surface)] border-b border-[var(--t-border)] z-10 text-[8px] tracking-widest text-[var(--t-text-dim)]">
                  <tr>
                    <th className="px-2 py-1.5 text-left">MES</th>
                    <th className="px-1 py-1.5 text-right">CIERRE</th>
                    <th className="px-1 py-1.5 text-right">FLUJO NETO</th>
                    <th className="px-1 py-1.5 text-right">Δ VALOR</th>
                    <th className="px-1 py-1.5 text-right">PNL ACUM</th>
                    <th className="px-1 py-1.5 text-right">TEM MES</th>
                    <th className="px-1 py-1.5 text-right">TEA CART.</th>
                  </tr>
                </thead>
                <tbody>
                  {mensual.length === 0 ? (
                    <tr><td colSpan={7} className="p-4 text-center text-[var(--t-text-muted)]">Sin datos.</td></tr>
                  ) : mensual.map((m) => {
                    const cierre = esUSD ? m.valuacion_cierre_usd : m.valuacion_cierre;
                    const flujo = esUSD ? m.flujo_neto_usd : m.flujo_neto;
                    const dv = esUSD ? m.delta_real_usd : m.delta_real;
                    const tem = esUSD ? m.tem_periodo_usd : m.tem_periodo;
                    const teaCart = (esUSD ? m.twr_base100_usd : m.twr_base100) - 100;
                    const acum = pnlAcum.get(m.mes) ?? null;
                    const sel = tenFecha === m.ultimo_dia;
                    return (
                      <tr key={m.mes} onClick={() => setTenFecha(m.ultimo_dia)}
                        className={`border-b border-[var(--t-border)] cursor-pointer ${sel ? "bg-[var(--t-accent)]/15" : "hover:bg-[var(--t-accent)]/5"}`}>
                        <td className="px-2 py-1 text-[var(--t-text)]">{mesLabel(m.mes)}</td>
                        <td className="px-1 py-1 text-right text-[var(--t-text)]">{cell(cierre)}</td>
                        <td className={`px-1 py-1 text-right ${pnlClass(flujo)}`}>{cell(flujo)}</td>
                        <td className={`px-1 py-1 text-right ${pnlClass(dv)}`}>{dv != null ? fmtC(dv) : "—"}</td>
                        <td className={`px-1 py-1 text-right ${pnlClass(acum)}`}>{acum != null ? fmtC(acum) : "—"}</td>
                        <td className={`px-1 py-1 text-right ${pnlClass(tem)}`}>{tem != null ? pct(tem * 100) : "—"}</td>
                        <td className={`px-1 py-1 text-right ${pnlClass(teaCart)}`}>{pct(teaCart)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* tenencias al mes */}
          <div className="h-1/2 border border-[var(--t-border)] bg-[var(--t-panel)] flex flex-col min-h-0 overflow-hidden">
            <div className="px-2 py-1.5 border-b border-[var(--t-border)] bg-[var(--t-surface)] flex items-center gap-2 shrink-0 text-[9px] tracking-widest text-[var(--t-text-dim)]">
              TENENCIAS {tenencias?.fecha ? `· ${tenencias.fecha}` : ""}
              {tenencias && <span className="ml-auto font-mono text-[var(--t-text)]">{fmtC(tenencias.total)}</span>}
            </div>
            <div className="flex-1 min-h-0 overflow-auto">
              {!tenencias ? (
                <div className="p-3 text-[10px] text-[var(--t-text-muted)]">Tocá un mes para ver las tenencias al cierre.</div>
              ) : (
                <table className="w-full text-[10px] font-mono">
                  <thead className="sticky top-0 bg-[var(--t-surface)] border-b border-[var(--t-border)] z-10 text-[8px] tracking-widest text-[var(--t-text-dim)]">
                    <tr><th className="px-2 py-1 text-left">TICKER</th><th className="px-1 py-1 text-right">CANT</th><th className="px-1 py-1 text-right">PRECIO</th><th className="px-2 py-1 text-right">VALUACIÓN</th></tr>
                  </thead>
                  <tbody>
                    {tenencias.posiciones.map((p, i) => (
                      <tr key={`${p.ticker}-${i}`} className="border-b border-[var(--t-border)]">
                        <td className="px-2 py-1 text-[var(--t-text)] truncate max-w-[180px]" title={p.ticker}>{p.ticker}</td>
                        <td className="px-1 py-1 text-right text-[var(--t-text-dim)]">{fmtN(p.cantidad)}</td>
                        <td className="px-1 py-1 text-right text-[var(--t-text-dim)]">{p.precio.toLocaleString("es-AR", { maximumFractionDigits: 2 })}</td>
                        <td className="px-2 py-1 text-right text-[var(--t-text)]">{fmtC(p.valuacion)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
