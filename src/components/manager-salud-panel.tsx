"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Manager → OBSERVABILIDAD → SALUD. La pantalla que responde UNA pregunta:
 * ¿está todo bien?
 *
 * Antes había que recorrer seis tabs (CONTROLES / DIAGNÓSTICO / JOBS / BASE /
 * LATENCIA / IA) y ninguna respondía eso: la card de AuM estaba en VERDE con el job
 * muerto hacía 48 h porque mostraba cómo salieron las corridas que hubo, no si el
 * sistema estaba sano (incidente 2026-08-07).
 *
 * Decisiones de diseño:
 *  - Lo VERDE se esconde por default. Un tablero donde el 95% está bien entrena a
 *    ignorarlo; acá se ve lo que hay que atender y nada más.
 *  - Cada fila dice QUÉ controla y POR QUÉ está así, en castellano. El detalle
 *    técnico (la evidencia) va debajo, en mono.
 *  - Un click abre el HISTORIAL de ese chequeo: cuándo se rompió y cuándo volvió.
 *    Es lo que no se puede reconstruir después, porque una vez que el job vuelve a
 *    correr el motivo de la falla ya no existe en ningún lado.
 *  - El toggle de alerta es por chequeo. Silenciar NO lo saca de esta lista: sigue
 *    rojo acá, solo deja de abrir el modal.
 *
 * Los chequeos se generan solos: los jobs salen de `deploy/crontab.txt` (un cron
 * nuevo aparece sin tocar nada) y los datos, de los contratos de frescura del
 * backend. No hay lista que mantener a mano.
 */

const POLL_MS = 60_000;

type Chequeo = {
  id: string; familia: string; titulo: string; estado: "ok" | "warn" | "error";
  motivo: string; evidencia: string; alertar?: boolean;
  schedule?: string | null; ultimo_at?: string | null; detalle?: string;
  modulos?: string[]; tabla?: string;
};
type Evento = {
  id: number; de: string | null; a: string; motivo: string | null;
  evidencia: string | null; at: string | null;
};
type Resp = {
  veredicto: "ok" | "warn" | "error";
  conteo: Record<string, number>;
  chequeos: Chequeo[];
  evaluado_at?: string;
};

const COLOR: Record<string, string> = {
  ok: "var(--t-pos)", warn: "#eab308", error: "var(--t-neg)",
};
const hhmm = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleString("es-AR", {
    day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
  }) : "—";

