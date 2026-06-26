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
  // Roles creados localmente (todavía sin guardar). Se mergean con los del server
  // para renderizar su columna; al GUARDAR el PATCH los crea en la matriz.
  const [extraRoles, setExtraRoles] = useState<string[]>([]);
  const [nuevoRol, setNuevoRol] = useState("");

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

  // Roles a renderizar = los del server + los recién creados (sin duplicar).
  const allRoles = useMemo(
    () => (data ? [...data.roles, ...extraRoles.filter((r) => !data.roles.includes(r))] : []),
    [data, extraRoles],
  );

  function addRol() {
    // Normaliza a una key segura: "BACK OFFICE" → "back_office".
    const name = nuevoRol.trim().toLowerCase().replace(/\s+/g, "_");
    if (!name) return;
    if ((data?.roles ?? []).includes(name) || extraRoles.includes(name)) {
      setError(`el rol "${name}" ya existe`);
      return;
    }
    setError(null);
    setExtraRoles((p) => [...p, name]);
    // Arranca con HOME tildado; tildá los demás módulos en la columna y GUARDÁ.
    setWorking((p) => ({ ...p, [name]: new Set(["home"]) }));
    setNuevoRol("");
  }

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
      setExtraRoles([]);   // ya están en el server → se renderizan desde data.roles
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
      <div className="h-full flex items-center justify-center text-[var(--t-text-muted)] text-xs">
        Cargando matriz…
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col min-h-0 p-3 gap-3">
      {error && (
        <div className="px-3 py-2 bg-[#ff3333]/15 border border-[#ff3333]/40 text-[var(--t-neg)] text-xs">
          {error}
        </div>
      )}

      {/* Header con save button */}
      <div className="flex items-center gap-3 shrink-0">
        <div className="text-[10px] text-[var(--t-text-dim)] tracking-wide">
          {allRoles.length} roles × {data.modules.length} módulos
        </div>
        {/* Crear un rol nuevo: aparece como columna; tildás sus módulos y GUARDÁS. */}
        <input
          value={nuevoRol}
          onChange={(e) => setNuevoRol(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") addRol(); }}
          placeholder="nuevo rol…"
          className="w-[150px] bg-[var(--t-surface)] border border-[var(--t-border-2)] text-[var(--t-text)] text-[10px] px-2 py-0.5 font-mono focus:border-[var(--t-accent)] outline-none placeholder:text-[var(--t-text-muted)]"
        />
        <button
          onClick={addRol}
          disabled={!nuevoRol.trim()}
          className="px-2 py-0.5 text-[10px] font-semibold border border-[var(--t-border-2)] text-[var(--t-text-dim)] hover:border-[var(--t-accent)] hover:text-[var(--t-accent)] disabled:opacity-40"
          title="Crear un rol nuevo (arranca con HOME; tildá el resto y GUARDÁ)"
        >➕ rol</button>
        {dirtyRoles.size > 0 && (
          <div className="text-[10px] text-[var(--t-accent)]">
            {dirtyRoles.size} {dirtyRoles.size === 1 ? "cambio pendiente" : "cambios pendientes"}
          </div>
        )}
        <button
          onClick={save}
          disabled={dirtyRoles.size === 0 || saving}
          className="ml-auto px-3 py-1 text-[11px] font-semibold text-[var(--t-on-accent)] bg-[var(--t-accent)] hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {saving ? "GUARDANDO…" : "GUARDAR"}
        </button>
      </div>

      {/* Matriz — flex-1 + scroll propio para que NO se corte la última fila
          (con shrink-0 la matriz se pasaba del alto y clippeaba el último módulo). */}
      <div className="border border-[var(--t-border)] bg-[var(--t-panel)] overflow-auto flex-1 min-h-0">
        <table className="w-full text-xs font-mono">
          <thead>
            <tr className="border-b border-[var(--t-border)]">
              <th className="px-3 py-2 text-left text-[10px] text-[var(--t-text-dim)] font-semibold tracking-wide">
                MÓDULO
              </th>
              {allRoles.map((r) => (
                <th
                  key={r}
                  className={`px-3 py-2 text-center text-[10px] font-semibold tracking-wide ${
                    dirtyRoles.has(r) ? "text-[var(--t-accent)]" : "text-[var(--t-text-dim)]"
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
                <td className="px-3 py-1.5 text-[var(--t-text)]">{m}</td>
                {allRoles.map((r) => {
                  const checked = working[r]?.has(m) ?? false;
                  return (
                    <td key={r} className="px-3 py-1.5 text-center">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggle(r, m)}
                        className="accent-[var(--t-accent)] cursor-pointer"
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
        <div className="px-3 py-1.5 border-b border-[var(--t-border)] text-[10px] text-[var(--t-accent)] tracking-widest font-semibold">
          AUDIT LOG — ÚLTIMOS {audit.length}
        </div>
        <div className="flex-1 overflow-y-auto font-mono text-[11px]">
          {audit.length === 0 ? (
            <div className="text-[var(--t-text-muted)] text-xs py-4 text-center">Sin eventos.</div>
          ) : (
            audit.map((ev, i) => (
              <div
                key={`${ev.ts}-${i}`}
                className="grid grid-cols-[140px_1fr_180px_1fr] gap-2 px-3 py-1 border-b border-[var(--t-border)]"
              >
                <div className="text-[var(--t-text-muted)]">{fmtDate(ev.ts)}</div>
                <div className="text-[var(--t-accent)] truncate">{ev.actor}</div>
                <div className="text-[var(--t-text)]">{ev.action}</div>
                <div className="text-[var(--t-text-dim)] truncate">{ev.target}</div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
