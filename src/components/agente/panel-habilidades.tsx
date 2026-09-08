"use client";

// HABILIDADES — una TAB PROPIA. Doc: `docs/AGENT.md` §6.
//
// Pedido del user (2026-08-24): *«un listado de todas las skills, y cada skill
// tiene que tener la última hora que se ejecutó»* · *«lo quiero ahí como una tab
// que no está dentro de lo demás, es propia»*.
//
// Y tiene razón en que sea propia: lo que el agente SABE HACER no es un
// accesorio de la lista de hoy. Es la respuesta a otra pregunta —«¿está
// mirando?»— y esa pregunta se hace cuando las otras listas están en cero, que
// es justo cuando un panel apretado al costado no se lee.
//
// ⚠️ **«Cuándo miró» es el único dato del agente que NO se puede derivar.** Una
// corrida que no encontró nada no deja rastro en los hallazgos, así que sin
// esta columna «miré y estaba todo bien» y «no corrí» se ven idénticos — que es
// el bug estructural del agente viejo y la razón por la que la tabla de
// habilidades existe.
//
// Por eso el panel va al lado de las listas y no escondido en una tab: mirar
// «ENCONTRÓ 0» sin ver que cuatro habilidades no corrieron es leer un verde que
// no significa nada.
import { useState } from "react";

import { MapaHabilidades, type ModoMapa } from "@/components/agente/mapa-habilidades";
import { fechaHora, saludDe, type Explicacion, type Habilidad } from "@/components/agente/tipos";

// Las tres LECTURAS de la misma tabla. La lista contesta «¿qué pasó con cada
// una?»; el mapa contesta «¿qué cubre el agente y qué no?». Es un solo control
// de tres posiciones y no dos toggles anidados: son tres vistas hermanas.
const MODOS: { id: "lista" | ModoMapa; txt: string; ayuda: string }[] = [
  { id: "lista", txt: "lista", ayuda: "cada habilidad con su última corrida" },
  { id: "dominio", txt: "mapa · dominio", ayuda: "qué cubre, agrupado por dominio" },
  { id: "ritmo", txt: "mapa · ritmo", ayuda: "cada cuánto mira cada cosa" },
];

const DE_QUIEN: Record<string, string> = {
  nuestro: "es nuestro código", dato: "es un dato roto en origen",
  proveedor: "es del proveedor", no_se: "no se pudo determinar",
};

