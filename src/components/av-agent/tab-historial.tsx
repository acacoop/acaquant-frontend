"use client";

// Tab HISTORIAL, rediseñada 2026-08-23 (§0.cx — la LEY DE CONEXIÓN).
//
// El user: *«quiero ese mismo diseño horizontal para todo lo de HISTORIAL…
// ¿por qué DECIDIDO no está en YA HIZO? MANDÓ no existe, es COMUNICACIONES,
// y es SOLO del día — no algo eterno e histórico»*.
//
// Quedan DOS cosas, con el mismo menú horizontal que ENCONTRÓ:
//
//   REGISTRO        una sola línea de tiempo con TODO lo que pasó — lo que
//                   escribió el agente Y lo que decidiste vos (respuestas,
//                   votos). Separarlos era arbitrario: son eventos del mismo
//                   sistema, y el orden temporal es el que cuenta la historia.
//                   Arriba, lo que todavía espera (contestadas sin ejecutar,
//                   descartes con su deshacer): es la única parte viva.
//   COMUNICACIONES  lo que el agente mandó HOY. Una comunicación es del día:
//                   el efecto pendiente vive en la bandeja del destinatario,
//                   no acá acumulándose.
import { Mensaje, Pendiente, Vista, fechaHora,
         ACCION_LABEL, TITULO, SUB } from "@/components/av-agent/tipos";

const ART = "America/Argentina/Buenos_Aires";

function esHoyArt(iso: string | null): boolean {
  if (!iso) return false;
  const f = (d: Date) => d.toLocaleDateString("es-AR", { timeZone: ART });
  return f(new Date(iso)) === f(new Date());
}

export function mensajesDeHoy(mensajes: Mensaje[]): Mensaje[] {
  return mensajes.filter((m) => esHoyArt(m.creado_at));
}

// ── COMUNICACIONES: solo HOY, cada fila con su fecha y hora ─────────────────

