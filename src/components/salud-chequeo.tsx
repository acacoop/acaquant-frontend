"use client";

import { useCallback, useRef, useState } from "react";

/**
 * SALUD — la pieza compartida: TODO lo que hay detrás de un chequeo.
 *
 * Vivía adentro de `manager-salud-panel.tsx`, y por eso el mini-panel que se abre
 * desde el botón SALUD de la barra inferior solo podía mostrar título + motivo y
 * mandarte a "ver todo" en Manager para cualquier otra cosa (reporte 2026-08-10).
 * Duplicar la vista habría sido peor: dos lugares que muestran lo mismo terminan
 * mostrando cosas distintas — el problema exacto que originó la pantalla de SALUD.
 *
 * Acá viven los tipos, el fetch del detalle y el render. Los dos lugares (Manager
 * y el mini-panel) consumen esto, así que no pueden divergir: lo que se ve y lo
 * que se puede hacer es idéntico, cambia solo el contenedor.
 */

export type Chequeo = {
  id: string; familia: string; titulo: string; estado: "ok" | "warn" | "error";
  motivo: string; evidencia: string; alertar?: boolean;
  schedule?: string | null; ultimo_at?: string | null; detalle?: string;
  modulos?: string[]; tabla?: string;
};
export type Evento = {
  id: number; de: string | null; a: string; motivo: string | null;
  evidencia: string | null; at: string | null;
};
export type Corrida = {
  tipo: string; status: string; inicio: string | null; elapsed_s?: number | null;
  stats?: Record<string, unknown>; errores?: string[]; log?: string[];
};
export type Detalle = {
  tipo: string; explicacion?: string; error?: string;
  corridas?: Corrida[];
  tabla?: string; columna?: string; fechas?: { fecha: string; filas: number }[];
  anomalias?: { item: string; detalle: string; desde: string }[];
  resueltas_7d?: number;
};
export type SaludResp = {
  veredicto: "ok" | "warn" | "error";
  conteo: Record<string, number>;
  chequeos: Chequeo[];
  evaluado_at?: string;
};

export const COLOR: Record<string, string> = {
  ok: "var(--t-pos)", warn: "#eab308", error: "var(--t-neg)",
};

export const hhmm = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleString("es-AR", {
    day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
  }) : "—";

/** Silenciar / reactivar un chequeo. Silenciar NO lo saca de la lista: sigue rojo,
 *  solo deja de abrir el modal. Devuelve true si el backend aceptó el cambio. */
export async function setAlertaChequeo(
  chequeoId: string, alertar: boolean, nota = "",
): Promise<boolean> {
  try {
    const r = await fetch("/api/manager/salud/alerta", {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chequeo_id: chequeoId, alertar, nota }),
    });
    return r.ok;
  } catch { return false; }
}

/**
 * Estado + fetch del detalle de un chequeo (acordeón de a uno).
 *
 * El detalle se pide SOLO al expandir y se cachea por chequeo: son corridas con su
 * log entero y, en el caso del diagnóstico, una llamada al LLM. Nada de esto puede
 * dispararse en el poll de fondo.
 */
export function useChequeoDetalle() {
  const [abierto, setAbierto] = useState<string | null>(null);
  const [detalle, setDetalle] = useState<Record<string, Detalle>>({});
  const [historial, setHistorial] = useState<Record<string, Evento[]>>({});
  const [diag, setDiag] = useState<Record<string, string>>({});
  // Ref (no state) para no re-crear `abrir` en cada carga y no re-pedir lo ya pedido.
  const pedidos = useRef<Set<string>>(new Set());

  const abrir = useCallback(async (c: Chequeo) => {
    const next = abierto === c.id ? null : c.id;
    setAbierto(next);
    if (!next || pedidos.current.has(c.id)) return;
    pedidos.current.add(c.id);
    try {
      const r = await fetch(
        `/api/manager/salud/detalle?chequeo_id=${encodeURIComponent(c.id)}`,
        { cache: "no-store" });
      if (r.ok) {
        const j = await r.json();
        setDetalle((d) => ({ ...d, [c.id]: j as Detalle }));
        setHistorial((h) => ({ ...h, [c.id]: j?.historial ?? [] }));
      }
    } catch { /* el detalle es extra: si falla, la fila sigue mostrando el motivo */ }
    // El diagnóstico con IA solo existe para incidentes ya confirmados; si no lo
    // está, el backend devuelve texto null y no se muestra nada.
    if (c.estado !== "ok") {
      try {
        const r = await fetch(
          `/api/manager/salud/diagnostico?chequeo_id=${encodeURIComponent(c.id)}`,
          { cache: "no-store" });
        if (r.ok) {
          const j = await r.json();
          if (j?.texto) setDiag((v) => ({ ...v, [c.id]: j.texto }));
        }
      } catch { /* no-op */ }
    }
  }, [abierto]);

  return { abierto, detalle, historial, diag, abrir };
}

