"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchJson } from "@/lib/fetch-json";

/**
 * LO QUE EL AGENTE TE DEJÓ A VOS — para CUALQUIER usuario, no solo admin.
 *
 * Regla del user (2026-08-19): *«el AV AGENT es solo para admin, no para el
 * resto, aunque esto no quiere decir que no tenga el poder para mandar una
 * alerta, notificación, etc. a otro user que no sea admin»*.
 *
 * Y del 2026-09-02, sobre el aviso de saldos de las 16:45: *«es exclusivo del
 * día, con saber que se informó alcanza, no hay que guardar historial. Es solo
 * avisar a las 16:45 y listo»*. Así que esto es DELIBERADAMENTE chico: el
 * asunto, el detalle, la tabla que venga, y un solo botón: **visto**. Sin
 * ítems que tildar, sin historial. Un aviso es del día; mañana vence solo.
 *
 * Backend: `GET /api/avisos` (los de HOY del que pregunta) y `POST
 * /api/avisos/visto` — `api/routers/avisos.py`, doc `docs/AGENT.md` §0.de.
 * Hasta el 2026-09-02 el router no existía y esta pantalla pedía una forma de
 * aviso del agente viejo: la bandeja se escribía para nadie.
 *
 * Los que traen `interrumpe` abren solos, como el modal de briefing: aparecen
 * encima de todo y hay que hacer algo con ellos. Se puede posponer (dura la
 * sesión, no se guarda) o marcar visto.
 */
type Fila = Record<string, unknown>;
type Aviso = {
  id: number; tema: string; asunto: string; detalle: string;
  filas: Fila[]; at: string; visto: boolean;
  donde: string; por: string; interrumpe: boolean;
};

// Lo que se le antepone al título de la pestaña cuando hay algo esperando y la
// app está de fondo. Con el espacio adentro, para poder sacarlo por largo exacto.
const MARCA = "(!) ";

