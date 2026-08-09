"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Botón flotante de SALUD — abajo a la derecha, SOLO admin.
 *
 * El modal automático solo aparece ante un incidente CONFIRMADO (roto y sin
 * arreglarse por más de 30'). Este botón es la otra mitad: poder mirar cuando uno
 * quiere, sin esperar a que algo se rompa ni entrar a Manager.
 *
 * Lleva el número de chequeos rotos encima, así el estado del sistema está visible
 * en TODA la app sin ocupar lugar. Si no hay nada roto queda apagado y discreto.
 *
 * Solo admin: el endpoint está gateado y un 403 hace que el botón no se muestre.
 */

const POLL_MS = 5 * 60_000;

type Chequeo = { id: string; titulo: string; estado: "ok" | "warn" | "error"; motivo: string };

export function SaludBoton({ onAbrir }: { onAbrir?: () => void }) {
  const [conteo, setConteo] = useState<{ error: number; warn: number } | null>(null);
  const [abierto, setAbierto] = useState(false);
  const [chequeos, setChequeos] = useState<Chequeo[]>([]);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  const cargar = useCallback(async () => {
    try {
      const r = await fetch("/api/manager/salud?solo_problemas=true", { cache: "no-store" });
      if (!r.ok || !alive.current) return;          // 403 = no es admin → botón oculto
      const j = await r.json();
      setConteo({ error: j?.conteo?.error ?? 0, warn: j?.conteo?.warn ?? 0 });
      setChequeos(j?.chequeos ?? []);
    } catch { /* nunca puede romper la app */ }
  }, []);

  useEffect(() => {
    cargar();
    const t = setInterval(cargar, POLL_MS);
    return () => clearInterval(t);
  }, [cargar]);

  if (!conteo) return null;                          // sin permiso o sin datos: no existe
  const rotos = conteo.error;
  const avisos = conteo.warn;

  return (
    <>
      <button
        onClick={() => { setAbierto((v) => !v); onAbrir?.(); }}
        title="Salud del sistema"
        className={"fixed bottom-4 right-4 z-50 flex items-center gap-2 px-3 py-2 border "
          + "text-[10px] font-mono uppercase tracking-wide shadow-lg "
          + (rotos
            ? "border-[var(--t-neg)] bg-[var(--t-neg)]/15 text-[var(--t-neg)]"
            : avisos
              ? "border-[#eab308] bg-[#eab308]/10 text-[#eab308]"
              : "border-[var(--t-border-2)] bg-[var(--t-panel)] text-[var(--t-text-muted)]")}
      >
        <span className="w-2 h-2 rounded-full" style={{
          background: rotos ? "var(--t-neg)" : avisos ? "#eab308" : "var(--t-pos)",
        }} />
        {rotos ? `${rotos} roto${rotos === 1 ? "" : "s"}`
          : avisos ? `${avisos} aviso${avisos === 1 ? "" : "s"}`
            : "todo bien"}
      </button>

      {abierto && (
        <div className="fixed bottom-16 right-4 z-50 w-[min(28rem,calc(100vw-2rem))] max-h-[60vh] overflow-y-auto border border-[var(--t-border)] bg-[var(--t-panel)] shadow-xl">
          <div className="px-3 py-2 border-b border-[var(--t-border)] flex items-center gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--t-text)]">
              Salud del sistema
            </span>
            <a href="/manager" className="ml-auto text-[9px] text-[var(--t-accent)] hover:underline">
              ver todo →
            </a>
          </div>
          {chequeos.length === 0 ? (
            <div className="px-3 py-6 text-center text-[11px] text-[var(--t-text-muted)]">
              No hay nada roto.
            </div>
          ) : (
            <div className="divide-y divide-[var(--t-border-2)]">
              {chequeos.map((c) => (
                <div key={c.id} className="px-3 py-2">
                  <div className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{
                      background: c.estado === "error" ? "var(--t-neg)" : "#eab308",
                    }} />
                    <span className="text-[11px] text-[var(--t-text)]">{c.titulo}</span>
                  </div>
                  <div className="pl-3.5 text-[10px] text-[var(--t-text-dim)]">{c.motivo}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </>
  );
}