/** El cuerpo expandido de un chequeo: evidencia, diagnóstico, detalle crudo,
 *  historial y el toggle de alerta. Es lo mismo en Manager y en el mini-panel. */
export function ChequeoExpandido({
  c, detalle, historial, diag, onToggleAlerta,
}: {
  c: Chequeo;
  detalle?: Detalle;
  historial?: Evento[];
  diag?: string;
  onToggleAlerta: (c: Chequeo) => void;
}) {
  return (
    <div className="px-3 pb-2.5 pl-7 bg-[var(--t-accent)]/5">
      <div className="text-[9px] font-mono text-[var(--t-text-muted)] break-words">
        {c.evidencia}
      </div>
      <div className="mt-1 text-[9px] text-[var(--t-text-muted)]">
        {c.schedule && <>cron <code>{c.schedule}</code> · </>}
        {c.tabla && <>tabla <code>{c.tabla}</code> · </>}
        {(c.modulos ?? []).join(", ")}
      </div>

      {diag && (
        <div className="mt-2 px-2 py-1.5 border-l-2 border-[var(--t-accent)] bg-[var(--t-accent)]/10">
          <div className="text-[8px] uppercase tracking-wide text-[var(--t-accent)] mb-0.5">
            diagnóstico
          </div>
          <div className="text-[10px] whitespace-pre-line leading-snug text-[var(--t-text)]">
            {diag}
          </div>
        </div>
      )}

      <DetalleChequeo d={detalle} />

      <div className="mt-2 text-[9px] uppercase tracking-wide text-[var(--t-text-muted)]">
        historial
      </div>
      {(historial ?? []).length === 0 ? (
        <div className="text-[10px] text-[var(--t-text-muted)]">
          sin cambios de estado registrados todavía
        </div>
      ) : (
        <table className="w-full text-[9px] font-mono mt-0.5">
          <tbody>
            {(historial ?? []).map((e) => (
              <tr key={e.id} className="border-b border-[var(--t-border-2)]/50">
                <td className="py-0.5 pr-2 text-[var(--t-text-muted)] whitespace-nowrap">
                  {hhmm(e.at)}
                </td>
                <td className="py-0.5 pr-2 whitespace-nowrap">
                  <span style={{ color: COLOR[e.de ?? "ok"] }}>{e.de ?? "—"}</span>
                  {" → "}
                  <span style={{ color: COLOR[e.a] }}>{e.a}</span>
                </td>
                <td className="py-0.5 text-[var(--t-text-dim)]">{e.motivo}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <button onClick={() => onToggleAlerta(c)}
              className="mt-2 text-[9px] underline text-[var(--t-text-muted)] hover:text-[var(--t-accent)]">
        {c.alertar === false ? "volver a avisarme de esto" : "no avisarme más de esto"}
      </button>
    </div>
  );
}

/** La cabecera clickeable de un chequeo: semáforo, título, familia, motivo. */
export function ChequeoFila({ c, onClick }: { c: Chequeo; onClick: () => void }) {
  return (
    <button onClick={onClick}
            className="w-full text-left px-3 py-2 hover:bg-[var(--t-accent)]/5">
      <div className="flex items-center gap-2">
        <span className="w-2 h-2 rounded-full shrink-0" style={{ background: COLOR[c.estado] }} />
        <span className="text-[11px] font-semibold text-[var(--t-text)]">{c.titulo}</span>
        <span className="text-[8px] uppercase px-1 border border-[var(--t-border-2)] text-[var(--t-text-muted)]">
          {c.familia}
        </span>
        {c.alertar === false && (
          <span className="text-[8px] uppercase px-1 border border-[var(--t-border-2)] text-[var(--t-text-muted)]">
            silenciado
          </span>
        )}
        <span className="ml-auto text-[9px] text-[var(--t-text-muted)] tabular-nums">
          {hhmm(c.ultimo_at)}
        </span>
      </div>
      <div className="mt-0.5 pl-4 text-[10px] text-[var(--t-text-dim)]">
        {c.motivo}
        {c.detalle && <span className="text-[var(--t-text-muted)]"> · {c.detalle}</span>}
      </div>
    </button>
  );
}

/** El detalle crudo del chequeo: corridas con su log, fechas cargadas o anomalías.
 *
 * Regla explícita del rediseño: NADA vacío ni incomprensible. Acá van los códigos de
 * error, las cifras y el log tal cual, más la explicación de cómo leerlos — para no
 * tener que salir a otra pantalla a entender qué pasó. */
export function DetalleChequeo({ d }: { d?: Detalle }) {
  if (!d) return <div className="mt-2 text-[9px] text-[var(--t-text-muted)]">cargando detalle…</div>;
  if (d.error) {
    return (
      <div className="mt-2 text-[9px] font-mono text-[var(--t-neg)]">
        no pude leer el detalle: {d.error}
      </div>
    );
  }
  return (
    <div className="mt-2">
      {d.explicacion && (
        <div className="text-[9px] text-[var(--t-text-muted)] mb-1 leading-snug">
          {d.explicacion}
        </div>
      )}

      {/* JOB: cada corrida con sus stats, errores y log */}
      {(d.corridas ?? []).map((r, i) => (
        <div key={i} className="mb-1.5 border-l-2 pl-2"
             style={{ borderColor: r.status === "ok" ? "var(--t-pos)"
               : r.status === "partial" ? "#eab308" : "var(--t-neg)" }}>
          <div className="text-[9px] font-mono">
            <span className="text-[var(--t-text-muted)]">{r.inicio?.replace("T", " ").slice(0, 16)}</span>
            {" · "}
            <span style={{ color: r.status === "ok" ? "var(--t-pos)"
              : r.status === "partial" ? "#eab308" : "var(--t-neg)" }}>{r.status}</span>
            {r.elapsed_s != null && <span className="text-[var(--t-text-muted)]"> · {r.elapsed_s}s</span>}
          </div>
          {r.stats && Object.keys(r.stats).length > 0 && (
            <div className="text-[9px] font-mono text-[var(--t-text-dim)]">
              {Object.entries(r.stats).map(([k, v]) => `${k}=${v}`).join(" · ")}
            </div>
          )}
          {(r.errores ?? []).map((e, j) => (
            <div key={j} className="text-[9px] font-mono text-[var(--t-neg)] break-words">✗ {e}</div>
          ))}
          {(r.log ?? []).length > 0 && (
            <details className="mt-0.5">
              <summary className="text-[9px] text-[var(--t-text-muted)] cursor-pointer">
                log ({(r.log ?? []).length} líneas)
              </summary>
              <pre className="text-[8px] font-mono text-[var(--t-text-muted)] whitespace-pre-wrap break-words mt-0.5">
                {(r.log ?? []).join("\n")}
              </pre>
            </details>
          )}
        </div>
      ))}

      {/* DATO: qué fechas hay cargadas y con cuántas filas */}
      {(d.fechas ?? []).length > 0 && (
        <table className="text-[9px] font-mono">
          <tbody>
            {(d.fechas ?? []).map((f) => (
              <tr key={f.fecha}>
                <td className="pr-3 text-[var(--t-text)]">{f.fecha}</td>
                <td className="text-[var(--t-text-dim)]">{f.filas.toLocaleString("es-AR")} filas</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* CONTROL: cada caso concreto a corregir */}
      {(d.anomalias ?? []).length > 0 && (
        <div>
          <table className="text-[9px] font-mono w-full">
            <tbody>
              {(d.anomalias ?? []).slice(0, 50).map((a, i) => (
                <tr key={i} className="border-b border-[var(--t-border-2)]/40">
                  <td className="pr-3 py-0.5 text-[var(--t-text)] whitespace-nowrap">{a.item}</td>
                  <td className="py-0.5 text-[var(--t-text-dim)]">{a.detalle}</td>
                  <td className="py-0.5 pl-2 text-[var(--t-text-muted)] whitespace-nowrap">
                    desde {String(a.desde ?? "").slice(0, 10)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {(d.anomalias ?? []).length > 50 && (
            <div className="text-[9px] text-[var(--t-text-muted)] mt-0.5">
              … y {(d.anomalias ?? []).length - 50} más
            </div>
          )}
        </div>
      )}
    </div>
  );
}
