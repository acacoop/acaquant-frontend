"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

// GRUPOS de acceso por cuenta. Un grupo agrupa usuarios (emails) + cuentas.
// Backend: /api/manager/grupos. Regla: usuario SIN grupo ve TODO; usuario
// en >=1 grupo ve solo las cuentas de sus grupos. El admin ve todo siempre.

type Grupo = {
  _id: string;
  nombre: string;
  emails: string[];
  id_cuentas: string[];
  creado_por?: string;
  updated_at?: string;
};

type Cuenta = { id_cuenta: string; cuenta: string };

type GruposResponse = { grupos: Grupo[]; cuentas: Cuenta[] };

export function GruposPanel() {
  const [grupos, setGrupos] = useState<Grupo[]>([]);
  const [cuentas, setCuentas] = useState<Cuenta[]>([]);
  const [users, setUsers] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newNombre, setNewNombre] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [gRes, uRes] = await Promise.all([
        fetch("/api/manager/grupos", { cache: "no-store" }),
        fetch("/api/manager/users", { cache: "no-store" }),
      ]);
      if (!gRes.ok) throw new Error(`grupos HTTP ${gRes.status}`);
      const gData = (await gRes.json()) as GruposResponse;
      setGrupos(gData.grupos || []);
      setCuentas(gData.cuentas || []);
      if (uRes.ok) {
        const uData = (await uRes.json()) as { users?: { email: string }[] };
        setUsers((uData.users || []).map((u) => u.email));
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function createGrupo() {
    const nombre = newNombre.trim();
    if (!nombre) return;
    setBusy("__new__");
    try {
      const res = await fetch("/api/manager/grupos", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ nombre, emails: [], id_cuentas: [] }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setNewNombre("");
      await load();
    } catch (e: unknown) {
      setError(String((e as Error).message || e));
    } finally {
      setBusy(null);
    }
  }

  async function saveGrupo(
    id: string,
    patch: { nombre: string; emails: string[]; id_cuentas: string[] },
  ) {
    setBusy(id);
    try {
      const res = await fetch(`/api/manager/grupos/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await load();
    } catch (e: unknown) {
      setError(String((e as Error).message || e));
    } finally {
      setBusy(null);
    }
  }

  async function deleteGrupo(id: string, nombre: string) {
    if (
      !confirm(
        `¿Eliminar el grupo "${nombre}"? Los usuarios que estaban solo en él vuelven a ver todas las cuentas.`,
      )
    )
      return;
    setBusy(id);
    try {
      const res = await fetch(`/api/manager/grupos/${id}`, { method: "DELETE" });
      if (!res.ok && res.status !== 204) throw new Error(`HTTP ${res.status}`);
      await load();
    } catch (e: unknown) {
      setError(String((e as Error).message || e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="h-full flex flex-col min-h-0 p-3 gap-3">
      {error && (
        <div className="px-3 py-2 bg-[#ff3333]/15 border border-[#ff3333]/40 text-[#ff6666] text-xs">
          {error}
        </div>
      )}

      <div className="text-[10px] text-[var(--t-text-muted)] leading-relaxed shrink-0">
        Un usuario que pertenece a uno o más grupos solo ve/opera las cuentas de
        sus grupos. Un usuario que no está en ningún grupo ve TODO. El admin ve
        todo siempre.
      </div>

      {/* Crear grupo */}
      <div className="border border-[var(--t-border)] bg-[var(--t-panel)] p-3 shrink-0">
        <div className="text-[10px] text-[var(--t-accent)] tracking-widest font-semibold mb-2">
          AGREGAR GRUPO
        </div>
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <div className="text-[9px] text-[var(--t-text-dim)] mb-0.5">NOMBRE</div>
            <input
              type="text"
              value={newNombre}
              onChange={(e) => setNewNombre(e.target.value)}
              placeholder="ej. Mesa Rosario"
              className="w-full bg-[var(--t-surface)] border border-[var(--t-border-2)] text-[var(--t-text)] text-xs px-2 py-1 font-mono focus:border-[var(--t-accent)] outline-none"
            />
          </div>
          <button
            onClick={createGrupo}
            disabled={!newNombre.trim() || busy === "__new__"}
            className="px-3 py-1 text-[11px] font-semibold text-black bg-[var(--t-accent)] hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {busy === "__new__" ? "..." : "AGREGAR"}
          </button>
        </div>
        <div className="text-[9px] text-[var(--t-text-muted)] mt-1.5">
          Se crea vacío — después le asignás usuarios y cuentas abajo.
        </div>
      </div>

      {/* Lista de grupos */}
      <div className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-3">
        {loading ? (
          <div className="text-[var(--t-text-muted)] text-xs py-4 text-center">Cargando…</div>
        ) : grupos.length === 0 ? (
          <div className="text-[var(--t-text-muted)] text-xs py-4 text-center">
            Sin grupos. Agregá uno arriba.
          </div>
        ) : (
          grupos.map((g) => (
            <GrupoCard
              key={g._id}
              grupo={g}
              users={users}
              cuentas={cuentas}
              busy={busy === g._id}
              onSave={(patch) => saveGrupo(g._id, patch)}
              onDelete={() => deleteGrupo(g._id, g.nombre)}
            />
          ))
        )}
      </div>
    </div>
  );
}

function GrupoCard({
  grupo,
  users,
  cuentas,
  busy,
  onSave,
  onDelete,
}: {
  grupo: Grupo;
  users: string[];
  cuentas: Cuenta[];
  busy: boolean;
  onSave: (patch: {
    nombre: string;
    emails: string[];
    id_cuentas: string[];
  }) => void;
  onDelete: () => void;
}) {
  const [nombre, setNombre] = useState(grupo.nombre);
  const [emails, setEmails] = useState<string[]>(grupo.emails);
  const [idCuentas, setIdCuentas] = useState<string[]>(grupo.id_cuentas);
  const [filtroCuenta, setFiltroCuenta] = useState("");

  const cuentaLabel = useMemo(() => {
    const m = new Map(cuentas.map((c) => [c.id_cuenta, c.cuenta]));
    return (id: string) => m.get(id) || id;
  }, [cuentas]);

  const sorted = (xs: string[]) => xs.slice().sort().join("");
  const dirty =
    nombre.trim() !== grupo.nombre ||
    sorted(emails) !== sorted(grupo.emails) ||
    sorted(idCuentas) !== sorted(grupo.id_cuentas);

  const usersDisponibles = users.filter((u) => !emails.includes(u));

  const cuentasDisponibles = useMemo(() => {
    const f = filtroCuenta.trim().toLowerCase();
    return cuentas
      .filter((c) => !idCuentas.includes(c.id_cuenta))
      .filter(
        (c) =>
          !f ||
          c.id_cuenta.toLowerCase().includes(f) ||
          c.cuenta.toLowerCase().includes(f),
      )
      .slice(0, 30);
  }, [cuentas, idCuentas, filtroCuenta]);

  return (
    <div className="border border-[var(--t-border)] bg-[var(--t-panel)] p-3">
      {/* Header: nombre + acciones */}
      <div className="flex items-center gap-2 mb-3">
        <input
          type="text"
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          className="flex-1 bg-[var(--t-surface)] border border-[var(--t-border-2)] text-[var(--t-text)] text-xs px-2 py-1 font-mono focus:border-[var(--t-accent)] outline-none"
        />
        <button
          onClick={() =>
            onSave({ nombre: nombre.trim(), emails, id_cuentas: idCuentas })
          }
          disabled={busy || !dirty || !nombre.trim()}
          className="px-3 py-1 text-[11px] font-semibold text-black bg-[var(--t-accent)] hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {busy ? "..." : "GUARDAR"}
        </button>
        <button
          onClick={onDelete}
          disabled={busy}
          className="px-2 py-1 text-[10px] border border-[var(--t-border-2)] text-[#ff4444] hover:border-[#ff4444] disabled:opacity-40"
        >
          BORRAR
        </button>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* Usuarios */}
        <div>
          <div className="text-[9px] text-[var(--t-text-dim)] tracking-wide mb-1">
            USUARIOS ({emails.length})
          </div>
          <div className="flex flex-wrap gap-1 mb-1.5 min-h-[22px]">
            {emails.length === 0 && (
              <span className="text-[10px] text-[var(--t-text-muted)]">sin usuarios</span>
            )}
            {emails.map((em) => (
              <span
                key={em}
                className="flex items-center gap-1 text-[10px] font-mono text-[var(--t-text)] bg-[var(--t-surface-2)] border border-[var(--t-border-2)] px-1.5 py-0.5"
              >
                {em}
                <button
                  onClick={() => setEmails(emails.filter((x) => x !== em))}
                  className="text-[#ff4444] hover:text-[#ff6666]"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
          <select
            value=""
            onChange={(e) => {
              if (e.target.value) setEmails([...emails, e.target.value]);
            }}
            className="w-full bg-[var(--t-surface)] border border-[var(--t-border-2)] text-[var(--t-text)] text-[11px] px-1.5 py-1 font-mono focus:border-[var(--t-accent)] outline-none"
          >
            <option value="">+ agregar usuario…</option>
            {usersDisponibles.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>
        </div>

        {/* Cuentas */}
        <div>
          <div className="text-[9px] text-[var(--t-text-dim)] tracking-wide mb-1">
            CUENTAS ({idCuentas.length})
          </div>
          <div className="flex flex-wrap gap-1 mb-1.5 min-h-[22px]">
            {idCuentas.length === 0 && (
              <span className="text-[10px] text-[var(--t-text-muted)]">sin cuentas</span>
            )}
            {idCuentas.map((id) => (
              <span
                key={id}
                title={cuentaLabel(id)}
                className="flex items-center gap-1 text-[10px] font-mono text-[var(--t-text)] bg-[var(--t-surface-2)] border border-[var(--t-border-2)] px-1.5 py-0.5"
              >
                <span className="text-[var(--t-accent)]">{id}</span>
                <span className="text-[var(--t-text-dim)] max-w-[120px] truncate">
                  {cuentaLabel(id)}
                </span>
                <button
                  onClick={() =>
                    setIdCuentas(idCuentas.filter((x) => x !== id))
                  }
                  className="text-[#ff4444] hover:text-[#ff6666]"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
          <input
            type="text"
            value={filtroCuenta}
            onChange={(e) => setFiltroCuenta(e.target.value)}
            placeholder="buscar cuenta por id o nombre…"
            className="w-full bg-[var(--t-surface)] border border-[var(--t-border-2)] text-[var(--t-text)] text-[11px] px-1.5 py-1 font-mono focus:border-[var(--t-accent)] outline-none mb-1"
          />
          {filtroCuenta.trim() && (
            <div className="max-h-[140px] overflow-y-auto border border-[var(--t-border)]">
              {cuentasDisponibles.length === 0 ? (
                <div className="text-[10px] text-[var(--t-text-muted)] px-1.5 py-1">
                  sin coincidencias
                </div>
              ) : (
                cuentasDisponibles.map((c) => (
                  <button
                    key={c.id_cuenta}
                    onClick={() => {
                      setIdCuentas([...idCuentas, c.id_cuenta]);
                      setFiltroCuenta("");
                    }}
                    className="w-full text-left text-[10px] font-mono px-1.5 py-1 hover:bg-[var(--t-surface-2)] flex gap-2"
                  >
                    <span className="text-[var(--t-accent)] w-12 shrink-0">
                      {c.id_cuenta}
                    </span>
                    <span className="text-[var(--t-text)] truncate">{c.cuenta}</span>
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
