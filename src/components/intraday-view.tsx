"use client";

import { useEffect, useMemo, useState } from "react";

// Monitor intradía de renta variable. Sube el CSV de boletos del día (export
// ROFEX/Aunesa, formato AR) y el backend (api/services/intraday.py) consolida
// por (cuenta, especie) con FIFO. Acá: filtro por cuenta, mark editable a mano
// (cuando el feed no tiene la especie), costo en book, detalle de operaciones
// por posición y un simulador de precio. Persiste en sessionStorage.

interface Trade {
  hora: string;
  lado: string;
  precio: number;
  cantidad: number;
  monto: number;
  pos_acum: number;
  ponderado_acum: number;
  interes: number;
  iva: number;
}
interface Posicion {
  cuenta: string;
  especie: string;
  moneda: string;
  n_ops: number;
  compras_qty: number;
  ventas_qty: number;
  qty_neta: number;
  estado: "LONG" | "SHORT" | "CERRADA";
  precio_ponderado: number | null;
  mark: number;
  mark_source: "live" | "csv";
  mark_updated_at: string | null;
  pnl_realizado: number;
  intereses: number;
  iva: number;
  trades: Trade[];
}
interface Resultado {
  archivo: string | null;
  filas_validas: number;
  posiciones: Posicion[];
  timestamp: number;
}

const STORAGE_KEY = "intraday_fifo_v2";
const EXCL_KEY = "intraday_excl_v1";
const PASOS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2];

const keyOf = (p: Posicion) => `${p.especie}|${p.cuenta}`;

// Especies destildadas (no cuentan como daytrade). Persiste en sessionStorage.
function loadExcl(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = sessionStorage.getItem(EXCL_KEY);
    if (raw) {
      const a = JSON.parse(raw);
      if (Array.isArray(a)) return new Set(a as string[]);
    }
  } catch {
    /* ignore */
  }
  return new Set();
}

function loadResultado(): Resultado | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Resultado;
      if (parsed?.posiciones && Array.isArray(parsed.posiciones)) return parsed;
    }
  } catch {
    /* storage corrupto/disabled */
  }
  return null;
}

function fmtNum(n: number | null | undefined, d = 2): string {
  if (n === null || n === undefined) return "—";
  return n.toLocaleString("es-AR", { minimumFractionDigits: d, maximumFractionDigits: d });
}
function fmtSigned(n: number, d = 0): string {
  const s = n.toLocaleString("es-AR", { minimumFractionDigits: d, maximumFractionDigits: d });
  return n > 0 ? `+${s}` : s;
}
function pnlColor(n: number): string {
  if (Math.abs(n) < 1e-9) return "#888";
  return n > 0 ? "var(--t-pos)" : "var(--t-neg)";
}
function estadoColor(e: string): string {
  if (e === "LONG") return "var(--t-pos)";
  if (e === "SHORT") return "var(--t-neg)";
  return "#888";
}

// PnL derivado del mark EFECTIVO (override manual o el del backend).
function derive(p: Posicion, mark: number) {
  const abierta = Math.abs(p.qty_neta) > 1e-9;
  const ponder = p.precio_ponderado ?? 0;
  const noreal = abierta ? p.qty_neta * (mark - ponder) : 0;
  const bruto = p.pnl_realizado + noreal;
  const neto = bruto - p.intereses - p.iva;
  const costo = abierta ? p.qty_neta * ponder : 0; // plata puesta (long +, short −)
  return { noreal, bruto, neto, costo };
}