function esNumero(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function celda(v: unknown): string {
  if (v == null || v === "") return "—";
  if (esNumero(v)) {
    return v.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  return String(v);
}

function hora(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("es-AR", {
    timeZone: "America/Argentina/Buenos_Aires", hour: "2-digit", minute: "2-digit",
  });
}

/** La tabla que venga en `filas`, tal cual: las columnas son las claves de la
 *  primera fila. El front no decide qué mostrar: eso lo decidió el job. */
function Tabla({ filas }: { filas: Fila[] }) {
  if (!filas.length) return null;
  const cols = Object.keys(filas[0]);
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[10px]">
        <thead>
          <tr className="border-b border-[var(--t-border)]">
            {cols.map((c) => (
              <th key={c}
                  className={`py-0.5 pr-3 text-[8px] uppercase tracking-widest font-normal text-[var(--t-text-dim)] ${
                    esNumero(filas[0][c]) ? "text-right" : "text-left"}`}>
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {filas.map((f, i) => (
            <tr key={i} className="border-b border-[var(--t-border)]/50">
              {cols.map((c) => {
                const v = f[c];
                const neg = esNumero(v) && v < 0;
                return (
                  <td key={c}
                      className={`py-0.5 pr-3 tabular-nums ${esNumero(v) ? "text-right font-semibold" : ""}`}
                      style={esNumero(v) ? { color: neg ? "var(--t-neg)" : "var(--t-pos)" } : undefined}>
                    {celda(v)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function MisAvisos() {
  const [avisos, setAvisos] = useState<Aviso[]>([]);
  const [abierto, setAbierto] = useState(false);
  // Los pospuestos EN ESTA SESIÓN. No se guarda en localStorage a propósito:
  // un aviso del día que se puede silenciar para siempre con un click deja de
  // ser un aviso. Al recargar vuelve — y vence solo a la medianoche.
  const [pospuestos, setPospuestos] = useState<Set<number>>(new Set());

  // Cuándo se pidió por última vez. Alt-tab dispara `focus` cada vez, y este
  // componente vive en la barra de TODAS las vistas: sin este freno, alguien que
  // salta entre ventanas pega un request por salto.
  const ultimoRef = useRef(0);

  const cargar = useCallback(async () => {
    ultimoRef.current = Date.now();
    try {
      const r = await fetchJson<{ avisos?: Aviso[] }>("/api/avisos");
      setAvisos(r.avisos ?? []);
    } catch {
      /* 403 del portal invitado o backend caído: la barra sigue andando */
    }
  }, []);

  // ⚠️ **TIENE QUE APARECER SIN TOCAR NADA** (user, 2026-08-20: *«hay que
  // actualizar la página, es decir inviable… hay gente que deja esto de fondo»*).
  //
  // Un `setInterval` solo NO alcanza: el navegador frena los timers de una
  // pestaña en segundo plano. Por eso se despierta **por evento** (vuelve a la
  // pestaña, vuelve internet, atrás/adelante) y no solo por reloj, y mientras
  // está oculta no pide nada.
  const [oculto, setOculto] = useState(false);
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;
    const parar = () => { if (timer) { clearInterval(timer); timer = null; } };
    const despertar = () => {
      const visible = document.visibilityState === "visible";
      setOculto(!visible);
      if (!visible) { parar(); return; }
      if (Date.now() - ultimoRef.current > 10_000) void cargar();
      // 60 s con la pantalla a la vista: el de saldos sale 16:45 y el mercado
      // cierra 17:00; con 5 minutos se perdía un tercio de la ventana.
      if (!timer) timer = setInterval(() => void cargar(), 60_000);
    };
    despertar();
    document.addEventListener("visibilitychange", despertar);
    window.addEventListener("focus", despertar);
    window.addEventListener("online", despertar);
    window.addEventListener("pageshow", despertar);
    return () => {
      parar();
      document.removeEventListener("visibilitychange", despertar);
      window.removeEventListener("focus", despertar);
      window.removeEventListener("online", despertar);
      window.removeEventListener("pageshow", despertar);
    };
  }, [cargar]);

  const visto = useCallback(async (id: number) => {
    try {
      await fetchJson("/api/avisos/visto", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
    } catch { /* si falla vuelve en el próximo poll, que es lo correcto */ }
    await cargar();
  }, [cargar]);

  const pendientes = avisos.filter((a) => !a.visto);
  // EL QUE INTERRUMPE. Uno por vez: dos modales encimados no son el doble de
  // urgente, son ninguno.
  const urgente = pendientes.find((a) => a.interrumpe && !pospuestos.has(a.id));

  // ── LA PESTAÑA AVISA ────────────────────────────────────────────────────
  // Con la app de fondo lo único que se ve de una pestaña es su TÍTULO, así que
  // ahí va la marca. Se saca sola al volver. No se pisa el título: prefijo.
  useEffect(() => {
    const limpio = document.title.startsWith(MARCA)
      ? document.title.slice(MARCA.length) : document.title;
    document.title = urgente && oculto ? MARCA + limpio : limpio;
  }, [urgente, oculto]);

  // Sin nada hoy NO se dibuja. Un indicador permanente en cero enseña a no
  // mirarlo, y el día que diga 1 tampoco se va a mirar.
  if (avisos.length === 0) return null;

  return (
    <>
      {urgente && (
        <div className="fixed inset-0 z-[90] bg-black/70 flex items-center justify-center p-4">
          <div className="w-[900px] max-w-[97vw] bg-[var(--t-panel)] border border-[var(--t-accent)] shadow-2xl flex flex-col max-h-[86vh]">
            <div className="px-4 pt-2.5 pb-2 border-b border-[var(--t-border)]">
              <p className="text-[11px] font-semibold tracking-widest text-[var(--t-accent)]">
                AV AGENT · {hora(urgente.at)}
              </p>
              <p className="text-[11px] text-[var(--t-text)] mt-0.5">
                {urgente.asunto}
              </p>
            </div>
            <div className="overflow-y-auto px-4 py-2">
              <Tabla filas={urgente.filas} />
            </div>
            <div className="flex items-center gap-3 px-4 py-2 border-t border-[var(--t-border)]">
              <span className="text-[9px] text-[var(--t-text-dim)]">
                {urgente.detalle ? `${urgente.detalle} ` : ""}
                {urgente.donde ? `Se atiende en ${urgente.donde}. ` : ""}
                Vale por hoy.
              </span>
              <button
                onClick={() => setPospuestos((s) => new Set(s).add(urgente.id))}
                className="ml-auto shrink-0 text-[9px] uppercase tracking-widest px-2 py-1 border border-[var(--t-border)] text-[var(--t-text-muted)] hover:border-[var(--t-accent)] hover:text-[var(--t-accent)]"
              >
                lo veo en un rato
              </button>
              <button
                onClick={() => void visto(urgente.id)}
                className="shrink-0 text-[9px] uppercase tracking-widest px-2 py-1 border border-[var(--t-accent)] text-[var(--t-accent)] hover:bg-[var(--t-accent)] hover:text-[var(--t-bg)]"
              >
                visto
              </button>
            </div>
          </div>
        </div>
      )}

      <button
        onClick={() => setAbierto((v) => !v)}
        title="Lo que el agente te dejó hoy"
        className="inline-flex items-center gap-1 px-1.5 leading-none text-[10px] font-semibold text-[var(--t-accent)] hover:opacity-80 transition-opacity"
      >
        <span className="tracking-widest">PARA VOS</span>
        {pendientes.length > 0 && (
          <span className="px-1 rounded-sm bg-[var(--t-accent)] text-[var(--t-on-accent)] text-[9px] font-bold tabular-nums">
            {pendientes.length}
          </span>
        )}
      </button>

      {abierto && (
        <div className="fixed inset-0 z-50 flex items-end justify-end p-4 bg-black/30"
             onClick={() => setAbierto(false)}>
          <div className="w-[640px] max-w-[95vw] bg-[var(--t-panel)] border border-[var(--t-border)] shadow-xl"
               onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2 px-3 py-1.5 border-b border-[var(--t-border)]">
              <span className="text-[10px] font-semibold tracking-widest text-[var(--t-accent)]">
                PARA VOS · HOY
              </span>
              <button onClick={() => setAbierto(false)}
                      className="ml-auto text-[var(--t-text-dim)] hover:text-[var(--t-text)] leading-none">
                ×
              </button>
            </div>
            <ul className="divide-y divide-[var(--t-border)] max-h-[60vh] overflow-y-auto">
              {avisos.map((a) => (
                <li key={a.id} className={`px-3 py-2 ${a.visto ? "opacity-50" : ""}`}>
                  <div className="flex items-baseline gap-2">
                    <span className="text-[9px] tabular-nums text-[var(--t-text-dim)] shrink-0">
                      {hora(a.at)}
                    </span>
                    <span className="text-[11px] text-[var(--t-text)] flex-1">
                      {a.asunto}
                    </span>
                    {a.visto ? (
                      <span className="shrink-0 text-[8px] uppercase tracking-widest text-[var(--t-text-dim)]">
                        visto
                      </span>
                    ) : (
                      <button
                        onClick={() => void visto(a.id)}
                        className="shrink-0 text-[9px] uppercase tracking-widest px-2 py-0.5 border border-[var(--t-border)] text-[var(--t-text-muted)] hover:border-[var(--t-accent)] hover:text-[var(--t-accent)]"
                      >
                        visto
                      </button>
                    )}
                  </div>
                  {a.detalle && (
                    <p className="text-[10px] leading-snug text-[var(--t-text-muted)]">
                      {a.detalle}
                    </p>
                  )}
                  {a.filas.length > 0 && (
                    <div className="mt-1">
                      <Tabla filas={a.filas} />
                    </div>
                  )}
                  {a.donde && (
                    <p className="text-[10px] leading-snug text-[var(--t-text-dim)]">
                      se atiende en {a.donde}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </>
  );
}
