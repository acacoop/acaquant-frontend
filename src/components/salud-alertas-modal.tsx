"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Modal de ALERTAS de salud del sistema — el aviso que faltaba.
 *
 * Por qué existe (incidente 2026-08-07): el backfill de tenencias falló dos días y
 * nadie se enteró. No faltaban datos, faltaba que la señal BUSCARA al admin en vez
 * de esperarlo en una pantalla que hay que ir a abrir. Un tablero que hay que abrir
 * para enterarse es un tablero que no se abre.
 *
 * Reglas de diseño, para que siga sirviendo dentro de seis meses:
 *
 *  - Solo aparece ante una TRANSICIÓN NUEVA a problema y sin ver. No es un
 *    recordatorio periódico: si te interrumpe cada media hora con lo mismo, en una
 *    semana lo cerrás sin leer y volvemos al punto de partida.
 *  - Que algo se ARREGLE nunca abre el modal (eso lo filtra el backend).
 *  - Se puede SILENCIAR un chequeo desde acá mismo. Silenciarlo NO lo saca de la
 *    pantalla de SALUD: sigue rojo en la lista, solo deja de interrumpir.
 *  - Solo lo ve el admin: el endpoint está gateado y un 403 deja el modal mudo.
 */

// Cada cuánto se pregunta si hay algo nuevo. No es cada cuánto INTERRUMPE: el modal
// abre solo si hay una transición que este admin no vio todavía.
const POLL_MS = 5 * 60_000;

type Pendiente = {
  id: number; chequeo_id: string; familia: string | null; titulo: string | null;
  de: string | null; a: string; motivo: string | null; evidencia: string | null;
  at: string | null;
};

const hhmm = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("es-AR", {
    day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
  }) : "—";

export function SaludAlertasModal() {
  const [items, setItems] = useState<Pendiente[]>([]);
  const [abierto, setAbierto] = useState(false);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  const chequear = useCallback(async () => {
    try {
      const r = await fetch("/api/manager/salud?solo_problemas=true", { cache: "no-store" });
      if (!r.ok || !alive.current) return;          // 403 = no es admin → mudo
      const j = await r.json();
      const p: Pendiente[] = j?.pendientes ?? [];
      if (p.length) { setItems(p); setAbierto(true); }
    } catch { /* la alerta nunca puede romper la app */ }
  }, []);

  useEffect(() => {
    chequear();
    const t = setInterval(chequear, POLL_MS);
    return () => clearInterval(t);
  }, [chequear]);

  const cerrar = async (marcarVistos: boolean) => {
    setAbierto(false);
    if (!marcarVistos) return;                       // "después lo miro": vuelve a avisar
    try {
      await fetch("/api/manager/salud/vistos", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: items.map((i) => i.id) }),
      });
    } catch { /* si falla, el modal vuelve a aparecer: es el fallo seguro */ }
  };

  const silenciar = async (chequeoId: string) => {
    try {
      await fetch("/api/manager/salud/alerta", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chequeo_id: chequeoId, alertar: false,
                               nota: "silenciado desde el modal" }),
      });
    } catch { /* no-op */ }
    setItems((prev) => prev.filter((i) => i.chequeo_id !== chequeoId));
  };

  if (!abierto || !items.length) return null;
  const errores = items.filter((i) => i.a === "error").length;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-2xl max-h-[80vh] flex flex-col border border-[var(--t-border)] bg-[var(--t-panel)] shadow-xl">
        <div className="px-4 py-2.5 border-b border-[var(--t-border)] flex items-center gap-2 shrink-0">
          <span className="w-2 h-2 rounded-full" style={{ background: errores ? "var(--t-neg)" : "#eab308" }} />
          <span className="text-[12px] font-semibold tracking-wide uppercase text-[var(--t-text)]">
            {items.length === 1 ? "Algo se rompió" : `${items.length} cosas se rompieron`}
          </span>
          <span className="ml-auto text-[9px] text-[var(--t-text-muted)] uppercase">
            salud del sistema
          </span>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto divide-y divide-[var(--t-border-2)]">
          {items.map((i) => (
            <div key={i.id} className="px-4 py-2.5">
              <div className="flex items-center gap-2">
                <span className={`px-1.5 py-0.5 text-[9px] uppercase border ${
                  i.a === "error"
                    ? "border-[var(--t-neg)] text-[var(--t-neg)]"
                    : "border-[#eab308] text-[#eab308]"}`}>
                  {i.a}
                </span>
                <span className="text-[11px] font-semibold text-[var(--t-text)]">
                  {i.titulo || i.chequeo_id}
                </span>
                <span className="ml-auto text-[9px] text-[var(--t-text-muted)] tabular-nums">
                  {hhmm(i.at)}
                </span>
              </div>
              <div className="mt-0.5 text-[10px] text-[var(--t-text-dim)]">{i.motivo}</div>
              {i.evidencia && i.evidencia !== i.motivo && (
                <div className="mt-0.5 text-[9px] font-mono text-[var(--t-text-muted)] break-words">
                  {i.evidencia}
                </div>
              )}
              <button onClick={() => silenciar(i.chequeo_id)}
                      className="mt-1 text-[9px] text-[var(--t-text-muted)] hover:text-[var(--t-accent)] underline">
                no avisarme más de esto
              </button>
            </div>
          ))}
        </div>

        <div className="px-4 py-2.5 border-t border-[var(--t-border)] flex items-center gap-2 shrink-0">
          <a href="/manager" className="text-[10px] text-[var(--t-accent)] hover:underline">
            ver SALUD completa →
          </a>
          <button onClick={() => cerrar(false)}
                  className="ml-auto px-3 py-1 text-[10px] border border-[var(--t-border-2)] text-[var(--t-text-dim)] hover:text-[var(--t-text)]">
            DESPUÉS
          </button>
          <button onClick={() => cerrar(true)}
                  className="px-3 py-1 text-[10px] border border-[var(--t-accent)] text-[var(--t-accent)] hover:bg-[var(--t-accent)] hover:text-[var(--t-on-accent)]">
            ENTENDIDO
          </button>
        </div>
      </div>
    </div>
  );
}