export function Comunicaciones({ mensajes }: { mensajes: Mensaje[] }) {
  const hoy = mensajesDeHoy(mensajes);
  return (
    <div className="flex flex-col gap-2">
      <p className="text-[10px] text-[var(--t-text-dim)]">
        Lo que el agente mandó <b>HOY</b> y a quién, con su estado. No se
        acumula: una comunicación es del día — si el destinatario no la
        atendió, sigue abierta en SU bandeja (/api/avisos), no acá.
      </p>
      {hoy.length === 0 ? (
        <p className="text-[11px] text-[var(--t-text-muted)]">
          Hoy no mandé ninguna comunicación.
        </p>
      ) : (
        <div className="border border-[var(--t-border)] divide-y divide-[var(--t-border)]">
          {hoy.map((m) => {
            const vencido = m.vence_at ? new Date(m.vence_at) < new Date() : false;
            return (
              <div key={m.id} className="px-2 py-1">
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 min-w-0">
                  <span className="text-[9px] tabular-nums text-[var(--t-text-dim)] whitespace-nowrap">
                    {fechaHora(m.creado_at)}
                  </span>
                  <span className="text-[10px] text-[var(--t-text-muted)] break-all"
                        title={m.para}>
                    {m.para}
                  </span>
                  {m.filas > 0 && (
                    <span className="text-[9px] tabular-nums text-[var(--t-text-dim)]"
                          title="cuántas filas del mensaje ya resolvió">
                      {m.hechas}/{m.filas}
                    </span>
                  )}
                  <span className="text-[8px] uppercase tracking-widest whitespace-nowrap"
                        style={{ color: m.resuelto ? "var(--t-pos)"
                          : vencido ? "var(--t-text-dim)" : "#f59e0b" }}
                        title={m.resuelto ? `cerrado ${m.resuelto_at}`
                          : vencido ? "venció sin cerrarse" : "abierto"}>
                    {m.resuelto ? "hecho" : vencido ? "venció" : "abierto"}
                  </span>
                </div>
                <div className="text-[10px] text-[var(--t-text)] break-words">
                  {m.asunto}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── REGISTRO: una sola línea de tiempo — el agente Y vos ────────────────────
//
// ⚠️ SIN GRILLAS DE COLUMNAS FIJAS (user: «en LO QUE HIZO todo se solapa»):
// la vieja `grid-cols-[110px_170px_90px_1fr]` metía «JOB:CIERRE_CANJE» en
// una columna de 90px y se montaba sobre la de al lado. Cada evento son DOS
// renglones que envuelven: arriba cuándo·qué·sobre, abajo quién y el detalle.

type Evento = {
  key: string; ts: string | null; quien: string; que: string;
  sobre: string; detalle: string; malo?: boolean;
};

function eventos(data: Vista): Evento[] {
  const out: Evento[] = [];
  for (const a of data.acciones ?? []) {
    out.push({
      key: `a${a.id}`, ts: a.ts,
      quien: a.por || "el agente",
      que: ACCION_LABEL[a.accion] ?? a.accion,
      sobre: a.objetivo,
      detalle: [a.destino, a.error ?? "",
                a.pregunta_id ? `pregunta #${a.pregunta_id}` : "",
                a.detalle && Object.keys(a.detalle).length
                  ? JSON.stringify(a.detalle) : ""].filter(Boolean).join(" · "),
      malo: !a.ok,
    });
  }
  for (const d of data.decididas ?? []) {
    out.push({
      key: `d${d.id}`, ts: d.respondida_at,
      quien: d.respondida_por || "—",
      que: `respondiste «${d.respuesta ?? "?"}»`,
      sobre: d.clave.includes(":") ? d.clave.split(":", 2)[1] : d.clave,
      detalle: [d.pregunta, d.aplicada_at ? "" : "guardado, sin aplicar",
                d.nota ? `«${d.nota}»` : ""].filter(Boolean).join(" · "),
    });
  }
  (data.votos ?? []).forEach((v, i) => {
    out.push({
      key: `v${i}`, ts: v.creado_at,
      quien: "vos",
      que: v.origen === "utilidad"
        ? (v.acierta ? "votaste ✔ te sirve" : "votaste ✖ es ruido")
        : (v.acierta ? "votaste ✔ acertó" : "votaste ✖ no acertó"),
      sobre: v.caso,
      detalle: [v.causa.replaceAll("_", " "), v.nota ?? ""]
        .filter(Boolean).join(" · "),
    });
  });
  // Más reciente primero; sin fecha, al final (no se inventa un orden).
  return out.sort((a, b) => (b.ts ?? "").localeCompare(a.ts ?? ""));
}

export function Registro({ data, designorar }: {
  data: Vista;
  designorar: (ticker: string) => void;
}) {
  const pend = data.pendientes ?? [];
  const porResp: Record<string, Pendiente[]> = {};
  for (const p of pend) (porResp[p.respuesta ?? "?"] ??= []).push(p);
  const evs = eventos(data);
  return (
    <div className="flex flex-col gap-4">
      {/* LO ÚNICO VIVO de esta tab va primero: decisiones esperando efecto y
          descartes con su deshacer. El resto es pasado y no se toca. */}
      {pend.length > 0 && (
        <section className="border border-[var(--t-tint-amber)] bg-[var(--t-surface)] px-3 py-2">
          <div className="flex items-baseline gap-2 mb-1 flex-wrap">
            <h3 className={TITULO}>CONTESTADAS, SIN EJECUTAR TODAVÍA</h3>
            <span className={SUB}>{pend.length}</span>
          </div>
          <p className="text-[9px] text-[var(--t-text-dim)] mb-1">
            Tu respuesta quedó guardada; el agente aún no tiene la habilidad
            para ejecutarla solo. <b>Se concilia contra la base en cada
            lectura</b>: lo que la realidad ya cumplió (un alta hecha por otra
            vía) se sella aplicado y baja al registro.
          </p>
          {Object.entries(porResp).map(([resp, filas]) => (
            <div key={resp} className="mt-1 text-[10px] text-[var(--t-text)]">
              <strong className="uppercase tracking-widest">{resp}</strong>
              <span className="text-[var(--t-text-dim)]"> ({filas.length}): </span>
              <span className="tabular-nums break-words">
                {filas.map((f) => f.ticker).sort().join(", ")}
              </span>
            </div>
          ))}
        </section>
      )}

      {data.ignorados.length > 0 && (
        <section>
          <div className="flex items-baseline gap-2 mb-1 flex-wrap">
            <h3 className={TITULO}>NO TE INTERESAN</h3>
            <span className={SUB}>
              {data.ignorados.length} · papeles descartados al contestar — se
              re-proponen solo si los deshacés
            </span>
          </div>
          <div className="border border-[var(--t-border)] divide-y divide-[var(--t-border)]">
            {data.ignorados.map((ig) => (
              <div key={ig.ticker} className="flex items-center gap-2 px-2 py-1">
                <span className="text-[11px] font-bold text-[var(--t-text)] tabular-nums w-40 shrink-0 truncate"
                      title={ig.ticker}>
                  {ig.ticker}
                </span>
                <span className="text-[10px] text-[var(--t-text-muted)] flex-1 min-w-0 truncate"
                      title={ig.motivo}>
                  {ig.motivo}
                </span>
                <button
                  onClick={() => designorar(ig.ticker)}
                  className="text-[9px] uppercase tracking-widest px-2 py-0.5 border border-[var(--t-border)] text-[var(--t-text-dim)] hover:border-[var(--t-accent)] hover:text-[var(--t-accent)] transition-colors shrink-0"
                >
                  Deshacer
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      <section>
        <div className="flex items-baseline gap-2 mb-1 flex-wrap">
          <h3 className={TITULO}>TODO LO QUE PASÓ</h3>
          <span className={SUB}>
            {evs.length} · lo que escribió el agente y lo que decidiste vos,
            en orden — cada evento con su fecha y hora
          </span>
        </div>
        {evs.length === 0 ? (
          <p className="text-[10px] text-[var(--t-text-muted)]">
            Todavía no pasó nada: acá va a quedar cada escritura del agente y
            cada decisión tuya, con fecha, hora y sobre qué.
          </p>
        ) : (
          <div className="border border-[var(--t-border)] divide-y divide-[var(--t-border)]">
            {evs.map((e) => (
              <div key={e.key} className={`px-2 py-1 ${e.malo ? "bg-[var(--t-surface)]" : ""}`}>
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 min-w-0">
                  <span className="text-[9px] tabular-nums text-[var(--t-text-dim)] whitespace-nowrap">
                    {fechaHora(e.ts)}
                  </span>
                  <span className="text-[10px] text-[var(--t-text)]">
                    {e.malo && <span className="text-[var(--t-neg)] font-bold">✘ </span>}
                    {e.que}
                  </span>
                  <span className="text-[11px] font-bold tabular-nums text-[var(--t-text)] min-w-0 break-all"
                        title={e.sobre}>
                    {e.sobre}
                  </span>
                </div>
                <div className="text-[9px] text-[var(--t-text-dim)] break-words"
                     title={e.detalle}>
                  {e.quien}{e.detalle ? ` · ${e.detalle}` : ""}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
