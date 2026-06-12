"use client";

import { useEffect, useMemo, useState } from "react";

import { CuentaCombobox, type CuentaDoc } from "@/components/aum-view";

// ── Tipos ───────────────────────────────────────────────────────────────────
type Categoria = "COMPRAS" | "VENTAS" | "RESCATES" | "SUSCRIPCIONES" | "OTROS";
const COLUMNAS: Categoria[] = ["COMPRAS", "VENTAS", "RESCATES", "SUSCRIPCIONES", "OTROS"];

interface Mov {
  comprobante: string | number;
  fecha: string | null;
  mes: string;
  categoria: Categoria;
  op: string | null;
  ticker: string | null;
  importe: number | null;
  moneda: string | null;
  importe_ars: number;
  incluido: boolean;
}
interface FlujoResp {
  id_cuenta: string;
  columnas: string[];
  movimientos: Mov[];
  n: number;
}

const fmt = (n: number) =>
  n.toLocaleString("es-AR", { maximumFractionDigits: 0 });

// ── Shell (selector de cuenta + tabs) ────────────────────────────────────────
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
        <button
          onClick={() => prev && setIdCuenta(prev)}
          disabled={!prev}
          title="Cuenta anterior"
          className="px-1 py-0.5 text-[10px] text-[var(--t-text-dim)] border border-[var(--t-border-2)] hover:text-[var(--t-accent)] hover:border-[var(--t-accent)] disabled:text-[#333] disabled:border-[var(--t-border)] disabled:cursor-not-allowed"
        >
          ◀
        </button>
        <CuentaCombobox cuentas={cuentas} value={idCuenta} onChange={setIdCuenta} />
        <button
          onClick={() => next && setIdCuenta(next)}
          disabled={!next}
          title="Cuenta siguiente"
          className="px-1 py-0.5 text-[10px] text-[var(--t-text-dim)] border border-[var(--t-border-2)] hover:text-[var(--t-accent)] hover:border-[var(--t-accent)] disabled:text-[#333] disabled:border-[var(--t-border)] disabled:cursor-not-allowed"
        >
          ▶
        </button>
        <span className="ml-3 text-[9px] text-[var(--t-text-muted)]">
          Flujo directo de la cartera (boletos de títulos) · sin depósitos/extracciones administrativas
        </span>
      </div>

      <div className="flex-1 min-h-0">
        {idCuenta ? (
          <FlujoView idCuenta={idCuenta} />
        ) : (
          <div className="h-full flex items-center justify-center text-[var(--t-text-muted)] text-sm">
            Cargando cuentas…
          </div>
        )}
      </div>
    </div>
  );
}

