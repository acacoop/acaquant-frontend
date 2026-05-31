"use client";

import { useEffect, useState } from "react";

// Tablero Comercial — lente POR OPERADOR (v1, solo manager).
// Consume GET /api/manager/comercial/operadores. Ver docs/TABLERO_COMERCIAL.md [5].

type Operador = {
  operador_email: string | null;
  operador_nombre: string | null;
  n_cuentas: number;
  n_activas: number;
  n_enfriandose: number;
  n_dormidas: number;
  n_nuevas: number;
  n_sin_segmentar: number;
  aum_total: number;
  huerfana: boolean;
};

type Resumen = {
  operadores: Operador[];
  dias_activa: number;
  dias_dormida: number;
  snapshot_aum: string | null;
  total_cuentas: number;
  total_aum: number;
};

const fmtN = (n: number) => Math.round(n).toLocaleString("es-AR");
const fmtAum = (n: number) =>
  "$" + (n >= 1e6 ? (n / 1e6).toLocaleString("es-AR", { maximumFractionDigits: 1 }) + "M" : fmtN(n));

function Kpi({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="border border-[var(--t-border)] bg-[var(--t-panel)] px-3 py-2 flex flex-col">
      <span className="text-[9px] text-[var(--t-text-muted)] tracking-widest">{label}</span>
      <span className={`text-[15px] font-semibold tabular-nums ${warn ? "text-[#ff6666]" : "text-[var(--t-text)]"}`}>
        {value}
      </span>
    </div>
  );
}

export function ComercialPanel() {
  const [data, setData] = useState<Resumen | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/manager/comercial/operadores", { cache: "no-store" })
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then((d: Resumen) => setData(d))
      .catch((e) => setError(String((e as Error).message || e)))
      .finally(() => setLoading(false));
  }, []);

  const sinOperador = data?.operadores.filter((o) => !o.operador_email).reduce((a, o) => a + o.n_cuentas, 0) ?? 0;
  const sinSegmentar = data?.operadores.reduce((a, o) => a + o.n_sin_segmentar, 0) ?? 0;
  const totalActivas = data?.operadores.reduce((a, o) => a + o.n_activas, 0) ?? 0;

  return (
    <div className="h-full flex flex-col min-h-0 p-3 gap-3">
      {error && (
        <div className="px-3 py-2 bg-[#ff3333]/15 border border-[#ff3333]/40 text-[#ff6666] text-xs">{error}</div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-2 shrink-0">
        <Kpi label="AUM TOTAL" value={data ? fmtAum(data.total_aum) : "—"} />
        <Kpi label="CUENTAS" value={data ? fmtN(data.total_cuentas) : "—"} />
        <Kpi label="ACTIVAS" value={data ? fmtN(totalActivas) : "—"} />
        <Kpi label="OPERADORES" value={data ? fmtN(data.operadores.length) : "—"} />
        <Kpi label="SIN OPERADOR" value={fmtN(sinOperador)} warn={sinOperador > 0} />
        <Kpi label="SIN SEGMENTAR" value={fmtN(sinSegmentar)} warn={sinSegmentar > 0} />
      </div>

      <div className="text-[10px] text-[var(--t-text-muted)] shrink-0">
        Estado comercial: ACTIVA ≤{data?.dias_activa ?? 30}d · ENFRIÁNDOSE {data?.dias_activa ?? 30}–{data?.dias_dormida ?? 90}d · DORMIDA &gt;{data?.dias_dormida ?? 90}d ·
        AuM al {data?.snapshot_aum ?? "—"}
      </div>

      {/* Tabla por operador */}
      <div className="flex-1 min-h-0 border border-[var(--t-border)] bg-[var(--t-panel)] overflow-auto">
        <table className="w-full text-[11px]">
          <thead className="sticky top-0 bg-[#0a0a0a]">
            <tr className="text-[9px] text-[var(--t-text-muted)] tracking-wide">
              <th className="text-left px-3 py-2">OPERADOR</th>
              <th className="text-right px-2">CUENTAS</th>
              <th className="text-right px-2 text-[#00cc66]">ACTIVAS</th>
              <th className="text-right px-2 text-[#ff9900]">ENFRIÁND.</th>
              <th className="text-right px-2 text-[#ff6666]">DORMIDAS</th>
              <th className="text-right px-2 text-[var(--t-text-dim)]">NUEVAS</th>
              <th className="text-right px-2">SIN SEG.</th>
              <th className="text-right px-3">AUM</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={8} className="text-center text-[var(--t-text-muted)] py-4">Cargando…</td></tr>
            )}
            {!loading && data?.operadores.length === 0 && (
              <tr><td colSpan={8} className="text-center text-[var(--t-text-muted)] py-4">Sin datos.</td></tr>
            )}
            {data?.operadores.map((o, i) => (
              <tr key={o.operador_email ?? `sin-${i}`} className="border-t border-[var(--t-border)] hover:bg-[var(--t-surface)]">
                <td className="px-3 py-1.5 text-[var(--t-text)] truncate">
                  {o.operador_nombre || o.operador_email || "— sin operador —"}
                  {o.huerfana && (
                    <span title="El email del operador ya no es usuario de la página — reasignar"
                      className="ml-1.5 text-[8px] px-1 py-0.5 border border-[#ff4444]/40 text-[#ff6666] bg-[#ff4444]/10">HUÉRFANA</span>
                  )}
                </td>
                <td className="text-right px-2 tabular-nums font-semibold">{fmtN(o.n_cuentas)}</td>
                <td className="text-right px-2 tabular-nums text-[#00cc66]">{fmtN(o.n_activas)}</td>
                <td className="text-right px-2 tabular-nums text-[#ff9900]">{fmtN(o.n_enfriandose)}</td>
                <td className="text-right px-2 tabular-nums text-[#ff6666]">{fmtN(o.n_dormidas)}</td>
                <td className="text-right px-2 tabular-nums text-[var(--t-text-dim)]">{fmtN(o.n_nuevas)}</td>
                <td className="text-right px-2 tabular-nums text-[var(--t-text-dim)]">{fmtN(o.n_sin_segmentar)}</td>
                <td className="text-right px-3 tabular-nums font-semibold text-[#ff9900]">{fmtAum(o.aum_total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
