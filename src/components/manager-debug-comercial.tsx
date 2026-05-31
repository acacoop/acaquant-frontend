"use client";

import { useEffect, useState } from "react";

// Debug del Informe comercial (Manager → Diagnóstico): elegí un operador o un
// segmento y mirá cuántas operaciones reconoce y qué volúmenes/aranceles, por
// cuenta. Audita el ticket promedio. Consume /api/manager/checks/debug-comercial.

type Fila = {
  id_cuenta: string; denominacion: string;
  n_ops: number; vol_total: number; vol_mes: number; ar_total: number;
};
type Totales = { n_ops: number; vol_total: number; vol_mes: number; ar_total: number; ticket_promedio: number };
type Resp = {
  operador: string | null; segmento: string | null;
  n_cuentas_filtradas: number; n_cuentas_con_actividad: number;
  totales: Totales; cuentas: Fila[];
};
type Op = { operador_email: string; operador_nombre: string | null; n_cuentas: number };

const fmt = (n: number) => Math.round(n || 0).toLocaleString("es-AR");

export function ManagerDebugComercialPanel() {
  const [open, setOpen] = useState(false);
  const [operadores, setOperadores] = useState<Op[]>([]);
  const [operador, setOperador] = useState("");
  const [segmento, setSegmento] = useState("");
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || operadores.length) return;
    void fetch("/api/operaciones/comercial/operadores", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : []))
      .then(setOperadores)
      .catch(() => {});
  }, [open, operadores.length]);

  const run = () => {
    setLoading(true);
    const p = new URLSearchParams();
    if (operador) p.set("operador", operador);
    if (segmento.trim()) p.set("segmento", segmento.trim());
    void fetch(`/api/manager/checks/debug-comercial?${p.toString()}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  };

  return (
    <div className="border border-[var(--t-border)] bg-[var(--t-panel)]">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-[var(--t-surface)] transition-colors"
      >
        <span className="text-[10px] text-[var(--t-text-muted)]">{open ? "▾" : "▸"}</span>
        <span className="text-[11px] font-semibold text-[var(--t-text)]">
          Debug Comercial — # operaciones y volúmenes por operador / segmento
        </span>
      </button>
      {open && (
        <div className="border-t border-[var(--t-border)] p-3 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={operador}
              onChange={(e) => setOperador(e.target.value)}
              className="bg-[var(--t-surface)] border border-[var(--t-border-2)] text-[var(--t-text)] text-[11px] px-2 py-1 font-mono focus:border-[var(--t-accent)] outline-none"
            >
              <option value="">— operador —</option>
              {operadores.map((o) => (
                <option key={o.operador_email} value={o.operador_email}>
                  {o.operador_nombre || o.operador_email}
                </option>
              ))}
            </select>
            <input
              value={segmento}
              onChange={(e) => setSegmento(e.target.value)}
              placeholder="segmento (nivel_1)"
              className="bg-[var(--t-surface)] border border-[var(--t-border-2)] text-[var(--t-text)] text-[11px] px-2 py-1 font-mono focus:border-[var(--t-accent)] outline-none"
            />
            <button
              onClick={run}
              disabled={loading || (!operador && !segmento.trim())}
              className="px-3 py-1 text-[10px] font-semibold border border-[var(--t-border-2)] text-[var(--t-text-muted)] hover:border-[var(--t-accent)] hover:text-[var(--t-accent)] transition-colors disabled:opacity-40"
            >
              {loading ? "Ejecutando…" : "▶ Ejecutar"}
            </button>
            <span className="text-[9px] text-[var(--t-text-muted)]">elegí operador y/o segmento</span>
          </div>

          {data && (
            <>
              <div className="text-[11px] text-[var(--t-text)] flex flex-wrap gap-x-4 gap-y-1 font-mono">
                <span className="text-[var(--t-text-dim)]">cuentas: {data.n_cuentas_con_actividad}/{data.n_cuentas_filtradas}</span>
                <span># ops: <b className="text-[var(--t-accent)]">{fmt(data.totales.n_ops)}</b></span>
                <span>vol total: ${fmt(data.totales.vol_total)}</span>
                <span>vol mes: ${fmt(data.totales.vol_mes)}</span>
                <span>aranceles: ${fmt(data.totales.ar_total)}</span>
                <span>ticket prom: <b className="text-[var(--t-accent)]">${fmt(data.totales.ticket_promedio)}</b></span>
              </div>
              <div className="max-h-[320px] overflow-auto border border-[var(--t-border)]">
                <table className="w-full text-[10px] font-mono tabular-nums">
                  <thead className="sticky top-0 bg-[#0a0a0a] text-[9px] text-[var(--t-text-muted)] uppercase">
                    <tr>
                      <th className="text-left px-2 py-1">Cuenta</th>
                      <th className="text-right px-2"># ops</th>
                      <th className="text-right px-2">Vol total</th>
                      <th className="text-right px-2">Vol mes</th>
                      <th className="text-right px-2">Arancel</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.cuentas.length === 0 && (
                      <tr><td colSpan={5} className="text-center text-[var(--t-text-muted)] py-3">Sin actividad.</td></tr>
                    )}
                    {data.cuentas.map((f) => (
                      <tr key={f.id_cuenta} className="border-t border-[var(--t-border)]">
                        <td className="px-2 py-1 text-[var(--t-text)] truncate max-w-[240px]" title={f.denominacion}>
                          <span className="text-[var(--t-text-muted)]">[{f.id_cuenta}]</span> {f.denominacion}
                        </td>
                        <td className="px-2 py-1 text-right">{f.n_ops}</td>
                        <td className="px-2 py-1 text-right">${fmt(f.vol_total)}</td>
                        <td className="px-2 py-1 text-right text-[var(--t-text-dim)]">${fmt(f.vol_mes)}</td>
                        <td className="px-2 py-1 text-right text-[#9fb8d0]">${fmt(f.ar_total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
