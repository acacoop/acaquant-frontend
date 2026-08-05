"use client";

// MANAGER → MESA (módulo `manager`, admin-only). Gestión de MESA DE DINERO:
//   IZQ: catálogo de TRADERS (los únicos nombres válidos del campo Trader
//        en /mesa-dinero — se cargan a mano acá, no se tipean en la vista).
//   CENTRO/DER: allowlists de ESCRITURA, una por vista (Mesa de Dinero y
//        SENEBIS son equipos distintos). Ver la vista lo da el módulo; esto
//        decide quién puede CREAR/EDITAR adentro.
// Consume /api/manager/mesa/*. Todo cambio queda auditado.

import { useCallback, useEffect, useRef, useState } from "react";

type Trader = { nombre: string; creado_por?: string | null };
type Escritor = { email: string; agregado_por?: string | null };
type Candidato = { email: string; role: string | null };

const INPUT =
  "bg-[var(--t-panel)] border border-[var(--t-border-2)] text-[11px] px-2 py-1 text-[var(--t-text)] focus:border-[var(--t-accent)] focus:outline-none";

export function TabMesa() {
  // ── Traders ──
  const [traders, setTraders] = useState<Trader[]>([]);
  const [nuevoTrader, setNuevoTrader] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch("/api/manager/mesa/traders", { cache: "no-store" })
      .then(r => r.json()).then((d) => setTraders(d?.traders ?? [])).catch(console.error);
  }, []);
  useEffect(() => { load(); }, [load]);

  const agregarTrader = async () => {
    const nombre = nuevoTrader.trim();
    if (!nombre) return;
    setBusy("trader:" + nombre);
    try {
      await fetch("/api/manager/mesa/traders", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nombre }),
      });
      setNuevoTrader(""); load();
    } finally { setBusy(null); }
  };

  const quitarTrader = async (nombre: string) => {
    setBusy("trader:" + nombre);
    try {
      await fetch(`/api/manager/mesa/traders?nombre=${encodeURIComponent(nombre)}`, { method: "DELETE" });
      load();
    } finally { setBusy(null); }
  };

  return (
    <div className="h-full grid grid-cols-1 lg:grid-cols-3 gap-3 p-3 min-h-0">
      {/* IZQUIERDA: traders */}
      <div className="flex flex-col min-h-0 border border-[var(--t-border)] bg-[var(--t-panel)] overflow-hidden">
        <div className="shrink-0 px-3 py-1.5 border-b border-[var(--t-border)] bg-[var(--t-surface)]">
          <span className="text-[11px] font-semibold text-[var(--t-text)]">TRADERS — Mesa de Dinero</span>
          <span className="ml-2 text-[10px] text-[var(--t-text-muted)]">{traders.length}</span>
          <div className="text-[9px] text-[var(--t-text-muted)] mt-0.5">
            Los únicos nombres que se pueden elegir en el campo TRADER de la vista Mesa de Dinero.
          </div>
        </div>
        <div className="p-3 shrink-0 flex gap-2">
          <input value={nuevoTrader} onChange={(e) => setNuevoTrader(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") agregarTrader(); }}
            placeholder="Nombre del trader…" className={`${INPUT} flex-1`} />
          <button onClick={agregarTrader} disabled={!nuevoTrader.trim()}
            className="px-3 py-1 text-[10px] font-semibold bg-[var(--t-accent)] text-[var(--t-on-accent)] disabled:opacity-40">
            + AGREGAR
          </button>
        </div>
        <div className="flex-1 min-h-0 overflow-auto px-3 pb-3">
          {traders.length === 0 ? (
            <div className="text-[10px] text-[var(--t-text-muted)]">Sin traders. Sin al menos uno, no se pueden registrar operaciones.</div>
          ) : (
            <table className="w-full text-[11px]">
              <tbody>
                {traders.map((t) => (
                  <tr key={t.nombre} className="border-t border-[var(--t-border)]">
                    <td className="px-2 py-1 text-[var(--t-text)]">{t.nombre}</td>
                    <td className="text-[10px] text-[var(--t-text-muted)]">{t.creado_por ?? ""}</td>
                    <td className="text-right pr-2">
                      <button onClick={() => quitarTrader(t.nombre)} disabled={busy === "trader:" + t.nombre}
                        className="text-[10px] text-[var(--t-neg)] hover:underline disabled:opacity-40">quitar</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* CENTRO: quién escribe en Mesa de Dinero */}
      <PanelEscritores
        titulo="PERMISOS — Mesa de Dinero"
        detalle="Usuarios que pueden REGISTRAR/EDITAR en Mesa de Dinero (admin siempre puede). Ver la vista lo da el acceso a NEGOCIO."
        base="/api/manager/mesa/escritores"
      />

      {/* DERECHA: quién escribe en SENEBIS */}
      <PanelEscritores
        titulo="PERMISOS — Senebis"
        detalle="Usuarios que pueden CARGAR/EDITAR órdenes en Senebis (admin siempre puede). Ver la vista lo da el acceso a BACK OFFICE."
        base="/api/manager/mesa/senebis-escritores"
      />
    </div>
  );
}


// Allowlist de escritura de una vista. Misma UI para Mesa de Dinero y Senebis;
// lo único que cambia es contra qué endpoint habla.
function PanelEscritores({ titulo, detalle, base }: {
  titulo: string; detalle: string; base: string;
}) {
  const [escritores, setEscritores] = useState<Escritor[]>([]);
  const [q, setQ] = useState("");
  const [cands, setCands] = useState<Candidato[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(() => {
    fetch(base, { cache: "no-store" })
      .then(r => r.json()).then((d) => setEscritores(d?.escritores ?? [])).catch(console.error);
  }, [base]);
  useEffect(() => { load(); }, [load]);

  // Buscador de usuarios candidatos (debounce 300ms).
  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if (!q.trim()) { setCands([]); return; }
    timer.current = setTimeout(() => {
      fetch(`${base}/candidatos?q=${encodeURIComponent(q.trim())}`, { cache: "no-store" })
        .then(r => r.json()).then((d) => setCands(d?.candidatos ?? [])).catch(() => setCands([]));
    }, 300);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [q, base]);

  const agregar = async (email: string) => {
    setBusy(email);
    try {
      await fetch(base, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      setQ(""); setCands([]); load();
    } finally { setBusy(null); }
  };

  const quitar = async (email: string) => {
    setBusy(email);
    try {
      await fetch(`${base}?email=${encodeURIComponent(email)}`, { method: "DELETE" });
      load();
    } finally { setBusy(null); }
  };

  return (
    <div className="flex flex-col min-h-0 border border-[var(--t-border)] bg-[var(--t-panel)] overflow-hidden">
      <div className="shrink-0 px-3 py-1.5 border-b border-[var(--t-border)] bg-[var(--t-surface)]">
        <span className="text-[11px] font-semibold text-[var(--t-text)]">{titulo}</span>
        <span className="ml-2 text-[10px] text-[var(--t-text-muted)]">{escritores.length}</span>
        <div className="text-[9px] text-[var(--t-text-muted)] mt-0.5">{detalle}</div>
      </div>
      <div className="p-3 shrink-0">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar usuario por email…"
          className={`${INPUT} w-full`} />
      </div>
      {cands.length > 0 && (
        <div className="shrink-0 max-h-40 overflow-auto px-3 pb-2">
          <table className="w-full text-[11px]">
            <tbody>
              {cands.map((c) => (
                <tr key={c.email} className="border-t border-[var(--t-border)]">
                  <td className="px-2 py-1 font-mono text-[var(--t-text)]">{c.email}</td>
                  <td className="text-[10px] text-[var(--t-text-muted)]">{c.role ?? ""}</td>
                  <td className="text-right pr-2">
                    <button onClick={() => agregar(c.email)} disabled={busy === c.email}
                      className="text-[10px] text-[var(--t-accent)] hover:underline disabled:opacity-40">+ agregar</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="flex-1 min-h-0 overflow-auto px-3 pb-3">
        {escritores.length === 0 ? (
          <div className="text-[10px] text-[var(--t-text-muted)]">Nadie tiene escritura todavía (solo admin). Buscá arriba para agregar.</div>
        ) : (
          <table className="w-full text-[11px]">
            <thead><tr className="text-[var(--t-text-muted)] text-left">
              <th className="px-2 py-1">EMAIL</th><th>AGREGÓ</th><th></th>
            </tr></thead>
            <tbody>
              {escritores.map((e) => (
                <tr key={e.email} className="border-t border-[var(--t-border)]">
                  <td className="px-2 py-1 font-mono text-[var(--t-text)]">{e.email}</td>
                  <td className="text-[10px] text-[var(--t-text-muted)]">{e.agregado_por ?? ""}</td>
                  <td className="text-right pr-2">
                    <button onClick={() => quitar(e.email)} disabled={busy === e.email}
                      className="text-[10px] text-[var(--t-neg)] hover:underline disabled:opacity-40">quitar</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
