"use client";

// MANAGER → ACA VALORES (módulo manager_clientes). Edita el set de cuentas
// "ACA VALORES" (clientes.aca_valores). La vista OPERACIONES lo usa para ver
// Todas / Solo ACA VALORES / Sin ACA VALORES. Consume /api/manager/aca-valores/*.

import { useCallback, useEffect, useRef, useState } from "react";

type Cuenta = { id_cuenta: string; denominacion: string | null; actualizado_por?: string | null };
type Candidato = { id_cuenta: string; denominacion: string | null };

const INPUT =
  "bg-[var(--t-panel)] border border-[var(--t-border-2)] text-[11px] px-2 py-1 text-[var(--t-text)] focus:border-[var(--t-accent)] focus:outline-none";

export function TabAcaValores() {
  const [rows, setRows] = useState<Cuenta[]>([]);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState("");
  const [cands, setCands] = useState<Candidato[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    fetch("/api/manager/aca-valores", { cache: "no-store" })
      .then(r => r.json()).then((d) => setRows(d?.cuentas ?? [])).finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(); }, [load]);

  // Buscador de candidatos (debounce 300ms).
  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if (!q.trim()) { setCands([]); return; }
    timer.current = setTimeout(() => {
      fetch(`/api/manager/aca-valores/candidatos?q=${encodeURIComponent(q.trim())}`, { cache: "no-store" })
        .then(r => r.json()).then((d) => setCands(d?.candidatos ?? [])).catch(() => setCands([]));
    }, 300);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [q]);

  const agregar = async (id_cuenta: string) => {
    setBusy(id_cuenta);
    try {
      await fetch("/api/manager/aca-valores", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id_cuenta }),
      });
      setQ(""); setCands([]); load();
    } finally { setBusy(null); }
  };

  const quitar = async (id_cuenta: string) => {
    setBusy(id_cuenta);
    try {
      await fetch(`/api/manager/aca-valores?id_cuenta=${encodeURIComponent(id_cuenta)}`, { method: "DELETE" });
      load();
    } finally { setBusy(null); }
  };

  return (
    <div className="h-full grid grid-cols-1 lg:grid-cols-2 gap-3 p-3 min-h-0">
      {/* IZQUIERDA: set actual */}
      <div className="flex flex-col min-h-0 border border-[var(--t-border)] bg-[var(--t-panel)] overflow-hidden">
        <div className="shrink-0 flex items-center gap-2 px-3 py-1.5 border-b border-[var(--t-border)] bg-[var(--t-surface)]">
          <span className="text-[11px] font-semibold text-[var(--t-text)]">Cuentas en ACA VALORES</span>
          <span className="text-[10px] text-[var(--t-text-muted)]">{rows.length}</span>
          <button onClick={load} disabled={loading}
            className="ml-auto px-2 py-0.5 text-[10px] border border-[var(--t-border-2)] text-[var(--t-text-muted)] hover:border-[var(--t-accent)] hover:text-[var(--t-accent)] disabled:opacity-40">
            {loading ? "…" : "↻"}
          </button>
        </div>
        <div className="flex-1 min-h-0 overflow-auto">
          {rows.length === 0 ? (
            <div className="p-3 text-[10px] text-[var(--t-text-muted)]">El set está vacío. Agregá cuentas desde la derecha.</div>
          ) : (
            <table className="w-full text-[11px]">
              <thead><tr className="text-[var(--t-text-muted)] text-left sticky top-0 bg-[var(--t-panel)]">
                <th className="px-2 py-1">ID</th><th>DENOMINACIÓN</th><th></th>
              </tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id_cuenta} className="border-t border-[var(--t-border)]">
                    <td className="px-2 py-1 text-[var(--t-text)] font-mono">{r.id_cuenta}</td>
                    <td className="text-[var(--t-text-muted)]">{r.denominacion || "—"}</td>
                    <td className="text-right pr-2">
                      <button onClick={() => quitar(r.id_cuenta)} disabled={busy === r.id_cuenta}
                        className="text-[10px] text-[var(--t-neg)] hover:underline disabled:opacity-40">quitar</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* DERECHA: agregar */}
      <div className="flex flex-col min-h-0 border border-[var(--t-border)] bg-[var(--t-panel)] overflow-hidden">
        <div className="shrink-0 px-3 py-1.5 border-b border-[var(--t-border)] bg-[var(--t-surface)]">
          <span className="text-[11px] font-semibold text-[var(--t-text)]">Agregar cuentas</span>
        </div>
        <div className="p-3 shrink-0">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por id o nombre…"
            className={`${INPUT} w-full`} />
        </div>
        <div className="flex-1 min-h-0 overflow-auto px-3 pb-3">
          {cands.length === 0 ? (
            <div className="text-[10px] text-[var(--t-text-muted)]">{q.trim() ? "Sin resultados." : "Escribí para buscar cuentas."}</div>
          ) : (
            <table className="w-full text-[11px]">
              <tbody>
                {cands.map((c) => (
                  <tr key={c.id_cuenta} className="border-t border-[var(--t-border)]">
                    <td className="px-2 py-1 text-[var(--t-text)] font-mono">{c.id_cuenta}</td>
                    <td className="text-[var(--t-text-muted)]">{c.denominacion || "—"}</td>
                    <td className="text-right pr-2">
                      <button onClick={() => agregar(c.id_cuenta)} disabled={busy === c.id_cuenta}
                        className="text-[10px] text-[var(--t-accent)] hover:underline disabled:opacity-40">+ agregar</button>
                    </td>
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