export function PanelHabilidades({ habilidades, correr, explicar }: {
  habilidades: Habilidad[];
  correr: (nombre: string) => Promise<unknown>;
  // «Explicámelo» (AGENT.md §0.dh): CALCULA, no muta — va por `calcular`.
  explicar: (nombre: string) => Promise<Explicacion>;
}) {
  const [corriendo, setCorriendo] = useState("");
  const [modo, setModo] = useState<"lista" | ModoMapa>("lista");
  const orden = [...habilidades].sort((a, b) => {
    // Lo que NO pudo mirar va arriba: es una advertencia sobre el AGENTE, no
    // sobre el sistema, y es la que nadie sale a buscar.
    const peso = (h: Habilidad) =>
      h.ultimo_resultado === "error" ? 0
      : h.ultimo_resultado === "sin_datos" ? 1
      : h.ultima_corrida_at ? 3 : 2;
    return peso(a) - peso(b) || a.nombre.localeCompare(b.nombre);
  });
  const ciegas = orden.filter((h) =>
    h.ultimo_resultado === "error" || h.ultimo_resultado === "sin_datos").length;

  const [explicaciones, setExplicaciones] = useState<Record<string, Explicacion>>({});
  const [explicando, setExplicando] = useState("");
  async function explicala(nombre: string) {
    if (explicando) return;
    setExplicando(nombre);
    try {
      const r = await explicar(nombre);
      setExplicaciones((e) => ({ ...e, [nombre]: r }));
    } catch (e) {
      setExplicaciones((x) => ({ ...x, [nombre]: { ok: false, error: String(e) } }));
    } finally { setExplicando(""); }
  }

  async function correrla(nombre: string) {
    if (corriendo) return;
    setCorriendo(nombre);
    try { await correr(nombre); } finally { setCorriendo(""); }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline gap-2 flex-wrap">
        <p className="text-[10px] text-[var(--t-text-dim)] max-w-[70ch]">
          Lo que el agente sabe hacer, y <b>la última vez que miró cada cosa</b>.
          «Corrió y no encontró nada» y «no corrió» <b>no son lo mismo</b>: sin
          esta columna se ven idénticos.
        </p>
        {ciegas > 0 && (
          <span className="text-[10px] text-[var(--t-neg)] ml-auto">
            ⚠ {ciegas} no pudieron mirar — no cerraron nada
          </span>
        )}
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex border border-[var(--t-border)]" role="group"
             aria-label="Cómo mirar las habilidades">
          {MODOS.map((m) => (
            <button
              key={m.id}
              onClick={() => setModo(m.id)}
              aria-pressed={modo === m.id}
              title={m.ayuda}
              className={`text-[9px] uppercase tracking-widest px-2 py-0.5 border-l first:border-l-0 border-[var(--t-border)] ${
                modo === m.id
                  ? "text-[var(--t-accent)] bg-[var(--t-surface)]"
                  : "text-[var(--t-text-dim)] hover:text-[var(--t-text-muted)]"}`}
            >
              {m.txt}
            </button>
          ))}
        </div>
        <span className="text-[9px] tabular-nums text-[var(--t-text-dim)]">
          {habilidades.length} declaradas
        </span>
      </div>

      {modo !== "lista" && (
        <MapaHabilidades habilidades={habilidades} modo={modo} />
      )}

      {modo === "lista" && (
      <div className="flex flex-col divide-y divide-[var(--t-border)] border border-[var(--t-border)]">
        {orden.map((h) => {
          const e = saludDe(h);
          return (
            <div key={h.nombre} className="px-2 py-1.5">
              <div className="flex items-baseline gap-2 flex-wrap">
                <span className="w-1.5 h-1.5 rounded-full shrink-0"
                      style={{ background: e.color }} title={e.txt} />
                <span className="text-[11px] font-bold text-[var(--t-text)]">
                  {h.nombre}
                </span>
                <span className="text-[9px] text-[var(--t-text-dim)]">
                  {h.dominio}
                </span>
                {h.hallazgos_abiertos > 0 && (
                  <span className="text-[9px] tabular-nums text-[var(--t-accent)]">
                    {h.hallazgos_abiertos}
                  </span>
                )}
                {h.reincidencias > 0 && (
                  <span className="text-[9px] tabular-nums text-[var(--t-neg)]"
                        title="volvió después de arreglarse">
                    ⚠{h.reincidencias}
                  </span>
                )}
              </div>
              <p className="text-[10px] text-[var(--t-text-muted)] pl-3.5">
                {h.que_mira}
              </p>
              <div className="flex items-baseline gap-2 pl-3.5 flex-wrap mt-0.5">
                {/* LA HORA. Es lo que el user pidió y lo único del agente que
                    NO se puede derivar de ninguna otra tabla. */}
                <span className="text-[9px] tabular-nums text-[var(--t-text)]">
                  {h.ultima_corrida_at
                    ? `miró ${fechaHora(h.ultima_corrida_at)}`
                    : "todavía no le tocó"}
                </span>
                <span className="text-[9px] text-[var(--t-text-dim)]">{e.txt}</span>
                <span className="text-[9px] text-[var(--t-text-dim)]">
                  cada {Math.round(h.cada_segundos / 60)} min
                  {h.ventana !== "siempre" ? ` · solo en ${h.ventana}` : ""}
                </span>
                <span className="text-[9px] text-[var(--t-text-dim)]">
                  {h.clase === "trabajo" ? "tiene arreglo" : "solo avisa"}
                </span>
                {Object.keys(h.automatico ?? {}).length > 0 && (
                  <span className="text-[9px] uppercase tracking-widest text-[var(--t-accent)]"
                        title={Object.entries(h.automatico ?? {}).map(([r, m]) => `${r}: ${m}`).join("\n")}>
                    aplica solo
                  </span>
                )}
                {h.corridas_hoy > 0 && (
                  <span className="text-[9px] tabular-nums text-[var(--t-text-dim)]">
                    {h.corridas_hoy}× hoy
                  </span>
                )}
                <button
                  disabled={Boolean(corriendo)}
                  onClick={() => void correrla(h.nombre)}
                  title="Correrla ahora, sin esperar su ritmo"
                  className="ml-auto text-[9px] uppercase tracking-widest px-1.5 py-0.5 border border-[var(--t-border)] text-[var(--t-text-dim)] hover:border-[var(--t-accent)] hover:text-[var(--t-accent)] disabled:opacity-40"
                >
                  {corriendo === h.nombre ? "mirando…" : "↻ mirar"}
                </button>
              </div>
              {h.ultimo_error && (
                <div className="pl-3.5 mt-0.5">
                  <p className="text-[9px] text-[var(--t-neg)]">
                    {h.ultimo_error}
                    {h.ultimo_resultado === "error" && (
                      <button
                        disabled={explicando === h.nombre}
                        onClick={() => void explicala(h.nombre)}
                        title="La IA lee el traceback, el código y el diario, y lo cuenta. A pedido, cacheado por error."
                        className="ml-2 text-[8px] uppercase tracking-widest px-1.5 py-0.5 border border-[var(--t-border)] text-[var(--t-text-muted)] hover:border-[var(--t-accent)] hover:text-[var(--t-accent)] disabled:opacity-40"
                      >
                        {explicando === h.nombre ? "…" : "explicámelo"}
                      </button>
                    )}
                  </p>
                  {(() => {
                    const x = explicaciones[h.nombre];
                    if (!x) return null;
                    if (!x.ok) {
                      return <p className="text-[9px] text-[var(--t-text-dim)] mt-0.5">{x.error}</p>;
                    }
                    const r = x.respuesta!;
                    return (
                      <div className="mt-1 px-1.5 py-1 border-l-2 border-[var(--t-accent)] bg-[var(--t-surface)] text-[9px] flex flex-col gap-0.5">
                        <span className="text-[8px] uppercase tracking-widest text-[var(--t-accent)]">
                          {DE_QUIEN[r.de_quien] ?? r.de_quien}
                          {x.cacheada && x.at ? ` · explicado ${fechaHora(x.at)}` : ""}
                        </span>
                        <span className="text-[var(--t-text)]">{r.explicacion}</span>
                        {r.afecta && <span className="text-[var(--t-text-muted)]">afecta: {r.afecta}</span>}
                        {r.que_hacer && <span className="text-[var(--t-text)]">qué hacer: {r.que_hacer}</span>}
                        {r.test && (
                          <details>
                            <summary className="cursor-pointer text-[8px] uppercase tracking-widest text-[var(--t-text-dim)]">test propuesto</summary>
                            <pre className="whitespace-pre-wrap break-all font-mono text-[8px] mt-0.5">{r.test}</pre>
                          </details>
                        )}
                        {r.tarea?.prompt && (
                          <details>
                            <summary className="cursor-pointer text-[8px] uppercase tracking-widest text-[var(--t-text-dim)]">
                              tarea: {r.tarea.titulo || "para Claude Code"}
                            </summary>
                            <pre className="whitespace-pre-wrap break-all font-mono text-[8px] mt-0.5">{r.tarea.prompt}</pre>
                          </details>
                        )}
                        {x.fuentes && x.fuentes.length > 0 && (
                          <span className="text-[8px] text-[var(--t-text-dim)]">
                            leyó: {x.fuentes.join(" · ")}
                          </span>
                        )}
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>
          );
        })}
      </div>
      )}
    </div>
  );
}
