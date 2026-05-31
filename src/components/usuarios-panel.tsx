"use client";

import { useCallback, useEffect, useState } from "react";

type User = {
  email: string;
  role: string;
  enabled: boolean;
  notes?: string;
  created_at?: string;
  updated_at?: string;
  last_seen_at?: string;
  auto_registered?: boolean;
};

type UsersResponse = {
  users: User[];
  roles: string[];
};

// Umbral de inactividad para la revisión periódica de accesos.
const INACTIVE_DAYS = 90;

function daysSince(s?: string): number | null {
  if (!s) return null;
  const d = new Date(s);
  if (isNaN(d.getTime())) return null;
  return Math.floor((Date.now() - d.getTime()) / 86_400_000);
}

export function UsuariosPanel() {
  const [users, setUsers] = useState<User[]>([]);
  const [roles, setRoles] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newEmail, setNewEmail] = useState("");
  const [newRole, setNewRole] = useState("");
  const [newNotes, setNewNotes] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/manager/users", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as UsersResponse;
      setUsers(data.users || []);
      setRoles(data.roles || []);
      if (!newRole && data.roles?.length) setNewRole(data.roles[0]);
    } catch (e: unknown) {
      setError(String((e as Error).message || e));
    } finally {
      setLoading(false);
    }
  }, [newRole]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function patchUser(email: string, patch: Partial<User>) {
    setBusy(email);
    try {
      const res = await fetch(
        `/api/manager/users/${encodeURIComponent(email)}`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(patch),
        },
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await load();
    } catch (e: unknown) {
      setError(String((e as Error).message || e));
    } finally {
      setBusy(null);
    }
  }

  async function deleteUser(email: string) {
    if (!confirm(`¿Eliminar ${email}?`)) return;
    setBusy(email);
    try {
      const res = await fetch(
        `/api/manager/users/${encodeURIComponent(email)}`,
        { method: "DELETE" },
      );
      if (!res.ok && res.status !== 204) throw new Error(`HTTP ${res.status}`);
      await load();
    } catch (e: unknown) {
      setError(String((e as Error).message || e));
    } finally {
      setBusy(null);
    }
  }

  async function createUser() {
    const email = newEmail.trim().toLowerCase();
    if (!email || !newRole) return;
    setBusy("__new__");
    try {
      const res = await fetch("/api/manager/users", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email,
          role: newRole,
          enabled: true,
          notes: newNotes.trim() || null,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setNewEmail("");
      setNewNotes("");
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

      {/* Crear usuario */}
      <div className="border border-[#1a1a1a] bg-[var(--t-panel)] p-3 shrink-0">
        <div className="text-[10px] text-[#ff9900] tracking-widest font-semibold mb-2">
          AGREGAR USUARIO
        </div>
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <div className="text-[9px] text-[#808080] mb-0.5">EMAIL</div>
            <input
              type="email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              placeholder="usuario@dominio.com"
              className="w-full bg-[var(--t-surface)] border border-[#2a2a2a] text-[#d0d0d0] text-xs px-2 py-1 font-mono focus:border-[#ff9900] outline-none"
            />
          </div>
          <div>
            <div className="text-[9px] text-[#808080] mb-0.5">ROLE</div>
            <select
              value={newRole}
              onChange={(e) => setNewRole(e.target.value)}
              className="bg-[var(--t-surface)] border border-[#2a2a2a] text-[#d0d0d0] text-xs px-2 py-1 font-mono focus:border-[#ff9900] outline-none"
            >
              {roles.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>
          <div className="flex-1">
            <div className="text-[9px] text-[#808080] mb-0.5">NOTAS (opcional)</div>
            <input
              type="text"
              value={newNotes}
              onChange={(e) => setNewNotes(e.target.value)}
              className="w-full bg-[var(--t-surface)] border border-[#2a2a2a] text-[#d0d0d0] text-xs px-2 py-1 font-mono focus:border-[#ff9900] outline-none"
            />
          </div>
          <button
            onClick={createUser}
            disabled={!newEmail.trim() || !newRole || busy === "__new__"}
            className="px-3 py-1 text-[11px] font-semibold text-black bg-[#ff9900] hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {busy === "__new__" ? "..." : "AGREGAR"}
          </button>
        </div>
      </div>

      {/* Tabla */}
      <div className="flex-1 min-h-0 border border-[#1a1a1a] bg-[var(--t-panel)] flex flex-col overflow-hidden">
        <div className="grid grid-cols-[1fr_120px_90px_1fr_170px_80px] gap-2 px-3 py-2 border-b border-[#1a1a1a] text-[9px] text-[#808080] tracking-wide shrink-0">
          <div>EMAIL</div>
          <div>ROLE</div>
          <div>ENABLED</div>
          <div>NOTAS</div>
          <div>ÚLT. VISTO</div>
          <div></div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="text-[#555] text-xs py-4 text-center">Cargando…</div>
          ) : users.length === 0 ? (
            <div className="text-[#555] text-xs py-4 text-center">
              Sin usuarios. Agregá uno arriba.
            </div>
          ) : (
            users.map((u) => (
              <UserRow
                key={u.email}
                user={u}
                roles={roles}
                busy={busy === u.email}
                onPatch={(patch) => patchUser(u.email, patch)}
                onDelete={() => deleteUser(u.email)}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function UserRow({
  user,
  roles,
  busy,
  onPatch,
  onDelete,
}: {
  user: User;
  roles: string[];
  busy: boolean;
  onPatch: (patch: Partial<User>) => void;
  onDelete: () => void;
}) {
  return (
    <div className="grid grid-cols-[1fr_120px_90px_1fr_170px_80px] gap-2 px-3 py-1.5 border-b border-[#141414] text-xs items-center hover:bg-[var(--t-surface)]">
      <div className="text-[#d0d0d0] font-mono truncate flex items-center gap-1.5">
        <span className="truncate">{user.email}</span>
        {user.auto_registered && (
          <span
            title="Detectado automáticamente en primera visita — revisar role"
            className="text-[8px] px-1 py-0.5 border border-[#ff9900]/40 text-[#ff9900] bg-[#ff9900]/10 shrink-0"
          >
            AUTO
          </span>
        )}
      </div>
      <select
        value={user.role}
        disabled={busy}
        onChange={(e) => onPatch({ role: e.target.value })}
        className="bg-[var(--t-surface)] border border-[#2a2a2a] text-[#d0d0d0] text-[11px] px-1 py-0.5 font-mono focus:border-[#ff9900] outline-none disabled:opacity-40"
      >
        {roles.map((r) => (
          <option key={r} value={r}>
            {r}
          </option>
        ))}
      </select>
      <label className="flex items-center gap-1 cursor-pointer">
        <input
          type="checkbox"
          checked={user.enabled}
          disabled={busy}
          onChange={(e) => onPatch({ enabled: e.target.checked })}
          className="accent-[#ff9900]"
        />
        <span
          className={`text-[10px] ${user.enabled ? "text-[#00cc66]" : "text-[#555]"}`}
        >
          {user.enabled ? "ON" : "OFF"}
        </span>
      </label>
      <div className="text-[#808080] text-[11px] truncate">{user.notes || "—"}</div>
      <LastSeenCell lastSeen={user.last_seen_at} />

      <button
        onClick={onDelete}
        disabled={busy}
        className="px-2 py-0.5 text-[10px] border border-[#2a2a2a] text-[#ff4444] hover:border-[#ff4444] disabled:opacity-40"
      >
        BORRAR
      </button>
    </div>
  );
}

// Celda "último acceso": muestra la fecha real del último login (no cae a
// updated_at, que es solo cuándo se editó el registro). "(nunca)" si el user
// jamás entró, y un badge INACTIVO si no se ve hace > INACTIVE_DAYS — los
// candidatos a deshabilitar en la revisión periódica de accesos.
function LastSeenCell({ lastSeen }: { lastSeen?: string }) {
  const dias = daysSince(lastSeen);
  if (!lastSeen || dias === null) {
    return <div className="text-[#ff9900] text-[10px]">(nunca entró)</div>;
  }
  const d = new Date(lastSeen);
  const fecha = `${String(d.getDate()).padStart(2, "0")}/${String(
    d.getMonth() + 1,
  ).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(
    d.getMinutes(),
  ).padStart(2, "0")}`;
  const inactivo = dias >= INACTIVE_DAYS;
  return (
    <div className="flex items-center gap-1.5 text-[10px]">
      <span className="text-[#888]">{fecha}</span>
      <span className={inactivo ? "text-[#ff6666]" : "text-[#555]"}>
        ·{" "}
        {dias === 0 ? "hoy" : `hace ${dias}d`}
      </span>
      {inactivo && (
        <span
          title={`Sin actividad hace ${dias} días — candidato a deshabilitar`}
          className="text-[8px] px-1 py-0.5 border border-[#ff4444]/40 text-[#ff6666] bg-[#ff4444]/10 shrink-0"
        >
          INACTIVO
        </span>
      )}
    </div>
  );
}
