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
  id_cuenta: string;
  desde: string;
  hasta: string;
  filas: FilaResumen[];
  totales: Record<Categoria, number>;
  neto_total: number;
}
interface Mov {
  comprobante: string;
  fecha: string | null;
  categoria: Categoria;
  op: string | null;
  ticker: string | null;
  importe: number;
  moneda: string | null;
  importe_ars: number;
  incluido: boolean;
}

const fmt = (n: number) => n.toLocaleString("es-AR", { maximumFractionDigits: 0 });

function _today(): string {
  // El backend valida formato; evitamos Date local complejo.
  if (typeof window === "undefined") return "";
  const d = new Date();
  const p = (x: number) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
function _yearStart(): string {
  if (typeof window === "undefined") return "";
  return `${new Date().getFullYear()}-01-01`;
}

// ── Shell (selector de cuenta) ───────────────────────────────────────────────
function _readUrlParam(name: string): string | null {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get(name);
}

export function ValuacionesFlujoShell() {
  const [cuentas, setCuentas] = useState<CuentaDoc[]>([]);
  const [idCuenta, setIdCuenta] = useState<string>(() => _readUrlParam("cuenta") || "");

  useEffect(() => {
    fetch("/api/portfolio-cuentas", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then((d: { cuentas: CuentaDoc[] }) => {
        const list = d.cuentas || [];
        setCuentas(list);
        if (list.length && !idCuenta) {
          const def = list.find((c) => c.id_cuenta === "100") || list[0];
          setIdCuenta(def.id_cuenta);
        }
      })
      .catch(() => {});
  }, [idCuenta]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    if (idCuenta) url.searchParams.set("cuenta", idCuenta);
    else url.searchParams.delete("cuenta");
    window.history.replaceState(null, "", url.toString());
  }, [idCuenta]);

  const idx = cuentas.findIndex((c) => c.id_cuenta === idCuenta);
  const prev = idx > 0 ? cuentas[idx - 1].id_cuenta : null;
  const next = idx >= 0 && idx < cuentas.length - 1 ? cuentas[idx + 1].id_cuenta : null;

  return (
    <div className="h-full flex flex-col min-h-0">
      <div className="flex items-center gap-3 px-3 py-2 border-b border-[var(--t-border)] bg-[var(--t-panel)] shrink-0">
        <span className="text-[9px] tracking-widest text-[var(--t-text-muted)]">CUENTA</span>
        <button onClick={() => prev && setIdCuenta(prev)} disabled={!prev} title="Cuenta anterior"
          className="px-1 py-0.5 text-[10px] text-[var(--t-text-dim)] border border-[var(--t-border-2)] hover:text-[var(--t-accent)] hover:border-[var(--t-accent)] disabled:text-[#333] disabled:border-[var(--t-border)] disabled:cursor-not-allowed">◀</button>
        <CuentaCombobox cuentas={cuentas} value={idCuenta} onChange={setIdCuenta} />
        <button onClick={() => next && setIdCuenta(next)} disabled={!next} title="Cuenta siguiente"
          className="px-1 py-0.5 text-[10px] text-[var(--t-text-dim)] border border-[var(--t-border-2)] hover:text-[var(--t-accent)] hover:border-[var(--t-accent)] disabled:text-[#333] disabled:border-[var(--t-border)] disabled:cursor-not-allowed">▶</button>
      </div>
      <div className="flex-1 min-h-0">
        {idCuenta ? <FlujoView idCuenta={idCuenta} /> : (
          <div className="h-full flex items-center justify-center text-[var(--t-text-muted)] text-sm">Cargando cuentas…</div>
        )}
      </div>
    </div>
  );
}

// ── Vista (50% resumen agregado | 50% detalle bajo demanda) ──────────────────
function FlujoView({ idCuenta }: { idCuenta: string }) {
  const [desde, setDesde] = useState<string>(_yearStart);
  const [hasta, setHasta] = useState<string>(_today);
  const [resumen, setResumen] = useState<ResumenResp | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  // Selección del panel derecho.
  const [selCat, setSelCat] = useState<Categoria | null>(null);
  const [selMes, setSelMes] = useState<string | null>(null);
  const [detalle, setDetalle] = useState<Mov[]>([]);
  const [detLoading, setDetLoading] = useState(false);

  const qs = useMemo(() => {
    const p = new URLSearchParams({ id_cuenta: idCuenta });
    if (desde) p.set("desde", desde);
    if (hasta) p.set("hasta", hasta);
    return p.toString();
  }, [idCuenta, desde, hasta]);

  const cargarResumen = useCallback(() => {
    setLoading(true);
    setErr(null);
    fetch(`/api/valuaciones-flujo/resumen?${qs}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d: ResumenResp) => setResumen(d))
      .catch((e) => setErr(e instanceof Error ? e.message : "error"))
      .finally(() => setLoading(false));
  }, [qs]);

  useEffect(() => { cargarResumen(); }, [cargarResumen]);

  // Cargar detalle cuando cambia la selección (categoría / mes).
  const cargarDetalle = useCallback((cat: Categoria, mes: string | null) => {
    setDetLoading(true);
    const p = new URLSearchParams({ id_cuenta: idCuenta, categoria: cat });
    if (desde) p.set("desde", desde);
    if (hasta) p.set("hasta", hasta);
    if (mes) p.set("mes", mes);
    fetch(`/api/valuaciones-flujo/movimientos?${p.toString()}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d: { movimientos: Mov[] }) => setDetalle(d.movimientos || []))
      .catch(() => setDetalle([]))
      .finally(() => setDetLoading(false));
  }, [idCuenta, desde, hasta]);

  const seleccionar = (cat: Categoria, mes: string | null) => {
    setSelCat(cat); setSelMes(mes); cargarDetalle(cat, mes);
  };

  // Toggle incluir/excluir (optimista + PATCH; refresca resumen para la suma).
  async function toggle(mov: Mov) {
    const nuevo = !mov.incluido;
    setDetalle((prev) => prev.map((m) => (m.comprobante === mov.comprobante ? { ...m, incluido: nuevo } : m)));
    try {
      const r = await fetch("/api/valuaciones-flujo/seleccion", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id_cuenta: idCuenta, comprobante: mov.comprobante, incluido: nuevo }),
      });
      if (!r.ok) throw new Error();
      cargarResumen(); // la matriz suma solo incluidos → recalcular
    } catch {
      setDetalle((prev) => prev.map((m) => (m.comprobante === mov.comprobante ? { ...m, incluido: mov.incluido } : m)));
    }
  }

  return (
    <div className="h-full flex flex-col gap-2 p-3 overflow-hidden">
      {/* Toolbar: desde / hasta */}
      <div className="flex items-center gap-2 text-[10px]">
        <span className="text-[9px] tracking-widest text-[var(--t-text-muted)]">DESDE</span>
        <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)}
          className="bg-[var(--t-surface)] border border-[var(--t-border-2)] px-1 py-0.5 text-[var(--t-text)]" />
        <span className="text-[9px] tracking-widest text-[var(--t-text-muted)]">HASTA</span>
        <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)}
          className="bg-[var(--t-surface)] border border-[var(--t-border-2)] px-1 py-0.5 text-[var(--t-text)]" />
        {resumen && (
          <span className="ml-auto text-[9px] text-[var(--t-text-muted)] font-mono">
            NETO total: <span className="text-[var(--t-accent)] font-semibold">{fmt(resumen.neto_total)}</span>
          </span>
        )}
      </div>

      {err && <div className="text-[11px] text-[var(--t-neg)]">Error: {err}</div>}

      <div className="flex-1 min-h-0 flex gap-3">
        {/* IZQUIERDA 50% — RESUMEN agregado */}
        <div className="w-1/2 border border-[var(--t-border)] bg-[var(--t-panel)] flex flex-col min-h-0 overflow-auto">
          {loading && !resumen ? (
            <div className="h-full flex items-center justify-center text-[var(--t-text-muted)] text-[11px]">Cargando…</div>
          ) : (
            <table className="w-full text-[11px] font-mono">
              <thead className="sticky top-0 bg-[var(--t-surface)] border-b border-[var(--t-border)] z-10">
                <tr className="text-[9px] tracking-widest text-[var(--t-text-dim)]">
                  <th className="px-3 py-2 text-left">MES</th>
                  {COLUMNAS.map((c) => (
                    <th key={c}
                      onClick={() => seleccionar(c, null)}
                      title={`Ver detalle de ${c} (todo el rango)`}
                      className={`px-2 py-2 text-right cursor-pointer select-none hover:text-[var(--t-accent)] ${selCat === c && !selMes ? "text-[var(--t-accent)]" : ""}`}>
                      {c}
                    </th>
                  ))}
                  <th className="px-3 py-2 text-right">NETO</th>
                </tr>
              </thead>
              <tbody>
                {!resumen || resumen.filas.length === 0 ? (
                  <tr><td colSpan={COLUMNAS.length + 2} className="p-6 text-center text-[var(--t-text-muted)]">Sin movimientos en el rango.</td></tr>
                ) : (
                  resumen.filas.map((f) => (
                    <tr key={f.mes} className="border-b border-[var(--t-border)] hover:bg-[var(--t-accent)]/5">
                      <td className="px-3 py-1.5 text-[var(--t-text)]">{f.mes}</td>
                      {COLUMNAS.map((c) => (
                        <td key={c}
                          onClick={() => f[c] && seleccionar(c, f.mes)}
                          className={`px-2 py-1.5 text-right ${f[c] ? "cursor-pointer hover:text-[var(--t-accent)]" : "text-[var(--t-text-dim)]"} ${selCat === c && selMes === f.mes ? "bg-[var(--t-accent)]/15 text-[var(--t-accent)]" : "text-[var(--t-text-dim)]"}`}>
                          {f[c] ? fmt(f[c]) : "—"}
                        </td>
                      ))}
                      <td className="px-3 py-1.5 text-right text-[var(--t-text)] font-semibold">{fmt(f.neto)}</td>
                    </tr>
                  ))
                )}
              </tbody>
              {resumen && resumen.filas.length > 0 && (
                <tfoot className="sticky bottom-0 bg-[var(--t-surface)] border-t border-[var(--t-border)]">
                  <tr className="text-[var(--t-text)] font-semibold">
                    <td className="px-3 py-2 text-left tracking-widest text-[9px]">TOTAL</td>
                    {COLUMNAS.map((c) => <td key={c} className="px-2 py-2 text-right">{fmt(resumen.totales[c])}</td>)}
                    <td className="px-3 py-2 text-right text-[var(--t-accent)]">{fmt(resumen.neto_total)}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          )}
        </div>

        {/* DERECHA 50% — DETALLE de lo seleccionado */}
        <div className="w-1/2 border border-[var(--t-border)] bg-[var(--t-panel)] flex flex-col min-h-0 overflow-hidden">
          {!selCat ? (
            <div className="h-full flex items-center justify-center text-center text-[var(--t-text-muted)] text-[11px] px-4">
              Tocá una categoría (o una celda mes×categoría) para ver e incluir/excluir sus movimientos.
            </div>
          ) : (
            <>
              <div className="px-3 py-2 border-b border-[var(--t-border)] bg-[var(--t-surface)] flex items-center gap-2 shrink-0">
                <span className="text-[10px] font-semibold tracking-wide text-[var(--t-accent)]">{selCat}</span>
                {selMes && <span className="text-[9px] text-[var(--t-text-muted)]">· {selMes}</span>}
                <span className="ml-auto text-[9px] text-[var(--t-text-muted)] font-mono">
                  {detalle.filter((m) => m.incluido).length}/{detalle.length} incluidos
                </span>
              </div>
              <div className="flex-1 min-h-0 overflow-auto">
                {detLoading ? (
                  <div className="h-full flex items-center justify-center text-[var(--t-text-muted)] text-[11px]">Cargando…</div>
                ) : (
                  <table className="w-full text-[10px] font-mono">
                    <thead className="sticky top-0 bg-[var(--t-surface)] border-b border-[var(--t-border)] z-10 text-[9px] tracking-widest text-[var(--t-text-dim)]">
                      <tr>
                        <th className="px-2 py-1.5 text-center">¿CUENTA?</th>
                        <th className="px-2 py-1.5 text-left">FECHA</th>
                        <th className="px-2 py-1.5 text-left">TICKER / OP</th>
                        <th className="px-2 py-1.5 text-right">IMPORTE ARS</th>
                        <th className="px-2 py-1.5 text-left">MON</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detalle.map((m, i) => (
                        <tr key={`${m.comprobante}-${i}`}
                          className={"border-b border-[var(--t-border)] " + (m.incluido ? "hover:bg-[var(--t-accent)]/5" : "opacity-40")}>
                          <td className="px-2 py-1 text-center">
                            <button onClick={() => toggle(m)}
                              title={m.incluido ? "Incluido — click para excluir" : "Excluido — click para incluir"}
                              className={`px-2 py-0.5 text-[9px] font-bold tracking-widest border transition-colors ${m.incluido ? "bg-[var(--t-pos)]/15 text-[var(--t-pos)] border-[var(--t-pos)]/40" : "bg-[var(--t-neg)]/10 text-[var(--t-neg)] border-[var(--t-neg)]/40"}`}>
                              {m.incluido ? "SÍ" : "NO"}
                            </button>
                          </td>
                          <td className="px-2 py-1 text-[var(--t-text-dim)]">{m.fecha}</td>
                          <td className="px-2 py-1 text-[var(--t-text)] truncate max-w-[200px]" title={m.op || ""}>{m.ticker || m.op || "—"}</td>
                          <td className="px-2 py-1 text-right text-[var(--t-text)]">{fmt(m.importe_ars)}</td>
                          <td className="px-2 py-1 text-[var(--t-text-muted)]">{m.moneda}</td>
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
