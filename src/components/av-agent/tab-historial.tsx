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
import { useMemo, useState } from "react";

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

// ⚠️⚠️ **DE LISTA APILADA A TABLA** (user, 2026-08-24: *«es horrible ver eso
// así uno apilado abajo del otro… acá tiene que ser la tabla donde quede bien
// todo trazable»*).
//
// EL MODELO, que es lo que faltaba entender: **cada fila es un EVENTO, pero
// «¿se arregló?» es una propiedad del OBJETO que el evento tocó.** Un mismo
// bono acumula muchos eventos (se descubrió → se diagnosticó → se arregló →
// volvió → se arregló otra vez) y por eso la respuesta nunca podía estar en la
// fila: había que ir a buscarla al objeto. El backend hace ese cruce.
//
// Y son TRES preguntas distintas que antes se leían como una sola:
//
//   SALIÓ   ¿la escritura entró? — instantánea, la contesta la acción misma
//   HOY     ¿el problema se fue? — solo la contesta el tiempo, y es del OBJETO
//   (falta) ¿el diagnóstico era correcto? — ésa es el eval set (§0.de)
type Evento = {
  key: string; ts: string | null; quien: string; que: string;
  sobre: string; porque: string; donde: string;
  cambios: { campo: string; antes: string; despues: string }[];
  detalle: string; malo?: boolean;
  hoy: string | null;
  objetos: { regla: string; estado: string }[];
};

// El estado del objeto, traducido y con color. `null` = no se sabe, que NO es
// lo mismo que «no pasó nada» y por eso se dice distinto.
const ESTADO: Record<string, { txt: string; color: string }> = {
  nuevo:    { txt: "sigue abierto", color: "var(--t-neg)" },
  visto:    { txt: "sigue abierto", color: "var(--t-neg)" },
  en_curso: { txt: "esperando al detector", color: "#f59e0b" },
  resuelto: { txt: "cerrado", color: "var(--t-pos)" },
  volvio:   { txt: "volvió", color: "var(--t-neg)" },
  ignorado: { txt: "ignorado", color: "var(--t-text-dim)" },
};

function eventos(data: Vista): Evento[] {
  const out: Evento[] = [];
  for (const a of data.acciones ?? []) {
    out.push({
      key: `a${a.id}`, ts: a.ts,
      quien: a.por || "el agente",
      que: ACCION_LABEL[a.accion] ?? a.accion,
      sobre: a.objetivo,
      porque: (a.regla ?? "").replaceAll("_", " "),
      donde: a.destino,
      cambios: a.cambios ?? [],
      detalle: [a.error ?? "",
                a.pregunta_id ? `pregunta #${a.pregunta_id}` : ""]
        .filter(Boolean).join(" · "),
      malo: !a.ok,
      hoy: a.estado_objeto ?? null,
      objetos: a.objetos ?? [],
    });
  }
  for (const d of data.decididas ?? []) {
    out.push({
      key: `d${d.id}`, ts: d.respondida_at,
      quien: d.respondida_por || "—",
      que: `respondiste «${d.respuesta ?? "?"}»`,
      sobre: d.clave.includes(":") ? d.clave.split(":", 2)[1] : d.clave,
      porque: "", donde: "", cambios: [],
      detalle: [d.pregunta, d.aplicada_at ? "" : "guardado, sin aplicar",
                d.nota ? `«${d.nota}»` : ""].filter(Boolean).join(" · "),
      hoy: null, objetos: [],
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
      porque: v.causa.replaceAll("_", " "),
      donde: "", cambios: [],
      detalle: v.nota ?? "",
      hoy: null, objetos: [],
    });
  });
  // Más reciente primero; sin fecha, al final (no se inventa un orden).
  return out.sort((a, b) => (b.ts ?? "").localeCompare(a.ts ?? ""));
}