export function IntradayView() {
  const [resultado, setResultado] = useState<Resultado | null>(loadResultado);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const [cuentaFiltro, setCuentaFiltro] = useState<string>("todas");
  const [simSel, setSimSel] = useState<string>("__todas__");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [markOv, setMarkOv] = useState<Record<string, number>>({});
  const [excluidas, setExcluidas] = useState<Set<string>>(loadExcl);

  useEffect(() => {
    try {
      sessionStorage.setItem(EXCL_KEY, JSON.stringify([...excluidas]));
    } catch {
      /* ignore */
    }
  }, [excluidas]);

  const toggleIncl = (p: Posicion) => {
    const k = keyOf(p);
    setExcluidas((prev) => {
      const n = new Set(prev);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });
  };

  const onFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setCargando(true);
    try {
      const buf = await file.arrayBuffer();
      const text = new TextDecoder("iso-8859-1").decode(buf); // export viene en latin-1
      const res = await fetch("/api/operaciones/intraday/analizar", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ csv: text, archivo: file.name }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.detail || `Error ${res.status}`);
      }
      const data = (await res.json()) as Resultado;
      data.timestamp = Date.now();
      setResultado(data);
      setMarkOv({});
      setExpanded(new Set());
      setExcluidas(new Set());
      setCuentaFiltro("todas");
      setSimSel("__todas__");
      try {
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      } catch {
        /* quota */
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setCargando(false);
      e.target.value = "";
    }
  };

  const limpiar = () => {
    setResultado(null);
    setError(null);
    setMarkOv({});
    setExpanded(new Set());
    setExcluidas(new Set());
    sessionStorage.removeItem(STORAGE_KEY);
  };

  const cuentas = useMemo(() => {
    const s = new Set<string>();
    (resultado?.posiciones ?? []).forEach((p) => s.add(p.cuenta));
    return Array.from(s).sort();
  }, [resultado]);

  const posiciones = useMemo(() => {
    const all = resultado?.posiciones ?? [];
    return cuentaFiltro === "todas" ? all : all.filter((p) => p.cuenta === cuentaFiltro);
  }, [resultado, cuentaFiltro]);

  const effMark = (p: Posicion) => markOv[keyOf(p)] ?? p.mark;

  const abiertas = useMemo(
    () => posiciones.filter((p) => p.estado !== "CERRADA" && !excluidas.has(keyOf(p))),
    [posiciones, excluidas],
  );

  // Totales (sobre lo filtrado, con marks efectivos).
  const totales = useMemo(() => {
    let real = 0, noreal = 0, fees = 0, neto = 0, costoBook = 0;
    for (const p of posiciones) {
      if (excluidas.has(keyOf(p))) continue; // solo lo tildado cuenta
      const d = derive(p, effMark(p));
      real += p.pnl_realizado;
      noreal += d.noreal;
      fees += p.intereses + p.iva;
      neto += d.neto;
      if (p.estado !== "CERRADA") costoBook += d.costo;
    }
    return { real, noreal, fees, neto, costoBook };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [posiciones, markOv, excluidas]);

  // Simulador con mark efectivo.
  const simData = useMemo(() => {
    if (!abiertas.length) return null;
    const ladder = PASOS.flatMap((p) => [p, -p]).concat([0]).sort((a, b) => b - a);
    if (simSel === "__todas__") {
      const filas = ladder.map((pct) => ({
        pct,
        precio: null as number | null,
        delta: abiertas.reduce((acc, pos) => acc + pos.qty_neta * effMark(pos) * (pct / 100), 0),
      }));
      return { filas, mark: null as number | null };
    }
    const pos = abiertas.find((p) => keyOf(p) === simSel);
    if (!pos) return null;
    const m = effMark(pos);
    const filas = ladder.map((pct) => {
      const precio = m * (1 + pct / 100);
      return { pct, precio, delta: pos.qty_neta * (precio - m) };
    });
    return { filas, mark: m };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abiertas, simSel, markOv]);

  const toggleExpand = (p: Posicion) => {
    const k = keyOf(p);
    setExpanded((prev) => {
      const n = new Set(prev);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });
    if (p.estado !== "CERRADA") setSimSel(k);
  };

  return (
    <div className="h-full flex flex-col min-h-0 p-3 gap-2 overflow-hidden">
      {/* Barra sobria: una línea */}
      <div className="flex items-center gap-3 shrink-0 text-[11px]">
        <label className="px-2.5 py-1 text-[10px] font-semibold tracking-wide border border-[var(--t-border-2)] text-[var(--t-text-dim)] hover:border-[var(--t-accent)] hover:text-[var(--t-accent)] cursor-pointer transition-colors">
          {cargando ? "…" : "Examinar"}
          <input type="file" accept=".csv,text/csv" className="hidden" onChange={onFileChange} disabled={cargando} />
        </label>
        {resultado && (
          <>
            <span className="text-[10px] text-[var(--t-text-muted)] font-mono truncate max-w-[180px]">{resultado.archivo}</span>
            <span className="text-[10px] text-[var(--t-text-muted)] font-mono">
              {resultado.filas_validas} trades · {posiciones.filter((p) => p.estado !== "CERRADA").length} abiertas
            </span>
            {cuentas.length > 0 && (
              <select
                value={cuentaFiltro}
                onChange={(e) => setCuentaFiltro(e.target.value)}
                className="bg-[var(--t-surface-2)] border border-[var(--t-border-2)] text-[10px] px-1.5 py-0.5 text-[var(--t-text)]"
              >
                <option value="todas">Todas las cuentas</option>
                {cuentas.map((c) => (
                  <option key={c} value={c}>Cuenta {c}</option>
                ))}
              </select>
            )}
            <button onClick={limpiar} className="ml-auto text-[10px] text-[var(--t-text-muted)] hover:text-[var(--t-neg)] underline">
              limpiar
            </button>
          </>
        )}
      </div>

      {error && (
        <div className="px-3 py-2 text-[11px] text-[var(--t-neg)] bg-[#ff3333]/10 border border-[#ff3333]/30 font-mono shrink-0 whitespace-pre-wrap">
          {error}
        </div>
      )}

      {!resultado && !error && (
        <div className="flex-1 flex items-center justify-center text-[var(--t-text-muted)] text-[12px] text-center px-6">
          Cargá el CSV de boletos del día (Especie, Lado, Precio, Cantidad, Cuenta, Monto).
          Las cauciones (PESOS/DOLARES) se excluyen automáticamente.
        </div>
      )}

      {resultado && (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-5 gap-2 shrink-0">
            <KpiBox label="Costo en book" val={totales.costoBook} neutral />
            <KpiBox label="Realizado" val={totales.real} />
            <KpiBox label="No realizado" val={totales.noreal} />
            <KpiBox label="Int. + IVA" val={-totales.fees} />
            <KpiBox label="PnL Neto" val={totales.neto} big />
          </div>

          {/* 60% tabla / 40% simulador */}
          <div className="flex-1 min-h-0 grid grid-cols-[3fr_2fr] gap-3 overflow-hidden">
            <div className="overflow-auto border border-[var(--t-border)] bg-[var(--t-panel)]">
              <table className="w-full text-[11px] font-mono tabular-nums border-collapse">
                <thead className="sticky top-0 bg-[var(--t-surface-2)] z-10 text-[9px] uppercase tracking-wide text-[var(--t-accent)]">
                  <tr className="border-b border-[var(--t-border)]">
                    <th className="!px-1 !py-1.5 text-center" title="Contar como daytrade">✓</th>
                    <th className="!px-2 !py-1.5 text-left">Especie</th>
                    {cuentaFiltro === "todas" && <th className="!px-2 !py-1.5 text-center">Cta</th>}
                    <th className="!px-2 !py-1.5 text-center">Estado</th>
                    <th className="!px-2 !py-1.5 text-right">Qty</th>
                    <th className="!px-2 !py-1.5 text-right">Costo</th>
                    <th className="!px-2 !py-1.5 text-right">Ponder.</th>
                    <th className="!px-2 !py-1.5 text-right">Mark</th>
                    <th className="!px-2 !py-1.5 text-right">Realiz.</th>
                    <th className="!px-2 !py-1.5 text-right">No real.</th>
                    <th className="!px-2 !py-1.5 text-right">Neto</th>
                  </tr>
                </thead>
                <tbody>
                  {posiciones.map((p) => {
                    const k = keyOf(p);
                    const m = effMark(p);
                    const d = derive(p, m);
                    const sel = k === simSel && p.estado !== "CERRADA";
                    const isOpen = expanded.has(k);
                    const excl = excluidas.has(k);
                    const colSpan = cuentaFiltro === "todas" ? 11 : 10;
                    return (
                      <FragmentRow key={k}>
                        <tr
                          onClick={() => toggleExpand(p)}
                          className={`border-b border-[var(--t-border)] cursor-pointer hover:bg-[var(--t-accent)]/5 ${
                            sel ? "bg-[var(--t-accent)]/15" : ""
                          } ${p.estado === "CERRADA" ? "opacity-75" : ""} ${excl ? "opacity-40" : ""}`}
                        >
                          <td className="!px-1 !py-1 text-center" onClick={(e) => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              checked={!excl}
                              onChange={() => toggleIncl(p)}
                              className="cursor-pointer accent-[var(--t-accent)]"
                              title={excl ? "No cuenta — clic para incluir" : "Cuenta como daytrade — clic para sacar"}
                            />
                          </td>
                          <td className="!px-2 !py-1 text-[var(--t-text)] font-semibold">
                            <span className="text-[8px] text-[var(--t-text-muted)] mr-1">{isOpen ? "▾" : "▸"}</span>
                            {p.especie}
                          </td>
                          {cuentaFiltro === "todas" && <td className="!px-2 !py-1 text-center text-[var(--t-text-dim)]">{p.cuenta}</td>}
                          <td className="!px-2 !py-1 text-center font-semibold" style={{ color: estadoColor(p.estado) }}>{p.estado}</td>
                          <td className="!px-2 !py-1 text-right">{fmtNum(p.qty_neta, 0)}</td>
                          <td className="!px-2 !py-1 text-right text-[var(--t-text-dim)]">{p.estado === "CERRADA" ? "—" : fmtNum(d.costo, 0)}</td>
                          <td className="!px-2 !py-1 text-right text-[var(--t-text-dim)]">{fmtNum(p.precio_ponderado, 2)}</td>
                          <td className="!px-2 !py-1 text-right" onClick={(e) => e.stopPropagation()}>
                            <span className="inline-flex items-center justify-end gap-1">
                              <input
                                type="number"
                                step="0.01"
                                value={Number.isFinite(m) ? m : ""}
                                onChange={(e) => {
                                  const v = parseFloat(e.target.value);
                                  setMarkOv((prev) => ({ ...prev, [k]: isNaN(v) ? 0 : v }));
                                }}
                                className="w-16 bg-transparent text-right text-[11px] text-[var(--t-text)] border-b border-dashed border-[var(--t-border-2)] focus:border-[var(--t-accent)] focus:outline-none"
                                title={p.mark_source === "live" ? "live feed (editable)" : "no mapeado — escribilo a mano"}
                              />
                              <span className="text-[8px]" style={{ color: markOv[k] !== undefined ? "var(--t-accent)" : p.mark_source === "live" ? "var(--t-pos)" : "var(--t-text-muted)" }}>
                                {markOv[k] !== undefined ? "✎" : p.mark_source === "live" ? "●" : "○"}
                              </span>
                            </span>
                          </td>
                          <td className="!px-2 !py-1 text-right" style={{ color: pnlColor(p.pnl_realizado) }}>{fmtNum(p.pnl_realizado, 0)}</td>
                          <td className="!px-2 !py-1 text-right" style={{ color: pnlColor(d.noreal) }}>{p.estado === "CERRADA" ? "—" : fmtNum(d.noreal, 0)}</td>
                          <td className="!px-2 !py-1 text-right font-semibold" style={{ color: pnlColor(d.neto) }}>{fmtNum(d.neto, 0)}</td>
                        </tr>
                        {isOpen && (
                          <tr className="bg-[var(--t-bg)]">
                            <td colSpan={colSpan} className="!px-2 !py-2">
                              <div className="text-[8px] uppercase tracking-widest text-[var(--t-text-muted)] mb-1">
                                {p.n_ops} operaciones · int.+IVA {fmtNum(p.intereses + p.iva, 0)}
                              </div>
                              <table className="w-full text-[10px] font-mono">
                                <thead className="text-[8px] uppercase tracking-wide text-[var(--t-text-muted)]">
                                  <tr>
                                    <th className="!py-0.5 text-left">Hora</th>
                                    <th className="!py-0.5 text-left">Lado</th>
                                    <th className="!py-0.5 text-right">Precio</th>
                                    <th className="!py-0.5 text-right">Cantidad</th>
                                    <th className="!py-0.5 text-right">Monto</th>
                                    <th className="!py-0.5 text-right">Pos. acum.</th>
                                    <th className="!py-0.5 text-right">Ponder.</th>
                                    <th className="!py-0.5 text-right">Int.+IVA</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {p.trades.map((tr, i) => (
                                    <tr key={i} className="border-t border-[var(--t-border)]">
                                      <td className="!py-0.5 text-[var(--t-text-dim)]">{tr.hora}</td>
                                      <td className="!py-0.5 font-semibold" style={{ color: tr.lado === "Compra" ? "var(--t-pos)" : "var(--t-neg)" }}>{tr.lado}</td>
                                      <td className="!py-0.5 text-right">{fmtNum(tr.precio, 2)}</td>
                                      <td className="!py-0.5 text-right text-[var(--t-text-dim)]">{fmtNum(tr.cantidad, 0)}</td>
                                      <td className="!py-0.5 text-right">{fmtNum(tr.monto, 0)}</td>
                                      <td className="!py-0.5 text-right font-semibold" style={{ color: Math.abs(tr.pos_acum) < 1e-9 ? "#888" : tr.pos_acum > 0 ? "var(--t-pos)" : "var(--t-neg)" }}>{fmtNum(tr.pos_acum, 0)}</td>
                                      <td className="!py-0.5 text-right text-[var(--t-text-dim)]">{Math.abs(tr.pos_acum) < 1e-9 ? "—" : fmtNum(tr.ponderado_acum, 2)}</td>
                                      <td className="!py-0.5 text-right text-[var(--t-neg)]">{fmtNum(tr.interes + tr.iva, 0)}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </td>
                          </tr>
                        )}
                      </FragmentRow>
                    );
                  })}
                  {!posiciones.length && (
                    <tr><td colSpan={11} className="!px-2 !py-3 text-[var(--t-text-muted)]">sin posiciones para esta cuenta</td></tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Simulador */}
            <div className="flex flex-col gap-2 overflow-hidden border border-[var(--t-border)] bg-[var(--t-panel)] p-3">
              <span className="text-[9px] uppercase tracking-widest text-[var(--t-accent)] shrink-0">Simulador de precio</span>
              {!abiertas.length ? (
                <div className="flex-1 flex items-center justify-center text-[11px] text-[var(--t-text-muted)] text-center">
                  No hay posiciones abiertas para simular.
                </div>
              ) : (
                <>
                  <select
                    value={simSel}
                    onChange={(e) => setSimSel(e.target.value)}
                    className="bg-[var(--t-surface-2)] border border-[var(--t-border-2)] text-[11px] px-2 py-1 text-[var(--t-text)] shrink-0"
                  >
                    <option value="__todas__">TODAS (abiertas)</option>
                    {abiertas.map((p) => (
                      <option key={keyOf(p)} value={keyOf(p)}>{p.especie} · {p.estado} {fmtNum(p.qty_neta, 0)}</option>
                    ))}
                  </select>
                  {simData?.mark != null && (
                    <div className="text-[10px] text-[var(--t-text-dim)] font-mono shrink-0">
                      Mark: <span className="text-[var(--t-text)]">{fmtNum(simData.mark, 2)}</span>
                    </div>
                  )}
                  <div className="flex-1 overflow-auto">
                    <table className="w-full text-[11px] font-mono tabular-nums">
                      <thead className="sticky top-0 bg-[var(--t-panel)] text-[9px] uppercase tracking-wide text-[var(--t-text-muted)]">
                        <tr>
                          <th className="!py-1 text-left">Mov.</th>
                          {simData?.mark != null && <th className="!py-1 text-right">Precio</th>}
                          <th className="!py-1 text-right">P&amp;L Δ</th>
                        </tr>
                      </thead>
                      <tbody>
                        {simData?.filas.map((f) => {
                          const isMark = f.pct === 0;
                          return (
                            <tr key={f.pct} className={`border-t border-[var(--t-border)] ${isMark ? "bg-[var(--t-surface-2)]" : ""}`}>
                              <td className={`!py-1 ${isMark ? "text-[var(--t-accent)] font-semibold" : "text-[var(--t-text-dim)]"}`}>
                                {isMark ? "actual" : `${fmtSigned(f.pct, 2)}%`}
                              </td>
                              {simData?.mark != null && <td className="!py-1 text-right text-[var(--t-text)]">{fmtNum(f.precio, 2)}</td>}
                              <td className="!py-1 text-right font-semibold" style={{ color: isMark ? "#888" : pnlColor(f.delta) }}>
                                {isMark ? "—" : fmtSigned(f.delta, 0)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <div className="text-[9px] text-[var(--t-text-muted)] leading-relaxed shrink-0 pt-1 border-t border-[var(--t-border)]">
                    Impacto sobre el mark si el precio se mueve ese %. Short: suba = pérdida.
                  </div>
                </>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// Wrapper para devolver dos <tr> (fila + detalle) con una sola key.
function FragmentRow({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

function KpiBox({ label, val, big, neutral }: { label: string; val: number; big?: boolean; neutral?: boolean }) {
  return (
    <div className="border border-[var(--t-border)] bg-[var(--t-panel)] px-3 py-1.5">
      <div className="text-[9px] uppercase tracking-widest text-[var(--t-text-muted)]">{label}</div>
      <div className={`font-mono font-bold ${big ? "text-[17px]" : "text-[13px]"}`} style={{ color: neutral ? "var(--t-text)" : pnlColor(val) }}>
        {neutral ? fmtNum(val, 0) : fmtSigned(val, 0)}
      </div>
    </div>
  );
}
