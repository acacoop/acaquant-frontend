"use client";

import { useEffect, useMemo, useState } from "react";

// Monitor intradía de renta variable. Sube el CSV de boletos del día (export
// ROFEX/Aunesa, formato AR) y el backend (api/services/intraday.py) consolida
// por (cuenta, especie): posición neta FIFO, precio ponderado de lo abierto,
// PnL realizado/no-realizado (mark live), intereses + IVA → PnL neto.
// Cauciones (PESOS/DOLARES) se excluyen. Persiste en sessionStorage.

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
  monto_abierto: number;
  valor_actual: number;
  pnl_realizado: number;
  pnl_no_realizado: number;
  pnl_bruto: number;
  intereses: number;
  iva: number;
  pnl_neto: number;
}

interface Totales {
  pnl_realizado: number;
  pnl_no_realizado: number;
  pnl_bruto: number;
  intereses: number;
  iva: number;
  pnl_neto: number;
  abiertas: number;
  cerradas: number;
}

interface Resultado {
  archivo: string | null;
  filas_validas: number;
  posiciones: Posicion[];
  totales: Totales;
  timestamp: number;
}

const STORAGE_KEY = "intraday_fifo_v2";
const PASOS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2];

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

export function IntradayView() {
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const [simSel, setSimSel] = useState<string>("__todas__"); // especie|cuenta o __todas__

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Resultado;
        if (parsed?.posiciones && Array.isArray(parsed.posiciones)) setResultado(parsed);
      }
    } catch {
      /* storage corrupto/disabled — no pasa nada */
    }
  }, []);

  const onFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setCargando(true);
    try {
      // El export viene en latin-1 (acentos: Operación, Caución). Decodifico
      // explícito para no mandar mojibake al backend.
      const buf = await file.arrayBuffer();
      const text = new TextDecoder("iso-8859-1").decode(buf);
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
      try {
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      } catch {
        /* quota — ignorar */
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
    sessionStorage.removeItem(STORAGE_KEY);
  };

  const abiertas = useMemo(
    () => (resultado?.posiciones ?? []).filter((p) => p.estado !== "CERRADA"),
    [resultado],
  );

  // Posición seleccionada para el simulador (o agregado de todas las abiertas).
  const simData = useMemo(() => {
    if (!abiertas.length) return null;
    if (simSel === "__todas__") {
      // Impacto al mover TODO el book abierto X% a la vez = Σ qty·mark·X%.
      const filas = PASOS.flatMap((p) => [p, -p])
        .concat([0])
        .sort((a, b) => b - a)
        .map((pct) => {
          const delta = abiertas.reduce(
            (acc, pos) => acc + pos.qty_neta * pos.mark * (pct / 100),
            0,
          );
          return { pct, precio: null as number | null, delta };
        });
      return { titulo: "TODAS (abiertas)", filas, mark: null as number | null, qty: null };
    }
    const pos = abiertas.find((p) => `${p.especie}|${p.cuenta}` === simSel);
    if (!pos) return null;
    const filas = PASOS.flatMap((p) => [p, -p])
      .concat([0])
      .sort((a, b) => b - a)
      .map((pct) => {
        const precio = pos.mark * (1 + pct / 100);
        const delta = pos.qty_neta * (precio - pos.mark);
        return { pct, precio, delta };
      });
    return { titulo: `${pos.especie} · ${pos.estado} ${fmtNum(pos.qty_neta, 0)}`, filas, mark: pos.mark, qty: pos.qty_neta };
  }, [abiertas, simSel]);

  // Default: primera abierta cuando llega un resultado nuevo.
  useEffect(() => {
    if (abiertas.length && simSel !== "__todas__") {
      const exists = abiertas.some((p) => `${p.especie}|${p.cuenta}` === simSel);
      if (!exists) setSimSel("__todas__");
    }
  }, [abiertas, simSel]);

  const t = resultado?.totales;

  return (
    <div className="h-full flex flex-col min-h-0 p-3 gap-3 overflow-hidden">
      {/* Barra: upload + meta */}
      <div className="border border-[var(--t-border)] bg-[var(--t-panel)] p-3 flex items-center gap-3 shrink-0 flex-wrap">
        <label className="px-3 py-1.5 text-[11px] font-semibold tracking-wide border border-[var(--t-accent)] text-[var(--t-accent)] hover:bg-[var(--t-accent)] hover:text-[var(--t-on-accent)] cursor-pointer transition-colors">
          {cargando ? "PROCESANDO…" : "EXAMINAR CSV"}
          <input type="file" accept=".csv,text/csv" className="hidden" onChange={onFileChange} disabled={cargando} />
        </label>
        <span className="text-[11px] text-[var(--t-text-dim)] font-mono truncate max-w-[280px]">
          {resultado?.archivo || "Ningún archivo seleccionado"}
        </span>
        {resultado && (
          <>
            <button onClick={limpiar} className="text-[10px] text-[var(--t-text-muted)] hover:text-[var(--t-neg)] underline">
              limpiar
            </button>
            <div className="ml-auto flex items-center gap-3 text-[10px] text-[var(--t-text-dim)] font-mono">
              <span>{resultado.filas_validas} trades RV</span>
              <span className="text-[var(--t-pos)]">{resultado.totales.abiertas} abiertas</span>
              <span className="text-[var(--t-text-muted)]">{resultado.totales.cerradas} cerradas</span>
            </div>
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

      {t && (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-5 gap-3 shrink-0">
            <KpiBox label="PnL Realizado" val={t.pnl_realizado} />
            <KpiBox label="PnL No Realizado" val={t.pnl_no_realizado} />
            <KpiBox label="PnL Bruto" val={t.pnl_bruto} />
            <KpiBox label="Intereses + IVA" val={-(t.intereses + t.iva)} />
            <KpiBox label="PnL Neto" val={t.pnl_neto} big />
          </div>

          <div className="flex-1 min-h-0 grid grid-cols-[1fr_380px] gap-3 overflow-hidden">
            {/* Tabla de posiciones */}
            <div className="overflow-auto border border-[var(--t-border)] bg-[var(--t-panel)]">
              <table className="w-full text-[11px] font-mono tabular-nums border-collapse">
                <thead className="sticky top-0 bg-[var(--t-surface-2)] z-10 text-[9px] uppercase tracking-wide text-[var(--t-accent)]">
                  <tr className="border-b border-[var(--t-border)]">
                    <th className="!px-2 !py-1.5 text-left">Especie</th>
                    <th className="!px-2 !py-1.5 text-center">Cta</th>
                    <th className="!px-2 !py-1.5 text-center">Estado</th>
                    <th className="!px-2 !py-1.5 text-right">Ops</th>
                    <th className="!px-2 !py-1.5 text-right">Qty neta</th>
                    <th className="!px-2 !py-1.5 text-right">Ponder.</th>
                    <th className="!px-2 !py-1.5 text-right">Mark</th>
                    <th className="!px-2 !py-1.5 text-right">Realizado</th>
                    <th className="!px-2 !py-1.5 text-right">No real.</th>
                    <th className="!px-2 !py-1.5 text-right">Int.+IVA</th>
                    <th className="!px-2 !py-1.5 text-right">Neto</th>
                  </tr>
                </thead>
                <tbody>
                  {resultado!.posiciones.map((p) => {
                    const sel = `${p.especie}|${p.cuenta}` === simSel && p.estado !== "CERRADA";
                    return (
                      <tr
                        key={`${p.especie}|${p.cuenta}`}
                        onClick={() => p.estado !== "CERRADA" && setSimSel(`${p.especie}|${p.cuenta}`)}
                        className={`border-b border-[var(--t-border)] ${
                          p.estado !== "CERRADA" ? "cursor-pointer hover:bg-[var(--t-accent)]/5" : "opacity-70"
                        } ${sel ? "bg-[var(--t-accent)]/15" : ""}`}
                      >
                        <td className="!px-2 !py-1 text-[var(--t-text)] font-semibold">{p.especie}</td>
                        <td className="!px-2 !py-1 text-center text-[var(--t-text-dim)]">{p.cuenta}</td>
                        <td className="!px-2 !py-1 text-center font-semibold" style={{ color: estadoColor(p.estado) }}>
                          {p.estado}
                        </td>
                        <td className="!px-2 !py-1 text-right text-[var(--t-text-dim)]">{p.n_ops}</td>
                        <td className="!px-2 !py-1 text-right">{fmtNum(p.qty_neta, 0)}</td>
                        <td className="!px-2 !py-1 text-right text-[var(--t-text-dim)]">{fmtNum(p.precio_ponderado, 2)}</td>
                        <td className="!px-2 !py-1 text-right" title={p.mark_source === "live" ? "live feed" : "último precio del CSV"}>
                          {fmtNum(p.mark, 2)}
                          <span className="ml-1 text-[8px] text-[var(--t-text-muted)]">{p.mark_source === "live" ? "●" : "○"}</span>
                        </td>
                        <td className="!px-2 !py-1 text-right" style={{ color: pnlColor(p.pnl_realizado) }}>
                          {fmtNum(p.pnl_realizado, 0)}
                        </td>
                        <td className="!px-2 !py-1 text-right" style={{ color: pnlColor(p.pnl_no_realizado) }}>
                          {fmtNum(p.pnl_no_realizado, 0)}
                        </td>
                        <td className="!px-2 !py-1 text-right text-[var(--t-neg)]">{fmtNum(p.intereses + p.iva, 0)}</td>
                        <td className="!px-2 !py-1 text-right font-semibold" style={{ color: pnlColor(p.pnl_neto) }}>
                          {fmtNum(p.pnl_neto, 0)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Simulador */}
            <div className="shrink-0 flex flex-col gap-2 overflow-hidden border border-[var(--t-border)] bg-[var(--t-panel)] p-3">
              <div className="flex items-center justify-between shrink-0">
                <span className="text-[9px] uppercase tracking-widest text-[var(--t-accent)]">Simulador de precio</span>
              </div>
              {abiertas.length === 0 ? (
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
                      <option key={`${p.especie}|${p.cuenta}`} value={`${p.especie}|${p.cuenta}`}>
                        {p.especie} · {p.estado} {fmtNum(p.qty_neta, 0)}
                      </option>
                    ))}
                  </select>
                  {simData?.mark != null && (
                    <div className="text-[10px] text-[var(--t-text-dim)] font-mono shrink-0">
                      Mark actual: <span className="text-[var(--t-text)]">{fmtNum(simData.mark, 2)}</span>
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
                            <tr
                              key={f.pct}
                              className={`border-t border-[var(--t-border)] ${isMark ? "bg-[var(--t-surface-2)]" : ""}`}
                            >
                              <td className={`!py-1 ${isMark ? "text-[var(--t-accent)] font-semibold" : "text-[var(--t-text-dim)]"}`}>
                                {isMark ? "actual" : `${fmtSigned(f.pct, 2)}%`}
                              </td>
                              {simData?.mark != null && (
                                <td className="!py-1 text-right text-[var(--t-text)]">{fmtNum(f.precio, 2)}</td>
                              )}
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
                    P&amp;L Δ = impacto sobre el mark actual si el precio se mueve ese %.
                    Para short, una suba es pérdida.
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

function KpiBox({ label, val, big }: { label: string; val: number; big?: boolean }) {
  return (
    <div className="border border-[var(--t-border)] bg-[var(--t-panel)] px-3 py-2">
      <div className="text-[9px] uppercase tracking-widest text-[var(--t-text-muted)]">{label}</div>
      <div className={`font-mono font-bold ${big ? "text-[18px]" : "text-[14px]"}`} style={{ color: pnlColor(val) }}>
        {fmtSigned(val, 0)}
      </div>
    </div>
  );
}