// La celda HOY: la única que contesta «¿quedó arreglado?».
function Hoy({ e }: { e: Evento }) {
  if (e.hoy) {
    const m = ESTADO[e.hoy] ?? { txt: e.hoy, color: "var(--t-text-muted)" };
    return <span className="text-[9px] font-bold whitespace-nowrap"
                 style={{ color: m.color }}>{m.txt}</span>;
  }
  // ⚠️ **SIN INVENTAR NADA.** La acción no guardó qué regla arreglaba, así que
  // no se puede decir cuál de los problemas del bono se tocó — medido: 49 de
  // 122 sujetos tienen más de uno. Se muestran todos, marcados como lo que
  // son: el contexto, no la respuesta.
  if (e.objetos.length) {
    return (
      <span className="text-[9px] text-[var(--t-text-dim)] whitespace-nowrap"
            title={"El evento no guardó qué problema arreglaba. Hoy este "
                   + "sujeto tiene:\n"
                   + e.objetos.map((o) => `· ${o.regla}: ${o.estado}`).join("\n")}>
        {e.objetos.length} problema{e.objetos.length > 1 ? "s" : ""} ·{" "}
        <span className="italic">no sé cuál</span>
      </span>
    );
  }
  return <span className="text-[9px] text-[var(--t-text-dim)]">—</span>;
}

// La celda QUÉ CAMBIÓ: campo por campo, no un JSON pegoteado.
function Cambios({ c }: { c: Evento["cambios"] }) {
  if (!c.length) return <span className="text-[9px] text-[var(--t-text-dim)]">—</span>;
  const ver = c.slice(0, 3);
  return (
    <span className="text-[9px] text-[var(--t-text-muted)]"
          title={c.map((x) => `${x.campo}: ${x.antes || "(vacío)"} → `
                              + `${x.despues || "(vacío)"}`).join("\n")}>
      {ver.map((x, i) => (
        <span key={x.campo} className="whitespace-nowrap">
          {i > 0 && " · "}
          <b className="text-[var(--t-text)]">{x.campo}</b>{" "}
          <span className="line-through opacity-60">{x.antes || "—"}</span>
          {" → "}
          <span className="text-[var(--t-text)]">{x.despues || "—"}</span>
        </span>
      ))}
      {c.length > ver.length && ` +${c.length - ver.length}`}
    </span>
  );
}