// ── Vista del flujo (Resumen + Movimientos) ──────────────────────────────────
function FlujoView({ idCuenta }: { idCuenta: string }) {
  const [movs, setMovs] = useState<Mov[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [tab, setTab] = useState<"resumen" | "movimientos">("resumen");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setErr(null);
    fetch(`/api/valuaciones-flujo/movimientos?id_cuenta=${encodeURIComponent(idCuenta)}`, {
      cache: "no-store",
    })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d: FlujoResp) => {
        if (!cancelled) setMovs(d.movimientos || []);
      })
      .catch((e) => {
        if (!cancelled) setErr(e instanceof Error ? e.message : "error");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [idCuenta]);

  // Matriz mes × categoría (solo incluidos) + neto por fila.
  const resumen = useMemo(() => {
    const byMes = new Map<string, Record<Categoria, number>>();
    for (const m of movs) {
      if (!m.incluido) continue;
      const row =
        byMes.get(m.mes) ??
        { COMPRAS: 0, VENTAS: 0, RESCATES: 0, SUSCRIPCIONES: 0, OTROS: 0 };
      row[m.categoria] = (row[m.categoria] || 0) + (m.importe_ars || 0);
      byMes.set(m.mes, row);
    }
    const filas = [...byMes.entries()]
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([mes, cols]) => ({
        mes,
        cols,
        neto: COLUMNAS.reduce((s, c) => s + cols[c], 0),
      }));
    const tot: Record<Categoria, number> = {
      COMPRAS: 0, VENTAS: 0, RESCATES: 0, SUSCRIPCIONES: 0, OTROS: 0,
    };
    for (const f of filas) for (const c of COLUMNAS) tot[c] += f.cols[c];
    return { filas, tot, netoTot: COLUMNAS.reduce((s, c) => s + tot[c], 0) };
  }, [movs]);

  // Toggle incluir/excluir (optimista + PATCH; revierte si falla).
  async function toggle(mov: Mov) {
    const nuevo = !mov.incluido;
    setMovs((prev) =>
      prev.map((m) => (m.comprobante === mov.comprobante ? { ...m, incluido: nuevo } : m)),
    );
    try {
      const r = await fetch("/api/valuaciones-flujo/seleccion", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id_cuenta: idCuenta,
          comprobante: mov.comprobante,
          incluido: nuevo,
        }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
    } catch {
      setMovs((prev) =>
        prev.map((m) =>
          m.comprobante === mov.comprobante ? { ...m, incluido: mov.incluido } : m,
        ),
      );
    }
  }

  if (err) return <div className="p-3 text-[11px] text-[var(--t-neg)]">Error: {err}</div>;
  if (loading) {
    return (
      <div className="h-full flex items-center justify-center text-[var(--t-text-muted)] text-[11px]">
        Cargando…
      </div>
    );
  }

  const nIncl = movs.filter((m) => m.incluido).length;

  return (
    <div className="h-full flex flex-col gap-2 p-3 overflow-hidden">
      {/* Tabs */}
      <div className="flex items-center gap-2">
        {(["resumen", "movimientos"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-3 py-0.5 text-[10px] font-semibold tracking-wide border transition-colors ${
              tab === t
                ? "bg-[var(--t-accent)] text-[var(--t-on-accent)] border-[var(--t-accent)]"
                : "bg-transparent text-[var(--t-text-dim)] border-[var(--t-border-2)] hover:text-[var(--t-accent)] hover:border-[var(--t-accent)]"
            }`}
          >
            {t === "resumen" ? "RESUMEN" : "MOVIMIENTOS"}
          </button>
        ))}
        <span className="ml-auto text-[9px] text-[var(--t-text-muted)] font-mono">
          {nIncl}/{movs.length} movimientos incluidos
        </span>
      </div>

      {tab === "resumen" ? (
        <div className="flex-1 min-h-0 overflow-auto border border-[var(--t-border)] bg-[var(--t-panel)]">
          <table className="w-full text-[11px] font-mono">
            <thead className="sticky top-0 bg-[var(--t-surface)] border-b border-[var(--t-border)] z-10">
              <tr className="text-[9px] tracking-widest text-[var(--t-text-dim)]">
                <th className="px-3 py-2 text-left">MES</th>
                {COLUMNAS.map((c) => (
                  <th key={c} className="px-2 py-2 text-right">{c}</th>
                ))}
                <th className="px-3 py-2 text-right">NETO</th>
              </tr>
            </thead>
            <tbody>
              {resumen.filas.length === 0 ? (
                <tr>
                  <td colSpan={COLUMNAS.length + 2} className="p-6 text-center text-[var(--t-text-muted)]">
                    Sin movimientos para esta cuenta.
                  </td>
                </tr>
              ) : (
                resumen.filas.map((f) => (
                  <tr key={f.mes} className="border-b border-[var(--t-border)] hover:bg-[var(--t-accent)]/5">
                    <td className="px-3 py-1.5 text-[var(--t-text)]">{f.mes}</td>
                    {COLUMNAS.map((c) => (
                      <td key={c} className="px-2 py-1.5 text-right text-[var(--t-text-dim)]">
                        {f.cols[c] ? fmt(f.cols[c]) : "—"}
                      </td>
                    ))}
                    <td className="px-3 py-1.5 text-right text-[var(--t-text)] font-semibold">
                      {fmt(f.neto)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            {resumen.filas.length > 0 && (
              <tfoot className="sticky bottom-0 bg-[var(--t-surface)] border-t border-[var(--t-border)]">
                <tr className="text-[var(--t-text)] font-semibold">
                  <td className="px-3 py-2 text-left tracking-widest text-[9px]">TOTAL</td>
                  {COLUMNAS.map((c) => (
                    <td key={c} className="px-2 py-2 text-right">{fmt(resumen.tot[c])}</td>
                  ))}
                  <td className="px-3 py-2 text-right text-[var(--t-accent)]">{fmt(resumen.netoTot)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      ) : (
        <div className="flex-1 min-h-0 overflow-auto border border-[var(--t-border)] bg-[var(--t-panel)]">
          <table className="w-full text-[11px] font-mono">
            <thead className="sticky top-0 bg-[var(--t-surface)] border-b border-[var(--t-border)] z-10">
              <tr className="text-[9px] tracking-widest text-[var(--t-text-dim)]">
                <th className="px-3 py-2 text-center">¿CUENTA?</th>
                <th className="px-2 py-2 text-left">FECHA</th>
                <th className="px-2 py-2 text-left">CATEGORÍA</th>
                <th className="px-2 py-2 text-left">TICKER / OP</th>
                <th className="px-2 py-2 text-right">IMPORTE ARS</th>
                <th className="px-2 py-2 text-left">MON</th>
              </tr>
            </thead>
            <tbody>
              {movs.map((m, i) => (
                <tr
                  key={`${m.comprobante}-${i}`}
                  className={
                    "border-b border-[var(--t-border)] " +
                    (m.incluido ? "hover:bg-[var(--t-accent)]/5" : "opacity-40")
                  }
                >
                  <td className="px-3 py-1 text-center">
                    <button
                      onClick={() => toggle(m)}
                      title={m.incluido ? "Incluido — click para excluir" : "Excluido — click para incluir"}
                      className={`px-2 py-0.5 text-[9px] font-bold tracking-widest border transition-colors ${
                        m.incluido
                          ? "bg-[var(--t-pos)]/15 text-[var(--t-pos)] border-[var(--t-pos)]/40"
                          : "bg-[var(--t-neg)]/10 text-[var(--t-neg)] border-[var(--t-neg)]/40"
                      }`}
                    >
                      {m.incluido ? "SÍ" : "NO"}
                    </button>
                  </td>
                  <td className="px-2 py-1 text-[var(--t-text-dim)]">{m.fecha}</td>
                  <td className="px-2 py-1 text-[var(--t-text)]">{m.categoria}</td>
                  <td className="px-2 py-1 text-[var(--t-text-dim)] truncate max-w-[220px]" title={m.op || ""}>
                    {m.ticker || m.op || "—"}
                  </td>
                  <td className="px-2 py-1 text-right text-[var(--t-text)]">{fmt(m.importe_ars)}</td>
                  <td className="px-2 py-1 text-[var(--t-text-muted)]">{m.moneda}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
