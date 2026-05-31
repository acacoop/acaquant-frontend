"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type MatrixResponse = {
  modules: string[];
  roles: string[];
  matrix: Record<string, string[]>;
};

type AuditEntry = {
  ts: string;
  actor: string;
  action: string;
  target: string;
  before?: unknown;
  after?: unknown;
};

export function RolesPanel() {
  const [data, setData] = useState<MatrixResponse | null>(null);
  const [working, setWorking] = useState<Record<string, Set<string>>>({});
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [rolesRes, auditRes] = await Promise.all([
        fetch("/api/manager/roles", { cache: "no-store" }),
        fetch("/api/manager/roles/audit?limit=50", { cache: "no-store" }),
      ]);
      if (!rolesRes.ok) throw new Error(`HTTP ${rolesRes.status}`);
      const m = (await rolesRes.json()) as MatrixResponse;
      setData(m);
      setWorking(
        Object.fromEntries(
          Object.entries(m.matrix).map(([r, mods]) => [r, new Set(mods)]),
        ),
      );
      if (auditRes.ok) {
        setAudit((await auditRes.json()) as AuditEntry[]);
      }
    } catch (e: unknown) {
      setError(String((e as Error).message || e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  function toggle(role: string, module: string) {
    setWorking((prev) => {
      const next = { ...prev };
      const curr = new Set(next[role] ?? []);
      if (curr.has(module)) curr.delete(module);
      else curr.add(module);
      next[role] = curr;
      return next;
    });
  }

  // Diff: roles con cambios pendientes vs el server.
  const dirtyRoles = useMemo(() => {
    if (!data) return new Set<string>();
    const out = new Set<string>();
    for (const role of Object.keys(working)) {
      const current = new Set(data.matrix[role] ?? []);
      const updated = working[role] ?? new Set();
      if (
        current.size !== updated.size ||
        [...current].some((m) => !updated.has(m)) ||
        [...updated].some((m) => !current.has(m))
      ) {
        out.add(role);
      }
    }
    return out;
  }, [data, working]);

  async function save() {
    if (!data || dirtyRoles.size === 0) return;
    setSaving(true);
    setError(null);
    try {
      await Promise.all(
        [...dirtyRoles].map((role) =>
          fetch(`/api/manager/roles/${encodeURIComponent(role)}`, {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ modules: [...(working[role] ?? [])] }),
          }).then((r) => {
            if (!r.ok) throw new Error(`${role}: HTTP ${r.status}`);
          }),
        ),
      );
      await load();
    } catch (e: unknown) {
      setError(String((e as Error).message || e));
    } finally {
      setSaving(false);
    }
  }

  const fmtDate = (s?: string) => {
    if (!s) return "—";
    const d = new Date(s);
    return `${String(d.getDate()).padStart(2, "0")}/${String(
      d.getMonth() + 1,
    ).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(
      d.getMinutes(),
    ).padStart(2, "0")}`;
  };

  if (loading || !data) {
    return (
      <div className="h-full flex items-center justify-center text-[#555] text-xs">
        Cargando matriz…
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col min-h-0 p-3 gap-3">
      {error && (
        <div className="px-3 py-2 bg-[#ff3333]/15 border border-[#ff3333]/40 text-[#ff6666] text-xs">
          {error}
        </div>
      )}

      {/* Header con save button */}
      <div className="flex items-center gap-3 shrink-0">
        <div className="text-[10px] text-[#808080] tracking-wide">
          {data.roles.length} roles × {data.modules.length} módulos
        </div>
        {dirtyRoles.size > 0 && (
          <div className="text-[10px] text-[#ff9900]">
            {dirtyRoles.size} {dirtyRoles.size === 1 ? "cambio pendiente" : "cambios pendientes"}
          </div>
        )}
        <button
          onClick={save}
          disabled={dirtyRoles.size === 0 || saving}
          className="ml-auto px-3 py-1 text-[11px] font-semibold text-black bg-[#ff9900] hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {saving ? "GUARDANDO…" : "GUARDAR"}
        </button>
      </div>

      {/* Matriz */}
      <div className="border border-[var(--t-border)] bg-[var(--t-panel)] overflow-auto shrink-0">
        <table className="w-full text-xs font-mono">
          <thead>
            <tr className="border-b border-[var(--t-border)]">
              <th className="px-3 py-2 text-left text-[10px] text-[#808080] font-semibold tracking-wide">
                MÓDULO
              </th>
              {data.roles.map((r) => (
                <th
                  key={r}
                  className={`px-3 py-2 text-center text-[10px] font-semibold tracking-wide ${
                    dirtyRoles.has(r) ? "text-[#ff9900]" : "text-[#808080]"
                  }`}
                >
                  {r}
                  {dirtyRoles.has(r) && " *"}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.modules.map((m) => (
              <tr
                key={m}
                className="border-b border-[var(--t-border)] hover:bg-[var(--t-surface)]"
              >
                <td className="px-3 py-1.5 text-[#d0d0d0]">{m}</td>
                {data.roles.map((r) => {
                  const checked = working[r]?.has(m) ?? false;
                  return (
                    <td key={r} className="px-3 py-1.5 text-center">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggle(r, m)}
                        className="accent-[#ff9900] cursor-pointer"
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Audit log */}
      <div className="flex-1 min-h-0 border border-[var(--t-border)] bg-[var(--t-panel)] flex flex-col overflow-hidden">
        <div className="px-3 py-1.5 border-b border-[var(--t-border)] text-[10px] text-[#ff9900] tracking-widest font-semibold">
          AUDIT LOG — ÚLTIMOS {audit.length}
        </div>
        <div className="flex-1 overflow-y-auto font-mono text-[11px]">
          {audit.length === 0 ? (
            <div className="text-[#555] text-xs py-4 text-center">Sin eventos.</div>
          ) : (
            audit.map((ev, i) => (
              <div
                key={`${ev.ts}-${i}`}
                className="grid grid-cols-[140px_1fr_180px_1fr] gap-2 px-3 py-1 border-b border-[var(--t-border)]"
              >
                <div className="text-[#555]">{fmtDate(ev.ts)}</div>
                <div className="text-[#ff9900] truncate">{ev.actor}</div>
                <div className="text-[#d0d0d0]">{ev.action}</div>
                <div className="text-[#808080] truncate">{ev.target}</div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