export function Registro({ data, designorar }: {
  data: Vista;
  designorar: (ticker: string) => void;
}) {
  const pend = data.pendientes ?? [];
  const porResp: Record<string, Pendiente[]> = {};
  for (const p of pend) (porResp[p.respuesta ?? "?"] ??= []).push(p);
  const evs = useMemo(() => eventos(data), [data]);
  const [q, setQ] = useState("");
  const [soloMalas, setSoloMalas] = useState(false);
  // El filtro mira TODO lo que la fila muestra (incluidos los campos que
  // cambiaron): buscar «moneda_flujo» tiene que traer los eventos que la
  // tocaron, no solo los que la nombran en el título.
  const vistos = useMemo(() => {
    const t = q.trim().toLowerCase();
    return evs.filter((e) => {
      if (soloMalas && !e.malo) return false;
      if (!t) return true;
      return [e.que, e.sobre, e.porque, e.quien, e.donde, e.detalle,
              ...e.cambios.map((c) => `${c.campo} ${c.antes} ${c.despues}`)]
        .join(" ").toLowerCase().includes(t);
    });
  }, [evs, q, soloMalas]);
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
            {vistos.length}{vistos.length !== evs.length ? ` de ${evs.length}` : ""}
            {" · cada evento con su hora, sobre qué, qué cambió y cómo quedó"}
          </span>
          <input
            value={q}
            onChange={(ev) => setQ(ev.target.value)}
            placeholder="filtrar por bono, acción, campo…"
            className="ml-auto w-52 bg-transparent border border-[var(--t-border)] px-1.5 py-0.5 text-[10px] text-[var(--t-text)] outline-none focus:border-[var(--t-accent)]"
          />
          <button
            onClick={() => setSoloMalas((v) => !v)}
            className="text-[9px] uppercase tracking-widest px-2 py-0.5 border"
            style={{ borderColor: soloMalas ? "var(--t-neg)" : "var(--t-border)",
                     color: soloMalas ? "var(--t-neg)" : "var(--t-text-muted)" }}
          >
            solo las que fallaron
          </button>
        </div>
        {vistos.length === 0 ? (
          <p className="text-[10px] text-[var(--t-text-muted)]">
            {evs.length === 0
              ? "Todavía no pasó nada: acá va a quedar cada escritura del agente"
                + " y cada decisión tuya, con fecha, hora y sobre qué."
              : "Ningún evento coincide con el filtro."}
          </p>
        ) : (
          /* ⚠️ El scroll horizontal vive ACÁ y no en el body: una tabla de 7
             columnas adentro de un modal angosto tiene que poder correrse sin
             arrastrar la pantalla entera. */
          <div className="border border-[var(--t-border)] overflow-x-auto max-h-[52vh] overflow-y-auto">
            <table className="w-full text-left border-collapse">
              <thead className="sticky top-0 bg-[var(--t-surface)] z-10">
                <tr className="text-[8px] uppercase tracking-widest text-[var(--t-text-dim)]">
                  <th className="px-2 py-1 font-normal whitespace-nowrap">Cuándo</th>
                  <th className="px-2 py-1 font-normal whitespace-nowrap">Qué hizo</th>
                  <th className="px-2 py-1 font-normal whitespace-nowrap">Sobre qué</th>
                  <th className="px-2 py-1 font-normal whitespace-nowrap"
                      title="La causa que motivó la acción. Vacía = la acción no la guardó.">
                    Por qué
                  </th>
                  <th className="px-2 py-1 font-normal whitespace-nowrap">Qué cambió</th>
                  <th className="px-2 py-1 font-normal whitespace-nowrap"
                      title="¿La escritura entró? Es instantánea — NO dice si el problema se fue.">
                    Salió
                  </th>
                  <th className="px-2 py-1 font-normal whitespace-nowrap"
                      title="El estado HOY del problema que tocó. Ésta es la que dice si quedó arreglado.">
                    Hoy
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--t-border)]">
                {vistos.map((e) => (
                  <tr key={e.key}
                      className={e.malo ? "bg-[var(--t-surface)]" : ""}>
                    <td className="px-2 py-1 align-top text-[9px] tabular-nums text-[var(--t-text-dim)] whitespace-nowrap">
                      {fechaHora(e.ts)}
                    </td>
                    <td className="px-2 py-1 align-top">
                      <div className="text-[10px] text-[var(--t-text)] whitespace-nowrap">
                        {e.que}
                      </div>
                      <div className="text-[8px] text-[var(--t-text-dim)] break-all"
                           title={e.donde ? `escribió en ${e.donde}` : undefined}>
                        {e.quien}{e.donde ? ` · ${e.donde}` : ""}
                      </div>
                    </td>
                    <td className="px-2 py-1 align-top text-[11px] font-bold tabular-nums text-[var(--t-text)] break-all"
                        title={e.sobre}>
                      {e.sobre}
                    </td>
                    <td className="px-2 py-1 align-top text-[9px] text-[var(--t-text-muted)] whitespace-nowrap">
                      {e.porque || <span className="text-[var(--t-text-dim)]">—</span>}
                    </td>
                    <td className="px-2 py-1 align-top">
                      <Cambios c={e.cambios} />
                      {e.detalle && (
                        <div className="text-[8px] text-[var(--t-text-dim)] break-words">
                          {e.detalle}
                        </div>
                      )}
                    </td>
                    <td className="px-2 py-1 align-top text-[9px] whitespace-nowrap"
                        style={{ color: e.malo ? "var(--t-neg)" : "var(--t-pos)" }}>
                      {e.malo ? "✘ falló" : "✔"}
                    </td>
                    <td className="px-2 py-1 align-top">
                      <Hoy e={e} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {/* Lo que la tabla TODAVÍA no puede contestar, dicho en voz alta en vez
            de disimulado con una columna vacía. */}
        <p className="mt-1 text-[9px] text-[var(--t-text-dim)]">
          <b>SALIÓ</b> dice si la escritura entró; <b>HOY</b> dice si el
          problema se fue. Son preguntas distintas. La tercera —¿el diagnóstico
          era el correcto?— la contesta el eval set, que se vació el 24/08
          porque sus dos fuentes fabricaban votos.
        </p>
      </section>
    </div>
  );
}