export function SaludPanel() {
  const [data, setData] = useState<Resp | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [verOk, setVerOk] = useState(false);
  const [abierto, setAbierto] = useState<string | null>(null);
  const [historial, setHistorial] = useState<Record<string, Evento[]>>({});
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  const cargar = useCallback(async () => {
    try {
      const r = await fetch("/api/manager/salud", { cache: "no-store" });
      const txt = await r.text();
      let body: unknown = null;
      try { body = JSON.parse(txt); } catch { /* no-JSON */ }
      if (!alive.current) return;
      if (!r.ok) {
        const o = (body && typeof body === "object") ? (body as Record<string, unknown>) : {};
        setErr(String(o.error ?? o.detail ?? `HTTP ${r.status} — ${txt.slice(0, 160)}`));
        return;
      }
      setErr(null); setData(body as Resp);
    } catch (e) {
      if (alive.current) setErr(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);
  useEffect(() => {
    const t = setInterval(cargar, POLL_MS);
    return () => clearInterval(t);
  }, [cargar]);

  const abrir = async (c: Chequeo) => {
    const next = abierto === c.id ? null : c.id;
    setAbierto(next);
    if (!next || historial[c.id]) return;
    try {
      const r = await fetch(
        `/api/manager/salud/historial?chequeo_id=${encodeURIComponent(c.id)}&limite=20`,
        { cache: "no-store" });
      if (!r.ok) return;
      const j = await r.json();
      setHistorial((h) => ({ ...h, [c.id]: j?.eventos ?? [] }));
    } catch { /* el historial es extra: si falla, la fila sigue sirviendo */ }
  };

  const toggleAlerta = async (c: Chequeo) => {
    const nuevo = !(c.alertar ?? true);
    try {
      await fetch("/api/manager/salud/alerta", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chequeo_id: c.id, alertar: nuevo }),
      });
    } catch { return; }
    cargar();
  };

  const chequeos = (data?.chequeos ?? []).filter((c) => verOk || c.estado !== "ok");
  const conteo = data?.conteo ?? {};
  const veredicto = data?.veredicto ?? "ok";

  return (
    <div className="h-full flex flex-col min-h-0 p-3 gap-2">
      {err && (
        <div className="px-3 py-2 border border-[var(--t-neg)] bg-[var(--t-neg)]/10 text-[11px] text-[var(--t-neg)] shrink-0">
          {err}
          <div className="text-[10px] text-[var(--t-text-dim)] mt-0.5">
            Si dice 404, falta reiniciar el backend en el Droplet (endpoint nuevo).
          </div>
        </div>
      )}

      {/* El veredicto, en una línea. Es lo único que hay que mirar. */}
      <div className="flex flex-wrap items-center gap-3 shrink-0 border border-[var(--t-border-2)] px-3 py-2">
        <span className="w-2.5 h-2.5 rounded-full" style={{ background: COLOR[veredicto] }} />
        <span className="text-[13px] font-semibold uppercase tracking-wide text-[var(--t-text)]">
          {veredicto === "ok"
            ? "TODO BIEN"
            : `${(conteo.error ?? 0) + (conteo.warn ?? 0)} COSAS PARA MIRAR`}
        </span>
        <span className="text-[10px] text-[var(--t-text-dim)]">
          {conteo.error ?? 0} rotas · {conteo.warn ?? 0} con avisos · {conteo.ok ?? 0} bien
        </span>
        <label className="ml-auto flex items-center gap-1 text-[10px] text-[var(--t-text-dim)] cursor-pointer">
          <input type="checkbox" checked={verOk} onChange={(e) => setVerOk(e.target.checked)} />
          ver también lo que está bien
        </label>
        <span className="text-[9px] text-[var(--t-text-muted)]">{hhmm(data?.evaluado_at)}</span>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto border border-[var(--t-border)] divide-y divide-[var(--t-border-2)]">
        {chequeos.map((c) => (
          <div key={c.id}>
            <button onClick={() => abrir(c)}
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

            {abierto === c.id && (
              <div className="px-3 pb-2.5 pl-7 bg-[var(--t-accent)]/5">
                <div className="text-[9px] font-mono text-[var(--t-text-muted)] break-words">
                  {c.evidencia}
                </div>
                <div className="mt-1 text-[9px] text-[var(--t-text-muted)]">
                  {c.schedule && <>cron <code>{c.schedule}</code> · </>}
                  {c.tabla && <>tabla <code>{c.tabla}</code> · </>}
                  {(c.modulos ?? []).join(", ")}
                </div>

                <div className="mt-2 text-[9px] uppercase tracking-wide text-[var(--t-text-muted)]">
                  historial
                </div>
                {(historial[c.id] ?? []).length === 0 ? (
                  <div className="text-[10px] text-[var(--t-text-muted)]">
                    sin cambios de estado registrados todavía
                  </div>
                ) : (
                  <table className="w-full text-[9px] font-mono mt-0.5">
                    <tbody>
                      {(historial[c.id] ?? []).map((e) => (
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

                <button onClick={() => toggleAlerta(c)}
                        className="mt-2 text-[9px] underline text-[var(--t-text-muted)] hover:text-[var(--t-accent)]">
                  {c.alertar === false ? "volver a avisarme de esto" : "no avisarme más de esto"}
                </button>
              </div>
            )}
          </div>
        ))}

        {chequeos.length === 0 && !err && (
          <div className="px-3 py-8 text-center text-[11px] text-[var(--t-text-muted)]">
            {data ? "No hay nada roto." : "cargando…"}
          </div>
        )}
      </div>
    </div>
  );
}
