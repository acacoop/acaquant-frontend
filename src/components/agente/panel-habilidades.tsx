"use client";

// HABILIDADES — una TAB PROPIA. Doc: `docs/AGENT_2.0.md` §6.
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

import { fechaHora, type Habilidad } from "@/components/agente/tipos";

// CUATRO estados, no dos. La distinción que el agente viejo no hacía.
const ESTADO: Record<string, { color: string; txt: string }> = {
  ok: { color: "var(--t-pos)", txt: "miró y guardó lo que vio" },
  sin_datos: { color: "var(--t-accent)", txt: "NO PUDO MIRAR — no cerró nada" },
  error: { color: "var(--t-neg)", txt: "reventó — no cerró nada" },
};
const NUNCA = { color: "var(--t-text-dim)", txt: "todavía no le tocó" };

export function PanelHabilidades({ habilidades, correr }: {
  habilidades: Habilidad[];
  correr: (nombre: string) => Promise<unknown>;
}) {
  const [corriendo, setCorriendo] = useState("");
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

  async function correrla(nombre: string) {
    if (corriendo) return;
    setCorriendo(nombre);
    try { await correr(nombre); } finally { setCorriendo(""); }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline gap-2 flex-wrap">
        <p className="text-[10px] text-[var(--t-text-dim)]">
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

      <div className="flex flex-col divide-y divide-[var(--t-border)] border border-[var(--t-border)]">
        {orden.map((h) => {
          const e = h.ultima_corrida_at
            ? (ESTADO[h.ultimo_resultado ?? ""] ?? NUNCA)
            : NUNCA;
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
                <p className="text-[9px] text-[var(--t-neg)] pl-3.5 mt-0.5">
                  {h.ultimo_error}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
